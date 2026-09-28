import { PAYMENT_PROVIDERS } from "@repo/shared";
import { queryOptions, useQuery } from "@tanstack/react-query";

import { ApiClient } from "../api-client";

export const paymentsConfigQueryOptions = queryOptions({
  queryKey: ["paymentsConfig"],
  queryFn: async () => {
    const response = await ApiClient.api.paymentsControllerGetPaymentsConfig();

    return response.data.data;
  },
  staleTime: 5 * 60 * 1000,
});

export function usePaymentsConfig() {
  return useQuery(paymentsConfigQueryOptions);
}

/** True when course payments go through ЮKassa (prices in RUB, redirect checkout). */
export function useIsYooKassaEnabled() {
  const { data } = usePaymentsConfig();

  return data?.provider === PAYMENT_PROVIDERS.YOOKASSA;
}
