"use client";

import { useEffect, useMemo, useState } from "react";
import {
  EmptyState,
  PageHeader,
  PanelSurface,
  PremiumButton,
  PremiumInput,
  PremiumSelect,
  SectionHeader,
  StatusBadge
} from "@/components/premium/design-system";
import { extractApiErrorMessage } from "@/lib/apiErrorMessage";

type StoreRow = { id: string; name: string; slug: string | null };

type Verification = {
  testSource: string;
  orders: Array<{
    id: string;
    storeId: string;
    orderNumber: string;
    shipmentPackageId: string;
    packageStatus: string | null;
    testSource: string | null;
    sandboxMode: boolean;
  }>;
  testEvents: Array<{ id: string; action: string; message: string; createdAt: string }>;
  trackingEvents: Array<{ id: string; eventTitle: string; eventCode: string | null; createdAt: string }>;
  shippingEvents: Array<{ id: string; action: string; message: string; createdAt: string }>;
  invoices: Array<{ id: string; invoiceNumber: string | null; invoiceStatus: string; createdAt: string }>;
  claims: Array<{ id: string; claimId: string; claimStatus: string; orderNumber: string | null; shipmentPackageId: string | null }>;
  claimEvents: Array<{ id: string; claimRecordId: string; action: string; message: string; createdAt: string }>;
  activityLogs: Array<{ id: string; action: string; message: string; entityType: string; entityId: string; createdAt: string }>;
};

type TestOrderLine = {
  stockCode: string;
  productName: string;
  quantity: number;
  lineUnitPrice?: number;
  barcode?: string;
};

function StatusSummaryBadge({ ok }: { ok: boolean }) {
  return (
    <StatusBadge variant={ok ? "success" : "danger"}>{ok ? "Başarılı" : "Hatalı"}</StatusBadge>
  );
}

