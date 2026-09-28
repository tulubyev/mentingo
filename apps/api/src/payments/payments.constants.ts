/** Injection token for the HTTP implementation used by the ЮKassa client (global fetch by default). */
export const YOOKASSA_FETCH = Symbol("YOOKASSA_FETCH");

/** A pending checkout with the same price is reused for this long instead of creating a new one. */
export const PENDING_PAYMENT_REUSE_WINDOW_MS = 30 * 60 * 1000;

export const PAYMENTS_CSV_DELIMITER = ";";

export const PAYMENT_CANCELLATION_REASONS = {
  PROVIDER_ERROR: "provider_error",
} as const;

/** API error messages are translation keys resolved by the web app. */
export const PAYMENT_ERRORS = {
  NOT_CONFIGURED: "payments.errors.notConfigured",
  COURSE_NOT_FOUND: "payments.errors.courseNotFound",
  COURSE_NOT_AVAILABLE: "payments.errors.courseNotAvailable",
  COURSE_IS_FREE: "payments.errors.courseIsFree",
  UNSUPPORTED_CURRENCY: "payments.errors.unsupportedCurrency",
  ALREADY_ENROLLED: "payments.errors.alreadyEnrolled",
  AMOUNT_TOO_LOW: "payments.errors.amountTooLow",
  RECEIPT_EMAIL_REQUIRED: "payments.errors.receiptEmailRequired",
  PROVIDER_UNAVAILABLE: "payments.errors.providerUnavailable",
  PAYMENT_NOT_FOUND: "payments.errors.paymentNotFound",
  REFUND_NOT_ALLOWED: "payments.errors.refundNotAllowed",
  REFUND_FAILED: "payments.errors.refundFailed",
  PROMO_CODE_NOT_FOUND: "payments.errors.promoCodeNotFound",
  PROMO_CODE_INACTIVE: "payments.errors.promoCodeInactive",
  PROMO_CODE_NOT_APPLICABLE: "payments.errors.promoCodeNotApplicable",
  PROMO_CODE_NOT_STARTED: "payments.errors.promoCodeNotStarted",
  PROMO_CODE_EXPIRED: "payments.errors.promoCodeExpired",
  PROMO_CODE_EXHAUSTED: "payments.errors.promoCodeExhausted",
  PROMO_CODE_INVALID_FORMAT: "payments.errors.promoCodeInvalidFormat",
  PROMO_CODE_DUPLICATE: "payments.errors.promoCodeDuplicate",
  PROMO_CODE_INVALID_VALUE: "payments.errors.promoCodeInvalidValue",
  PROMO_CODE_INVALID_DATES: "payments.errors.promoCodeInvalidDates",
  PAYMENT_REQUIRED: "payments.errors.paymentRequired",
} as const;
