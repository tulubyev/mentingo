import type { YooKassaAmount } from "./yookassa.types";

const AMOUNT_PATTERN = /^(\d{1,12})(?:\.(\d{1,2}))?$/;

/** 150000 (kopecks) -> "1500.00". Integer math only, never floats. */
export const toYooKassaValue = (minorUnits: number): string => {
  if (!Number.isSafeInteger(minorUnits) || minorUnits < 0) {
    throw new RangeError("Amount must be a non-negative integer in minor units");
  }

  const major = Math.floor(minorUnits / 100);
  const minor = minorUnits % 100;

  return `${major}.${String(minor).padStart(2, "0")}`;
};

/** "1500.00" -> 150000, "10.5" -> 1050. Returns null for anything that is not a plain amount. */
export const parseYooKassaValue = (value: unknown): number | null => {
  if (typeof value !== "string") return null;

  const match = AMOUNT_PATTERN.exec(value.trim());
  if (!match) return null;

  const [, major, fraction = ""] = match;

  return Number(major) * 100 + Number(fraction.padEnd(2, "0"));
};

export const toYooKassaAmount = (minorUnits: number, currency: string): YooKassaAmount => ({
  value: toYooKassaValue(minorUnits),
  currency: currency.toUpperCase(),
});

/** True when the provider amount is exactly `minorUnits` in `currency` (case-insensitive). */
export const isSameAmount = (
  amount: YooKassaAmount | undefined,
  minorUnits: number,
  currency: string,
) => {
  if (!amount || typeof amount.currency !== "string") return false;

  return (
    parseYooKassaValue(amount.value) === minorUnits &&
    amount.currency.toUpperCase() === currency.toUpperCase()
  );
};
