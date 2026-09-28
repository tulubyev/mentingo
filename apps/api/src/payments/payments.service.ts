import { randomUUID } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  COURSE_STATUSES,
  PAYMENT_PROVIDERS,
  PAYMENT_STATUSES,
  PERMISSIONS,
  YOOKASSA_CURRENCY,
} from "@repo/shared";

import { DatabasePg } from "src/common";
import { resolveTenantOrigin } from "src/common/helpers/resolveTenantOrigin";
import { hasPermission } from "src/common/permissions/permission.utils";
import { EnvService } from "src/env/services/env.service";
import { DB_ADMIN } from "src/storage/db/db.providers";

import {
  calculatePriceQuote,
  getPromoCodeRejection,
  isValidPromoCodeFormat,
  MIN_PAYMENT_AMOUNT,
  normalizePromoCode,
} from "./payment-pricing";
import { PaymentSyncService } from "./payment-sync.service";
import { buildPaymentsCsv } from "./payments-csv";
import {
  PAYMENT_CANCELLATION_REASONS,
  PAYMENT_ERRORS,
  PENDING_PAYMENT_REUSE_WINDOW_MS,
} from "./payments.constants";
import { PaymentsRepository } from "./payments.repository";
import { isSameAmount, toYooKassaAmount } from "./yookassa/yookassa-amount";
import { YooKassaClientFactory } from "./yookassa/yookassa-client.factory";
import { buildYooKassaReceipt, isReceiptEmail } from "./yookassa/yookassa-receipt";
import { YooKassaApiError } from "./yookassa/yookassa.client";

import type {
  AdminPayment,
  CheckoutBody,
  CheckoutResponse,
  PaymentRow,
  PaymentsConfigResponse,
  PaymentsFilters,
  PaymentsListQuery,
  PaymentsSummary,
  PaymentStatusResponse,
  PriceQuote,
  PromoCodeForPricing,
} from "./payments.types";
import type { CurrentUserType } from "src/common/types/current-user.type";

