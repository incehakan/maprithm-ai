import { asRecord, normalizeCargoProvider, normalizeCargoTracking } from "@/lib/trendyolOrderNormalize";

/** Sipariş satırındaki takip alanları için değişiklik tespiti (senkron / log). */
export function trackingOrderFieldsFingerprint(p: {
  cargoTrackingNumber?: string | null;
  cargoTrackingLink?: string | null;
  cargoProviderName?: string | null;
  cargoProviderCode?: string | null;
  cargoStatusText?: string | null;
  cargoLastEventAt?: Date | null;
  cargoLastEventMessage?: string | null;
} | null | undefined): string {
  if (!p) return "__empty__";
  return JSON.stringify({
    n: p.cargoTrackingNumber ?? null,
    link: p.cargoTrackingLink ?? null,
    pn: p.cargoProviderName ?? null,
    pc: p.cargoProviderCode ?? null,
    st: p.cargoStatusText ?? null,
    la: p.cargoLastEventAt ? p.cargoLastEventAt.toISOString() : null,
    lm: p.cargoLastEventMessage ?? null
  });
}

export function trackingEventsFingerprint(
  events: Array<{ eventTitle: string; eventDateTime: Date | null; eventCode?: string | null }>
): string {
  return JSON.stringify(
    events.map((e) => ({
      c: e.eventCode ?? null,
      t: e.eventTitle,
      d: e.eventDateTime ? e.eventDateTime.toISOString() : null
    }))
  );
}

export type NormalizedTrackingForOrder = {
  cargoTrackingNumber: string | null;
  cargoTrackingLink: string | null;
  cargoProviderName: string | null;
  cargoProviderCode: string | null;
  cargoStatusText: string | null;
  cargoLastEventAt: Date | null;
  cargoLastEventMessage: string | null;
  trackingRawData: Record<string, unknown> | null;
  persistableEvents: Array<{
    eventCode: string | null;
    eventTitle: string;
    eventDescription: string | null;
    eventDateTime: Date | null;
    rawData: unknown;
  }>;
};

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

