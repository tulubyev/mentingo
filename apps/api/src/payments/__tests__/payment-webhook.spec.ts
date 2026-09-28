import { ForbiddenException } from "@nestjs/common";
import { PAYMENT_STATUSES } from "@repo/shared";

import { PaymentSyncService } from "src/payments/payment-sync.service";
import { YooKassaWebhookService } from "src/payments/yookassa-webhook.service";

import type { PaymentStatus } from "@repo/shared";
import type { DatabasePg } from "src/common";
import type { CourseService } from "src/courses/course.service";
import type { OutboxPublisher } from "src/outbox/outbox.publisher";
import type { PaymentsRepository } from "src/payments/payments.repository";
import type { PaymentRow } from "src/payments/payments.types";
import type { YooKassaClientFactory } from "src/payments/yookassa/yookassa-client.factory";
import type { YooKassaPayment } from "src/payments/yookassa/yookassa.types";
import type { TenantDbRunnerService } from "src/storage/db/tenant-db-runner.service";

const TENANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PAYMENT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const COURSE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const PROMO_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const PROVIDER_ID = "2f1e7c4a-000f-5000-8000-1c2d3e4f5a6b";
const YOOKASSA_IP = "185.71.76.10";

const buildPayment = (overrides: Partial<PaymentRow> = {}): PaymentRow => ({
  id: PAYMENT_ID,
  createdAt: "2026-09-28T10:00:00.000Z",
  updatedAt: "2026-09-28T10:00:00.000Z",
  userId: USER_ID,
  courseId: COURSE_ID,
  courseTitle: "Курс",
  provider: "yookassa",
  providerPaymentId: PROVIDER_ID,
  providerStatus: "pending",
  status: PAYMENT_STATUSES.PENDING,
  amount: 120000,
  currency: "rub",
  originalAmount: 150000,
  discountAmount: 30000,
  promoCodeId: PROMO_ID,
  promoCode: "SUMMER",
  refundedAmount: 0,
  confirmationUrl: "https://yoomoney.ru/checkout/xyz",
  idempotenceKey: PAYMENT_ID,
  receiptEmail: "student@example.com",
  cancellationReason: null,
  paidAt: null,
  canceledAt: null,
  refundedAt: null,
  tenantId: TENANT_ID,
  ...overrides,
});

const providerPayment = (overrides: Partial<YooKassaPayment> = {}): YooKassaPayment => ({
  id: PROVIDER_ID,
  status: "succeeded",
  paid: true,
  amount: { value: "1200.00", currency: "RUB" },
  captured_at: "2026-09-28T10:05:00.000Z",
  metadata: { paymentId: PAYMENT_ID, tenantId: TENANT_ID, userId: USER_ID, courseId: COURSE_ID },
  ...overrides,
});

/** In-memory repository with the same conditional-update semantics as the SQL one. */
const createFakeRepository = (initial: PaymentRow) => {
  let row = { ...initial };
  const enrolled = new Set<string>();
  let promoActivations = 0;

  const repository = {
    findPaymentById: jest.fn(async (id: string) => (id === row.id ? { ...row } : undefined)),
    findPaymentTenantByProviderId: jest.fn(async (_provider: string, providerId: string) =>
      providerId === row.providerPaymentId ? { id: row.id, tenantId: row.tenantId } : undefined,
    ),
    transitionPayment: jest.fn(
      async (id: string, from: PaymentStatus[], values: Partial<PaymentRow>) => {
        if (id !== row.id || !from.includes(row.status)) return undefined;
        row = { ...row, ...values } as PaymentRow;
        return { ...row };
      },
    ),
    applyRefundedAmount: jest.fn(
      async (id: string, refundedAmount: number, status: PaymentStatus, refundedAt: string) => {
        const refundable: PaymentStatus[] = [
          PAYMENT_STATUSES.SUCCEEDED,
          PAYMENT_STATUSES.PARTIALLY_REFUNDED,
        ];
        if (
          id !== row.id ||
          !refundable.includes(row.status) ||
          row.refundedAmount >= refundedAmount
        )
          return undefined;
        row = { ...row, refundedAmount, status, refundedAt };
        return { ...row };
      },
    ),
    incrementPromoCodeActivations: jest.fn(async () => {
      promoActivations += 1;
    }),
    findUser: jest.fn(async () => ({
      id: USER_ID,
      email: "student@example.com",
      deletedAt: null,
      archived: false,
    })),
    findCourseForCheckout: jest.fn(async () => ({
      id: COURSE_ID,
      title: "Курс",
      status: "published",
      priceInCents: 150000,
      currency: "rub",
    })),
    isUserEnrolled: jest.fn(async (userId: string, courseId: string) =>
      enrolled.has(`${userId}:${courseId}`),
    ),
  };

  return {
    repository,
    enroll: (userId: string, courseId: string) => enrolled.add(`${userId}:${courseId}`),
    get row() {
      return row;
    },
    get promoActivations() {
      return promoActivations;
    },
  };
};