export default function AdminTestLabPage() {
  const [loadingStores, setLoadingStores] = useState(true);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [storeId, setStoreId] = useState<string>("");

  const [runId] = useState(() => crypto.randomUUID());
  const [verification, setVerification] = useState<Verification | null>(null);

  const [testOrderId, setTestOrderId] = useState<string>("");
  const [testShipmentPackageId, setTestShipmentPackageId] = useState<string>("");

  const [globalMsg, setGlobalMsg] = useState<string | null>(null);

  // Module responses
  const [orderCreateRes, setOrderCreateRes] = useState<{ ok: boolean; msg: string } | null>(null);
  const [lifecycleRes, setLifecycleRes] = useState<{ ok: boolean; msg: string } | null>(null);
  const [splitRes, setSplitRes] = useState<{ ok: boolean; msg: string } | null>(null);
  const [trackingRes, setTrackingRes] = useState<{ ok: boolean; msg: string } | null>(null);
  const [invoiceRes, setInvoiceRes] = useState<{ ok: boolean; msg: string } | null>(null);
  const [returnsRes, setReturnsRes] = useState<{ ok: boolean; msg: string } | null>(null);
  const [webhookRes, setWebhookRes] = useState<{ ok: boolean; msg: string } | null>(null);

  // Order create form
  const [orderNumber, setOrderNumber] = useState<string>("TEST-" + Math.floor(Math.random() * 1000000));
  const [shipmentPackageId, setShipmentPackageId] = useState<string>("test-pkg-" + Math.floor(Math.random() * 1000000));
  const [packageStatus, setPackageStatus] = useState<string>("Created");
  const [customerFirstName, setCustomerFirstName] = useState<string>("Test");
  const [customerLastName, setCustomerLastName] = useState<string>("Customer");
  const [totalPrice, setTotalPrice] = useState<number>(100);
  const [currency, setCurrency] = useState<string>("TRY");
  const [cargoProviderName, setCargoProviderName] = useState<string>("Test Carrier");
  const [cargoProviderCode, setCargoProviderCode] = useState<string>("TRC01");
  const [cargoTrackingNumber, setCargoTrackingNumber] = useState<string>("TRK-" + Math.floor(Math.random() * 100000000));
  const [cargoSenderNumber, setCargoSenderNumber] = useState<string>("SENDER-1");

  const [lines, setLines] = useState<TestOrderLine[]>([
    { stockCode: "STK-001", productName: "Test ürün 1", quantity: 1, lineUnitPrice: 50, barcode: "BC-001" }
  ]);

  // Lifecycle simulate form
  const [nextStatus, setNextStatus] = useState<string>("Picking");

  // Split simulate form
  const [childShipmentPackageId, setChildShipmentPackageId] = useState<string>(
    "test-child-" + Math.floor(Math.random() * 1000000)
  );
  const [moveLineCount, setMoveLineCount] = useState<number>(1);

  // Tracking simulate form
  const [trackingNumber, setTrackingNumber] = useState<string>("TRK-" + Math.floor(Math.random() * 100000000));
  const [providerCode, setProviderCode] = useState<string>("TRC01");
  const [providerName, setProviderName] = useState<string>("Test Carrier");
  const [labelUrl, setLabelUrl] = useState<string>("");
  const [labelFormat, setLabelFormat] = useState<string>("PDF");
  const [trackingCargoSenderNumber, setTrackingCargoSenderNumber] = useState<string>("");

  // Invoice simulate form
  const [invoiceNumber, setInvoiceNumber] = useState<string>("INV-" + Math.floor(Math.random() * 1000000));
  const [invoiceDateTime, setInvoiceDateTime] = useState<string>(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [invoiceLink, setInvoiceLink] = useState<string>("https://example.com/invoice/test-" + Math.floor(Math.random() * 1000000));
  const [invoiceStatus, setInvoiceStatus] = useState<"sent" | "failed">("sent");

  // Returns simulate form
  const [claimId, setClaimId] = useState<string>("CLM-" + Math.floor(Math.random() * 1000000));
  const [claimStatus, setClaimStatus] = useState<string>("Created");
  const [approveOrReject, setApproveOrReject] = useState<"approve" | "reject">("approve");
  const [returnReasons, setReturnReasons] = useState<Array<{ code: string; name: string }>>([]);
  const [returnReasonCode, setReturnReasonCode] = useState<string>("301");
  const [rejectTrackingNumber, setRejectTrackingNumber] = useState<string>("RTNTRK-" + Math.floor(Math.random() * 100000000));
  const [rejectProviderName, setRejectProviderName] = useState<string>("Test Carrier");
  const [rejectPackageId, setRejectPackageId] = useState<string>("");

  // Webhook simulate form
  const [webhookNextPackageStatus, setWebhookNextPackageStatus] = useState<string>("Shipped");
  const [webhookTrackingNumber, setWebhookTrackingNumber] = useState<string>("");
  const [webhookProviderCode, setWebhookProviderCode] = useState<string>("");
  const [webhookProviderName, setWebhookProviderName] = useState<string>("");

  useEffect(() => {
    async function loadStores() {
      setLoadingStores(true);
      setGlobalMsg(null);
      try {
        const res = await fetch("/api/admin/test-lab/stores");
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(extractApiErrorMessage(data, "Store yüklenemedi"));
        const rows = (data.stores ?? []) as StoreRow[];
        setStores(rows);
        if (rows.length > 0) setStoreId(rows[0].id);
      } catch (e) {
        setGlobalMsg(e instanceof Error ? e.message : "Store yüklenemedi");
      } finally {
        setLoadingStores(false);
      }
    }

    void loadStores();
  }, []);

  useEffect(() => {
    async function loadReturnReasons() {
      try {
        const res = await fetch("/api/admin/test-lab/return-reasons");
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(extractApiErrorMessage(data, "Return reasons yüklenemedi"));
        setReturnReasons(data.reasons ?? []);
      } catch {
        // opsiyonel
      }
    }
    void loadReturnReasons();
  }, []);

  const verificationFetch = async () => {
    try {
      const res = await fetch(`/api/admin/test-lab/verification?testSource=${encodeURIComponent(runId)}`);
      const data = await res.json();
      if (!res.ok || !data.success) return;
      setVerification(data.data as Verification);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    void verificationFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const testOrderExists = Boolean(testOrderId);

  const testsPassed = useMemo(() => {
    const actions = new Set((verification?.testEvents ?? []).map((e) => e.action));
    const claimActions = new Set((verification?.claimEvents ?? []).map((e) => e.action));
    const testReturnCreated = claimActions.has("TEST_RETURN_CREATED");
    return {
      orderCreated: actions.has("TEST_ORDER_CREATED"),
      splitCreated: actions.has("TEST_PACKAGE_SPLIT_CREATED"),
      trackingUpdated: actions.has("TEST_TRACKING_UPDATED"),
      invoiceSent: actions.has("TEST_INVOICE_SENT"),
      returnCreated: testReturnCreated,
      webhookSimulated: actions.has("TEST_WEBHOOK_SIMULATED")
    };
  }, [verification]);

  async function withVerification<T>(fn: () => Promise<T>) {
    const out = await fn();
    await verificationFetch();
    return out;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Operation Test Lab"
        subtitle="Canlı sipariş beklemeden order/shipment/invoice/returns/tracking/webhook akışlarını simüle edin."
      />

      {globalMsg && (
        <div className="rounded-md border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm">
          {globalMsg}
        </div>
      )}

      <PanelSurface className="space-y-3">
        <SectionHeader title="Test Ayarları" />
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">Test Run (read-only)</label>
            <PremiumInput value={runId} disabled />
          </div>
          <div>
            <label className="label">Store</label>
            {loadingStores ? (
              <div className="text-sm text-slate-400">Yükleniyor...</div>
            ) : stores.length === 0 ? (
              <div className="text-sm text-slate-400">Store bulunamadı.</div>
            ) : (
              <PremiumSelect value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </PremiumSelect>
            )}
          </div>
        </div>
      </PanelSurface>

      <div className="grid gap-4 lg:grid-cols-2">
        <PanelSurface className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <SectionHeader title="Test Order Oluştur" />
            {orderCreateRes ? <StatusSummaryBadge ok={orderCreateRes.ok} /> : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">orderNumber</label>
              <PremiumInput value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
            </div>
            <div>
              <label className="label">shipmentPackageId</label>
              <PremiumInput value={shipmentPackageId} onChange={(e) => setShipmentPackageId(e.target.value)} />
            </div>
            <div>
              <label className="label">packageStatus</label>
              <PremiumSelect value={packageStatus} onChange={(e) => setPackageStatus(e.target.value)}>
                {["Created","Picking","Invoiced","Shipped","Delivered","UnSupplied","Cancelled","Returned","UnDelivered"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </PremiumSelect>
            </div>
            <div>
              <label className="label">totalPrice</label>
              <PremiumInput type="number" value={totalPrice} onChange={(e) => setTotalPrice(Number(e.target.value))} />
            </div>
            <div>
              <label className="label">customerFirstName</label>
              <PremiumInput value={customerFirstName} onChange={(e) => setCustomerFirstName(e.target.value)} />
            </div>
            <div>
              <label className="label">customerLastName</label>
              <PremiumInput value={customerLastName} onChange={(e) => setCustomerLastName(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">cargoProviderCode</label>
              <PremiumInput value={cargoProviderCode} onChange={(e) => setCargoProviderCode(e.target.value)} />
            </div>
            <div>
              <label className="label">cargoProviderName</label>
              <PremiumInput value={cargoProviderName} onChange={(e) => setCargoProviderName(e.target.value)} />
            </div>
            <div>
              <label className="label">cargoTrackingNumber</label>
              <PremiumInput value={cargoTrackingNumber} onChange={(e) => setCargoTrackingNumber(e.target.value)} />
            </div>
            <div>
              <label className="label">cargoSenderNumber (opsiyonel)</label>
              <PremiumInput value={cargoSenderNumber} onChange={(e) => setCargoSenderNumber(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-semibold text-slate-200">Ürün Satırları</div>
            {lines.map((ln, idx) => (
              <div key={idx} className="grid gap-3 md:grid-cols-4">
                <PremiumInput
                  placeholder="stockCode"
                  value={ln.stockCode}
                  onChange={(e) =>
                    setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, stockCode: e.target.value } : x)))
                  }
                />
                <PremiumInput
                  placeholder="productName"
                  value={ln.productName}
                  onChange={(e) =>
                    setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, productName: e.target.value } : x)))
                  }
                />
                <PremiumInput
                  placeholder="quantity"
                  type="number"
                  value={ln.quantity}
                  onChange={(e) =>
                    setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, quantity: Number(e.target.value) } : x)))
                  }
                />
                <PremiumInput
                  placeholder="unitPrice"
                  type="number"
                  value={ln.lineUnitPrice ?? 0}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, lineUnitPrice: Number(e.target.value) } : x))
                    )
                  }
                />
              </div>
            ))}
            <div className="flex items-center gap-2">
              <PremiumButton
                variant="secondary"
                onClick={() =>
                  setLines((prev) => [
                    ...prev,
                    { stockCode: "", productName: "", quantity: 1, lineUnitPrice: 0, barcode: "" }
                  ])
                }
              >
                Satır Ekle
              </PremiumButton>
              {lines.length > 1 ? (
                <PremiumButton variant="secondary" onClick={() => setLines((prev) => prev.slice(0, -1))}>
                  Satır Sil
                </PremiumButton>
              ) : null}
            </div>
          </div>

          <PremiumButton
            onClick={async () => {
              setOrderCreateRes(null);
              setGlobalMsg(null);
              try {
                await withVerification(async () => {
                  const res = await fetch("/api/admin/test-lab/test-orders/create", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      testSource: runId,
                      storeId,
                      orderNumber,
                      shipmentPackageId,
                      packageStatus,
                      customerFirstName,
                      customerLastName,
                      totalPrice,
                      currency,
                      cargoProviderName,
                      cargoProviderCode,
                      cargoTrackingNumber,
                      cargoSenderNumber,
                      lines: lines.map((l) => ({
                        stockCode: l.stockCode,
                        productName: l.productName,
                        quantity: l.quantity,
                        lineUnitPrice: l.lineUnitPrice ?? null,
                        barcode: l.barcode ?? null
                      }))
                    })
                  });
                  const data = await res.json();
                  if (!res.ok || !data.success) throw new Error(extractApiErrorMessage(data, "Order oluşturma başarısız"));
                  setTestOrderId(data.orderId);
                  setTestShipmentPackageId(data.shipmentPackageId);
                  setOrderCreateRes({ ok: true, msg: data.message ?? "OK" });
                });
              } catch (e) {
                setOrderCreateRes({ ok: false, msg: e instanceof Error ? e.message : "Order oluşturma başarısız" });
              }
            }}
            disabled={!storeId}
          >
            Test Order Oluştur
          </PremiumButton>

          {orderCreateRes ? <div className="text-sm text-slate-400">{orderCreateRes.msg}</div> : null}
          {testOrderExists ? (
            <div className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-300">
              Test OrderId: <span className="font-mono">{testOrderId}</span>
              <br />
              shipmentPackageId: <span className="font-mono">{testShipmentPackageId}</span>
            </div>
          ) : null}
        </PanelSurface>

        <PanelSurface className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <SectionHeader title="Test Shipment Lifecycle" />
            {lifecycleRes ? <StatusSummaryBadge ok={lifecycleRes.ok} /> : null}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Next Status</label>
              <PremiumSelect value={nextStatus} onChange={(e) => setNextStatus(e.target.value)}>
                {["Created","Picking","Invoiced","Shipped","Delivered","UnSupplied","Cancelled","Returned","UnDelivered"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </PremiumSelect>
            </div>
          </div>
          <PremiumButton
            disabled={!testOrderExists}
            onClick={async () => {
              setLifecycleRes(null);
              try {
                await withVerification(async () => {
                  const res = await fetch(`/api/admin/test-lab/test-orders/${testOrderId}/lifecycle/simulate`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ storeId, testSource: runId, nextStatus })
                  });
                  const data = await res.json();
                  if (!res.ok || !data.success) throw new Error(extractApiErrorMessage(data, "Lifecycle simülasyonu başarısız"));
                  setLifecycleRes({ ok: true, msg: `OK: ${data.nextStatus}` });
                });
              } catch (e) {
                setLifecycleRes({ ok: false, msg: e instanceof Error ? e.message : "Lifecycle simülasyonu başarısız" });
              }
            }}
          >
            Lifecycle Simüle Et
          </PremiumButton>
          {lifecycleRes ? <div className="text-sm text-slate-400">{lifecycleRes.msg}</div> : null}

          <div className="mt-4">
            <div className="text-xs text-slate-500">Not: Created → Picking → Invoiced → Shipped → Delivered + terminal adımlar simüle edilebilir.</div>
          </div>
        </PanelSurface>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PanelSurface className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <SectionHeader title="Test Split Package" />
            {splitRes ? <StatusSummaryBadge ok={splitRes.ok} /> : null}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">childShipmentPackageId</label>
              <PremiumInput value={childShipmentPackageId} onChange={(e) => setChildShipmentPackageId(e.target.value)} />
            </div>
            <div>
              <label className="label">moveLineCount</label>
              <PremiumInput type="number" value={moveLineCount} onChange={(e) => setMoveLineCount(Number(e.target.value))} />
            </div>
          </div>
          <PremiumButton
            disabled={!testOrderExists}
            onClick={async () => {
              setSplitRes(null);
              try {
                await withVerification(async () => {
                  const res = await fetch(`/api/admin/test-lab/test-orders/${testOrderId}/split/create`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ storeId, testSource: runId, childShipmentPackageId, moveLineCount })
                  });
                  const data = await res.json();
                  if (!res.ok || !data.success) throw new Error(extractApiErrorMessage(data, "Split simülasyonu başarısız"));
                  setSplitRes({ ok: true, msg: `OK: child=${data.childShipmentPackageId}` });
                });
              } catch (e) {
                setSplitRes({ ok: false, msg: e instanceof Error ? e.message : "Split simülasyonu başarısız" });
              }
            }}
          >
            Split Oluştur
          </PremiumButton>
          {splitRes ? <div className="text-sm text-slate-400">{splitRes.msg}</div> : null}
        </PanelSurface>

        <PanelSurface className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <SectionHeader title="Test Tracking & Label" />
            {trackingRes ? <StatusSummaryBadge ok={trackingRes.ok} /> : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">trackingNumber</label>
              <PremiumInput value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} />
            </div>
            <div>
              <label className="label">providerCode</label>
              <PremiumInput value={providerCode} onChange={(e) => setProviderCode(e.target.value)} />
            </div>
            <div>
              <label className="label">providerName</label>
              <PremiumInput value={providerName} onChange={(e) => setProviderName(e.target.value)} />
            </div>
            <div>
              <label className="label">cargoSenderNumber (opsiyonel)</label>
              <PremiumInput value={trackingCargoSenderNumber} onChange={(e) => setTrackingCargoSenderNumber(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">labelFormat</label>
              <PremiumSelect value={labelFormat} onChange={(e) => setLabelFormat(e.target.value)}>
                {["PDF","ZPL","SAMPLE"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </PremiumSelect>
            </div>
            <div>
              <label className="label">labelUrl (opsiyonel)</label>
              <PremiumInput value={labelUrl} onChange={(e) => setLabelUrl(e.target.value)} placeholder="(boş bırakılırsa sahte üretilecektir)" />
            </div>
          </div>

          <PremiumButton
            disabled={!testOrderExists}
            onClick={async () => {
              setTrackingRes(null);
              try {
                await withVerification(async () => {
                  const res = await fetch(`/api/admin/test-lab/test-orders/${testOrderId}/shipping/simulate-tracking`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      storeId,
                      testSource: runId,
                      trackingNumber,
                      providerCode,
                      providerName,
                      cargoSenderNumber: trackingCargoSenderNumber || null,
                      labelUrl: labelUrl || null,
                      labelFormat
                    })
                  });
                  const data = await res.json();
                  if (!res.ok || !data.success) throw new Error(extractApiErrorMessage(data, "Tracking simülasyonu başarısız"));
                  setTrackingRes({ ok: true, msg: "OK" });
                });
              } catch (e) {
                setTrackingRes({ ok: false, msg: e instanceof Error ? e.message : "Tracking simülasyonu başarısız" });
              }
            }}
          >
            Tracking + Label Simüle Et
          </PremiumButton>
          {trackingRes ? <div className="text-sm text-slate-400">{trackingRes.msg}</div> : null}
        </PanelSurface>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PanelSurface className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <SectionHeader title="Test Invoice Flow" />
            {invoiceRes ? <StatusSummaryBadge ok={invoiceRes.ok} /> : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">invoiceNumber</label>
              <PremiumInput value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
            </div>
            <div>
              <label className="label">invoiceDateTime</label>
              <PremiumInput type="datetime-local" value={invoiceDateTime} onChange={(e) => setInvoiceDateTime(e.target.value)} />
            </div>
            <div>
              <label className="label">invoiceLink</label>
              <PremiumInput value={invoiceLink} onChange={(e) => setInvoiceLink(e.target.value)} />
            </div>
            <div>
              <label className="label">invoiceStatus</label>
              <PremiumSelect value={invoiceStatus} onChange={(e) => setInvoiceStatus(e.target.value as any)}>
                <option value="sent">sent</option>
                <option value="failed">failed</option>
              </PremiumSelect>
            </div>
          </div>

          <PremiumButton
            disabled={!testOrderExists}
            onClick={async () => {
              setInvoiceRes(null);
              try {
                await withVerification(async () => {
                  const res = await fetch(`/api/admin/test-lab/test-orders/${testOrderId}/invoice/simulate`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      storeId,
                      testSource: runId,
                      invoiceNumber,
                      invoiceDateTime,
                      invoiceLink,
                      invoiceStatus
                    })
                  });
                  const data = await res.json();
                  if (!res.ok || !data.success) throw new Error(extractApiErrorMessage(data, "Invoice simülasyonu başarısız"));
                  setInvoiceRes({ ok: true, msg: `OK: invoiceId=${data.invoiceId}` });
                });
              } catch (e) {
                setInvoiceRes({ ok: false, msg: e instanceof Error ? e.message : "Invoice simülasyonu başarısız" });
              }
            }}
          >
            Invoice Simüle Et
          </PremiumButton>
          {invoiceRes ? <div className="text-sm text-slate-400">{invoiceRes.msg}</div> : null}
        </PanelSurface>

        <PanelSurface className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <SectionHeader title="Test Returns / Claims" />
            {returnsRes ? <StatusSummaryBadge ok={returnsRes.ok} /> : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">claimId</label>
              <PremiumInput value={claimId} onChange={(e) => setClaimId(e.target.value)} />
            </div>
            <div>
              <label className="label">claimStatus</label>
              <PremiumInput value={claimStatus} onChange={(e) => setClaimStatus(e.target.value)} />
            </div>
            <div>
              <label className="label">returnReason</label>
              <PremiumSelect
                value={returnReasonCode}
                onChange={(e) => setReturnReasonCode(e.target.value)}
              >
                {returnReasons.length === 0 ? (
                  <option value="301">Kusurlu ürün gönderildi</option>
                ) : (
                  returnReasons.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.name}
                    </option>
                  ))
                )}
              </PremiumSelect>
            </div>
            <div>
              <label className="label">approveOrReject</label>
              <PremiumSelect
                value={approveOrReject}
                onChange={(e) => setApproveOrReject(e.target.value as any)}
              >
                <option value="approve">approve</option>
                <option value="reject">reject</option>
              </PremiumSelect>
            </div>
          </div>

          {approveOrReject === "reject" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="label">rejectTrackingNumber</label>
                <PremiumInput value={rejectTrackingNumber} onChange={(e) => setRejectTrackingNumber(e.target.value)} />
              </div>
              <div>
                <label className="label">rejectProviderName</label>
                <PremiumInput value={rejectProviderName} onChange={(e) => setRejectProviderName(e.target.value)} />
              </div>
              <div>
                <label className="label">rejectPackageId (opsiyonel)</label>
                <PremiumInput value={rejectPackageId} onChange={(e) => setRejectPackageId(e.target.value)} placeholder="boş bırakılırsa test sipariş paketi kullanılır" />
              </div>
              <div />
            </div>
          ) : null}

          <PremiumButton
            disabled={!testOrderExists}
            onClick={async () => {
              setReturnsRes(null);
              try {
                await withVerification(async () => {
                  const reason = returnReasons.find((r) => r.code === returnReasonCode);
                  const res = await fetch(`/api/admin/test-lab/test-orders/${testOrderId}/returns/simulate`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      storeId,
                      testSource: runId,
                      claimId,
                      claimStatus,
                      approveOrReject,
                      returnReasonId: returnReasonCode,
                      returnReasonText: reason?.name ?? null,
                      rejectTrackingNumber: approveOrReject === "reject" ? rejectTrackingNumber : null,
                      rejectProviderName: approveOrReject === "reject" ? rejectProviderName : null,
                      rejectPackageId: approveOrReject === "reject" ? rejectPackageId || null : null
                    })
                  });
                  const data = await res.json();
                  if (!res.ok || !data.success) throw new Error(extractApiErrorMessage(data, "Returns simülasyonu başarısız"));
                  setReturnsRes({ ok: true, msg: `OK: claim=${data.claimRecordId}` });
                });
              } catch (e) {
                setReturnsRes({ ok: false, msg: e instanceof Error ? e.message : "Returns simülasyonu başarısız" });
              }
            }}
          >
            Claim Simüle Et
          </PremiumButton>
          {returnsRes ? <div className="text-sm text-slate-400">{returnsRes.msg}</div> : null}
        </PanelSurface>
      </div>

      <PanelSurface className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <SectionHeader title="Test Webhook Simulator" />
          {webhookRes ? <StatusSummaryBadge ok={webhookRes.ok} /> : null}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">nextPackageStatus</label>
            <PremiumSelect value={webhookNextPackageStatus} onChange={(e) => setWebhookNextPackageStatus(e.target.value)}>
              {["Created","Picking","Invoiced","Shipped","Delivered","UnSupplied","Cancelled","Returned","UnDelivered"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </PremiumSelect>
          </div>
          <div />
          <div>
            <label className="label">trackingNumber (opsiyonel)</label>
            <PremiumInput value={webhookTrackingNumber} onChange={(e) => setWebhookTrackingNumber(e.target.value)} />
          </div>
          <div>
            <label className="label">providerCode (opsiyonel)</label>
            <PremiumInput value={webhookProviderCode} onChange={(e) => setWebhookProviderCode(e.target.value)} />
          </div>
          <div>
            <label className="label">providerName (opsiyonel)</label>
            <PremiumInput value={webhookProviderName} onChange={(e) => setWebhookProviderName(e.target.value)} />
          </div>
        </div>

        <PremiumButton
          disabled={!testOrderExists}
          onClick={async () => {
            setWebhookRes(null);
            try {
              await withVerification(async () => {
                const res = await fetch(`/api/admin/test-lab/test-orders/${testOrderId}/webhook/simulate`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    storeId,
                    testSource: runId,
                    nextPackageStatus: webhookNextPackageStatus,
                    trackingNumber: webhookTrackingNumber || null,
                    providerCode: webhookProviderCode || null,
                    providerName: webhookProviderName || null
                  })
                });
                const data = await res.json();
                if (!res.ok || !data.success) throw new Error(extractApiErrorMessage(data, "Webhook simülasyonu başarısız"));
                setWebhookRes({ ok: true, msg: "OK" });
              });
            } catch (e) {
              setWebhookRes({ ok: false, msg: e instanceof Error ? e.message : "Webhook simülasyonu başarısız" });
            }
          }}
        >
          Webhook Payload Simüle Et
        </PremiumButton>
        {webhookRes ? <div className="text-sm text-slate-400">{webhookRes.msg}</div> : null}
      </PanelSurface>

      <PanelSurface className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <SectionHeader title="Verification Panel" />
          <div className="flex items-center gap-2">
            <StatusBadge variant="default">run:{runId.slice(0, 8)}…</StatusBadge>
          </div>
        </div>

        {!verification ? (
          <EmptyState title="Henüz doğrulama yok" description="Bir test çalıştırdığınızda burada üretilen event/log/record’lar görünecek." />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm">
                <div className="text-xs text-slate-500">TEST_ORDER_CREATED</div>
                <div className="mt-1">{testsPassed.orderCreated ? <StatusBadge variant="success">OK</StatusBadge> : <StatusBadge variant="danger">Missing</StatusBadge>}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm">
                <div className="text-xs text-slate-500">TEST_PACKAGE_SPLIT_CREATED</div>
                <div className="mt-1">{testsPassed.splitCreated ? <StatusBadge variant="success">OK</StatusBadge> : <StatusBadge variant="danger">Missing</StatusBadge>}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm">
                <div className="text-xs text-slate-500">TEST_TRACKING_UPDATED</div>
                <div className="mt-1">{testsPassed.trackingUpdated ? <StatusBadge variant="success">OK</StatusBadge> : <StatusBadge variant="danger">Missing</StatusBadge>}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm">
                <div className="text-xs text-slate-500">TEST_INVOICE_SENT</div>
                <div className="mt-1">{testsPassed.invoiceSent ? <StatusBadge variant="success">OK</StatusBadge> : <StatusBadge variant="danger">Missing</StatusBadge>}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm">
                <div className="text-xs text-slate-500">TEST_RETURN_CREATED</div>
                <div className="mt-1">{testsPassed.returnCreated ? <StatusBadge variant="success">OK</StatusBadge> : <StatusBadge variant="danger">Missing</StatusBadge>}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm">
                <div className="text-xs text-slate-500">TEST_WEBHOOK_SIMULATED</div>
                <div className="mt-1">{testsPassed.webhookSimulated ? <StatusBadge variant="success">OK</StatusBadge> : <StatusBadge variant="danger">Missing</StatusBadge>}</div>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="text-xs text-slate-500">Model Güncellemeleri</div>
                <div className="mt-2 space-y-1 text-sm text-slate-200">
                  <div>Orders: {verification.orders.length}</div>
                  <div>TrackingEvents: {verification.trackingEvents.length}</div>
                  <div>ShippingEvents: {verification.shippingEvents.length}</div>
                  <div>Invoices: {verification.invoices.length}</div>
                  <div>Claims: {verification.claims.length}</div>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 lg:col-span-2">
                <div className="text-xs text-slate-500">TEST Event’leri</div>
                <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-white/10 bg-slate-900/20">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-slate-400">
                        <th className="px-3 py-2">action</th>
                        <th className="px-3 py-2">createdAt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(verification.testEvents ?? []).slice(0, 50).map((e) => (
                        <tr key={e.id} className="border-t border-white/5">
                          <td className="px-3 py-2 font-mono text-slate-200">{e.action}</td>
                          <td className="px-3 py-2 text-slate-400">{new Date(e.createdAt).toLocaleString("tr-TR")}</td>
                        </tr>
                      ))}
                      {(verification.testEvents ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={2} className="px-3 py-3 text-slate-500">
                            Event yok.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="text-xs text-slate-500">Claim Events</div>
                <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-white/10 bg-slate-900/20">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-slate-400">
                        <th className="px-3 py-2">action</th>
                        <th className="px-3 py-2">claimRecordId</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(verification.claimEvents ?? []).slice(0, 50).map((e) => (
                        <tr key={e.id} className="border-t border-white/5">
                          <td className="px-3 py-2 font-mono text-slate-200">{e.action}</td>
                          <td className="px-3 py-2 text-slate-400">{e.claimRecordId}</td>
                        </tr>
                      ))}
                      {(verification.claimEvents ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={2} className="px-3 py-3 text-slate-500">
                            Claim event yok.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="text-xs text-slate-500">Activity Log</div>
                <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-white/10 bg-slate-900/20">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-slate-400">
                        <th className="px-3 py-2">action</th>
                        <th className="px-3 py-2">message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(verification.activityLogs ?? []).slice(0, 60).map((l) => (
                        <tr key={l.id} className="border-t border-white/5">
                          <td className="px-3 py-2 font-mono text-slate-200">{l.action}</td>
                          <td className="px-3 py-2 text-slate-400">{l.message}</td>
                        </tr>
                      ))}
                      {(verification.activityLogs ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={2} className="px-3 py-3 text-slate-500">
                            Activity log yok.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end">
              <PremiumButton onClick={() => void verificationFetch()}>Refresh</PremiumButton>
            </div>
          </div>
        )}
      </PanelSurface>
    </div>
  );
}