const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 100;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @Inject(DB_ADMIN) private readonly dbAdmin: DatabasePg,
    private readonly paymentsRepository: PaymentsRepository,
    private readonly paymentSyncService: PaymentSyncService,
    private readonly yooKassaClientFactory: YooKassaClientFactory,
    private readonly envService: EnvService,
  ) {}

  /** ЮKassa wins when both providers are configured (the fork's production setup). */
  async getConfig(): Promise<PaymentsConfigResponse> {
    if (this.yooKassaClientFactory.getConfig().enabled) {
      return { provider: PAYMENT_PROVIDERS.YOOKASSA, currency: YOOKASSA_CURRENCY };
    }

    const { enabled: stripeEnabled } = await this.envService
      .getStripeConfigured()
      .catch(() => ({ enabled: false }));

    return stripeEnabled
      ? { provider: PAYMENT_PROVIDERS.STRIPE, currency: null }
      : { provider: null, currency: null };
  }

  async getQuote(body: CheckoutBody, currentUser: CurrentUserType): Promise<PriceQuote> {
    this.yooKassaClientFactory.getEnabledConfig();

    const { quote } = await this.prepareCheckout(body, currentUser);

    return quote;
  }

  async createYooKassaCheckout(
    body: CheckoutBody,
    currentUser: CurrentUserType,
  ): Promise<CheckoutResponse> {
    const config = this.yooKassaClientFactory.getEnabledConfig();
    const { course, user, promo, quote } = await this.prepareCheckout(body, currentUser);

    if (config.receiptEnabled && !isReceiptEmail(user.email)) {
      throw new BadRequestException(PAYMENT_ERRORS.RECEIPT_EMAIL_REQUIRED);
    }

    const reusable = await this.paymentsRepository.findReusablePendingPayment({
      userId: user.id,
      courseId: course.id,
      provider: PAYMENT_PROVIDERS.YOOKASSA,
      amount: quote.amount,
      promoCodeId: promo?.id ?? null,
      createdAfter: new Date(Date.now() - PENDING_PAYMENT_REUSE_WINDOW_MS).toISOString(),
    });

    if (reusable?.confirmationUrl) {
      // Only hand out the old link if ЮKassa still waits for this payment.
      const current = await this.syncWithProvider(reusable).catch(() => null);

      if (current?.status === PAYMENT_STATUSES.PENDING && current.confirmationUrl) {
        return { paymentId: current.id, confirmationUrl: current.confirmationUrl };
      }

      if (current?.status === PAYMENT_STATUSES.SUCCEEDED) {
        throw new ConflictException(PAYMENT_ERRORS.ALREADY_ENROLLED);
      }
    }

    const paymentId = randomUUID();

    const payment = await this.paymentsRepository.insertPayment({
      id: paymentId,
      userId: user.id,
      courseId: course.id,
      courseTitle: course.title,
      provider: PAYMENT_PROVIDERS.YOOKASSA,
      status: PAYMENT_STATUSES.PENDING,
      amount: quote.amount,
      currency: YOOKASSA_CURRENCY,
      originalAmount: quote.originalAmount,
      discountAmount: quote.discountAmount,
      promoCodeId: promo?.id ?? null,
      promoCode: promo?.code ?? null,
      // The row id doubles as the ЮKassa Idempotence-Key: retries can never create a second charge.
      idempotenceKey: paymentId,
      receiptEmail: isReceiptEmail(user.email) ? user.email : null,
    });

    const origin = await resolveTenantOrigin(this.dbAdmin, currentUser.tenantId);
    const client = this.yooKassaClientFactory.create(config);

    try {
      const providerPayment = await client.createPayment(
        {
          amount: toYooKassaAmount(payment.amount, payment.currency),
          confirmation: {
            type: "redirect",
            return_url: `${origin}/payment/return?paymentId=${payment.id}`,
          },
          capture: true,
          description: this.buildDescription(course.title),
          metadata: {
            paymentId: payment.id,
            tenantId: payment.tenantId,
            userId: user.id,
            courseId: course.id,
          },
          receipt: buildYooKassaReceipt({
            config,
            email: user.email,
            description: course.title,
            amount: payment.amount,
            currency: payment.currency,
          }),
        },
        payment.idempotenceKey,
      );

      const confirmationUrl = providerPayment.confirmation?.confirmation_url;

      if (
        !confirmationUrl ||
        !/^https:\/\//.test(confirmationUrl) ||
        !isSameAmount(providerPayment.amount, payment.amount, payment.currency)
      ) {
        throw new YooKassaApiError(200, "unexpected_payment_response");
      }

      await this.paymentsRepository.updatePayment(payment.id, {
        providerPaymentId: providerPayment.id,
        providerStatus: providerPayment.status,
        confirmationUrl,
      });

      this.logger.log(`ЮKassa payment created: paymentId=${payment.id}`);

      return { paymentId: payment.id, confirmationUrl };
    } catch (error) {
      await this.paymentsRepository.transitionPayment(payment.id, [PAYMENT_STATUSES.PENDING], {
        status: PAYMENT_STATUSES.CANCELED,
        canceledAt: new Date().toISOString(),
        cancellationReason: PAYMENT_CANCELLATION_REASONS.PROVIDER_ERROR,
      });

      this.logger.error(
        `ЮKassa payment creation failed: paymentId=${payment.id} ${this.describeError(error)}`,
      );

      throw new ServiceUnavailableException(PAYMENT_ERRORS.PROVIDER_UNAVAILABLE);
    }
  }

  /**
   * Status for the return page. While the payment is pending the provider is asked directly, so the
   * student gets access even if the notification is delayed.
   */
  async getPaymentStatus(
    paymentId: string,
    currentUser: CurrentUserType,
  ): Promise<PaymentStatusResponse> {
    let payment = await this.paymentsRepository.findPaymentById(paymentId);

    if (!payment || !this.canReadPayment(payment, currentUser)) {
      throw new NotFoundException(PAYMENT_ERRORS.PAYMENT_NOT_FOUND);
    }

    if (
      payment.status === PAYMENT_STATUSES.PENDING &&
      payment.provider === PAYMENT_PROVIDERS.YOOKASSA &&
      payment.providerPaymentId &&
      this.yooKassaClientFactory.getConfig().enabled
    ) {
      payment = await this.syncWithProvider(payment).catch((error) => {
        this.logger.warn(
          `ЮKassa status sync failed: paymentId=${paymentId} ${this.describeError(error)}`,
        );
        return payment as PaymentRow;
      });
    }

    return {
      id: payment.id,
      status: payment.status,
      courseId: payment.courseId,
      amount: payment.amount,
      currency: payment.currency,
    };
  }

  async refundPayment(paymentId: string): Promise<AdminPayment> {
    const config = this.yooKassaClientFactory.getEnabledConfig();
    const payment = await this.paymentsRepository.findPaymentById(paymentId);

    if (!payment) throw new NotFoundException(PAYMENT_ERRORS.PAYMENT_NOT_FOUND);

    const refundableStatuses: string[] = [
      PAYMENT_STATUSES.SUCCEEDED,
      PAYMENT_STATUSES.PARTIALLY_REFUNDED,
    ];

    const remainingAmount = payment.amount - payment.refundedAmount;

    if (
      payment.provider !== PAYMENT_PROVIDERS.YOOKASSA ||
      !payment.providerPaymentId ||
      !refundableStatuses.includes(payment.status) ||
      remainingAmount <= 0
    ) {
      throw new ConflictException(PAYMENT_ERRORS.REFUND_NOT_ALLOWED);
    }

    const client = this.yooKassaClientFactory.create(config);

    try {
      const refund = await client.createRefund(
        {
          payment_id: payment.providerPaymentId,
          amount: toYooKassaAmount(remainingAmount, payment.currency),
          description: this.buildDescription(payment.courseTitle),
          receipt:
            payment.receiptEmail && config.receiptEnabled
              ? buildYooKassaReceipt({
                  config,
                  email: payment.receiptEmail,
                  description: payment.courseTitle,
                  amount: remainingAmount,
                  currency: payment.currency,
                })
              : undefined,
        },
        // Deterministic per refund state: a double click cannot refund twice.
        `refund-${payment.id}-${payment.refundedAmount}`,
      );

      if (refund.status === "canceled") throw new YooKassaApiError(200, "refund_canceled");
    } catch (error) {
      this.logger.error(
        `ЮKassa refund failed: paymentId=${payment.id} ${this.describeError(error)}`,
      );

      throw new ServiceUnavailableException(PAYMENT_ERRORS.REFUND_FAILED);
    }

    // The refund itself succeeded; if reading the new state fails, the refund.succeeded
    // notification updates the row later.
    await this.syncWithProvider(payment).catch((error) =>
      this.logger.warn(
        `ЮKassa sync after refund failed: paymentId=${payment.id} ${this.describeError(error)}`,
      ),
    );

    const updated = await this.paymentsRepository.findAdminPaymentById(payment.id);

    if (!updated) throw new NotFoundException(PAYMENT_ERRORS.PAYMENT_NOT_FOUND);

    return updated;
  }

  async listPayments(query: PaymentsListQuery) {
    const page = Math.max(1, Math.floor(query.page ?? 1));
    const perPage = Math.min(
      MAX_PER_PAGE,
      Math.max(1, Math.floor(query.perPage ?? DEFAULT_PER_PAGE)),
    );

    const { data, totalItems } = await this.paymentsRepository.listPayments(
      this.pickFilters(query),
      { page, perPage },
    );

    return {
      data,
      pagination: { totalItems, page, perPage },
      appliedFilters: this.pickFilters(query),
    };
  }

  async getSummary(filters: PaymentsFilters): Promise<PaymentsSummary> {
    const summary = await this.paymentsRepository.getPaymentsSummary(this.pickFilters(filters));

    return {
      count: summary?.count ?? 0,
      succeededCount: summary?.succeededCount ?? 0,
      totalAmount: summary?.totalAmount ?? 0,
      refundedAmount: summary?.refundedAmount ?? 0,
      netAmount: (summary?.totalAmount ?? 0) - (summary?.refundedAmount ?? 0),
      currency: summary?.currency ?? null,
    };
  }

  async exportPaymentsCsv(filters: PaymentsFilters) {
    const { data } = await this.paymentsRepository.listPayments(this.pickFilters(filters));

    return buildPaymentsCsv(data);
  }

  /** Re-reads the payment from ЮKassa and applies the verified state. */
  async syncWithProvider(payment: PaymentRow): Promise<PaymentRow> {
    if (!payment.providerPaymentId) return payment;

    const client = this.yooKassaClientFactory.create();
    const providerPayment = await client.getPayment(payment.providerPaymentId);
    const { payment: updated } = await this.paymentSyncService.applyProviderPayment(
      payment,
      providerPayment,
    );

    return updated;
  }

  private async prepareCheckout(body: CheckoutBody, currentUser: CurrentUserType) {
    const course = await this.paymentsRepository.findCourseForCheckout(body.courseId);

    if (!course) throw new NotFoundException(PAYMENT_ERRORS.COURSE_NOT_FOUND);

    if (course.status !== COURSE_STATUSES.PUBLISHED) {
      throw new BadRequestException(PAYMENT_ERRORS.COURSE_NOT_AVAILABLE);
    }

    if (course.priceInCents <= 0) throw new BadRequestException(PAYMENT_ERRORS.COURSE_IS_FREE);

    if (course.currency.toLowerCase() !== YOOKASSA_CURRENCY) {
      throw new BadRequestException(PAYMENT_ERRORS.UNSUPPORTED_CURRENCY);
    }

    const user = await this.paymentsRepository.findUser(currentUser.userId);

    if (!user || user.deletedAt || user.archived) {
      throw new NotFoundException(PAYMENT_ERRORS.COURSE_NOT_FOUND);
    }

    if (await this.paymentsRepository.isUserEnrolled(user.id, course.id)) {
      throw new ConflictException(PAYMENT_ERRORS.ALREADY_ENROLLED);
    }

    const promo = await this.resolvePromoCode(body.promoCode, course.id);
    const quote = calculatePriceQuote(course.priceInCents, course.currency, promo);

    if (quote.amount < MIN_PAYMENT_AMOUNT) {
      throw new BadRequestException(PAYMENT_ERRORS.AMOUNT_TOO_LOW);
    }

    return { course, user, promo, quote };
  }

  private async resolvePromoCode(
    rawCode: string | undefined,
    courseId: string,
  ): Promise<PromoCodeForPricing | null> {
    if (!rawCode?.trim()) return null;

    if (!isValidPromoCodeFormat(rawCode)) {
      throw new BadRequestException(PAYMENT_ERRORS.PROMO_CODE_NOT_FOUND);
    }

    const promo = await this.paymentsRepository.findPromoCodeByCode(normalizePromoCode(rawCode));

    if (!promo) throw new BadRequestException(PAYMENT_ERRORS.PROMO_CODE_NOT_FOUND);

    const rejection = getPromoCodeRejection(promo, { courseId, now: new Date() });

    if (rejection) throw new BadRequestException(rejection);

    return promo;
  }

  private canReadPayment(payment: PaymentRow, currentUser: CurrentUserType) {
    return (
      payment.userId === currentUser.userId ||
      hasPermission(currentUser.permissions, PERMISSIONS.BILLING_MANAGE)
    );
  }

  private pickFilters(filters: PaymentsFilters): PaymentsFilters {
    return {
      status: filters.status,
      courseId: filters.courseId,
      userId: filters.userId,
      search: filters.search,
      from: filters.from,
      to: filters.to,
    };
  }

  private buildDescription(courseTitle: string) {
    // ЮKassa limits the payment description to 128 characters.
    return Array.from(`Оплата курса: ${courseTitle}`.replace(/\s+/g, " ").trim())
      .slice(0, 128)
      .join("");
  }

  private describeError(error: unknown) {
    if (error instanceof YooKassaApiError) {
      return `status=${error.httpStatus} code=${error.code}${
        error.parameter ? ` parameter=${error.parameter}` : ""
      }`;
    }

    return `error=${error instanceof Error ? error.name : "unknown"}`;
  }
}
