import { zodResolver } from "@hookform/resolvers/zod";
import { PROMO_CODE_DISCOUNT_TYPES, YOOKASSA_CURRENCY } from "@repo/shared";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { useCreatePromoCode } from "~/api/mutations/admin/useCreatePromoCode";
import { useUpdatePromoCode } from "~/api/mutations/admin/useUpdatePromoCode";
import { PriceInput } from "~/components/PriceInput/PriceInput";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";

import { ADMIN_PROMO_CODES_HANDLES } from "../../../../../e2e/data/payments/handles";
import {
  ALL_COURSES_VALUE,
  EMPTY_PROMO_CODE_FORM,
  formValuesToPromoCodeBody,
  promoCodeFormSchema,
  promoCodeToFormValues,
} from "../promoCodeForm";

import type { PromoCodeFormValues } from "../promoCodeForm";
import type { GetPromoCodesResponse } from "~/api/generated-api";

type PromoCode = GetPromoCodesResponse["data"][number];

type PromoCodeFormDialogProps = {
  open: boolean;
  promoCode: PromoCode | null;
  courses: { id: string; title: string }[];
  onClose: () => void;
};

export const PromoCodeFormDialog = ({
  open,
  promoCode,
  courses,
  onClose,
}: PromoCodeFormDialogProps) => {
  const { t } = useTranslation();
  const { mutateAsync: createPromoCode, isPending: isCreating } = useCreatePromoCode();
  const { mutateAsync: updatePromoCode, isPending: isUpdating } = useUpdatePromoCode();

  const form = useForm<PromoCodeFormValues>({
    resolver: zodResolver(promoCodeFormSchema(t)),
    defaultValues: EMPTY_PROMO_CODE_FORM,
  });

  useEffect(() => {
    if (open) form.reset(promoCode ? promoCodeToFormValues(promoCode) : EMPTY_PROMO_CODE_FORM);
  }, [form, open, promoCode]);

  const discountType = form.watch("discountType");

  const onSubmit = async (values: PromoCodeFormValues) => {
    const body = formValuesToPromoCodeBody(values);

    const saved = promoCode
      ? await updatePromoCode({ id: promoCode.id, data: body }).catch(() => null)
      : await createPromoCode(body).catch(() => null);

    if (saved) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent data-testid={ADMIN_PROMO_CODES_HANDLES.FORM_DIALOG} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {promoCode
              ? t("adminPromoCodesView.form.editTitle")
              : t("adminPromoCodesView.form.createTitle")}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-y-4">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("adminPromoCodesView.form.code")}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      data-testid={ADMIN_PROMO_CODES_HANDLES.CODE_INPUT}
                      placeholder="SUMMER2026"
                      autoComplete="off"
                      className="uppercase"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="discountType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("adminPromoCodesView.form.discountType")}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={PROMO_CODE_DISCOUNT_TYPES.PERCENT}>
                          {t("adminPromoCodesView.discountType.percent")}
                        </SelectItem>
                        <SelectItem value={PROMO_CODE_DISCOUNT_TYPES.FIXED}>
                          {t("adminPromoCodesView.discountType.fixed")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {discountType === PROMO_CODE_DISCOUNT_TYPES.PERCENT ? (
                <FormField
                  control={form.control}
                  name="percentValue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("adminPromoCodesView.form.percentValue")}</FormLabel>
                      <FormControl>
                        <Input
                          data-testid={ADMIN_PROMO_CODES_HANDLES.VALUE_INPUT}
                          type="number"
                          min={1}
                          max={100}
                          step={1}
                          value={field.value ?? ""}
                          onChange={(event) =>
                            field.onChange(
                              event.target.value === "" ? undefined : Number(event.target.value),
                            )
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <FormField
                  control={form.control}
                  name="fixedValue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("adminPromoCodesView.form.fixedValue")}</FormLabel>
                      <FormControl>
                        <PriceInput
                          data-testid={ADMIN_PROMO_CODES_HANDLES.VALUE_INPUT}
                          value={field.value}
                          onChange={field.onChange}
                          currency={YOOKASSA_CURRENCY.toUpperCase()}
                          locale="ru-RU"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <FormField
              control={form.control}
              name="courseId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("adminPromoCodesView.form.course")}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={ALL_COURSES_VALUE}>
                        {t("adminPromoCodesView.form.allCourses")}
                      </SelectItem>
                      {courses.map((course) => (
                        <SelectItem key={course.id} value={course.id}>
                          {course.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="validFrom"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("adminPromoCodesView.form.validFrom")}</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="validTo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("adminPromoCodesView.form.validTo")}</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="maxActivations"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("adminPromoCodesView.form.maxActivations")}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      placeholder={t("adminPromoCodesView.form.unlimited")}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex items-center gap-x-3 space-y-0">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel>{t("adminPromoCodesView.form.isActive")}</FormLabel>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                {t("common.button.cancel")}
              </Button>
              <Button
                data-testid={ADMIN_PROMO_CODES_HANDLES.SAVE_BUTTON}
                type="submit"
                disabled={isCreating || isUpdating}
              >
                {t("common.button.save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
