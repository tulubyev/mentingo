import { useNavigate } from "@remix-run/react";
import { PAYMENT_STATUSES, type PaymentStatus } from "@repo/shared";
import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { format } from "date-fns";
import { Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { usePayments } from "~/api/queries/admin/usePayments";
import { usePaymentsSummary } from "~/api/queries/admin/usePaymentsSummary";
import { useCourses } from "~/api/queries/useCourses";
import { usePaymentsConfig } from "~/api/queries/usePaymentsConfig";
import { PageWrapper } from "~/components/PageWrapper";
import {
  ITEMS_PER_PAGE_OPTIONS,
  Pagination,
  type ItemsPerPageOption,
} from "~/components/Pagination/Pagination";
import { Button } from "~/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { formatPrice } from "~/lib/formatters/priceFormatter";
import {
  type FilterConfig,
  type FilterValue,
  SearchFilter,
} from "~/modules/common/SearchFilter/SearchFilter";
import { useLanguageStore } from "~/modules/Dashboard/Settings/Language/LanguageStore";
import { getCurrencyLocale } from "~/utils/getCurrencyLocale";
import { setPageTitle } from "~/utils/setPageTitle";

import { ADMIN_PAYMENTS_HANDLES } from "../../../../e2e/data/payments/handles";

import { PaymentStatusBadge } from "./components/PaymentStatusBadge";
import { RefundPaymentDialog } from "./components/RefundPaymentDialog";
import { useDownloadPaymentsCsv } from "./hooks/useDownloadPaymentsCsv";

import type { MetaFunction } from "@remix-run/react";
import type { GetPaymentsResponse } from "~/api/generated-api";
import type { PaymentsFiltersParams } from "~/api/queries/admin/usePayments.types";

export const meta: MetaFunction = ({ matches }) => setPageTitle(matches, "pages.payments");

type PaymentRow = GetPaymentsResponse["data"][number];

type Filters = {
  search?: string;
  status?: PaymentStatus;
  courseId?: string;
  from?: string;
  to?: string;
};

const REFUNDABLE_STATUSES: PaymentStatus[] = [
  PAYMENT_STATUSES.SUCCEEDED,
  PAYMENT_STATUSES.PARTIALLY_REFUNDED,
];

export default function PaymentsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const language = useLanguageStore((state) => state.language);
  const { data: paymentsConfig, isLoading: isConfigLoading } = usePaymentsConfig();
  const isYooKassa = paymentsConfig?.provider === "yookassa";

  const [filters, setFilters] = useState<Filters>({});
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState<ItemsPerPageOption>(ITEMS_PER_PAGE_OPTIONS[1]);
  const [paymentToRefund, setPaymentToRefund] = useState<PaymentRow | null>(null);

  const filterParams: PaymentsFiltersParams = useMemo(
    () => Object.fromEntries(Object.entries(filters).filter(([, value]) => Boolean(value))),
    [filters],
  );

  const { data: payments, isLoading } = usePayments({ ...filterParams, page, perPage });
  const { data: summary } = usePaymentsSummary(filterParams);
  const { data: courses } = useCourses({ language });
  const { downloadCsv, isDownloading } = useDownloadPaymentsCsv();

  useEffect(() => {
    if (!isConfigLoading && !isYooKassa) navigate("/");
  }, [isConfigLoading, isYooKassa, navigate]);

  const formatAmount = (amount: number, currency: string) =>
    formatPrice(amount, currency, getCurrencyLocale(currency));

  const formatDate = (value: string | null) =>
    value ? format(new Date(value), "dd.MM.yyyy HH:mm") : "—";

  const filterConfig: FilterConfig[] = [
    {
      name: "search",
      type: "text",
      placeholder: t("adminPaymentsView.filters.search"),
      testId: ADMIN_PAYMENTS_HANDLES.SEARCH_INPUT,
    },
    {
      name: "status",
      type: "select",
      placeholder: t("adminPaymentsView.filters.status"),
      testId: ADMIN_PAYMENTS_HANDLES.STATUS_FILTER,
      options: Object.values(PAYMENT_STATUSES).map((status) => ({
        value: status,
        label: t(`adminPaymentsView.status.${status}`),
      })),
    },
    {
      name: "courseId",
      type: "select",
      placeholder: t("adminPaymentsView.filters.course"),
      testId: ADMIN_PAYMENTS_HANDLES.COURSE_FILTER,
      options: (courses ?? []).map((course) => ({ value: course.id, label: course.title })),
    },
    {
      name: "from",
      type: "date",
      placeholder: t("adminPaymentsView.filters.from"),
      testId: ADMIN_PAYMENTS_HANDLES.FROM_FILTER,
    },
    {
      name: "to",
      type: "date",
      placeholder: t("adminPaymentsView.filters.to"),
      testId: ADMIN_PAYMENTS_HANDLES.TO_FILTER,
    },
  ];

  const handleFilterChange = (name: string, value: FilterValue) => {
    setPage(1);
    setFilters((previous) => ({ ...previous, [name]: value || undefined }));
  };

  const columns: ColumnDef<PaymentRow>[] = [
    {
      id: "date",
      header: t("adminPaymentsView.columns.date"),
      cell: ({ row }) => formatDate(row.original.paidAt ?? row.original.createdAt),
    },
    {
      id: "user",
      header: t("adminPaymentsView.columns.user"),
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span>
            {[row.original.userFirstName, row.original.userLastName].filter(Boolean).join(" ") ||
              "—"}
          </span>
          <span className="details text-neutral-600">{row.original.userEmail ?? "—"}</span>
        </div>
      ),
    },
    {
      id: "course",
      header: t("adminPaymentsView.columns.course"),
      cell: ({ row }) => row.original.courseTitle,
    },
    {
      id: "amount",
      header: t("adminPaymentsView.columns.amount"),
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">
            {formatAmount(row.original.amount, row.original.currency)}
          </span>
          {row.original.discountAmount > 0 && (
            <span className="details text-neutral-600">
              {t("adminPaymentsView.columns.discountOf", {
                discount: formatAmount(row.original.discountAmount, row.original.currency),
                original: formatAmount(row.original.originalAmount, row.original.currency),
              })}
            </span>
          )}
          {row.original.refundedAmount > 0 && (
            <span className="details text-error-700">
              {t("adminPaymentsView.columns.refundedOf", {
                amount: formatAmount(row.original.refundedAmount, row.original.currency),
              })}
            </span>
          )}
        </div>
      ),
    },
    {
      id: "promoCode",
      header: t("adminPaymentsView.columns.promoCode"),
      cell: ({ row }) => row.original.promoCode ?? "—",
    },
    {
      id: "status",
      header: t("adminPaymentsView.columns.status"),
      cell: ({ row }) => <PaymentStatusBadge status={row.original.status} />,
    },
    {
      id: "providerPaymentId",
      header: t("adminPaymentsView.columns.providerPaymentId"),
      cell: ({ row }) => (
        <span className="details break-all font-mono text-neutral-700">
          {row.original.providerPaymentId ?? "—"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) =>
        REFUNDABLE_STATUSES.includes(row.original.status) && (
          <Button
            data-testid={ADMIN_PAYMENTS_HANDLES.refundButton(row.original.id)}
            variant="outline"
            size="sm"
            onClick={() => setPaymentToRefund(row.original)}
          >
            {t("adminPaymentsView.refund.button")}
          </Button>
        ),
    },
  ];

  const table = useReactTable({
    data: payments?.data ?? [],
    columns,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
  });

  const summaryCurrency = summary?.currency ?? "rub";

  const summaryItems = [
    { label: t("adminPaymentsView.summary.count"), value: String(summary?.count ?? 0) },
    {
      label: t("adminPaymentsView.summary.paidCount"),
      value: String(summary?.succeededCount ?? 0),
    },
    {
      label: t("adminPaymentsView.summary.total"),
      value: formatAmount(summary?.totalAmount ?? 0, summaryCurrency),
    },
    {
      label: t("adminPaymentsView.summary.refunded"),
      value: formatAmount(summary?.refundedAmount ?? 0, summaryCurrency),
    },
    {
      label: t("adminPaymentsView.summary.net"),
      value: formatAmount(summary?.netAmount ?? 0, summaryCurrency),
    },
  ];

  if (!isYooKassa) return null;

  return (
    <PageWrapper
      breadcrumbs={[
        { title: t("adminPaymentsView.breadcrumbs.payments"), href: "/admin/payments" },
      ]}
    >
      <div data-testid={ADMIN_PAYMENTS_HANDLES.PAGE} className="flex flex-col gap-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="h4 text-neutral-950">{t("adminPaymentsView.header")}</h4>
          <Button
            data-testid={ADMIN_PAYMENTS_HANDLES.EXPORT_BUTTON}
            variant="outline"
            className="gap-x-2"
            disabled={isDownloading}
            onClick={() => void downloadCsv(filterParams)}
          >
            <Download className="size-4" />
            {t("adminPaymentsView.exportCsv")}
          </Button>
        </div>

        <SearchFilter
          filters={filterConfig}
          values={filters}
          onChange={handleFilterChange}
          onClearAll={() => {
            setPage(1);
            setFilters({});
          }}
          isLoading={isLoading}
        />

        <div
          data-testid={ADMIN_PAYMENTS_HANDLES.SUMMARY}
          className="grid grid-cols-2 gap-3 md:grid-cols-5"
        >
          {summaryItems.map(({ label, value }) => (
            <div key={label} className="flex flex-col rounded-lg border bg-white p-4">
              <span className="details text-neutral-600">{label}</span>
              <span className="h6 text-neutral-950">{value}</span>
            </div>
          ))}
        </div>

        <Table data-testid={ADMIN_PAYMENTS_HANDLES.TABLE} className="border bg-neutral-50">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-payment-id={row.original.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center text-neutral-600">
                  {isLoading ? t("adminPaymentsView.loading") : t("adminPaymentsView.empty")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <Pagination
          totalItems={payments?.pagination.totalItems ?? 0}
          itemsPerPage={perPage}
          currentPage={page}
          onPageChange={setPage}
          onItemsPerPageChange={(value) => {
            setPage(1);
            setPerPage(Number(value) as ItemsPerPageOption);
          }}
        />
      </div>

      <RefundPaymentDialog
        payment={
          paymentToRefund
            ? {
                id: paymentToRefund.id,
                courseTitle: paymentToRefund.courseTitle,
                userEmail: paymentToRefund.userEmail,
                amountLabel: formatAmount(
                  paymentToRefund.amount - paymentToRefund.refundedAmount,
                  paymentToRefund.currency,
                ),
              }
            : null
        }
        onClose={() => setPaymentToRefund(null)}
      />
    </PageWrapper>
  );
}
