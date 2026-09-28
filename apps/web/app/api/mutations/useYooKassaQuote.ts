import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { useToast } from "~/components/ui/use-toast";

import { ApiClient } from "../api-client";
import { getTranslatedApiErrorMessage } from "../utils/getTranslatedApiErrorMessage";

import type { GetYooKassaQuoteBody } from "../generated-api";

export function useYooKassaQuote() {
  const { t } = useTranslation();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (body: GetYooKassaQuoteBody) => {
      const response = await ApiClient.api.paymentsControllerGetYooKassaQuote(body);

      return response.data.data;
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        description: getTranslatedApiErrorMessage(error, t, t("payments.errors.generic")),
      });
    },
  });
}
