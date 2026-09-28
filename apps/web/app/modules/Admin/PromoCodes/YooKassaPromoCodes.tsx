import { PROMO_CODE_DISCOUNT_TYPES, YOOKASSA_CURRENCY } from "@repo/shared";
import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { format } from "date-fns";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useDeletePromoCode } from "~/api/mutations/admin/useDeletePromoCode";
import { useUpdatePromoCode } from "~/api/mutations/admin/useUpdatePromoCode";
import { usePromoCodes } from "~/api/queries/admin/usePromoCodes";
import { useCourses } from "~/api/queries/useCourses";
import { PageWrapper } from "~/components/PageWrapper";
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
import { Button } from "~/components/ui/button";
import { Switch } from "~/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { formatPrice } from "~/lib/formatters/priceFormatter";
import { useLanguageStore } from "~/modules/Dashboard/Settings/Language/LanguageStore";

import { ADMIN_PROMO_CODES_HANDLES } from "../../../../e2e/data/payments/handles";

import { PromoCodeFormDialog } from "./components/PromoCodeFormDialog";

import type { GetPromoCodesResponse } from "~/api/generated-api";

type PromoCode = GetPromoCodesResponse["data"][number];

const formatDate = (value: string | null) => (value ? format(new Date(value), "dd.MM.yyyy") : "");

/** Local promo codes used by ЮKassa checkouts (Stripe promotion codes live in Stripe). */
export const YooKassaPromoCodes = () => {
  const { t } = useTranslation();
  const language = useLanguageStore((state) => state.language);
  const { data: promoCodes, isLoading } = usePromoCodes();
  const { data: courses } = useCourses({ language });
  const { mutateAsync: updatePromoCode } = useUpdatePromoCode();
  const { mutateAsync: deletePromoCode, isPending: isDeleting } = useDeletePromoCode();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editedPromoCode, setEditedPromoCode] = useState<PromoCode | null>(null);
  const [promoCodeToDelete, setPromoCodeToDelete] = useState<PromoCode | null>(null);

  const openForm = (promoCode: PromoCode | null) => {
    setEditedPromoCode(promoCode);
    setIsFormOpen(true);
  };

  const formatDiscount = (promo: PromoCode) =>
    promo.discountType === PROMO_CODE_DISCOUNT_TYPES.PERCENT
      ? `${promo.discountValue}%`
      : formatPrice(promo.discountValue, YOOKASSA_CURRENCY, "ru-RU");

  const formatValidity = (promo: PromoCode) => {
    if (!promo.validFrom && !promo.validTo) return t("adminPromoCodesView.validity.always");

    return [formatDate(promo.validFrom), formatDate(promo.validTo)].join(" — ");
  };

  const columns: ColumnDef<PromoCode>[] = [
    {
      id: "code",
      header: t("adminPromoCodesView.columns.code"),
      cell: ({ row }) => <span className="font-mono font-medium">{row.original.code}</span>,
    },
    {
      id: "discount",
      header: t("adminPromoCodesView.columns.discount"),
      cell: ({ row }) => formatDiscount(row.original),
    },
    {
      id: "course",
      header: t("adminPromoCodesView.columns.course"),
      cell: ({ row }) => row.original.courseTitle ?? t("adminPromoCodesView.form.allCourses"),
    },
    {
      id: "validity",
      header: t("adminPromoCodesView.columns.validity"),
      cell: ({ row }) => formatValidity(row.original),
    },
    {
      id: "activations",
      header: t("adminPromoCodesView.columns.activations"),
      cell: ({ row }) =>
        row.original.maxActivations
          ? `${row.original.activationsCount} / ${row.original.maxActivations}`
          : String(row.original.activationsCount),
    },
    {
      id: "isActive",
      header: t("adminPromoCodesView.columns.active"),
      cell: ({ row }) => (
        <Switch
          data-testid={ADMIN_PROMO_CODES_HANDLES.activeSwitch(row.original.id)}
          checked={row.original.isActive}
          aria-label={t("adminPromoCodesView.columns.active")}
          onCheckedChange={(isActive) =>
            void updatePromoCode({ id: row.original.id, data: { isActive } }).catch(() => null)
          }
        />
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end gap-x-1">
          <Button
            data-testid={ADMIN_PROMO_CODES_HANDLES.editButton(row.original.id)}
            variant="ghost"
            size="icon"
            aria-label={t("adminPromoCodesView.actions.edit")}
            onClick={() => openForm(row.original)}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            data-testid={ADMIN_PROMO_CODES_HANDLES.deleteButton(row.original.id)}
            variant="ghost"
            size="icon"
            aria-label={t("adminPromoCodesView.actions.delete")}
            onClick={() => setPromoCodeToDelete(row.original)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ),
    },
  ];

  const table = useReactTable({
    data: promoCodes ?? [],
    columns,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <PageWrapper
      breadcrumbs={[
        {
          title: t("adminPromotionCodesView.breadcrumbs.promotionCodes"),
          href: "/admin/promotion-codes",
        },
      ]}
    >
      <div data-testid={ADMIN_PROMO_CODES_HANDLES.PAGE} className="flex flex-col gap-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col">
            <h4 className="h4 text-neutral-950">{t("adminPromoCodesView.header")}</h4>
            <p className="body-sm text-neutral-700">{t("adminPromoCodesView.subheader")}</p>
          </div>
          <Button
            data-testid={ADMIN_PROMO_CODES_HANDLES.CREATE_BUTTON}
            variant="outline"
            onClick={() => openForm(null)}
          >
            {t("adminPromoCodesView.create")}
          </Button>
        </div>

        <Table data-testid={ADMIN_PROMO_CODES_HANDLES.TABLE} className="border bg-neutral-50">
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
                <TableRow key={row.id}>
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
                  {isLoading ? t("adminPaymentsView.loading") : t("adminPromoCodesView.empty")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <PromoCodeFormDialog
        open={isFormOpen}
        promoCode={editedPromoCode}
        courses={(courses ?? []).map(({ id, title }) => ({ id, title }))}
        onClose={() => setIsFormOpen(false)}
      />

      <AlertDialog
        open={Boolean(promoCodeToDelete)}
        onOpenChange={(open) => !open && setPromoCodeToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("adminPromoCodesView.delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("adminPromoCodesView.delete.description", { code: promoCodeToDelete?.code })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.button.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={() => {
                if (promoCodeToDelete) void deletePromoCode(promoCodeToDelete.id).catch(() => null);
                setPromoCodeToDelete(null);
              }}
            >
              {t("adminPromoCodesView.actions.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageWrapper>
  );
};
