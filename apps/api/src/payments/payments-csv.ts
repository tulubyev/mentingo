import { PAYMENTS_CSV_DELIMITER } from "./payments.constants";

import type { AdminPayment } from "./payments.types";

export const PAYMENTS_CSV_HEADERS = [
  "user",
  "email",
  "course",
  "date",
  "amount",
  "discount",
  "promo_code",
  "status",
  "provider_payment_id",
] as const;

/** Minor units -> "1500.00" (dot decimal separator, no grouping). */
const formatMinorUnits = (value: number) => {
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);

  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
};

/**
 * Escapes a CSV cell and neutralises spreadsheet formula injection
 * (cells starting with =, +, -, @, tab or CR are prefixed with an apostrophe).
 */
export const escapeCsvCell = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return "";

  let text = String(value);

  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;

  if (text.includes(PAYMENTS_CSV_DELIMITER) || /["\r\n,]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
};

/**
 * CSV for the payments registry: UTF-8 with BOM and ";" delimiter so it opens correctly in
 * Excel with Russian regional settings.
 */
export const buildPaymentsCsv = (rows: AdminPayment[]) => {
  const lines = rows.map((row) => {
    const userName = [row.userFirstName, row.userLastName].filter(Boolean).join(" ");

    return [
      userName,
      row.userEmail,
      row.courseTitle,
      row.paidAt ?? row.createdAt,
      formatMinorUnits(row.amount),
      formatMinorUnits(row.discountAmount),
      row.promoCode,
      row.status,
      row.providerPaymentId,
    ]
      .map(escapeCsvCell)
      .join(PAYMENTS_CSV_DELIMITER);
  });

  return `﻿${[PAYMENTS_CSV_HEADERS.join(PAYMENTS_CSV_DELIMITER), ...lines].join("\r\n")}\r\n`;
};
