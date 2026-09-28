import type { API } from "~/api/generated-api";

export type PaymentsControllerGetPaymentsParams = NonNullable<
  Parameters<API<unknown>["api"]["paymentsControllerGetPayments"]>[0]
>;

export type PaymentsFiltersParams = NonNullable<
  Parameters<API<unknown>["api"]["paymentsControllerGetPaymentsSummary"]>[0]
>;
