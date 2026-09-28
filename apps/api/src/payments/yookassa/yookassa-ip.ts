import { BlockList, isIP } from "node:net";

import type { Request } from "express";

/**
 * Official ЮKassa notification source addresses:
 * https://yookassa.ru/developers/using-api/webhooks#ip
 */
export const YOOKASSA_NOTIFICATION_IP_RANGES = [
  "185.71.76.0/27",
  "185.71.77.0/27",
  "77.75.153.0/25",
  "77.75.156.11",
  "77.75.156.35",
  "77.75.154.128/25",
  "2a02:5180::/32",
] as const;

export const createYooKassaBlockList = (
  ranges: readonly string[] = YOOKASSA_NOTIFICATION_IP_RANGES,
) => {
  const list = new BlockList();

  for (const range of ranges) {
    const [address, prefix] = range.split("/");
    const family = isIP(address) === 6 ? "ipv6" : "ipv4";

    if (prefix === undefined) {
      list.addAddress(address, family);
    } else {
      list.addSubnet(address, Number(prefix), family);
    }
  }

  return list;
};

const yooKassaBlockList = createYooKassaBlockList();

/** Strips IPv4-mapped IPv6 prefixes ("::ffff:185.71.76.1") and surrounding whitespace. */
export const normalizeIp = (ip: string | undefined | null): string | null => {
  if (!ip) return null;

  const trimmed = ip.trim();
  const unmapped = trimmed.toLowerCase().startsWith("::ffff:") ? trimmed.slice(7) : trimmed;

  return isIP(unmapped) ? unmapped : null;
};

/** Exact CIDR membership check (IPv4 and IPv6) — no string-prefix matching. */
export const isYooKassaIp = (
  ip: string | undefined | null,
  list: BlockList = yooKassaBlockList,
) => {
  const normalized = normalizeIp(ip);
  if (!normalized) return false;

  return list.check(normalized, isIP(normalized) === 6 ? "ipv6" : "ipv4");
};

/**
 * Client address of a webhook call. Behind Traefik the original address is the first
 * `X-Forwarded-For` entry (Traefik replaces client-supplied forwarded headers unless it is told to
 * trust them); without a proxy the socket address is used.
 */
export const getWebhookClientIp = (request: Pick<Request, "headers" | "socket">) => {
  const forwardedFor = request.headers["x-forwarded-for"];
  const headerValue = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  const firstForwarded = headerValue?.split(",")[0]?.trim();

  return normalizeIp(firstForwarded) ?? normalizeIp(request.socket?.remoteAddress);
};
