import { toYooKassaAmount } from "./yookassa-amount";

import type { YooKassaConfig, YooKassaReceipt } from "./yookassa.types";

/** ЮKassa limits a receipt item description to 128 characters. */
export const RECEIPT_ITEM_DESCRIPTION_MAX_LENGTH = 128;

// Pragmatic check: ЮKassa rejects receipts with malformed customer e-mails.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isReceiptEmail = (email: string | null | undefined): email is string =>
  typeof email === "string" && email.length <= 254 && EMAIL_PATTERN.test(email);

export const truncateReceiptDescription = (value: string) => {
  const normalized = value.replace(/\s+/g, " ").trim();
  const characters = Array.from(normalized);

  if (characters.length <= RECEIPT_ITEM_DESCRIPTION_MAX_LENGTH) return normalized;

  return characters.slice(0, RECEIPT_ITEM_DESCRIPTION_MAX_LENGTH).join("").trim();
};

type BuildReceiptInput = {
  config: Pick<YooKassaConfig, "receiptEnabled" | "vatCode" | "taxSystemCode">;
  email: string;
  description: string;
  amount: number;
  currency: string;
};

/**
 * 54-ФЗ receipt: one "service" item paid in full. Returned only when receipts are enabled.
 * The same structure is used for the payment and for its refund (чек возврата).
 */
export const buildYooKassaReceipt = ({
  config,
  email,
  description,
  amount,
  currency,
}: BuildReceiptInput): YooKassaReceipt | undefined => {
  if (!config.receiptEnabled) return undefined;

  return {
    customer: { email },
    items: [
      {
        description: truncateReceiptDescription(description),
        quantity: "1.00",
        amount: toYooKassaAmount(amount, currency),
        vat_code: config.vatCode,
        payment_subject: "service",
        payment_mode: "full_payment",
      },
    ],
    ...(config.taxSystemCode ? { tax_system_code: config.taxSystemCode } : {}),
  };
};
