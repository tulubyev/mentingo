/**
 * Subset of the ЮKassa REST API v3 contract used by the LMS.
 * https://yookassa.ru/developers/api
 */

export type YooKassaAmount = {
  /** Decimal string with two fraction digits, e.g. "1500.00". */
  value: string;
  /** ISO-4217 upper-case code, e.g. "RUB". */
  currency: string;
};

export type YooKassaPaymentStatus = "pending" | "waiting_for_capture" | "succeeded" | "canceled";

export type YooKassaReceiptItem = {
  description: string;
  quantity: string;
  amount: YooKassaAmount;
  vat_code: number;
  payment_subject: "service";
  payment_mode: "full_payment";
};

export type YooKassaReceipt = {
  customer: { email?: string; phone?: string };
  items: YooKassaReceiptItem[];
  tax_system_code?: number;
};

export type YooKassaPaymentMetadata = {
  paymentId: string;
  tenantId: string;
  userId: string;
  courseId: string;
};

export type YooKassaCreatePaymentRequest = {
  amount: YooKassaAmount;
  confirmation: { type: "redirect"; return_url: string; locale?: "ru_RU" | "en_US" };
  capture: boolean;
  description: string;
  metadata: YooKassaPaymentMetadata;
  receipt?: YooKassaReceipt;
};

export type YooKassaPayment = {
  id: string;
  status: YooKassaPaymentStatus;
  paid?: boolean;
  amount: YooKassaAmount;
  refunded_amount?: YooKassaAmount;
  confirmation?: { type: string; confirmation_url?: string };
  captured_at?: string;
  created_at?: string;
  description?: string;
  metadata?: Record<string, string>;
  cancellation_details?: { party?: string; reason?: string };
  test?: boolean;
};

export type YooKassaCreateRefundRequest = {
  payment_id: string;
  amount: YooKassaAmount;
  description?: string;
  receipt?: YooKassaReceipt;
};

export type YooKassaRefund = {
  id: string;
  payment_id: string;
  status: "pending" | "succeeded" | "canceled";
  amount: YooKassaAmount;
  created_at?: string;
};

export type YooKassaNotificationEvent =
  | "payment.succeeded"
  | "payment.waiting_for_capture"
  | "payment.canceled"
  | "refund.succeeded";

export type YooKassaErrorBody = {
  type?: string;
  id?: string;
  code?: string;
  description?: string;
  parameter?: string;
};

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type YooKassaConfig = {
  enabled: boolean;
  shopId: string;
  secretKey: string;
  apiUrl: string;
  receiptEnabled: boolean;
  vatCode: number;
  taxSystemCode?: number;
  webhookIpCheck: boolean;
  /** Env variables that are set but hold an invalid value (logged on startup). */
  invalidSettings: string[];
};
