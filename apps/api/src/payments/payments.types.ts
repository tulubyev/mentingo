import type {
  adminPaymentSchema,
  checkoutBodySchema,
  checkoutResponseSchema,
  createPromoCodeSchema,
  paymentsConfigSchema,
  paymentStatusResponseSchema,
  paymentsSummarySchema,
  priceQuoteSchema,
  promoCodeSchema,
  updatePromoCodeSchema,
} from "./payments.schema";
import type { PaymentStatus, PromoCodeDiscountType } from "@repo/shared";
import type { Static } from "@sinclair/typebox";
import type { payments } from "src/storage/schema";

export type PaymentsConfigResponse = Static<typeof paymentsConfigSchema>;
export type CheckoutBody = Static<typeof checkoutBodySchema>;
export type CheckoutResponse = Static<typeof checkoutResponseSchema>;
export type PriceQuote = Static<typeof priceQuoteSchema>;
export type PaymentStatusResponse = Static<typeof paymentStatusResponseSchema>;
export type AdminPayment = Static<typeof adminPaymentSchema>;
export type PaymentsSummary = Static<typeof paymentsSummarySchema>;
export type PromoCodeResponse = Static<typeof promoCodeSchema>;
export type CreatePromoCodeBody = Static<typeof createPromoCodeSchema>;
export type UpdatePromoCodeBody = Static<typeof updatePromoCodeSchema>;

export type PaymentRow = typeof payments.$inferSelect;

export type PromoCodeForPricing = {
  id: string;
  code: string;
  discountType: PromoCodeDiscountType;
  discountValue: number;
  courseId: string | null;
  validFrom: string | null;
  validTo: string | null;
  maxActivations: number | null;
  activationsCount: number;
  isActive: boolean;
};

export type PaymentsFilters = {
  status?: PaymentStatus;
  courseId?: string;
  userId?: string;
  search?: string;
  /** Inclusive calendar dates (YYYY-MM-DD), interpreted in UTC. */
  from?: string;
  to?: string;
};

export type PaymentsListQuery = PaymentsFilters & {
  page?: number;
  perPage?: number;
};

export type CheckoutCourse = {
  id: string;
  title: string;
  status: string;
  priceInCents: number;
  currency: string;
};

export type CheckoutUser = {
  id: string;
  email: string;
  deletedAt: string | null;
  archived: boolean;
};

/** What happened when a verified provider state was applied to our payment row. */
export type PaymentSyncOutcome =
  | "succeeded"
  | "canceled"
  | "refunded"
  | "pending"
  | "unchanged"
  | "rejected";

export type PaymentSyncResult = {
  outcome: PaymentSyncOutcome;
  /** Present when `outcome` is "rejected": why the provider state was not trusted. */
  reason?: string;
  payment: PaymentRow;
};

export type WebhookHandlingResult =
  | { handled: true; outcome: PaymentSyncOutcome }
  | { handled: false; reason: string };
