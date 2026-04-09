"use client";

import {
  compactMarketplaceSyncLabel,
  marketplaceSyncChipClass
} from "@/lib/xml-sync/productSyncUi";

type Props = {
  marketplaceSyncStatus: string | null | undefined;
  hasTrendyolMapping: boolean;
};

export function ProductMarketplaceSyncChip({
  marketplaceSyncStatus,
  hasTrendyolMapping
}: Props) {
  const label = compactMarketplaceSyncLabel(marketplaceSyncStatus, hasTrendyolMapping);
  const cls = marketplaceSyncChipClass(marketplaceSyncStatus, hasTrendyolMapping);
  return (
    <span
      className={`inline-flex max-w-[11rem] truncate rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}
      title={label}
    >
      {label}
    </span>
  );
}
