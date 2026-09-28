import { PROMO_CODE_DISCOUNT_TYPES } from "@repo/shared";

import { PAYMENT_ERRORS } from "./payments.constants";

import type { PriceQuote, PromoCodeForPricing } from "./payments.types";

/** ЮKassa does not accept payments below 1 RUB. */
export const MIN_PAYMENT_AMOUNT = 100;

const PROMO_CODE_PATTERN = /^[\p{L}\p{N}_-]{3,64}$/u;

/** Promo codes are case-insensitive: stored and compared trimmed and upper-cased. */
export const normalizePromoCode = (code: string) => code.trim().toUpperCase();

export const isValidPromoCodeFormat = (code: string) =>
  PROMO_CODE_PATTERN.test(normalizePromoCode(code));

/**
 * Returns the translation key of the reason the promo code cannot be used for `courseId`
 * at `now`, or null when it can be applied.
 */
export const getPromoCodeRejection = (
  promo: PromoCodeForPricing,
  { courseId, now }: { courseId: string; now: Date },
): string | null => {
  if (!promo.isActive) return PAYMENT_ERRORS.PROMO_CODE_INACTIVE;

  if (promo.courseId && promo.courseId !== courseId) {
    return PAYMENT_ERRORS.PROMO_CODE_NOT_APPLICABLE;
  }

  if (promo.validFrom && new Date(promo.validFrom).getTime() > now.getTime()) {
    return PAYMENT_ERRORS.PROMO_CODE_NOT_STARTED;
  }

  if (promo.validTo && new Date(promo.validTo).getTime() < now.getTime()) {
    return PAYMENT_ERRORS.PROMO_CODE_EXPIRED;
  }

  if (promo.maxActivations !== null && promo.activationsCount >= promo.maxActivations) {
    return PAYMENT_ERRORS.PROMO_CODE_EXHAUSTED;
  }

  return null;
};

/** Discount in minor units, never more than the price itself. */
export const calculateDiscount = (
  originalAmount: number,
  promo: Pick<PromoCodeForPricing, "discountType" | "discountValue"> | null | undefined,
) => {
  if (!promo || originalAmount <= 0) return 0;

  const discount =
    promo.discountType === PROMO_CODE_DISCOUNT_TYPES.PERCENT
      ? Math.round((originalAmount * Math.min(Math.max(promo.discountValue, 0), 100)) / 100)
      : Math.max(promo.discountValue, 0);

  return Math.min(discount, originalAmount);
};

export const calculatePriceQuote = (
  originalAmount: number,
  currency: string,
  promo?: PromoCodeForPricing | null,
): PriceQuote => {
  const discountAmount = calculateDiscount(originalAmount, promo);

  return {
    originalAmount,
    discountAmount,
    amount: originalAmount - discountAmount,
    currency: currency.toLowerCase(),
    promoCode: promo ? promo.code : null,
  };
};
