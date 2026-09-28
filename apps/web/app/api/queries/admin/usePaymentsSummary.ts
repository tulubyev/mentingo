import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";

import { ApiClient } from "~/api/api-client";

import { PAYMENTS_QUERY_KEY } from "./usePayments";

import type { PaymentsFiltersParams } from "./usePayments.types";

export const paymentsSummaryQueryOptions = (params: PaymentsFiltersParams) =>
  queryOptions({
    queryKey: [PAYMENTS_QUERY_KEY, "summary", params],
    queryFn: async () => {
      const response = await ApiClient.api.paymentsControllerGetPaymentsSummary(params);

      return response.data.data;
    },
    placeholderData: keepPreviousData,
  });

export function usePaymentsSummary(params: PaymentsFiltersParams) {
  return useQuery(paymentsSummaryQueryOptions(params));
}
