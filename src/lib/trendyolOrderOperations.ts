import { updatePackageStatus } from "@/lib/trendyolOrderActions";

export async function sendPickingToTrendyol(params: {
  userId: string;
  storeId: string;
  shipmentPackageId: string;
}) {
  return updatePackageStatus(
    params.userId,
    params.storeId,
    params.shipmentPackageId,
    "Picking",
    {}
  );
}

export async function sendInvoicedToTrendyol(params: {
  userId: string;
  storeId: string;
  shipmentPackageId: string;
  invoiceNumber?: string;
}) {
  return updatePackageStatus(
    params.userId,
    params.storeId,
    params.shipmentPackageId,
    "Invoiced",
    { invoiceNumber: params.invoiceNumber }
  );
}

export async function sendUnsuppliedToTrendyol(params: {
  userId: string;
  storeId: string;
  shipmentPackageId: string;
  reasonId?: number;
  lines?: Array<{ lineId?: string | null; quantity?: number | null }>;
}) {
  return updatePackageStatus(
    params.userId,
    params.storeId,
    params.shipmentPackageId,
    "Unsupplied",
    {
      reasonId: params.reasonId,
      lines: params.lines
    }
  );
}

