import { PROMO_CODE_DISCOUNT_TYPES } from "@repo/shared";
import { format } from "date-fns";
import { z } from "zod";

import type i18next from "i18next";
import type { CreatePromoCodeBody, GetPromoCodesResponse } from "~/api/generated-api";

export const ALL_COURSES_VALUE = "all";

const PROMO_CODE_PATTERN = /^[\p{L}\p{N}_-]{3,64}$/u;

export const promoCodeFormSchema = (t: typeof i18next.t) =>
  z
    .object({
      code: z.string().trim().regex(PROMO_CODE_PATTERN, t("adminPromoCodesView.validation.code")),
      discountType: z.enum([PROMO_CODE_DISCOUNT_TYPES.PERCENT, PROMO_CODE_DISCOUNT_TYPES.FIXED]),
      percentValue: z.number().optional(),
      /** Minor units (kopecks). */
      fixedValue: z.number().optional(),
      courseId: z.string(),
      validFrom: z.string(),
      validTo: z.string(),
      maxActivations: z.string().regex(/^\d*$/, t("adminPromoCodesView.validation.maxActivations")),
      isActive: z.boolean(),
    })
    .superRefine((data, ctx) => {
      if (data.discountType === PROMO_CODE_DISCOUNT_TYPES.PERCENT) {
        const value = data.percentValue ?? 0;

        if (!Number.isInteger(value) || value < 1 || value > 100) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: t("adminPromoCodesView.validation.percent"),
            path: ["percentValue"],
          });
        }
      } else if (!data.fixedValue || data.fixedValue < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t("adminPromoCodesView.validation.fixed"),
          path: ["fixedValue"],
        });
      }

      if (data.maxActivations && Number(data.maxActivations) < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t("adminPromoCodesView.validation.maxActivations"),
          path: ["maxActivations"],
        });
      }

      if (data.validFrom && data.validTo && data.validFrom > data.validTo) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t("adminPromoCodesView.validation.dates"),
          path: ["validTo"],
        });
      }
    });

export type PromoCodeFormValues = z.infer<ReturnType<typeof promoCodeFormSchema>>;

type PromoCode = GetPromoCodesResponse["data"][number];

export const EMPTY_PROMO_CODE_FORM: PromoCodeFormValues = {
  code: "",
  discountType: PROMO_CODE_DISCOUNT_TYPES.PERCENT,
  percentValue: undefined,
  fixedValue: undefined,
  courseId: ALL_COURSES_VALUE,
  validFrom: "",
  validTo: "",
  maxActivations: "",
  isActive: true,
};

/** Calendar date in the admin's local time -> ISO instant (start or end of that day). */
const toIsoBoundary = (date: string, boundary: "start" | "end") => {
  if (!date) return null;

  const time = boundary === "start" ? "00:00:00.000" : "23:59:59.999";

  return new Date(`${date}T${time}`).toISOString();
};

const toDateInput = (value: string | null) => (value ? format(new Date(value), "yyyy-MM-dd") : "");

export const promoCodeToFormValues = (promo: PromoCode): PromoCodeFormValues => ({
  code: promo.code,
  discountType: promo.discountType,
  percentValue:
    promo.discountType === PROMO_CODE_DISCOUNT_TYPES.PERCENT ? promo.discountValue : undefined,
  fixedValue:
    promo.discountType === PROMO_CODE_DISCOUNT_TYPES.FIXED ? promo.discountValue : undefined,
  courseId: promo.courseId ?? ALL_COURSES_VALUE,
  validFrom: toDateInput(promo.validFrom),
  validTo: toDateInput(promo.validTo),
  maxActivations: promo.maxActivations ? String(promo.maxActivations) : "",
  isActive: promo.isActive,
});

export const formValuesToPromoCodeBody = (
  values: PromoCodeFormValues,
): Required<CreatePromoCodeBody> => ({
  code: values.code.trim(),
  discountType: values.discountType,
  discountValue:
    values.discountType === PROMO_CODE_DISCOUNT_TYPES.PERCENT
      ? (values.percentValue ?? 0)
      : (values.fixedValue ?? 0),
  courseId: values.courseId === ALL_COURSES_VALUE ? null : values.courseId,
  validFrom: toIsoBoundary(values.validFrom, "start"),
  validTo: toIsoBoundary(values.validTo, "end"),
  maxActivations: values.maxActivations ? Number(values.maxActivations) : null,
  isActive: values.isActive,
});
