import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWith } from "~/utils/testUtils";

import { PAYMENT_CHECKOUT_HANDLES } from "../../../../e2e/data/payments/handles";

import { YooKassaCheckout } from "./YooKassaCheckout";

const COURSE_ID = "11111111-1111-4111-8111-111111111111";

const mocks = vi.hoisted(() => ({
  getQuote: vi.fn(),
  createCheckout: vi.fn(),
  assign: vi.fn(),
}));

vi.mock("~/api/api-client", () => ({
  ApiClient: {
    api: {
      paymentsControllerGetYooKassaQuote: mocks.getQuote,
      paymentsControllerCreateYooKassaCheckout: mocks.createCheckout,
    },
  },
}));

describe("YooKassaCheckout", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    mocks.getQuote.mockReset();
    mocks.createCheckout.mockReset();
    mocks.assign.mockReset();

    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, assign: mocks.assign },
    });

    mocks.createCheckout.mockResolvedValue({
      data: {
        data: {
          paymentId: "22222222-2222-4222-8222-222222222222",
          confirmationUrl: "https://yoomoney.ru/checkout/payments/v2/contract?orderId=abc",
        },
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });

  it("redirects to the ЮKassa confirmation page", async () => {
    renderWith({ withQuery: true }).render(
      <YooKassaCheckout courseId={COURSE_ID} priceInCents={150000} currency="rub" />,
    );

    const button = screen.getByTestId(PAYMENT_CHECKOUT_HANDLES.BUY_BUTTON);
    expect(button.textContent?.replace(/\D/g, "")).toBe("1500");

    await userEvent.setup().click(button);

    await waitFor(() =>
      expect(mocks.assign).toHaveBeenCalledWith(
        "https://yoomoney.ru/checkout/payments/v2/contract?orderId=abc",
      ),
    );
    expect(mocks.createCheckout).toHaveBeenCalledWith({ courseId: COURSE_ID });
  });

  it("applies a promo code and pays the discounted price", async () => {
    mocks.getQuote.mockResolvedValue({
      data: {
        data: {
          originalAmount: 150000,
          discountAmount: 30000,
          amount: 120000,
          currency: "rub",
          promoCode: "SUMMER20",
        },
      },
    });

    renderWith({ withQuery: true }).render(
      <YooKassaCheckout courseId={COURSE_ID} priceInCents={150000} currency="rub" />,
    );

    const user = userEvent.setup();

    await user.click(screen.getByTestId(PAYMENT_CHECKOUT_HANDLES.PROMO_TOGGLE));
    await user.type(screen.getByTestId(PAYMENT_CHECKOUT_HANDLES.PROMO_INPUT), "summer20");
    await user.click(screen.getByTestId(PAYMENT_CHECKOUT_HANDLES.PROMO_APPLY));

    expect(
      await screen.findByTestId(PAYMENT_CHECKOUT_HANDLES.DISCOUNTED_PRICE),
    ).toBeInTheDocument();
    expect(mocks.getQuote).toHaveBeenCalledWith({ courseId: COURSE_ID, promoCode: "summer20" });
    expect(
      screen.getByTestId(PAYMENT_CHECKOUT_HANDLES.BUY_BUTTON).textContent?.replace(/\D/g, ""),
    ).toBe("1200");

    await user.click(screen.getByTestId(PAYMENT_CHECKOUT_HANDLES.BUY_BUTTON));

    await waitFor(() =>
      expect(mocks.createCheckout).toHaveBeenCalledWith({
        courseId: COURSE_ID,
        promoCode: "SUMMER20",
      }),
    );
  });

  it("does not redirect when the checkout fails", async () => {
    mocks.createCheckout.mockRejectedValue(new Error("payments.errors.providerUnavailable"));

    renderWith({ withQuery: true }).render(
      <YooKassaCheckout courseId={COURSE_ID} priceInCents={150000} currency="rub" />,
    );

    await userEvent.setup().click(screen.getByTestId(PAYMENT_CHECKOUT_HANDLES.BUY_BUTTON));

    await waitFor(() => expect(mocks.createCheckout).toHaveBeenCalled());
    expect(mocks.assign).not.toHaveBeenCalled();
  });
});
