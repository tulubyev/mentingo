import {
  isSameAmount,
  parseYooKassaValue,
  toYooKassaAmount,
  toYooKassaValue,
} from "src/payments/yookassa/yookassa-amount";
import { YooKassaApiError, YooKassaClient } from "src/payments/yookassa/yookassa.client";

import type { FetchLike } from "src/payments/yookassa/yookassa.types";

const credentials = { shopId: "123456", secretKey: "test_secret", apiUrl: "https://api.test/v3" };

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const createClient = (fetchImpl: jest.Mock) =>
  new YooKassaClient(credentials, fetchImpl as unknown as FetchLike);

const payment = {
  id: "2f1e7c4a-000f-5000-8000-1c2d3e4f5a6b",
  status: "pending",
  amount: { value: "1500.00", currency: "RUB" },
  confirmation: { type: "redirect", confirmation_url: "https://yoomoney.ru/checkout/xyz" },
};

describe("YooKassa amounts", () => {
  it.each([
    [0, "0.00"],
    [1, "0.01"],
    [150000, "1500.00"],
    [99999, "999.99"],
    [100050, "1000.50"],
  ])("formats %p kopecks as %p", (minor, expected) => {
    expect(toYooKassaValue(minor)).toBe(expected);
  });

  it("rejects fractional or negative minor units", () => {
    expect(() => toYooKassaValue(1.5)).toThrow(RangeError);
    expect(() => toYooKassaValue(-1)).toThrow(RangeError);
  });

  it.each([
    ["1500.00", 150000],
    ["1500", 150000],
    ["10.5", 1050],
    ["0.01", 1],
    [" 2.30 ", 230],
  ])("parses %p as %p kopecks", (value, expected) => {
    expect(parseYooKassaValue(value)).toBe(expected);
  });

  it.each([["1e3"], ["-1.00"], ["1.001"], ["abc"], [""], [1500], [null]])(
    "rejects malformed amount %p",
    (value) => {
      expect(parseYooKassaValue(value)).toBeNull();
    },
  );

  it("compares amount and currency exactly", () => {
    expect(isSameAmount({ value: "1500.00", currency: "RUB" }, 150000, "rub")).toBe(true);
    expect(isSameAmount({ value: "1500.01", currency: "RUB" }, 150000, "rub")).toBe(false);
    expect(isSameAmount({ value: "1500.00", currency: "USD" }, 150000, "rub")).toBe(false);
    expect(isSameAmount(undefined, 150000, "rub")).toBe(false);
    expect(toYooKassaAmount(150000, "rub")).toEqual({ value: "1500.00", currency: "RUB" });
  });
});

describe("YooKassaClient", () => {
  it("creates a payment with Basic auth, Idempotence-Key and a JSON body", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(payment));
    const client = createClient(fetchImpl);

    const body = {
      amount: { value: "1500.00", currency: "RUB" },
      confirmation: { type: "redirect" as const, return_url: "https://lms.test/payment/return" },
      capture: true,
      description: "Course",
      metadata: { paymentId: "p", tenantId: "t", userId: "u", courseId: "c" },
    };

    await expect(client.createPayment(body, "idem-key-1")).resolves.toEqual(payment);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];

    expect(url).toBe("https://api.test/v3/payments");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(
      `Basic ${Buffer.from("123456:test_secret").toString("base64")}`,
    );
    expect(init.headers["Idempotence-Key"]).toBe("idem-key-1");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual(body);
  });

  it("gets a payment without an idempotence key and encodes the id", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(payment));

    await createClient(fetchImpl).getPayment(payment.id);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`https://api.test/v3/payments/${payment.id}`);
    expect(init.method).toBe("GET");
    expect(init.headers["Idempotence-Key"]).toBeUndefined();
    expect(init.body).toBeUndefined();
  });

  it("refuses ids that could change the request path", async () => {
    const fetchImpl = jest.fn();

    await expect(createClient(fetchImpl).getPayment("../refunds")).rejects.toMatchObject({
      code: "invalid_payment_id",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("posts refunds, captures and cancellations with idempotence keys", async () => {
    const fetchImpl = jest
      .fn()
      .mockImplementation(async () =>
        jsonResponse({ id: "r1", payment_id: payment.id, status: "succeeded" }),
      );
    const client = createClient(fetchImpl);
    const amount = { value: "1500.00", currency: "RUB" };

    await client.createRefund({ payment_id: payment.id, amount }, "refund-key");
    await client.capturePayment(payment.id, amount, "capture-key");
    await client.cancelPayment(payment.id, "cancel-key");

    expect(
      fetchImpl.mock.calls.map(([url, init]) => [url, init.headers["Idempotence-Key"]]),
    ).toEqual([
      ["https://api.test/v3/refunds", "refund-key"],
      [`https://api.test/v3/payments/${payment.id}/capture`, "capture-key"],
      [`https://api.test/v3/payments/${payment.id}/cancel`, "cancel-key"],
    ]);
  });

  it("parses ЮKassa error bodies", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse(
        {
          type: "error",
          id: "req-1",
          code: "invalid_credentials",
          description: "Authentication by given credentials failed",
          parameter: "Authorization",
        },
        401,
      ),
    );

    const error = await createClient(fetchImpl)
      .getPayment(payment.id)
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(YooKassaApiError);
    expect(error).toMatchObject({
      httpStatus: 401,
      code: "invalid_credentials",
      parameter: "Authorization",
      requestId: "req-1",
      isRetryable: false,
    });
    expect(error.message).not.toContain("test_secret");
  });

  it("maps non-JSON error bodies and 5xx to retryable http errors", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(new Response("<html>bad gateway</html>", { status: 502 }));

    await expect(createClient(fetchImpl).getPayment(payment.id)).rejects.toMatchObject({
      httpStatus: 502,
      code: "http_error",
      isRetryable: true,
    });
  });

  it("maps transport failures and timeouts", async () => {
    const networkFetch = jest.fn().mockRejectedValue(new TypeError("fetch failed"));
    const timeoutError = Object.assign(new Error("timeout"), { name: "TimeoutError" });
    const timeoutFetch = jest.fn().mockRejectedValue(timeoutError);

    await expect(createClient(networkFetch).getPayment(payment.id)).rejects.toMatchObject({
      httpStatus: 0,
      code: "network_error",
      isRetryable: true,
    });
    await expect(createClient(timeoutFetch).getPayment(payment.id)).rejects.toMatchObject({
      code: "timeout",
    });
  });

  it("rejects a successful status with an unparsable body", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(new Response("not json", { status: 200 }));

    await expect(createClient(fetchImpl).getPayment(payment.id)).rejects.toMatchObject({
      code: "invalid_response",
    });
  });
});
