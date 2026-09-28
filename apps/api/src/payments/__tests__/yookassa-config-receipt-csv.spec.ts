import { buildPaymentsCsv, escapeCsvCell } from "src/payments/payments-csv";
import {
  buildYooKassaReceipt,
  isReceiptEmail,
  truncateReceiptDescription,
} from "src/payments/yookassa/yookassa-receipt";
import { readYooKassaConfig } from "src/payments/yookassa/yookassa.config";

import type { AdminPayment } from "src/payments/payments.types";

describe("readYooKassaConfig", () => {
  it("is disabled without both credentials", () => {
    expect(readYooKassaConfig({}).enabled).toBe(false);
    expect(readYooKassaConfig({ YOOKASSA_SHOP_ID: "123" }).enabled).toBe(false);
    expect(readYooKassaConfig({ YOOKASSA_SECRET_KEY: "live_x" }).enabled).toBe(false);
  });

  it("uses safe defaults", () => {
    expect(
      readYooKassaConfig({ YOOKASSA_SHOP_ID: " 123 ", YOOKASSA_SECRET_KEY: "live_x" }),
    ).toEqual({
      enabled: true,
      shopId: "123",
      secretKey: "live_x",
      apiUrl: "https://api.yookassa.ru/v3",
      receiptEnabled: false,
      vatCode: 1,
      taxSystemCode: undefined,
      webhookIpCheck: true,
      invalidSettings: [],
    });
  });

  it("reads receipt and webhook settings and reports invalid values", () => {
    const config = readYooKassaConfig({
      YOOKASSA_SHOP_ID: "123",
      YOOKASSA_SECRET_KEY: "live_x",
      YOOKASSA_RECEIPT_ENABLED: "true",
      YOOKASSA_VAT_CODE: "20",
      YOOKASSA_TAX_SYSTEM_CODE: "2",
      YOOKASSA_WEBHOOK_IP_CHECK: "false",
    });

    expect(config).toMatchObject({
      receiptEnabled: true,
      vatCode: 1,
      taxSystemCode: 2,
      webhookIpCheck: false,
      invalidSettings: ["YOOKASSA_VAT_CODE"],
    });
  });
});

describe("54-ФЗ receipt", () => {
  const config = { receiptEnabled: true, vatCode: 1, taxSystemCode: 2 };

  it("builds a single full-payment service item", () => {
    expect(
      buildYooKassaReceipt({
        config,
        email: "student@example.com",
        description: "Основы программирования",
        amount: 120000,
        currency: "rub",
      }),
    ).toEqual({
      customer: { email: "student@example.com" },
      items: [
        {
          description: "Основы программирования",
          quantity: "1.00",
          amount: { value: "1200.00", currency: "RUB" },
          vat_code: 1,
          payment_subject: "service",
          payment_mode: "full_payment",
        },
      ],
      tax_system_code: 2,
    });
  });

  it("omits the receipt when disabled and tax system when unset", () => {
    expect(
      buildYooKassaReceipt({
        config: { ...config, receiptEnabled: false },
        email: "a@b.co",
        description: "x",
        amount: 100,
        currency: "rub",
      }),
    ).toBeUndefined();

    expect(
      buildYooKassaReceipt({
        config: { receiptEnabled: true, vatCode: 4 },
        email: "a@b.co",
        description: "x",
        amount: 100,
        currency: "rub",
      }),
    ).not.toHaveProperty("tax_system_code");
  });

  it("limits the item description to 128 characters (by code point)", () => {
    const title = `${"Я".repeat(127)}😀😀`;

    expect(Array.from(truncateReceiptDescription(title))).toHaveLength(128);
    expect(truncateReceiptDescription("  a   b  ")).toBe("a b");
  });

  it("validates receipt e-mails", () => {
    expect(isReceiptEmail("student@example.com")).toBe(true);
    expect(isReceiptEmail("broken@")).toBe(false);
    expect(isReceiptEmail(null)).toBe(false);
  });
});

describe("payments CSV", () => {
  const row: AdminPayment = {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    createdAt: "2026-09-28T10:00:00.000Z",
    paidAt: "2026-09-28T10:05:00.000Z",
    canceledAt: null,
    refundedAt: null,
    status: "succeeded",
    provider: "yookassa",
    providerPaymentId: "2f1e7c4a-000f-5000-8000-1c2d3e4f5a6b",
    amount: 120000,
    originalAmount: 150000,
    discountAmount: 30000,
    refundedAmount: 0,
    currency: "rub",
    promoCode: "SUMMER",
    courseId: null,
    courseTitle: "Курс; «Основы»",
    userId: null,
    userFirstName: "Иван",
    userLastName: "Петров",
    userEmail: "ivan@example.com",
  };

  it("writes a BOM, the header and escaped rows", () => {
    const csv = buildPaymentsCsv([row]);
    const [header, line] = csv.replace("﻿", "").trim().split("\r\n");

    expect(csv.startsWith("﻿")).toBe(true);
    expect(header).toBe(
      "user;email;course;date;amount;discount;promo_code;status;provider_payment_id",
    );
    expect(line).toBe(
      'Иван Петров;ivan@example.com;"Курс; «Основы»";2026-09-28T10:05:00.000Z;1200.00;300.00;SUMMER;succeeded;2f1e7c4a-000f-5000-8000-1c2d3e4f5a6b',
    );
  });

  it("neutralises spreadsheet formulas and quotes", () => {
    expect(escapeCsvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell(null)).toBe("");
  });
});
