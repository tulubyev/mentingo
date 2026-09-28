export const PAYMENT_CHECKOUT_HANDLES = {
  BUY_BUTTON: "payment-checkout-buy-button",
  PROMO_TOGGLE: "payment-checkout-promo-toggle",
  PROMO_INPUT: "payment-checkout-promo-input",
  PROMO_APPLY: "payment-checkout-promo-apply",
  PROMO_REMOVE: "payment-checkout-promo-remove",
  DISCOUNTED_PRICE: "payment-checkout-discounted-price",
} as const;

export const PAYMENT_RETURN_HANDLES = {
  PAGE: "payment-return-page",
  STATUS: "payment-return-status",
  GO_TO_COURSE: "payment-return-go-to-course",
  RETRY: "payment-return-retry",
  CHECK_AGAIN: "payment-return-check-again",
} as const;

export const ADMIN_PAYMENTS_HANDLES = {
  PAGE: "admin-payments-page",
  TABLE: "admin-payments-table",
  EXPORT_BUTTON: "admin-payments-export-button",
  SEARCH_INPUT: "admin-payments-search-input",
  STATUS_FILTER: "admin-payments-status-filter",
  COURSE_FILTER: "admin-payments-course-filter",
  FROM_FILTER: "admin-payments-from-filter",
  TO_FILTER: "admin-payments-to-filter",
  SUMMARY: "admin-payments-summary",
  refundButton: (paymentId: string) => `admin-payments-refund-${paymentId}`,
  REFUND_CONFIRM: "admin-payments-refund-confirm",
} as const;

export const ADMIN_PROMO_CODES_HANDLES = {
  PAGE: "admin-promo-codes-page",
  TABLE: "admin-promo-codes-table",
  CREATE_BUTTON: "admin-promo-codes-create-button",
  FORM_DIALOG: "admin-promo-codes-form-dialog",
  CODE_INPUT: "admin-promo-codes-code-input",
  VALUE_INPUT: "admin-promo-codes-value-input",
  SAVE_BUTTON: "admin-promo-codes-save-button",
  editButton: (id: string) => `admin-promo-codes-edit-${id}`,
  deleteButton: (id: string) => `admin-promo-codes-delete-${id}`,
  activeSwitch: (id: string) => `admin-promo-codes-active-${id}`,
} as const;