const setup = (initial = buildPayment(), apiPayment: YooKassaPayment = providerPayment()) => {
  const fake = createFakeRepository(initial);
  const getPayment = jest.fn(async () => apiPayment);
  const capturePayment = jest.fn();
  const clientFactory = {
    getConfig: jest.fn(() => ({ enabled: true, webhookIpCheck: true })),
    create: jest.fn(() => ({ getPayment, capturePayment })),
  } as unknown as YooKassaClientFactory;
  const courseService = {
    enrollCourse: jest.fn(async (courseId: string, userId: string) =>
      fake.enroll(userId, courseId),
    ),
  } as unknown as CourseService;
  const outboxPublisher = { publish: jest.fn(async () => undefined) } as unknown as OutboxPublisher;
  const db = {
    transaction: jest.fn((callback: () => unknown) => callback()),
  } as unknown as DatabasePg;
  const tenantRunner = {
    runWithTenant: jest.fn((_tenantId: string, callback: () => unknown) => callback()),
  } as unknown as TenantDbRunnerService;

  const repository = fake.repository as unknown as PaymentsRepository;
  const syncService = new PaymentSyncService(
    db,
    repository,
    courseService,
    outboxPublisher,
    clientFactory,
  );
  const webhookService = new YooKassaWebhookService(
    repository,
    syncService,
    clientFactory,
    tenantRunner,
  );

  return {
    fake,
    getPayment,
    capturePayment,
    clientFactory,
    courseService,
    outboxPublisher,
    tenantRunner,
    syncService,
    webhookService,
  };
};

const notification = (event: string, object: Record<string, unknown>) => ({
  type: "notification",
  event,
  object,
});

