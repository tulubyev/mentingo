import { PAYMENT_STATUSES } from "@repo/shared";
import { describe, expect, it } from "vitest";

import cs from "~/locales/cs/translation.json";
import de from "~/locales/de/translation.json";
import en from "~/locales/en/translation.json";
import es from "~/locales/es/translation.json";
import fr from "~/locales/fr/translation.json";
import lt from "~/locales/lt/translation.json";
import pl from "~/locales/pl/translation.json";
import ru from "~/locales/ru/translation.json";

const locales = { cs, de, en, es, fr, lt, pl, ru };

const flattenKeys = (value: unknown, prefix = ""): string[] => {
  if (!value || typeof value !== "object") return [prefix];

  return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) =>
    flattenKeys(nested, prefix ? `${prefix}.${key}` : key),
  );
};

const getValue = (translation: unknown, path: string) =>
  path
    .split(".")
    .reduce<unknown>(
      (current, key) => (current as Record<string, unknown> | undefined)?.[key],
      translation,
    );

const paymentKeys = [
  ...flattenKeys(en.payments, "payments"),
  ...flattenKeys(en.adminPaymentsView, "adminPaymentsView"),
  ...flattenKeys(en.adminPromoCodesView, "adminPromoCodesView"),
  "navigationSideBar.payments",
  "pages.payments",
  "pages.paymentReturn",
];

describe("payment translations", () => {
  it.each(Object.entries(locales))("%s defines every payment key", (_, translation) => {
    for (const key of paymentKeys) {
      expect(getValue(translation, key), key).toEqual(expect.any(String));
      expect((getValue(translation, key) as string).length, key).toBeGreaterThan(0);
    }
  });

  it("translates every payment status shown in the registry", () => {
    for (const status of Object.values(PAYMENT_STATUSES)) {
      expect(getValue(ru, `adminPaymentsView.status.${status}`)).toEqual(expect.any(String));
    }
  });

  it("covers every API error key", () => {
    const apiErrorKeys = [
      "notConfigured",
      "courseNotFound",
      "courseNotAvailable",
      "courseIsFree",
      "unsupportedCurrency",
      "alreadyEnrolled",
      "amountTooLow",
      "receiptEmailRequired",
      "providerUnavailable",
      "paymentNotFound",
      "refundNotAllowed",
      "refundFailed",
      "promoCodeNotFound",
      "promoCodeInactive",
      "promoCodeNotApplicable",
      "promoCodeNotStarted",
      "promoCodeExpired",
      "promoCodeExhausted",
      "promoCodeInvalidFormat",
      "promoCodeDuplicate",
      "promoCodeInvalidValue",
      "promoCodeInvalidDates",
      "paymentRequired",
    ];

    for (const key of apiErrorKeys) {
      expect(getValue(ru, `payments.errors.${key}`), key).toEqual(expect.any(String));
    }
  });

  it("has Russian texts for the checkout", () => {
    expect(ru.payments.checkout.buyFor).toBe("Купить за {{price}}");
    expect(ru.adminPaymentsView.refund.button).toBe("Вернуть");
  });
});
