import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";

import { ApiClient } from "~/api/api-client";

import type { PaymentsControllerGetPaymentsParams } from "./usePayments.types";

export const PAYMENTS_QUERY_KEY = "adminPayments";

export const paymentsQueryOptions = (params: PaymentsControllerGetPaymentsParams) =>
  queryOptions({
    queryKey: [PAYMENTS_QUERY_KEY, "list", params],
    queryFn: async () => {
      const response = await ApiClient.api.paymentsControllerGetPayments(params);

      return response.data;
    },
    placeholderData: keepPreviousData,
  });

export function usePayments(params: PaymentsControllerGetPaymentsParams) {
  return useQuery(paymentsQueryOptions(params));
}
