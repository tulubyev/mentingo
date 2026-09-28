import { getWebhookClientIp, isYooKassaIp, normalizeIp } from "src/payments/yookassa/yookassa-ip";

import type { Request } from "express";

const requestWith = (headers: Record<string, string | string[]>, remoteAddress?: string) =>
  ({ headers, socket: { remoteAddress } }) as unknown as Pick<Request, "headers" | "socket">;

describe("isYooKassaIp", () => {
  it.each([
    "185.71.76.0",
    "185.71.76.31",
    "185.71.77.1",
    "77.75.153.0",
    "77.75.153.127",
    "77.75.156.11",
    "77.75.156.35",
    "77.75.154.128",
    "77.75.154.255",
    "2a02:5180::1",
    "2a02:5180:ffff:ffff::1",
    "::ffff:185.71.76.10",
  ])("accepts official address %p", (ip) => {
    expect(isYooKassaIp(ip)).toBe(true);
  });

  it.each([
    "185.71.76.32", // just outside /27
    "185.71.77.32",
    "77.75.153.128", // just outside /25
    "77.75.154.127",
    "77.75.156.12",
    "77.75.156.1",
    "185.7.1.1", // would pass a naive "185.7" prefix check
    "1.2.3.4",
    "2a02:5181::1", // just outside /32
    "2a03::1",
    "::1",
    "127.0.0.1",
    "185.71.76.1.evil.com",
    "",
    undefined,
    null,
  ])("rejects %p", (ip) => {
    expect(isYooKassaIp(ip as string | undefined)).toBe(false);
  });
});

describe("normalizeIp", () => {
  it("unmaps IPv4-mapped IPv6 addresses and drops garbage", () => {
    expect(normalizeIp(" ::FFFF:77.75.156.11 ")).toBe("77.75.156.11");
    expect(normalizeIp("2a02:5180::1")).toBe("2a02:5180::1");
    expect(normalizeIp("not-an-ip")).toBeNull();
  });
});

describe("getWebhookClientIp", () => {
  it("uses the first X-Forwarded-For entry", () => {
    expect(
      getWebhookClientIp(requestWith({ "x-forwarded-for": "185.71.76.5, 10.0.0.2" }, "10.0.0.2")),
    ).toBe("185.71.76.5");
  });

  it("supports repeated headers", () => {
    expect(
      getWebhookClientIp(requestWith({ "x-forwarded-for": ["2a02:5180::7", "10.0.0.1"] })),
    ).toBe("2a02:5180::7");
  });

  it("falls back to the socket address", () => {
    expect(getWebhookClientIp(requestWith({}, "::ffff:77.75.156.35"))).toBe("77.75.156.35");
    expect(getWebhookClientIp(requestWith({ "x-forwarded-for": "garbage" }, "10.0.0.2"))).toBe(
      "10.0.0.2",
    );
  });
});
