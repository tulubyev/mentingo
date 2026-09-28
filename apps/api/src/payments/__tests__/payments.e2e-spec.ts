import { COURSE_ENROLLMENT, PAYMENT_STATUSES } from "@repo/shared";
import { and, eq } from "drizzle-orm";
import request from "supertest";

import { EmailAdapter } from "src/common/emails/adapters/email.adapter";
import { YOOKASSA_FETCH } from "src/payments/payments.constants";
import { DB, DB_ADMIN } from "src/storage/db/db.providers";
import { TenantDbRunnerService } from "src/storage/db/tenant-db-runner.service";
import { payments, promoCodes, studentCourses } from "src/storage/schema";

import { createE2ETest } from "../../../test/create-e2e-test";
import { createCourseFactory } from "../../../test/factory/course.factory";
import { createSettingsFactory } from "../../../test/factory/settings.factory";
import { createUserFactory } from "../../../test/factory/user.factory";
import { cookieFor } from "../../../test/helpers/test-helpers";

import type { INestApplication } from "@nestjs/common";
import type { DatabasePg, UUIDType } from "src/common";
import type { YooKassaPayment } from "src/payments/yookassa/yookassa.types";
import type { EmailTestingAdapter } from "test/helpers/test-email.adapter";

const SHOP_ID = "654321";
const SECRET_KEY = "test_e2e_secret";
const YOOKASSA_IP = "185.71.76.10";
const PASSWORD = "Password123@";

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

type RecordedRequest = {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: Record<string, any>;
};

/** In-memory stand-in for the ЮKassa HTTP API (no network in tests). */
class FakeYooKassa {
  payments = new Map<string, YooKassaPayment>();
  requests: RecordedRequest[] = [];
  private readonly byIdempotenceKey = new Map<string, unknown>();
  private sequence = 0;

  fetch = async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const headers = (init.headers ?? {}) as Record<string, string>;
    const path = new URL(url).pathname.replace(/^\/v3/, "");
    const body = init.body ? JSON.parse(String(init.body)) : undefined;

    this.requests.push({ method, path, headers, body });

    if (
      headers.Authorization !==
      `Basic ${Buffer.from(`${SHOP_ID}:${SECRET_KEY}`).toString("base64")}`
    ) {
      return jsonResponse(401, { type: "error", code: "invalid_credentials" });
    }

    const idempotenceKey = headers["Idempotence-Key"];

    if (method === "POST" && idempotenceKey && this.byIdempotenceKey.has(idempotenceKey)) {
      return jsonResponse(200, this.byIdempotenceKey.get(idempotenceKey));
    }

    const result = this.route(method, path, body);

    if (method === "POST" && idempotenceKey && result.status === 200) {
      this.byIdempotenceKey.set(idempotenceKey, result.body);
    }

    return jsonResponse(result.status, result.body);
  };

  succeed(providerId: string) {
    const payment = this.payments.get(providerId)!;
    Object.assign(payment, {
      status: "succeeded",
      paid: true,
      captured_at: "2026-09-28T10:05:00.000Z",
    });
  }

  lastCreatedPayment() {
    return Array.from(this.payments.values()).at(-1)!;
  }

  private route(method: string, path: string, body?: Record<string, any>) {
    if (method === "POST" && path === "/payments") {
      this.sequence += 1;
      const id = `2f1e7c4a-000f-5000-8000-${String(this.sequence).padStart(12, "0")}`;
      const payment: YooKassaPayment = {
        id,
        status: "pending",
        paid: false,
        amount: body!.amount,
        description: body!.description,
        metadata: body!.metadata,
        confirmation: {
          type: "redirect",
          confirmation_url: `https://yoomoney.ru/checkout/payments/v2/contract?orderId=${id}`,
        },
        test: true,
      };
      this.payments.set(id, payment);

      return { status: 200, body: payment };
    }

    const paymentMatch = /^\/payments\/([^/]+)$/.exec(path);

    if (method === "GET" && paymentMatch) {
      const payment = this.payments.get(paymentMatch[1]);
      return payment
        ? { status: 200, body: payment }
        : { status: 404, body: { type: "error", code: "not_found" } };
    }

    if (method === "POST" && path === "/refunds") {
      const payment = this.payments.get(body!.payment_id)!;
      payment.refunded_amount = body!.amount;

      return {
        status: 200,
        body: {
          id: `refund-${payment.id}`,
          payment_id: payment.id,
          status: "succeeded",
          amount: body!.amount,
        },
      };
    }

    return { status: 404, body: { type: "error", code: "not_found" } };
  }
}

