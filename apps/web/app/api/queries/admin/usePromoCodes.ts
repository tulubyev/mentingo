import { queryOptions, useQuery } from "@tanstack/react-query";

import { ApiClient } from "~/api/api-client";

export const PROMO_CODES_QUERY_KEY = "promoCodes";

export const promoCodesQueryOptions = (enabled = true) =>
  queryOptions({
    queryKey: [PROMO_CODES_QUERY_KEY],
    queryFn: async () => {
      const response = await ApiClient.api.promoCodesControllerGetPromoCodes();

      return response.data.data;
    },
    enabled,
  });

export function usePromoCodes(enabled = true) {
  return useQuery(promoCodesQueryOptions(enabled));
}