describe("PaymentSyncService", () => {
  it("rejects a provider state whose metadata points to another payment", async () => {
    const { syncService, fake, courseService } = setup();

    const result = await syncService.applyProviderPayment(
      fake.row,
      providerPayment({ metadata: { paymentId: "other", tenantId: TENANT_ID } }),
    );

    expect(result).toMatchObject({ outcome: "rejected", reason: "metadata_payment_mismatch" });
    expect(fake.row.status).toBe(PAYMENT_STATUSES.PENDING);
    expect(courseService.enrollCourse).not.toHaveBeenCalled();
  });

  it.each([
    [{ amount: { value: "1.00", currency: "RUB" } }, "amount_mismatch"],
    [{ amount: { value: "1200.00", currency: "USD" } }, "amount_mismatch"],
    [{ id: "another-provider-id" }, "provider_id_mismatch"],
    [
      { metadata: { paymentId: PAYMENT_ID, tenantId: "ffffffff-ffff-4fff-8fff-ffffffffffff" } },
      "metadata_tenant_mismatch",
    ],
  ])("rejects %p", async (overrides, reason) => {
    const { syncService, fake, courseService } = setup();

    const result = await syncService.applyProviderPayment(fake.row, providerPayment(overrides));

    expect(result).toMatchObject({ outcome: "rejected", reason });
    expect(fake.row.status).toBe(PAYMENT_STATUSES.PENDING);
    expect(courseService.enrollCourse).not.toHaveBeenCalled();
  });

  it("marks the payment paid, counts the promo code, enrolls and emits the event once", async () => {
    const { syncService, fake, courseService, outboxPublisher } = setup();

    const first = await syncService.applyProviderPayment(fake.row, providerPayment());
    const second = await syncService.applyProviderPayment(fake.row, providerPayment());

    expect(first.outcome).toBe("succeeded");
    expect(second.outcome).toBe("unchanged");
    expect(fake.row).toMatchObject({
      status: PAYMENT_STATUSES.SUCCEEDED,
      paidAt: "2026-09-28T10:05:00.000Z",
    });
    expect(fake.promoActivations).toBe(1);
    expect(courseService.enrollCourse).toHaveBeenCalledTimes(1);
    expect(courseService.enrollCourse).toHaveBeenCalledWith(
      COURSE_ID,
      USER_ID,
      undefined,
      PROVIDER_ID,
    );
    expect(outboxPublisher.publish).toHaveBeenCalledTimes(1);
  });

  it("does not enroll twice when the student is already enrolled", async () => {
    const { syncService, fake, courseService } = setup();
    fake.enroll(USER_ID, COURSE_ID);

    await syncService.applyProviderPayment(fake.row, providerPayment());

    expect(fake.row.status).toBe(PAYMENT_STATUSES.SUCCEEDED);
    expect(courseService.enrollCourse).not.toHaveBeenCalled();
  });

  it("cancels only pending payments", async () => {
    const { syncService, fake } = setup();

    const canceled = await syncService.applyProviderPayment(
      fake.row,
      providerPayment({
        status: "canceled",
        cancellation_details: { reason: "expired_on_confirmation" },
      }),
    );

    expect(canceled.outcome).toBe("canceled");
    expect(fake.row).toMatchObject({
      status: PAYMENT_STATUSES.CANCELED,
      cancellationReason: "expired_on_confirmation",
    });

    const again = await syncService.applyProviderPayment(
      fake.row,
      providerPayment({ status: "canceled" }),
    );
    expect(again.outcome).toBe("unchanged");
  });

  it("applies refunds from the provider's cumulative refunded amount idempotently", async () => {
    const { syncService, fake, courseService } = setup(
      buildPayment({ status: PAYMENT_STATUSES.SUCCEEDED, paidAt: "2026-09-28T10:05:00.000Z" }),
    );

    const partial = await syncService.applyProviderPayment(
      fake.row,
      providerPayment({ refunded_amount: { value: "200.00", currency: "RUB" } }),
    );
    expect(partial.outcome).toBe("refunded");
    expect(fake.row).toMatchObject({
      status: PAYMENT_STATUSES.PARTIALLY_REFUNDED,
      refundedAmount: 20000,
    });

    const full = await syncService.applyProviderPayment(
      fake.row,
      providerPayment({ refunded_amount: { value: "1200.00", currency: "RUB" } }),
    );
    expect(full.outcome).toBe("refunded");
    expect(fake.row).toMatchObject({ status: PAYMENT_STATUSES.REFUNDED, refundedAmount: 120000 });

    const repeated = await syncService.applyProviderPayment(
      fake.row,
      providerPayment({ refunded_amount: { value: "1200.00", currency: "RUB" } }),
    );
    expect(repeated.outcome).toBe("unchanged");
    // A refund never unenrolls automatically, and never enrolls again.
    expect(courseService.enrollCourse).not.toHaveBeenCalled();
  });

  it("captures a payment that is waiting for capture", async () => {
    const { syncService, fake, capturePayment } = setup();
    capturePayment.mockResolvedValue(providerPayment());

    const result = await syncService.applyProviderPayment(
      fake.row,
      providerPayment({ status: "waiting_for_capture" }),
    );

    expect(capturePayment).toHaveBeenCalledWith(
      PROVIDER_ID,
      { value: "1200.00", currency: "RUB" },
      `capture-${PAYMENT_ID}`,
    );
    expect(result.outcome).toBe("succeeded");
  });
});

