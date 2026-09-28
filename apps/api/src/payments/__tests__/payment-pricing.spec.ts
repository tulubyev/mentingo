import { PROMO_CODE_DISCOUNT_TYPES } from "@repo/shared";

import {
  calculateDiscount,
  calculatePriceQuote,
  getPromoCodeRejection,
  isValidPromoCodeFormat,
  normalizePromoCode,
} from "src/payments/payment-pricing";
import { PAYMENT_ERRORS } from "src/payments/payments.constants";

import type { PromoCodeForPricing } from "src/payments/payments.types";

const COURSE_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_COURSE_ID = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-09-28T12:00:00.000Z");

const promo = (overrides: Partial<PromoCodeForPricing> = {}): PromoCodeForPricing => ({
  id: "promo-1",
  code: "SUMMER",
  discountType: PROMO_CODE_DISCOUNT_TYPES.PERCENT,
  discountValue: 10,
  courseId: null,
  validFrom: null,
  validTo: null,
  maxActivations: null,
  activationsCount: 0,
  isActive: true,
  ...overrides,
});

describe("promo code normalization", () => {
  it("is case-insensitive and trims whitespace", () => {
    expect(normalizePromoCode("  summer2026 ")).toBe("SUMMER2026");
    expect(normalizePromoCode("лето")).toBe("ЛЕТО");
  });

  it.each([
    ["SUMMER", true],
    ["лето-2026", true],
    ["a_b", true],
    ["ab", false],
    ["with space", false],
    ["drop;table", false],
    ["x".repeat(65), false],
  ])("validates the format of %p", (code, expected) => {
    expect(isValidPromoCodeFormat(code)).toBe(expected);
  });
});

describe("calculateDiscount", () => {
  it.each([
    [150000, 10, 15000],
    [150000, 100, 150000],
    [99999, 33, 33000], // 32999.67 rounds to 33000
    [100, 50, 50],
    [101, 50, 51], // 50.5 rounds half up
  ])("percent: %p kopecks with %p%% off -> %p", (price, percent, expected) => {
    expect(calculateDiscount(price, { discountType: "percent", discountValue: percent })).toBe(
      expected,
    );
  });

  it("fixed discounts are in minor units and never exceed the price", () => {
    expect(calculateDiscount(150000, { discountType: "fixed", discountValue: 50000 })).toBe(50000);
    expect(calculateDiscount(150000, { discountType: "fixed", discountValue: 900000 })).toBe(
      150000,
    );
  });

  it("returns 0 without a promo code", () => {
    expect(calculateDiscount(150000, null)).toBe(0);
  });
});

describe("calculatePriceQuote", () => {
  it("computes the final price server-side", () => {
    expect(calculatePriceQuote(150000, "RUB", promo({ discountValue: 20 }))).toEqual({
      originalAmount: 150000,
      discountAmount: 30000,
      amount: 120000,
      currency: "rub",
      promoCode: "SUMMER",
    });
  });

  it("keeps the full price without a promo code", () => {
    expect(calculatePriceQuote(150000, "rub")).toEqual({
      originalAmount: 150000,
      discountAmount: 0,
      amount: 150000,
      currency: "rub",
      promoCode: null,
    });
  });
});

describe("getPromoCodeRejection", () => {
  const check = (overrides: Partial<PromoCodeForPricing>) =>
    getPromoCodeRejection(promo(overrides), { courseId: COURSE_ID, now: NOW });

  it("accepts an active, unrestricted code", () => {
    expect(check({})).toBeNull();
  });

  it("accepts a code bound to the same course inside its validity window", () => {
    expect(
      check({
        courseId: COURSE_ID,
        validFrom: "2026-09-01T00:00:00.000Z",
        validTo: "2026-10-01T00:00:00.000Z",
        maxActivations: 5,
        activationsCount: 4,
      }),
    ).toBeNull();
  });

  it.each([
    [{ isActive: false }, PAYMENT_ERRORS.PROMO_CODE_INACTIVE],
    [{ courseId: OTHER_COURSE_ID }, PAYMENT_ERRORS.PROMO_CODE_NOT_APPLICABLE],
    [{ validFrom: "2026-09-29T00:00:00.000Z" }, PAYMENT_ERRORS.PROMO_CODE_NOT_STARTED],
    [{ validTo: "2026-09-28T11:59:59.000Z" }, PAYMENT_ERRORS.PROMO_CODE_EXPIRED],
    [{ maxActivations: 3, activationsCount: 3 }, PAYMENT_ERRORS.PROMO_CODE_EXHAUSTED],
  ])("rejects %p", (overrides, expected) => {
    expect(check(overrides)).toBe(expected);
  });
});
