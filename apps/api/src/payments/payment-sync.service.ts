import { Inject, Injectable, Logger } from "@nestjs/common";
import { PAYMENT_STATUSES } from "@repo/shared";
import { match } from "ts-pattern";

import { DatabasePg } from "src/common";
import { CourseService } from "src/courses/course.service";
import { CoursePaymentSucceededEvent } from "src/events/payments/course-payment-succeeded.event";
import { OutboxPublisher } from "src/outbox/outbox.publisher";
import { DB } from "src/storage/db/db.providers";

import { PaymentsRepository } from "./payments.repository";
import { isSameAmount, parseYooKassaValue } from "./yookassa/yookassa-amount";
import { YooKassaClientFactory } from "./yookassa/yookassa-client.factory";

import type { PaymentRow, PaymentSyncResult } from "./payments.types";
import type { YooKassaPayment } from "./yookassa/yookassa.types";

/**
 * Applies a provider payment state (always obtained from the ЮKassa API with shop credentials,
 * never from a notification body) to our payment row. Every transition is conditional on the
 * current status, so concurrent or repeated calls (webhook retries, status polling) are no-ops.
 */
@Injectable()
export class PaymentSyncService {
  private readonly logger = new Logger(PaymentSyncService.name);

  constructor(
    @Inject(DB) private readonly db: DatabasePg,
    private readonly paymentsRepository: PaymentsRepository,
    private readonly courseService: CourseService,
    private readonly outboxPublisher: OutboxPublisher,
    private readonly yooKassaClientFactory: YooKassaClientFactory,
  ) {}

  /** Returns why the provider object must not be trusted for this row, or null if it matches. */
  getVerificationFailure(payment: PaymentRow, providerPayment: YooKassaPayment): string | null {
    if (!payment.providerPaymentId || providerPayment.id !== payment.providerPaymentId) {
      return "provider_id_mismatch";
    }

    if (providerPayment.metadata?.paymentId !== payment.id) return "metadata_payment_mismatch";

    if (providerPayment.metadata?.tenantId !== payment.tenantId) return "metadata_tenant_mismatch";

    if (!isSameAmount(providerPayment.amount, payment.amount, payment.currency)) {
      return "amount_mismatch";
    }

    return null;
  }

  async applyProviderPayment(
    payment: PaymentRow,
    providerPayment: YooKassaPayment,
  ): Promise<PaymentSyncResult> {
    const failure = this.getVerificationFailure(payment, providerPayment);

    if (failure) {
      this.logger.warn(
        `Rejected ЮKassa payment state: paymentId=${payment.id} providerPaymentId=${payment.providerPaymentId} reason=${failure}`,
      );

      return { outcome: "rejected", reason: failure, payment };
    }

    return match(providerPayment.status)
      .with("succeeded", () => this.applySucceeded(payment, providerPayment))
      .with("canceled", () => this.applyCanceled(payment, providerPayment))
      .with("waiting_for_capture", () => this.capture(payment, providerPayment))
      .otherwise(() => this.applyPending(payment, providerPayment));
  }

  private async applySucceeded(
    payment: PaymentRow,
    providerPayment: YooKassaPayment,
  ): Promise<PaymentSyncResult> {
    const succeeded = await this.db.transaction(async () => {
      // A payment we marked as canceled (e.g. the create call timed out) can still be paid:
      // the money is the source of truth.
      const updated = await this.paymentsRepository.transitionPayment(
        payment.id,
        [PAYMENT_STATUSES.PENDING, PAYMENT_STATUSES.CANCELED],
        {
          status: PAYMENT_STATUSES.SUCCEEDED,
          providerStatus: providerPayment.status,
          paidAt: providerPayment.captured_at ?? new Date().toISOString(),
          canceledAt: null,
          cancellationReason: null,
        },
      );

      if (!updated) return undefined;

      if (updated.promoCodeId) {
        await this.paymentsRepository.incrementPromoCodeActivations(updated.promoCodeId);
      }

      await this.enrollPayer(updated);

      return updated;
    });

    let result: PaymentSyncResult = succeeded
      ? { outcome: "succeeded", payment: succeeded }
      : { outcome: "unchanged", payment: (await this.reload(payment)) ?? payment };

    if (succeeded) {
      this.logger.log(`Payment succeeded: paymentId=${succeeded.id}`);
      await this.publishSucceeded(succeeded);
    }

    const refundedAmount = this.getRefundedAmount(result.payment, providerPayment);

    if (refundedAmount > 0) {
      const refunded = await this.applyRefundedAmount(result.payment, refundedAmount);
      if (refunded) result = { outcome: "refunded", payment: refunded };
    }

    return result;
  }

