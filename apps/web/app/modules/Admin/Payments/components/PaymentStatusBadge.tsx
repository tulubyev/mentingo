import { PAYMENT_STATUSES, type PaymentStatus } from "@repo/shared";
import { useTranslation } from "react-i18next";
import { match } from "ts-pattern";

import { Badge } from "~/components/ui/badge";

type PaymentStatusBadgeProps = {
  status: PaymentStatus;
};

export const PaymentStatusBadge = ({ status }: PaymentStatusBadgeProps) => {
  const { t } = useTranslation();

  const variant = match(status)
    .with(PAYMENT_STATUSES.SUCCEEDED, () => "success" as const)
    .with(PAYMENT_STATUSES.PENDING, () => "inProgress" as const)
    .with(PAYMENT_STATUSES.CANCELED, () => "notStarted" as const)
    .with(PAYMENT_STATUSES.REFUNDED, PAYMENT_STATUSES.PARTIALLY_REFUNDED, () => "draft" as const)
    .exhaustive();

  return <Badge variant={variant}>{t(`adminPaymentsView.status.${status}`)}</Badge>;
};
