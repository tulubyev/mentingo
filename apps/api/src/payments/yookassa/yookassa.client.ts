import { FetchLike } from "./yookassa.types";

import type {
  YooKassaAmount,
  YooKassaCreatePaymentRequest,
  YooKassaCreateRefundRequest,
  YooKassaErrorBody,
  YooKassaPayment,
  YooKassaRefund,
} from "./yookassa.types";

const DEFAULT_TIMEOUT_MS = 15_000;
const PROVIDER_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Error returned by the ЮKassa API (or a transport failure, `httpStatus` 0).
 * The message never contains credentials or request bodies.
 */
export class YooKassaApiError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly code: string,
    readonly description?: string,
    readonly parameter?: string,
    readonly requestId?: string,
  ) {
    super(
      `YooKassa API error: status=${httpStatus} code=${code}${
        parameter ? ` parameter=${parameter}` : ""
      }`,
    );
    this.name = "YooKassaApiError";
  }

  /** Transport errors and 5xx answers are worth retrying with the same idempotence key. */
  get isRetryable() {
    return this.httpStatus === 0 || this.httpStatus >= 500;
  }
}

export const isValidYooKassaId = (id: unknown): id is string =>
  typeof id === "string" && PROVIDER_ID_PATTERN.test(id);

type YooKassaCredentials = {
  shopId: string;
  secretKey: string;
  apiUrl: string;
};

/**
 * Minimal ЮKassa REST v3 client: Basic auth (shopId:secretKey), `Idempotence-Key` on every POST,
 * JSON in/out and structured error parsing. HTTP is injected so tests never hit the network.
 */
export class YooKassaClient {
  constructor(
    private readonly credentials: YooKassaCredentials,
    private readonly fetchImpl: FetchLike,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  async createPayment(body: YooKassaCreatePaymentRequest, idempotenceKey: string) {
    return this.request<YooKassaPayment>("POST", "/payments", body, idempotenceKey);
  }

  async getPayment(paymentId: string) {
    return this.request<YooKassaPayment>("GET", `/payments/${this.encodeId(paymentId)}`);
  }

  async capturePayment(paymentId: string, amount: YooKassaAmount, idempotenceKey: string) {
    return this.request<YooKassaPayment>(
      "POST",
      `/payments/${this.encodeId(paymentId)}/capture`,
      { amount },
      idempotenceKey,
    );
  }

  async cancelPayment(paymentId: string, idempotenceKey: string) {
    return this.request<YooKassaPayment>(
      "POST",
      `/payments/${this.encodeId(paymentId)}/cancel`,
      {},
      idempotenceKey,
    );
  }

  async createRefund(body: YooKassaCreateRefundRequest, idempotenceKey: string) {
    return this.request<YooKassaRefund>("POST", "/refunds", body, idempotenceKey);
  }

  private encodeId(id: string) {
    if (!isValidYooKassaId(id)) {
      throw new YooKassaApiError(0, "invalid_payment_id");
    }

    return encodeURIComponent(id);
  }

  private authorizationHeader() {
    const token = Buffer.from(`${this.credentials.shopId}:${this.credentials.secretKey}`).toString(
      "base64",
    );

    return `Basic ${token}`;
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    idempotenceKey?: string,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: this.authorizationHeader(),
      Accept: "application/json",
    };

    if (method === "POST") {
      if (!idempotenceKey) throw new YooKassaApiError(0, "missing_idempotence_key");

      headers["Content-Type"] = "application/json";
      headers["Idempotence-Key"] = idempotenceKey;
    }

    let response: Response;

    try {
      response = await this.fetchImpl(`${this.credentials.apiUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const code =
        error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
          ? "timeout"
          : "network_error";

      throw new YooKassaApiError(0, code);
    }

    const text = await response.text().catch(() => "");
    const json = this.parseJson(text);

    if (!response.ok) {
      const errorBody = (json ?? {}) as YooKassaErrorBody;

      throw new YooKassaApiError(
        response.status,
        typeof errorBody.code === "string" ? errorBody.code : "http_error",
        typeof errorBody.description === "string" ? errorBody.description : undefined,
        typeof errorBody.parameter === "string" ? errorBody.parameter : undefined,
        typeof errorBody.id === "string" ? errorBody.id : undefined,
      );
    }

    if (!json || typeof json !== "object") {
      throw new YooKassaApiError(response.status, "invalid_response");
    }

    return json as T;
  }

  private parseJson(text: string): unknown {
    if (!text) return null;

    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
}