describe("Payments / ЮKassa (e2e)", () => {
  const envKeys = [
    "YOOKASSA_SHOP_ID",
    "YOOKASSA_SECRET_KEY",
    "YOOKASSA_RECEIPT_ENABLED",
    "YOOKASSA_VAT_CODE",
    "YOOKASSA_WEBHOOK_IP_CHECK",
  ] as const;
  const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

  const fakeYooKassa = new FakeYooKassa();

  let app: INestApplication;
  let db: DatabasePg;
  let baseDb: DatabasePg;
  let defaultTenantId: UUIDType;
  let tenantRunner: TenantDbRunnerService;
  let emailAdapter: EmailTestingAdapter;
  let userFactory: ReturnType<typeof createUserFactory>;
  let courseFactory: ReturnType<typeof createCourseFactory>;

  const inTenant = <T>(fn: () => Promise<T>) => tenantRunner.runWithTenant(defaultTenantId, fn);

  const createStudent = () =>
    inTenant(() =>
      userFactory.withCredentials({ password: PASSWORD }).withUserSettings(db).create(),
    );

  const createAdmin = () =>
    inTenant(() =>
      userFactory.withCredentials({ password: PASSWORD }).withAdminSettings(db).create(),
    );

  const createPaidCourse = (priceInCents = 150000) =>
    inTenant(() => courseFactory.create({ priceInCents, currency: "rub", status: "published" }));

  const sendWebhook = (body: object, ip = YOOKASSA_IP) =>
    request(app.getHttpServer())
      .post("/api/payments/yookassa/webhook")
      .set("X-Forwarded-For", ip)
      .send(body);

  const notification = (event: string, object: Record<string, unknown>) => ({
    type: "notification",
    event,
    object,
  });

  const getPaymentRow = (id: string) =>
    baseDb
      .select()
      .from(payments)
      .where(eq(payments.id, id))
      .then(([row]) => row);

  const isEnrolled = async (studentId: string, courseId: string) => {
    const [row] = await baseDb
      .select({ status: studentCourses.status })
      .from(studentCourses)
      .where(and(eq(studentCourses.studentId, studentId), eq(studentCourses.courseId, courseId)));

    return row?.status === COURSE_ENROLLMENT.ENROLLED;
  };

  const waitFor = async (predicate: () => boolean | Promise<boolean>) => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (await predicate()) return true;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return false;
  };

  const checkout = (cookie: string, courseId: string, promoCode?: string) =>
    request(app.getHttpServer())
      .post("/api/payments/yookassa/checkout")
      .set("Cookie", cookie)
      .send({ courseId, ...(promoCode ? { promoCode } : {}) });

  beforeAll(async () => {
    process.env.YOOKASSA_SHOP_ID = SHOP_ID;
    process.env.YOOKASSA_SECRET_KEY = SECRET_KEY;
    process.env.YOOKASSA_RECEIPT_ENABLED = "true";
    process.env.YOOKASSA_VAT_CODE = "1";
    process.env.YOOKASSA_WEBHOOK_IP_CHECK = "true";

    const testApp = await createE2ETest({
      customProviders: [{ provide: YOOKASSA_FETCH, useValue: fakeYooKassa.fetch }],
      useDbProxy: true,
    });

    app = testApp.app;
    defaultTenantId = testApp.defaultTenantId;
    db = app.get(DB);
    baseDb = app.get(DB_ADMIN);
    tenantRunner = app.get(TenantDbRunnerService);
    emailAdapter = app.get(EmailAdapter) as EmailTestingAdapter;
    userFactory = createUserFactory(db);
    courseFactory = createCourseFactory(db);

    await inTenant(() => createSettingsFactory(db, null).create());
  });

  afterAll(async () => {
    for (const key of envKeys) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }

    await app.close();
  });

  it("exposes the active provider", async () => {
    const response = await request(app.getHttpServer()).get("/api/payments/config").expect(200);

    expect(response.body.data).toEqual({ provider: "yookassa", currency: "rub" });
  });

  it("checkout -> forged webhook -> genuine webhook -> enrollment, e-mail and refund", async () => {
    const student = await createStudent();
    const admin = await createAdmin();
    const course = await createPaidCourse(150000);
    const studentCookie = await cookieFor(student, app);
    const adminCookie = await cookieFor(admin, app);

    await request(app.getHttpServer())
      .post("/api/promo-codes")
      .set("Cookie", adminCookie)
      .send({ code: "summer20", discountType: "percent", discountValue: 20, maxActivations: 10 })
      .expect(201);

    const quote = await request(app.getHttpServer())
      .post("/api/payments/yookassa/quote")
      .set("Cookie", studentCookie)
      .send({ courseId: course.id, promoCode: "Summer20" })
      .expect(200);

    expect(quote.body.data).toEqual({
      originalAmount: 150000,
      discountAmount: 30000,
      amount: 120000,
      currency: "rub",
      promoCode: "SUMMER20",
    });

    // Self-enrollment into a paid course is blocked while payments are enabled.
    const selfEnroll = await request(app.getHttpServer())
      .post(`/api/course/enroll-course?id=${course.id}`)
      .set("Cookie", studentCookie)
      .expect(403);
    expect(selfEnroll.body.message).toBe("payments.errors.paymentRequired");

    const checkoutResponse = await checkout(studentCookie, course.id, "SUMMER20").expect(201);
    const { paymentId, confirmationUrl } = checkoutResponse.body.data;

    const created = fakeYooKassa.lastCreatedPayment();
    const createRequest = fakeYooKassa.requests.find(
      ({ method, path }) => method === "POST" && path === "/payments",
    )!;

    expect(confirmationUrl).toBe(created.confirmation?.confirmation_url);
    expect(createRequest.headers["Idempotence-Key"]).toBe(paymentId);
    expect(createRequest.body).toMatchObject({
      amount: { value: "1200.00", currency: "RUB" },
      capture: true,
      confirmation: {
        type: "redirect",
        return_url: expect.stringMatching(new RegExp(`/payment/return\\?paymentId=${paymentId}$`)),
      },
      metadata: { paymentId, tenantId: defaultTenantId, userId: student.id, courseId: course.id },
      receipt: {
        customer: { email: student.email },
        items: [
          {
            description: course.title,
            quantity: "1.00",
            amount: { value: "1200.00", currency: "RUB" },
            vat_code: 1,
            payment_subject: "service",
            payment_mode: "full_payment",
          },
        ],
      },
    });

    expect(await getPaymentRow(paymentId)).toMatchObject({
      status: PAYMENT_STATUSES.PENDING,
      providerPaymentId: created.id,
      amount: 120000,
      originalAmount: 150000,
      discountAmount: 30000,
      promoCode: "SUMMER20",
      idempotenceKey: paymentId,
      tenantId: defaultTenantId,
    });

    // A double click reuses the pending checkout instead of creating a second payment.
    const repeated = await checkout(studentCookie, course.id, "SUMMER20").expect(201);
    expect(repeated.body.data.paymentId).toBe(paymentId);

    // Forged notification from a foreign address.
    await sendWebhook(
      notification("payment.succeeded", { id: created.id, status: "succeeded" }),
      "203.0.113.7",
    ).expect(403);

    // Right address, but ЮKassa still says "pending": the body is not trusted.
    await sendWebhook(
      notification("payment.succeeded", { id: created.id, status: "succeeded" }),
    ).expect(200);

    expect((await getPaymentRow(paymentId)).status).toBe(PAYMENT_STATUSES.PENDING);
    expect(await isEnrolled(student.id, course.id)).toBe(false);

    emailAdapter.clearEmails();
    fakeYooKassa.succeed(created.id);

    await sendWebhook(notification("payment.succeeded", { id: created.id })).expect(200);
    await sendWebhook(notification("payment.succeeded", { id: created.id })).expect(200);

    const paid = await getPaymentRow(paymentId);
    expect(paid).toMatchObject({ status: PAYMENT_STATUSES.SUCCEEDED });
    expect(paid.paidAt).not.toBeNull();
    expect(await isEnrolled(student.id, course.id)).toBe(true);

    const [promo] = await baseDb.select().from(promoCodes).where(eq(promoCodes.code, "SUMMER20"));
    expect(promo.activationsCount).toBe(1);

    expect(
      await waitFor(() => emailAdapter.getAllEmails().some((email) => email.to === student.email)),
    ).toBe(true);
    expect(emailAdapter.getAllEmails().filter((email) => email.to === student.email)).toHaveLength(
      1,
    );

    const status = await request(app.getHttpServer())
      .get(`/api/payments/${paymentId}/status`)
      .set("Cookie", studentCookie)
      .expect(200);
    expect(status.body.data).toMatchObject({ status: "succeeded", courseId: course.id });

    // Another student cannot see someone else's payment.
    const otherStudent = await createStudent();
    await request(app.getHttpServer())
      .get(`/api/payments/${paymentId}/status`)
      .set("Cookie", await cookieFor(otherStudent, app))
      .expect(404);

    await checkout(studentCookie, course.id).expect(409);

    // Admin registry, totals and CSV.
    const list = await request(app.getHttpServer())
      .get(`/api/payments?courseId=${course.id}`)
      .set("Cookie", adminCookie)
      .expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({
      id: paymentId,
      status: "succeeded",
      userEmail: student.email,
      promoCode: "SUMMER20",
    });

    const summary = await request(app.getHttpServer())
      .get(`/api/payments/summary?courseId=${course.id}`)
      .set("Cookie", adminCookie)
      .expect(200);
    expect(summary.body.data).toMatchObject({ succeededCount: 1, totalAmount: 120000 });

    const csv = await request(app.getHttpServer())
      .get(`/api/payments/export?courseId=${course.id}`)
      .set("Cookie", adminCookie)
      .expect(200);
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.text).toContain(created.id);

    await request(app.getHttpServer())
      .get("/api/payments")
      .set("Cookie", studentCookie)
      .expect(403);

    // Full refund.
    const refund = await request(app.getHttpServer())
      .post(`/api/payments/${paymentId}/refund`)
      .set("Cookie", adminCookie)
      .expect(200);
    expect(refund.body.data).toMatchObject({ status: "refunded", refundedAmount: 120000 });

    const refundRequest = fakeYooKassa.requests.find(({ path }) => path === "/refunds")!;
    expect(refundRequest.headers["Idempotence-Key"]).toBe(`refund-${paymentId}-0`);
    expect(refundRequest.body).toMatchObject({
      payment_id: created.id,
      amount: { value: "1200.00", currency: "RUB" },
      receipt: { customer: { email: student.email } },
    });

    // refund.succeeded notification afterwards is a no-op; the student keeps access.
    await sendWebhook(
      notification("refund.succeeded", { id: `refund-${created.id}`, payment_id: created.id }),
    ).expect(200);
    expect(await getPaymentRow(paymentId)).toMatchObject({
      status: PAYMENT_STATUSES.REFUNDED,
      refundedAmount: 120000,
    });
    expect(await isEnrolled(student.id, course.id)).toBe(true);

    await request(app.getHttpServer())
      .post(`/api/payments/${paymentId}/refund`)
      .set("Cookie", adminCookie)
      .expect(409);
  });

  it("confirms the payment from the status endpoint when the notification is late", async () => {
    const student = await createStudent();
    const course = await createPaidCourse(99000);
    const cookie = await cookieFor(student, app);

    const { paymentId } = (await checkout(cookie, course.id).expect(201)).body.data;
    fakeYooKassa.succeed(fakeYooKassa.lastCreatedPayment().id);

    const status = await request(app.getHttpServer())
      .get(`/api/payments/${paymentId}/status`)
      .set("Cookie", cookie)
      .expect(200);

    expect(status.body.data.status).toBe("succeeded");
    expect(await isEnrolled(student.id, course.id)).toBe(true);
  });

  it("acknowledges notifications for unknown payments", async () => {
    await sendWebhook(
      notification("payment.succeeded", { id: "3a1b2c3d-000f-5000-8000-000000000000" }),
    ).expect(200);
    await sendWebhook({ hello: "world" }).expect(200);
  });

  it("validates promo codes and refuses free or foreign-currency checkouts", async () => {
    const admin = await createAdmin();
    const student = await createStudent();
    const adminCookie = await cookieFor(admin, app);
    const cookie = await cookieFor(student, app);
    const course = await createPaidCourse(50000);
    const otherCourse = await createPaidCourse(50000);

    const created = await request(app.getHttpServer())
      .post("/api/promo-codes")
      .set("Cookie", adminCookie)
      .send({
        code: "ONLY-OTHER",
        discountType: "fixed",
        discountValue: 10000,
        courseId: otherCourse.id,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post("/api/promo-codes")
      .set("Cookie", adminCookie)
      .send({ code: "only-other", discountType: "percent", discountValue: 5 })
      .expect(409);

    const notApplicable = await checkout(cookie, course.id, "only-other").expect(400);
    expect(notApplicable.body.message).toBe("payments.errors.promoCodeNotApplicable");

    await request(app.getHttpServer())
      .patch(`/api/promo-codes/${created.body.data.id}`)
      .set("Cookie", adminCookie)
      .send({ isActive: false })
      .expect(200);

    const inactive = await checkout(cookie, otherCourse.id, "ONLY-OTHER").expect(400);
    expect(inactive.body.message).toBe("payments.errors.promoCodeInactive");

    const unknown = await checkout(cookie, course.id, "NOPE123").expect(400);
    expect(unknown.body.message).toBe("payments.errors.promoCodeNotFound");

    const list = await request(app.getHttpServer())
      .get("/api/promo-codes")
      .set("Cookie", adminCookie)
      .expect(200);
    expect(list.body.data.map(({ code }: { code: string }) => code)).toContain("ONLY-OTHER");

    await request(app.getHttpServer())
      .delete(`/api/promo-codes/${created.body.data.id}`)
      .set("Cookie", adminCookie)
      .expect(200);

    await request(app.getHttpServer()).get("/api/promo-codes").set("Cookie", cookie).expect(403);

    const freeCourse = await createPaidCourse(0);
    const free = await checkout(cookie, freeCourse.id).expect(400);
    expect(free.body.message).toBe("payments.errors.courseIsFree");

    const usdCourse = await inTenant(() =>
      courseFactory.create({ priceInCents: 1000, currency: "usd", status: "published" }),
    );
    const usd = await checkout(cookie, usdCourse.id).expect(400);
    expect(usd.body.message).toBe("payments.errors.unsupportedCurrency");
  });

  it("marks the payment canceled when ЮKassa rejects the creation", async () => {
    const student = await createStudent();
    const course = await createPaidCourse(150000);
    const cookie = await cookieFor(student, app);

    process.env.YOOKASSA_SECRET_KEY = "wrong";

    try {
      const response = await checkout(cookie, course.id).expect(503);
      expect(response.body.message).toBe("payments.errors.providerUnavailable");
    } finally {
      process.env.YOOKASSA_SECRET_KEY = SECRET_KEY;
    }

    const [row] = await baseDb.select().from(payments).where(eq(payments.courseId, course.id));
    expect(row).toMatchObject({
      status: PAYMENT_STATUSES.CANCELED,
      cancellationReason: "provider_error",
      providerPaymentId: null,
    });
  });
});
