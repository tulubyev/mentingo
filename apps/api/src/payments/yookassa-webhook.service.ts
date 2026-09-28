import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { PAYMENT_PROVIDERS } from "@repo/shared";

import { TenantDbRunnerService } from "src/storage/db/tenant-db-runner.service";

import { PaymentSyncService } from "./payment-sync.service";
import { PaymentsRepository } from "./payments.repository";
import { YooKassaClientFactory } from "./yookassa/yookassa-client.factory";
import { isYooKassaIp } from "./yookassa/yookassa-ip";
import { isValidYooKassaId } from "./yookassa/yookassa.client";

import type { WebhookHandlingResult } from "./payments.types";
import type { YooKassaNotificationEvent } from "./yookassa/yookassa.types";

const SUPPORTED_EVENTS: readonly YooKassaNotificationEvent[] = [
  "payment.succeeded",
  "payment.waiting_for_capture",
  "payment.canceled",
  "refund.succeeded",
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * ЮKassa HTTP notifications. The body is only used to learn *which* payment changed:
 * the state is always re-read from the ЮKassa API with the shop credentials, matched against our
 * row (id, metadata, amount, currency) and applied idempotently.
 */
@Injectable()
export class YooKassaWebhookService {
  private readonly logger = new Logger(YooKassaWebhookService.name);

  constructor(
    private readonly paymentsRepository: PaymentsRepository,
    private readonly paymentSyncService: PaymentSyncService,
    private readonly yooKassaClientFactory: YooKassaClientFactory,
    private readonly tenantDbRunner: TenantDbRunnerService,
  ) {}

  async handleNotification(body: unknown, clientIp: string | null): Promise<WebhookHandlingResult> {
    const config = this.yooKassaClientFactory.getConfig();

    if (!config.enabled) return this.ignore("not_configured");

    if (config.webhookIpCheck && !isYooKassaIp(clientIp)) {
      this.logger.warn("ЮKassa notification from a non-ЮKassa address rejected");
      throw new ForbiddenException();
    }

    if (!isRecord(body) || body.type !== "notification" || !isRecord(body.object)) {
      return this.ignore("malformed_body");
    }

    const event = body.event as YooKassaNotificationEvent;

    if (!SUPPORTED_EVENTS.includes(event)) return this.ignore("unsupported_event");

    const providerPaymentId = event.startsWith("refund.") ? body.object.payment_id : body.object.id;

    if (!isValidYooKassaId(providerPaymentId)) return this.ignore("invalid_payment_id");

    // Unknown ids get a 200 so ЮKassa stops retrying, and never trigger an API call.
    const reference = await this.paymentsRepository.findPaymentTenantByProviderId(
      PAYMENT_PROVIDERS.YOOKASSA,
      providerPaymentId,
    );

    if (!reference) {
      this.logger.warn(`ЮKassa notification for an unknown payment: event=${event}`);
      return { handled: false, reason: "unknown_payment" };
    }

    const providerPayment = await this.yooKassaClientFactory
      .create(config)
      .getPayment(providerPaymentId);

    return this.tenantDbRunner.runWithTenant(reference.tenantId, async () => {
      const payment = await this.paymentsRepository.findPaymentById(reference.id);

      if (!payment) return { handled: false, reason: "unknown_payment" } as const;

      const result = await this.paymentSyncService.applyProviderPayment(payment, providerPayment);

      this.logger.log(
        `ЮKassa notification processed: event=${event} paymentId=${payment.id} outcome=${result.outcome}`,
      );

      return { handled: true, outcome: result.outcome } as const;
    });
  }

  private ignore(reason: string): WebhookHandlingResult {
    this.logger.warn(`ЮKassa notification ignored: reason=${reason}`);

    return { handled: false, reason };
  }
}
