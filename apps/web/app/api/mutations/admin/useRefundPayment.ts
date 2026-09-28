import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { ApiClient } from "~/api/api-client";
import { PAYMENTS_QUERY_KEY } from "~/api/queries/admin/usePayments";
import { queryClient } from "~/api/queryClient";
import { getTranslatedApiErrorMessage } from "~/api/utils/getTranslatedApiErrorMessage";
import { useToast } from "~/components/ui/use-toast";

export function useRefundPayment() {
  const { t } = useTranslation();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (paymentId: string) => {
      const response = await ApiClient.api.paymentsControllerRefundPayment(paymentId);

      return response.data.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [PAYMENTS_QUERY_KEY] });
      toast({ description: t("adminPaymentsView.toast.refunded") });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        description: getTranslatedApiErrorMessage(error, t, t("payments.errors.generic")),
      });
    },
  });
}