function parseEventTime(v: unknown): Date | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === "string") {
    if (/^\d{10,13}$/.test(v)) {
      const n = Number(v);
      const d = new Date(v.length === 10 ? n * 1000 : n);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

const PROVIDER_LINK_BUILDERS: Array<{
  test: (code: string | null, name: string | null) => boolean;
  build: (tracking: string) => string;
}> = [
  {
    test: (c, n) =>
      /aras/i.test(n ?? "") || /aras/i.test(c ?? "") || (c ?? "").toUpperCase() === "ARAS",
    build: (t) =>
      `https://kargotakip.araskargo.com.tr/main.aspx?q=${encodeURIComponent(t)}`
  },
  {
    test: (c, n) =>
      /yurtiçi|yurtici/i.test(n ?? "") ||
      /YK$/i.test(c ?? "") ||
      (c ?? "").toUpperCase() === "YK",
    build: (t) =>
      `https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code=${encodeURIComponent(t)}`
  },
  {
    test: (c, n) => /mng/i.test(n ?? "") || /mng/i.test(c ?? ""),
    build: (t) => `https://www.mngkargo.com.tr/track?query=${encodeURIComponent(t)}`
  },
  {
    test: (c, n) => /ptt/i.test(n ?? "") || /ptt/i.test(c ?? ""),
    build: (t) =>
      `https://gonderitakip.ptt.gov.tr/Track/Verify?q=${encodeURIComponent(t)}`
  },
  {
    test: (c, n) => /ups/i.test(n ?? "") || /ups/i.test(c ?? ""),
    build: (t) => `https://www.ups.com/track?tracknum=${encodeURIComponent(t)}`
  },
  {
    test: (c, n) => /surat|sürat/i.test(n ?? "") || /surat/i.test(c ?? ""),
    build: (t) => `https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=${encodeURIComponent(t)}`
  },
  {
    test: (c, n) => /trendyol\s*express|ty\s*express|sentigo/i.test(n ?? ""),
    build: (t) => `https://www.trendyol.com/siparislerim?tracking=${encodeURIComponent(t)}`
  }
];

/**
 * Bilinen taşıyıcılar için takip URL üretir; yoksa null (ham kodu URL diye göstermeyiz).
 */
export function buildTrackingLink(
  trackingNumber: string | null | undefined,
  cargoProviderCode: string | null | undefined,
  cargoProviderName: string | null | undefined
): string | null {
  const t = trackingNumber?.trim();
  if (!t) return null;
  const c = cargoProviderCode?.trim() ?? null;
  const n = cargoProviderName?.trim() ?? null;
  for (const p of PROVIDER_LINK_BUILDERS) {
    if (p.test(c, n)) return p.build(t);
  }
  return null;
}

/**
 * İsim veya kod ile kullanıcıya gösterilecek taşıyıcı etiketi.
 */
export function resolveCargoProviderDisplay(
  cargoProviderCode: string | null | undefined,
  cargoProviderName: string | null | undefined
): string {
  const name = cargoProviderName?.trim();
  if (name) return name;
  const code = cargoProviderCode?.trim();
  if (!code) return "Bilinmeyen Kargo Firması";
  const upper = code.toUpperCase();
  const codeMap: Record<string, string> = {
    ARAS: "Aras Kargo",
    YK: "Yurtiçi Kargo",
    MNG: "MNG Kargo",
    PTT: "PTT Kargo",
    UPS: "UPS",
    SURAT: "Sürat Kargo"
  };
  return codeMap[upper] ?? "Bilinmeyen Kargo Firması";
}

/**
 * Trendyol paket raw gövdesinden kargo alanlarını ve olası hareket listesini çıkarır.
 */
export function normalizeTrackingData(raw: Record<string, unknown>): NormalizedTrackingForOrder {
  const cargoTrackingNumber = normalizeCargoTracking(raw);
  const directLink = pickString(raw, [
    "cargoTrackingLink",
    "trackingLink",
    "cargoTrackingUrl",
    "trackingUrl",
    "shipmentTrackingUrl"
  ]);
  const cargoProviderCode = pickString(raw, [
    "cargoProviderCode",
    "logisticsProviderCode",
    "cargoCompanyCode",
    "cargoSenderNumber"
  ]);
  const cargoProviderName = normalizeCargoProvider(raw);
  const cargoStatusText = pickString(raw, [
    "cargoStatusText",
    "cargoTrackingStatus",
    "lastCargoStatus",
    "cargoState"
  ]);

  const historyKeys = [
    "trackingEvents",
    "cargoTrackingEvents",
    "shipmentTrackingDetails",
    "trackingDetails",
    "logisticsTrackingHistory",
    "cargoFollowUpSteps"
  ];

  const persistableEvents: NormalizedTrackingForOrder["persistableEvents"] = [];

  for (const key of historyKeys) {
    const arr = raw[key];
    if (!Array.isArray(arr) || arr.length === 0) continue;
    for (const item of arr) {
      const r = asRecord(item);
      if (!r) continue;
      const title =
        pickString(r, ["status", "title", "eventName", "state", "description"]) ?? "Kargo güncellemesi";
      const desc = pickString(r, ["description", "detail", "message", "location", "note"]);
      const code = pickString(r, ["code", "statusCode", "eventCode"]);
      const eventDateTime = parseEventTime(
        r.eventDate ?? r.date ?? r.createdDate ?? r.timestamp ?? r.time
      );
      persistableEvents.push({
        eventCode: code,
        eventTitle: title.slice(0, 500),
        eventDescription: desc,
        eventDateTime,
        rawData: r
      });
    }
    if (persistableEvents.length > 0) break;
  }

  persistableEvents.sort((a, b) => {
    const ta = a.eventDateTime?.getTime() ?? 0;
    const tb = b.eventDateTime?.getTime() ?? 0;
    return ta - tb;
  });

  let cargoLastEventAt: Date | null = null;
  let cargoLastEventMessage: string | null = null;
  if (persistableEvents.length > 0) {
    const last = persistableEvents[persistableEvents.length - 1];
    cargoLastEventAt = last.eventDateTime;
    cargoLastEventMessage =
      [last.eventTitle, last.eventDescription].filter(Boolean).join(" · ").slice(0, 500) || null;
  }

  const builtLink = buildTrackingLink(cargoTrackingNumber, cargoProviderCode, cargoProviderName);
  const cargoTrackingLink = directLink ?? builtLink ?? null;

  const trackingRawData: Record<string, unknown> = {
    source: "trendyol_package_ingest",
    eventCount: persistableEvents.length,
    hadDirectLink: Boolean(directLink),
    usedBuiltLink: Boolean(!directLink && builtLink)
  };

  return {
    cargoTrackingNumber,
    cargoTrackingLink,
    cargoProviderName,
    cargoProviderCode,
    cargoStatusText,
    cargoLastEventAt,
    cargoLastEventMessage,
    trackingRawData,
    persistableEvents
  };
}

export type TrackingTimelineItem = {
  id: string;
  eventTitle: string;
  eventDescription: string | null;
  eventDateTime: string | null;
  kind: "tracking" | "lifecycle";
};

const PACKAGE_STATUS_TR: Record<string, string> = {
  Created: "Sipariş oluşturuldu",
  Picking: "Hazırlanıyor",
  Invoiced: "Faturalandı",
  Shipped: "Kargoya verildi",
  Delivered: "Teslim edildi",
  Cancelled: "İptal edildi",
  UnDelivered: "Teslim edilemedi",
  Returned: "İade",
  AtCollectionPoint: "Teslim noktasında",
  UnPacked: "Parçalandı",
  UnSupplied: "Tedarik edilemedi"
};

function lifecycleSyntheticSteps(packageStatus: string | null | undefined): string[] {
  const order = [
    "Created",
    "Picking",
    "Invoiced",
    "Shipped",
    "Delivered"
  ];
  const terminal = new Set(["Cancelled", "UnSupplied", "Returned", "UnDelivered"]);
  const cur = packageStatus ?? "";
  if (terminal.has(cur)) {
    if (cur === "Cancelled") return ["Created", "Picking", "Cancelled"];
    return ["Created", "Picking", "Invoiced", "Shipped", cur];
  }
  const idx = order.indexOf(cur);
  if (idx < 0) return ["Created"];
  return order.slice(0, idx + 1);
}

/**
 * DB tracking satırları + paket statüsü ile okunabilir zaman çizgisi.
 */
export function buildTrackingTimeline(params: {
  shipmentPackageId: string;
  packageStatus: string | null | undefined;
  orderCreatedAt: Date;
  packageStatusUpdatedAt: Date | null;
  cargoLastEventAt: Date | null;
  cargoLastEventMessage: string | null;
  dbEvents: Array<{
    id: string;
    eventTitle: string;
    eventDescription: string | null;
    eventDateTime: Date | null;
  }>;
}): TrackingTimelineItem[] {
  const items: TrackingTimelineItem[] = [];

  for (const e of params.dbEvents) {
    items.push({
      id: `t-${e.id}`,
      eventTitle: e.eventTitle,
      eventDescription: e.eventDescription,
      eventDateTime: e.eventDateTime?.toISOString() ?? null,
      kind: "tracking"
    });
  }

  if (items.length === 0) {
    const steps = lifecycleSyntheticSteps(params.packageStatus);
    const statusAt =
      params.packageStatusUpdatedAt ?? params.orderCreatedAt;
    const knownAt =
      params.cargoLastEventAt && params.cargoLastEventAt.getTime() > statusAt.getTime()
        ? params.cargoLastEventAt
        : statusAt;

    steps.forEach((st, i) => {
      const isCurrent = st === (params.packageStatus ?? "");
      let when: string | null = null;
      if (i === 0) when = params.orderCreatedAt.toISOString();
      else if (isCurrent) when = knownAt.toISOString();

      items.push({
        id: `lc-${st}-${i}`,
        eventTitle: PACKAGE_STATUS_TR[st] ?? st,
        eventDescription: isCurrent
          ? "Bu aşama, paket durumu ile eşleşiyor (senkron verisi)."
          : i === 0
            ? "Siparişin sisteme düşme anına yakın zaman."
            : null,
        eventDateTime: when,
        kind: "lifecycle"
      });
    });

    if (params.cargoLastEventMessage && params.cargoLastEventAt) {
      items.push({
        id: "cargo-last",
        eventTitle: "Son kargo bilgisi",
        eventDescription: params.cargoLastEventMessage,
        eventDateTime: params.cargoLastEventAt.toISOString(),
        kind: "tracking"
      });
    }
  }

  items.sort((a, b) => {
    const ta = a.eventDateTime ? new Date(a.eventDateTime).getTime() : 0;
    const tb = b.eventDateTime ? new Date(b.eventDateTime).getTime() : 0;
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });

  return items;
}
