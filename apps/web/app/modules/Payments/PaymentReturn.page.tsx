import { Link, useNavigate, useSearchParams } from "@remix-run/react";
import { PAYMENT_STATUSES } from "@repo/shared";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { match } from "ts-pattern";

import { courseQueryOptions, studentCoursesQueryOptions } from "~/api/queries";
import { usePaymentStatus } from "~/api/queries/usePaymentStatus";
import { queryClient } from "~/api/queryClient";
import { PageWrapper } from "~/components/PageWrapper";
import { Button } from "~/components/ui/button";
import { useLanguageStore } from "~/modules/Dashboard/Settings/Language/LanguageStore";
import { setPageTitle } from "~/utils/setPageTitle";

import { PAYMENT_RETURN_HANDLES } from "../../../e2e/data/payments/handles";

import type { MetaFunction } from "@remix-run/react";

export const meta: MetaFunction = ({ matches }) => setPageTitle(matches, "pages.paymentReturn");

/** Give the provider notification this long before showing "still processing". */
const PENDING_TIMEOUT_MS = 90_000;
const REDIRECT_DELAY_MS = 1500;

type ViewState = "loading" | "succeeded" | "failed" | "processing" | "notFound";

export default function PaymentReturnPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const language = useLanguageStore((state) => state.language);
  const paymentId = searchParams.get("paymentId") ?? "";
  const [isTimedOut, setIsTimedOut] = useState(false);

  const { data, isError, isFetching, refetch } = usePaymentStatus(paymentId, {
    poll: !isTimedOut,
  });

  useEffect(() => {
    const timer = setTimeout(() => setIsTimedOut(true), PENDING_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, []);

  const courseId = data?.courseId ?? null;
  const isSucceeded = data?.status === PAYMENT_STATUSES.SUCCEEDED;

  useEffect(() => {
    if (!isSucceeded || !courseId) return;

    void queryClient.invalidateQueries(courseQueryOptions(courseId));
    void queryClient.invalidateQueries(studentCoursesQueryOptions({ language }));

    const timer = setTimeout(() => navigate(`/course/${courseId}`), REDIRECT_DELAY_MS);

    return () => clearTimeout(timer);
  }, [courseId, isSucceeded, language, navigate]);

  const viewState: ViewState = match({ paymentId, isError, status: data?.status, isTimedOut })
    .returnType<ViewState>()
    .with({ paymentId: "" }, () => "notFound")
    .with({ isError: true }, () => "notFound")
    .with({ status: PAYMENT_STATUSES.SUCCEEDED }, () => "succeeded")
    .with({ status: PAYMENT_STATUSES.CANCELED }, () => "failed")
    .with({ status: PAYMENT_STATUSES.REFUNDED }, () => "failed")
    .with({ status: PAYMENT_STATUSES.PARTIALLY_REFUNDED }, () => "failed")
    .with({ status: PAYMENT_STATUSES.PENDING, isTimedOut: true }, () => "processing")
    .otherwise(() => "loading");

  const icon = match(viewState)
    .with("succeeded", () => <CheckCircle2 className="size-12 text-success-600" />)
    .with("failed", "notFound", () => <XCircle className="size-12 text-error-600" />)
    .with("processing", () => <Clock className="size-12 text-warning-600" />)
    .otherwise(() => <Loader2 className="size-12 animate-spin text-primary-700" />);

  return (
    <PageWrapper>
      <div
        data-testid={PAYMENT_RETURN_HANDLES.PAGE}
        className="mx-auto flex max-w-lg flex-col items-center gap-y-4 rounded-lg bg-white p-8 text-center"
      >
        {icon}
        <h1 className="h5 text-neutral-950" data-testid={PAYMENT_RETURN_HANDLES.STATUS}>
          {t(`payments.return.${viewState}.title`)}
        </h1>
        <p className="body-base text-neutral-800">
          {t(`payments.return.${viewState}.description`)}
        </p>

        <div className="flex flex-wrap justify-center gap-2">
          {courseId && (viewState === "succeeded" || viewState === "processing") && (
            <Link to={`/course/${courseId}`} data-testid={PAYMENT_RETURN_HANDLES.GO_TO_COURSE}>
              <Button variant="primary">{t("payments.return.goToCourse")}</Button>
            </Link>
          )}

          {courseId && viewState === "failed" && (
            <Link to={`/course/${courseId}`} data-testid={PAYMENT_RETURN_HANDLES.RETRY}>
              <Button variant="primary">{t("payments.return.tryAgain")}</Button>
            </Link>
          )}

          {viewState === "processing" && (
            <Button
              variant="outline"
              data-testid={PAYMENT_RETURN_HANDLES.CHECK_AGAIN}
              disabled={isFetching}
              onClick={() => void refetch()}
            >
              {t("payments.return.checkAgain")}
            </Button>
          )}

          {viewState === "notFound" && (
            <Link to="/courses">
              <Button variant="outline">{t("payments.return.toCourses")}</Button>
            </Link>
          )}
        </div>
      </div>
    </PageWrapper>
  );
}
