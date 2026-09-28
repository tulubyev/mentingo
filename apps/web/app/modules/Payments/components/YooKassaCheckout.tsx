import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useYooKassaCheckout } from "~/api/mutations/useYooKassaCheckout";
import { useYooKassaQuote } from "~/api/mutations/useYooKassaQuote";
import { Enroll } from "~/assets/svgs";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { formatPrice } from "~/lib/formatters/priceFormatter";
import { cn } from "~/lib/utils";
import { getCurrencyLocale } from "~/utils/getCurrencyLocale";

import { PAYMENT_CHECKOUT_HANDLES } from "../../../../e2e/data/payments/handles";

import type { GetYooKassaQuoteResponse } from "~/api/generated-api";

type YooKassaCheckoutProps = {
  courseId: string;
  priceInCents: number;
  currency: string;
};

type Quote = GetYooKassaQuoteResponse["data"];

/** "Buy" button for ЮKassa: optional promo code, then a redirect to the ЮKassa payment page. */
export const YooKassaCheckout = ({ courseId, priceInCents, currency }: YooKassaCheckoutProps) => {
  const { t } = useTranslation();
  const [isPromoOpen, setIsPromoOpen] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);

  const { mutateAsync: requestQuote, isPending: isQuotePending } = useYooKassaQuote();
  const { mutateAsync: createCheckout, isPending: isCheckoutPending } = useYooKassaCheckout();

  const format = (amount: number) => formatPrice(amount, currency, getCurrencyLocale(currency));
  const payableAmount = quote?.amount ?? priceInCents;

  const handleApplyPromo = async () => {
    const code = promoCode.trim();
    if (!code) return;

    const result = await requestQuote({ courseId, promoCode: code }).catch(() => null);
    if (result) setQuote(result);
  };

  const handleRemovePromo = () => {
    setQuote(null);
    setPromoCode("");
  };

  const handleBuy = async () => {
    const result = await createCheckout({
      courseId,
      ...(quote?.promoCode ? { promoCode: quote.promoCode } : {}),
    }).catch(() => null);

    if (result?.confirmationUrl) window.location.assign(result.confirmationUrl);
  };

  return (
    <div className="flex flex-col gap-y-2">
      <Button
        data-testid={PAYMENT_CHECKOUT_HANDLES.BUY_BUTTON}
        onClick={handleBuy}
        disabled={isCheckoutPending}
        className="gap-x-2"
        variant="primary"
      >
        <Enroll />
        <span>
          {isCheckoutPending
            ? t("payments.checkout.redirecting")
            : t("payments.checkout.buyFor", { price: format(payableAmount) })}
        </span>
      </Button>

      {quote && quote.discountAmount > 0 && (
        <p
          data-testid={PAYMENT_CHECKOUT_HANDLES.DISCOUNTED_PRICE}
          className="body-sm text-neutral-800"
        >
          <span className="mr-2 text-neutral-500 line-through">{format(quote.originalAmount)}</span>
          {t("payments.checkout.promoApplied", {
            code: quote.promoCode,
            discount: format(quote.discountAmount),
          })}
          <button
            type="button"
            data-testid={PAYMENT_CHECKOUT_HANDLES.PROMO_REMOVE}
            onClick={handleRemovePromo}
            className="ml-2 text-primary-700 underline"
          >
            {t("payments.checkout.removePromo")}
          </button>
        </p>
      )}

      {!quote && (
        <button
          type="button"
          data-testid={PAYMENT_CHECKOUT_HANDLES.PROMO_TOGGLE}
          onClick={() => setIsPromoOpen((open) => !open)}
          className={cn("body-sm self-start text-primary-700 underline", {
            "text-neutral-700": isPromoOpen,
          })}
        >
          {t("payments.checkout.havePromo")}
        </button>
      )}

      {!quote && isPromoOpen && (
        <form
          className="flex gap-x-2"
          onSubmit={(event) => {
            event.preventDefault();
            void handleApplyPromo();
          }}
        >
          <Input
            data-testid={PAYMENT_CHECKOUT_HANDLES.PROMO_INPUT}
            value={promoCode}
            maxLength={64}
            autoComplete="off"
            aria-label={t("payments.checkout.promoPlaceholder")}
            placeholder={t("payments.checkout.promoPlaceholder")}
            onChange={(event) => setPromoCode(event.target.value)}
          />
          <Button
            data-testid={PAYMENT_CHECKOUT_HANDLES.PROMO_APPLY}
            type="submit"
            variant="outline"
            disabled={isQuotePending || !promoCode.trim()}
          >
            {t("payments.checkout.applyPromo")}
          </Button>
        </form>
      )}

      <p className="details text-neutral-600">{t("payments.checkout.secureNote")}</p>
    </div>
  );
};
