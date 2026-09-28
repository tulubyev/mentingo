import { PAYMENT_STATUSES } from "@repo/shared";
import { queryOptions, useQuery } from "@tanstack/react-query";

import { ApiClient } from "../api-client";

const POLL_INTERVAL_MS = 2500;

export const paymentStatusQueryOptions = (paymentId: string) =>
  queryOptions({
    queryKey: ["paymentStatus", paymentId],
    queryFn: async () => {
      const response = await ApiClient.api.paymentsControllerGetPaymentStatus(paymentId);

      return response.data.data;
    },
    enabled: Boolean(paymentId),
    retry: 1,
  });

/** Polls the payment while it is pending; `enabled: false` stops polling (e.g. after a timeout). */
export function usePaymentStatus(paymentId: string, { poll = true }: { poll?: boolean } = {}) {
  return useQuery({
    ...paymentStatusQueryOptions(paymentId),
    refetchInterval: (query) =>
      poll && query.state.data?.status === PAYMENT_STATUSES.PENDING ? POLL_INTERVAL_MS : false,
  });
}