  private async applyCanceled(
    payment: PaymentRow,
    providerPayment: YooKassaPayment,
  ): Promise<PaymentSyncResult> {
    const updated = await this.paymentsRepository.transitionPayment(
      payment.id,
      [PAYMENT_STATUSES.PENDING],
      {
        status: PAYMENT_STATUSES.CANCELED,
        providerStatus: providerPayment.status,
        canceledAt: new Date().toISOString(),
        cancellationReason: providerPayment.cancellation_details?.reason?.slice(0, 64) ?? null,
      },
    );

    if (!updated) {
      return { outcome: "unchanged", payment: (await this.reload(payment)) ?? payment };
    }

    this.logger.log(`Payment canceled: paymentId=${updated.id}`);

    return { outcome: "canceled", payment: updated };
  }

  private async applyPending(
    payment: PaymentRow,
    providerPayment: YooKassaPayment,
  ): Promise<PaymentSyncResult> {
    if (payment.status !== PAYMENT_STATUSES.PENDING) {
      return { outcome: "unchanged", payment };
    }

    if (payment.providerStatus === providerPayment.status) {
      return { outcome: "pending", payment };
    }

    const updated = await this.paymentsRepository.transitionPayment(
      payment.id,
      [PAYMENT_STATUSES.PENDING],
      { providerStatus: providerPayment.status },
    );

    return { outcome: "pending", payment: updated ?? payment };
  }

  /**
   * Payments are created with `capture: true`, so "waiting_for_capture" only appears when the shop
   * forces two-stage payments. The amount was already verified, so the payment is captured.
   */
  private async capture(
    payment: PaymentRow,
    providerPayment: YooKassaPayment,
  ): Promise<PaymentSyncResult> {
    if (payment.status !== PAYMENT_STATUSES.PENDING) {
      return { outcome: "unchanged", payment };
    }

    const client = this.yooKassaClientFactory.create();
    const captured = await client.capturePayment(
      providerPayment.id,
      providerPayment.amount,
      `capture-${payment.id}`,
    );

    if (captured.status === "waiting_for_capture") {
      return this.applyPending(payment, captured);
    }

    return this.applyProviderPayment(payment, captured);
  }

  private getRefundedAmount(payment: PaymentRow, providerPayment: YooKassaPayment) {
    const refunded = providerPayment.refunded_amount;

    if (!refunded || refunded.currency?.toUpperCase() !== payment.currency.toUpperCase()) return 0;

    return parseYooKassaValue(refunded.value) ?? 0;
  }

  private async applyRefundedAmount(payment: PaymentRow, providerRefundedAmount: number) {
    const refundedAmount = Math.min(providerRefundedAmount, payment.amount);
    const status =
      refundedAmount >= payment.amount
        ? PAYMENT_STATUSES.REFUNDED
        : PAYMENT_STATUSES.PARTIALLY_REFUNDED;

    const updated = await this.paymentsRepository.applyRefundedAmount(
      payment.id,
      refundedAmount,
      status,
      new Date().toISOString(),
    );

    if (updated) {
      this.logger.log(`Payment refund applied: paymentId=${updated.id} status=${updated.status}`);
    }

    return updated;
  }

  /**
   * Enrolls the payer through the regular enrollment service. A missing/deleted user or course is
   * logged and skipped (the money is still recorded), anything else rolls back the transition so
   * the provider retries the notification.
   */
  private async enrollPayer(payment: PaymentRow) {
    if (!payment.userId || !payment.courseId) {
      this.logger.warn(`Paid payment has no user or course: paymentId=${payment.id}`);
      return;
    }

    const user = await this.paymentsRepository.findUser(payment.userId);

    if (!user || user.deletedAt) {
      this.logger.warn(`Paid payment user is missing or deleted: paymentId=${payment.id}`);
      return;
    }

    const course = await this.paymentsRepository.findCourseForCheckout(payment.courseId);

    if (!course) {
      this.logger.warn(`Paid payment course is missing: paymentId=${payment.id}`);
      return;
    }

    if (await this.paymentsRepository.isUserEnrolled(payment.userId, payment.courseId)) return;

    await this.courseService.enrollCourse(
      payment.courseId,
      payment.userId,
      undefined,
      payment.providerPaymentId ?? payment.id,
    );
  }

  private async publishSucceeded(payment: PaymentRow) {
    if (!payment.userId || !payment.courseId) return;

    try {
      await this.outboxPublisher.publish(
        new CoursePaymentSucceededEvent({
          paymentId: payment.id,
          tenantId: payment.tenantId,
          userId: payment.userId,
          courseId: payment.courseId,
        }),
      );
    } catch (error) {
      this.logger.error(
        `Failed to publish payment succeeded event: paymentId=${payment.id} error=${
          error instanceof Error ? error.name : "unknown"
        }`,
      );
    }
  }

  private reload(payment: PaymentRow) {
    return this.paymentsRepository.findPaymentById(payment.id);
  }
}
