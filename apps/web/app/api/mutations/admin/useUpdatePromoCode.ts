import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { ApiClient } from "~/api/api-client";
import { PROMO_CODES_QUERY_KEY } from "~/api/queries/admin/usePromoCodes";
import { queryClient } from "~/api/queryClient";
import { getTranslatedApiErrorMessage } from "~/api/utils/getTranslatedApiErrorMessage";
import { useToast } from "~/components/ui/use-toast";

import type { UpdatePromoCodeBody } from "~/api/generated-api";

export function useUpdatePromoCode() {
  const { t } = useTranslation();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdatePromoCodeBody }) => {
      const response = await ApiClient.api.promoCodesControllerUpdatePromoCode(id, data);

      return response.data.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [PROMO_CODES_QUERY_KEY] });
      toast({ description: t("adminPromoCodesView.toast.updated") });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        description: getTranslatedApiErrorMessage(error, t, t("payments.errors.generic")),
      });
    },
  });
}
