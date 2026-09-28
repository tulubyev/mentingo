import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ApiClient } from "~/api/api-client";
import { useToast } from "~/components/ui/use-toast";
import {
  extractFilenameFromContentDisposition,
  triggerBrowserDownload,
} from "~/utils/downloadFile";

import type { AxiosResponse } from "axios";
import type { PaymentsFiltersParams } from "~/api/queries/admin/usePayments.types";

export function useDownloadPaymentsCsv() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isDownloading, setIsDownloading] = useState(false);

  const downloadCsv = async (filters: PaymentsFiltersParams) => {
    setIsDownloading(true);

    try {
      const response = (await ApiClient.api.paymentsControllerExportPayments(filters, {
        format: "blob",
      })) as unknown as AxiosResponse<Blob>;

      const filename =
        extractFilenameFromContentDisposition(response.headers["content-disposition"]) ||
        "payments.csv";

      triggerBrowserDownload(response.data, filename);
    } catch {
      toast({ variant: "destructive", description: t("adminPaymentsView.toast.exportFailed") });
    } finally {
      setIsDownloading(false);
    }
  };

  return { downloadCsv, isDownloading };
}
