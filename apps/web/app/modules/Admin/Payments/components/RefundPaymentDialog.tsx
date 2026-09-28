import { useTranslation } from "react-i18next";

import { useRefundPayment } from "~/api/mutations/admin/useRefundPayment";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";

import { ADMIN_PAYMENTS_HANDLES } from "../../../../../e2e/data/payments/handles";

type RefundPaymentDialogProps = {
  payment: {
    id: string;
    courseTitle: string;
    userEmail: string | null;
    amountLabel: string;
  } | null;
  onClose: () => void;
};

export const RefundPaymentDialog = ({ payment, onClose }: RefundPaymentDialogProps) => {
  const { t } = useTranslation();
  const { mutateAsync: refundPayment, isPending } = useRefundPayment();

  const handleConfirm = async () => {
    if (!payment) return;

    await refundPayment(payment.id).catch(() => null);
    onClose();
  };

  return (
    <AlertDialog open={Boolean(payment)} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("adminPaymentsView.refund.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("adminPaymentsView.refund.description", {
              amount: payment?.amountLabel ?? "",
              course: payment?.courseTitle ?? "",
              email: payment?.userEmail ?? "—",
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{t("common.button.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            data-testid={ADMIN_PAYMENTS_HANDLES.REFUND_CONFIRM}
            disabled={isPending}
            onClick={(event) => {
              event.preventDefault();
              void handleConfirm();
            }}
          >
            {t("adminPaymentsView.refund.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
