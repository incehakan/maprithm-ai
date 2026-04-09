export type PublishItemStatus = "SUCCESS" | "FAILED" | "PENDING";

export interface PublishItemResult {
  productId: string;
  mappingId?: string;
  barcode?: string;
  status: PublishItemStatus;
  errorCode?: string;
  errorMessage?: string;
  rawMessage?: string;
  batchRequestId?: string;
}

export interface PublishBatchResult {
  total: number;
  success: number;
  failed: number;
  pending: number;
  results: PublishItemResult[];
}
