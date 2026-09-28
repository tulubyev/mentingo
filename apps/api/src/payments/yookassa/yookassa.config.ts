import type { YooKassaConfig } from "./yookassa.types";

export const YOOKASSA_API_URL = "https://api.yookassa.ru/v3";

/** 54-ФЗ VAT codes accepted by ЮKassa ("1" = без НДС). */
const MIN_VAT_CODE = 1;
const MAX_VAT_CODE = 12;
const DEFAULT_VAT_CODE = 1;

/** СНО codes accepted by ЮKassa (1 = ОСН … 6 = патент). */
const MIN_TAX_SYSTEM_CODE = 1;
const MAX_TAX_SYSTEM_CODE = 6;

const readOptional = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const readIntInRange = (value: string | undefined, min: number, max: number) => {
  const raw = readOptional(value);
  if (!raw || !/^\d+$/.test(raw)) return undefined;

  const parsed = Number(raw);
  return parsed >= min && parsed <= max ? parsed : undefined;
};

const readBoolean = (value: string | undefined, defaultValue: boolean) => {
  const raw = readOptional(value)?.toLowerCase();
  if (raw === undefined) return defaultValue;

  return !["false", "0", "no", "off"].includes(raw);
};

/**
 * ЮKassa configuration is read from the API environment at call time (one shop per deployment),
 * so the feature can be toggled per process and per test without rebuilding the Nest config tree.
 * The feature is enabled only when both the shop id and the secret key are present.
 */
export const readYooKassaConfig = (env: NodeJS.ProcessEnv = process.env): YooKassaConfig => {
  const shopId = readOptional(env.YOOKASSA_SHOP_ID) ?? "";
  const secretKey = readOptional(env.YOOKASSA_SECRET_KEY) ?? "";
  const vatCode = readIntInRange(env.YOOKASSA_VAT_CODE, MIN_VAT_CODE, MAX_VAT_CODE);
  const taxSystemCode = readIntInRange(
    env.YOOKASSA_TAX_SYSTEM_CODE,
    MIN_TAX_SYSTEM_CODE,
    MAX_TAX_SYSTEM_CODE,
  );

  const invalidSettings = [
    readOptional(env.YOOKASSA_VAT_CODE) && vatCode === undefined ? "YOOKASSA_VAT_CODE" : null,
    readOptional(env.YOOKASSA_TAX_SYSTEM_CODE) && taxSystemCode === undefined
      ? "YOOKASSA_TAX_SYSTEM_CODE"
      : null,
  ].filter((name): name is string => Boolean(name));

  return {
    enabled: Boolean(shopId && secretKey),
    shopId,
    secretKey,
    apiUrl: YOOKASSA_API_URL,
    receiptEnabled: readBoolean(env.YOOKASSA_RECEIPT_ENABLED, false),
    vatCode: vatCode ?? DEFAULT_VAT_CODE,
    taxSystemCode,
    webhookIpCheck: readBoolean(env.YOOKASSA_WEBHOOK_IP_CHECK, true),
    invalidSettings,
  };
};

export const isYooKassaEnabled = (env: NodeJS.ProcessEnv = process.env) =>
  readYooKassaConfig(env).enabled;
