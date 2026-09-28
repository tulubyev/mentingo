export const PAYMENT_PROVIDERS = {
  YOOKASSA: "yookassa",
  STRIPE: "stripe",
} as const;

export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[keyof typeof PAYMENT_PROVIDERS];

export const PAYMENT_STATUSES = {
  PENDING: "pending",
  SUCCEEDED: "succeeded",
  CANCELED: "canceled",
  REFUNDED: "refunded",
  PARTIALLY_REFUNDED: "partially_refunded",
} as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[keyof typeof PAYMENT_STATUSES];

export const PROMO_CODE_DISCOUNT_TYPES = {
  PERCENT: "percent",
  FIXED: "fixed",
} as const;

export type PromoCodeDiscountType =
  (typeof PROMO_CODE_DISCOUNT_TYPES)[keyof typeof PROMO_CODE_DISCOUNT_TYPES];

/** Currency used by ЮKassa course payments (lowercase, like `courses.currency`). */
export const YOOKASSA_CURRENCY = "rub";