describe("YooKassaWebhookService", () => {
  it("never trusts the notification body: a forged 'succeeded' is ignored if the API says pending", async () => {
    const { webhookService, fake, getPayment, courseService } = setup(
      buildPayment(),
      providerPayment({ status: "pending", paid: false }),
    );

    const result = await webhookService.handleNotification(
      notification("payment.succeeded", {
        id: PROVIDER_ID,
        status: "succeeded",
        paid: true,
        amount: { value: "1200.00", currency: "RUB" },
        metadata: { paymentId: PAYMENT_ID },
      }),
      YOOKASSA_IP,
    );

    expect(getPayment).toHaveBeenCalledWith(PROVIDER_ID);
    expect(result).toEqual({ handled: true, outcome: "pending" });
    expect(fake.row.status).toBe(PAYMENT_STATUSES.PENDING);
    expect(courseService.enrollCourse).not.toHaveBeenCalled();
  });

  it("rejects an amount mismatch between our row and the API", async () => {
    const { webhookService, fake } = setup(
      buildPayment(),
      providerPayment({ amount: { value: "1.00", currency: "RUB" } }),
    );

    const result = await webhookService.handleNotification(
      notification("payment.succeeded", { id: PROVIDER_ID }),
      YOOKASSA_IP,
    );

    expect(result).toEqual({ handled: true, outcome: "rejected" });
    expect(fake.row.status).toBe(PAYMENT_STATUSES.PENDING);
  });

  it("processes a genuine notification in the payment's tenant, idempotently", async () => {
    const { webhookService, fake, courseService, tenantRunner } = setup();
    const body = notification("payment.succeeded", { id: PROVIDER_ID });

    await expect(webhookService.handleNotification(body, YOOKASSA_IP)).resolves.toEqual({
      handled: true,
      outcome: "succeeded",
    });
    await expect(webhookService.handleNotification(body, YOOKASSA_IP)).resolves.toEqual({
      handled: true,
      outcome: "unchanged",
    });

    expect(tenantRunner.runWithTenant).toHaveBeenCalledWith(TENANT_ID, expect.any(Function));
    expect(fake.row.status).toBe(PAYMENT_STATUSES.SUCCEEDED);
    expect(courseService.enrollCourse).toHaveBeenCalledTimes(1);
  });

  it("uses payment_id for refund notifications", async () => {
    const { webhookService, getPayment } = setup(
      buildPayment({ status: PAYMENT_STATUSES.SUCCEEDED }),
      providerPayment({ refunded_amount: { value: "1200.00", currency: "RUB" } }),
    );

    const result = await webhookService.handleNotification(
      notification("refund.succeeded", { id: "refund-1", payment_id: PROVIDER_ID }),
      YOOKASSA_IP,
    );

    expect(getPayment).toHaveBeenCalledWith(PROVIDER_ID);
    expect(result).toEqual({ handled: true, outcome: "refunded" });
  });

  it("rejects callers outside the ЮKassa networks before doing anything", async () => {
    const { webhookService, getPayment, fake } = setup();

    await expect(
      webhookService.handleNotification(
        notification("payment.succeeded", { id: PROVIDER_ID }),
        "203.0.113.5",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(fake.repository.findPaymentTenantByProviderId).not.toHaveBeenCalled();
    expect(getPayment).not.toHaveBeenCalled();
  });

  it("skips the IP check when it is disabled", async () => {
    const { webhookService, clientFactory } = setup();
    (clientFactory.getConfig as jest.Mock).mockReturnValue({
      enabled: true,
      webhookIpCheck: false,
    });

    await expect(
      webhookService.handleNotification(
        notification("payment.succeeded", { id: PROVIDER_ID }),
        "203.0.113.5",
      ),
    ).resolves.toEqual({ handled: true, outcome: "succeeded" });
  });

  it("acknowledges unknown payments without calling the API", async () => {
    const { webhookService, getPayment } = setup();

    const result = await webhookService.handleNotification(
      notification("payment.succeeded", { id: "3a1b2c3d-000f-5000-8000-000000000000" }),
      YOOKASSA_IP,
    );

    expect(result).toEqual({ handled: false, reason: "unknown_payment" });
    expect(getPayment).not.toHaveBeenCalled();
  });

  it.each([
    [null],
    ["text"],
    [{ type: "notification", event: "payment.succeeded" }],
    [{ type: "other", event: "payment.succeeded", object: { id: PROVIDER_ID } }],
    [{ type: "notification", event: "deal.closed", object: { id: PROVIDER_ID } }],
    [{ type: "notification", event: "payment.succeeded", object: { id: "../../refunds" } }],
  ])("ignores malformed body %p", async (body) => {
    const { webhookService, getPayment } = setup();

    const result = await webhookService.handleNotification(body, YOOKASSA_IP);

    expect(result.handled).toBe(false);
    expect(getPayment).not.toHaveBeenCalled();
  });
});
