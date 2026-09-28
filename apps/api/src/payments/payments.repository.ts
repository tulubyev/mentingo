import { Inject, Injectable } from "@nestjs/common";
import { COURSE_ENROLLMENT, PAYMENT_STATUSES } from "@repo/shared";
import { and, count, desc, eq, gte, ilike, inArray, isNull, lt, or, sql } from "drizzle-orm";

import { DatabasePg } from "src/common";
import { LocalizationService } from "src/localization/localization.service";
import { DB, DB_ADMIN } from "src/storage/db/db.providers";
import { courses, payments, promoCodes, studentCourses, users } from "src/storage/schema";

import type {
  AdminPayment,
  CheckoutCourse,
  CheckoutUser,
  PaymentRow,
  PaymentsFilters,
  PromoCodeForPricing,
} from "./payments.types";
import type { PaymentProvider, PaymentStatus } from "@repo/shared";
import type { SQL } from "drizzle-orm";

type NewPayment = typeof payments.$inferInsert;
type PaymentUpdate = Partial<Omit<NewPayment, "id" | "tenantId">>;

const escapeLikePattern = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

const addOneDay = (date: string) => {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
};

@Injectable()
export class PaymentsRepository {
  constructor(
    @Inject(DB) private readonly db: DatabasePg,
    @Inject(DB_ADMIN) private readonly dbAdmin: DatabasePg,
    private readonly localizationService: LocalizationService,
  ) {}

  async findCourseForCheckout(courseId: string): Promise<CheckoutCourse | undefined> {
    const [course] = await this.db
      .select({
        id: courses.id,
        title: this.localizationService.getLocalizedSqlField(courses.title),
        status: courses.status,
        priceInCents: courses.priceInCents,
        currency: courses.currency,
      })
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);

    return course ? { ...course, title: course.title ?? "" } : undefined;
  }

  async findUser(userId: string): Promise<CheckoutUser | undefined> {
    const [user] = await this.db
      .select({
        id: users.id,
        email: users.email,
        deletedAt: users.deletedAt,
        archived: users.archived,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return user;
  }

  async isUserEnrolled(userId: string, courseId: string) {
    const [enrollment] = await this.db
      .select({ id: studentCourses.id })
      .from(studentCourses)
      .where(
        and(
          eq(studentCourses.studentId, userId),
          eq(studentCourses.courseId, courseId),
          eq(studentCourses.status, COURSE_ENROLLMENT.ENROLLED),
        ),
      )
      .limit(1);

    return Boolean(enrollment);
  }

  async findPromoCodeByCode(code: string): Promise<PromoCodeForPricing | undefined> {
    const [promo] = await this.db
      .select({
        id: promoCodes.id,
        code: promoCodes.code,
        discountType: promoCodes.discountType,
        discountValue: promoCodes.discountValue,
        courseId: promoCodes.courseId,
        validFrom: promoCodes.validFrom,
        validTo: promoCodes.validTo,
        maxActivations: promoCodes.maxActivations,
        activationsCount: promoCodes.activationsCount,
        isActive: promoCodes.isActive,
      })
      .from(promoCodes)
      .where(eq(promoCodes.code, code))
      .limit(1);

    return promo;
  }

  async incrementPromoCodeActivations(promoCodeId: string) {
    await this.db
      .update(promoCodes)
      .set({ activationsCount: sql`${promoCodes.activationsCount} + 1` })
      .where(eq(promoCodes.id, promoCodeId));
  }

  async findReusablePendingPayment(input: {
    userId: string;
    courseId: string;
    provider: PaymentProvider;
    amount: number;
    promoCodeId: string | null;
    createdAfter: string;
  }) {
    const [payment] = await this.db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.userId, input.userId),
          eq(payments.courseId, input.courseId),
          eq(payments.provider, input.provider),
          eq(payments.status, PAYMENT_STATUSES.PENDING),
          eq(payments.amount, input.amount),
          input.promoCodeId
            ? eq(payments.promoCodeId, input.promoCodeId)
            : isNull(payments.promoCodeId),
          gte(payments.createdAt, input.createdAfter),
          sql`${payments.confirmationUrl} IS NOT NULL`,
          sql`${payments.providerPaymentId} IS NOT NULL`,
        ),
      )
      .orderBy(desc(payments.createdAt))
      .limit(1);

    return payment;
  }

  async insertPayment(values: NewPayment): Promise<PaymentRow> {
    const [payment] = await this.db.insert(payments).values(values).returning();

    return payment;
  }

  async updatePayment(id: string, values: PaymentUpdate): Promise<PaymentRow | undefined> {
    const [payment] = await this.db
      .update(payments)
      .set(values)
      .where(eq(payments.id, id))
      .returning();

    return payment;
  }

  /**
   * Atomically moves a payment to a new state only if it is still in one of `fromStatuses`.
   * Returns undefined when another request already applied the transition (idempotency).
   */
  async transitionPayment(
    id: string,
    fromStatuses: PaymentStatus[],
    values: PaymentUpdate,
  ): Promise<PaymentRow | undefined> {
    const [payment] = await this.db
      .update(payments)
      .set(values)
      .where(and(eq(payments.id, id), inArray(payments.status, fromStatuses)))
      .returning();

    return payment;
  }

  /**
   * Stores the provider's cumulative refunded amount. Only grows, so repeated or out-of-order
   * refund notifications are no-ops.
   */
  async applyRefundedAmount(
    id: string,
    refundedAmount: number,
    status: PaymentStatus,
    refundedAt: string,
  ): Promise<PaymentRow | undefined> {
    const [payment] = await this.db
      .update(payments)
      .set({ refundedAmount, status, refundedAt })
      .where(
        and(
          eq(payments.id, id),
          inArray(payments.status, [
            PAYMENT_STATUSES.SUCCEEDED,
            PAYMENT_STATUSES.PARTIALLY_REFUNDED,
          ]),
          lt(payments.refundedAmount, refundedAmount),
        ),
      )
      .returning();

    return payment;
  }

  async findPaymentById(id: string): Promise<PaymentRow | undefined> {
    const [payment] = await this.db.select().from(payments).where(eq(payments.id, id)).limit(1);

    return payment;
  }

  /**
   * Tenant resolution for provider notifications: the webhook is not bound to a tenant host,
   * so the owning tenant is looked up by the provider payment id (deliberate cross-tenant read).
   */
  async findPaymentTenantByProviderId(provider: PaymentProvider, providerPaymentId: string) {
    const [payment] = await this.dbAdmin
      .select({ id: payments.id, tenantId: payments.tenantId })
      .from(payments)
      .where(
        and(eq(payments.provider, provider), eq(payments.providerPaymentId, providerPaymentId)),
      )
      .limit(1);

    return payment;
  }

  async listPayments(
    filters: PaymentsFilters,
    pagination?: { page: number; perPage: number },
  ): Promise<{ data: AdminPayment[]; totalItems: number }> {
    const where = this.buildFilters(filters);

    const query = this.db
      .select(this.adminPaymentSelection())
      .from(payments)
      .leftJoin(users, eq(users.id, payments.userId))
      .where(where)
      .orderBy(desc(payments.createdAt), desc(payments.id))
      .$dynamic();

    const data = pagination
      ? await query.limit(pagination.perPage).offset((pagination.page - 1) * pagination.perPage)
      : await query;

    const [{ totalItems }] = await this.db
      .select({ totalItems: count() })
      .from(payments)
      .leftJoin(users, eq(users.id, payments.userId))
      .where(where);

    return { data, totalItems };
  }

  async findAdminPaymentById(id: string): Promise<AdminPayment | undefined> {
    const [payment] = await this.db
      .select(this.adminPaymentSelection())
      .from(payments)
      .leftJoin(users, eq(users.id, payments.userId))
      .where(eq(payments.id, id))
      .limit(1);

    return payment;
  }

  async getPaymentsSummary(filters: PaymentsFilters) {
    const paidStatuses = [
      PAYMENT_STATUSES.SUCCEEDED,
      PAYMENT_STATUSES.PARTIALLY_REFUNDED,
      PAYMENT_STATUSES.REFUNDED,
    ];

    const [summary] = await this.db
      .select({
        count: sql<number>`COUNT(*)::INTEGER`,
        succeededCount: sql<number>`COUNT(*) FILTER (WHERE ${inArray(
          payments.status,
          paidStatuses,
        )})::INTEGER`,
        totalAmount: sql<number>`COALESCE(SUM(${payments.amount}) FILTER (WHERE ${inArray(
          payments.status,
          paidStatuses,
        )}), 0)::INTEGER`,
        refundedAmount: sql<number>`COALESCE(SUM(${payments.refundedAmount}), 0)::INTEGER`,
        currency: sql<string | null>`MIN(${payments.currency})`,
      })
      .from(payments)
      .leftJoin(users, eq(users.id, payments.userId))
      .where(this.buildFilters(filters));

    return summary;
  }

  private adminPaymentSelection() {
    return {
      id: payments.id,
      createdAt: payments.createdAt,
      paidAt: payments.paidAt,
      canceledAt: payments.canceledAt,
      refundedAt: payments.refundedAt,
      status: payments.status,
      provider: payments.provider,
      providerPaymentId: payments.providerPaymentId,
      amount: payments.amount,
      originalAmount: payments.originalAmount,
      discountAmount: payments.discountAmount,
      refundedAmount: payments.refundedAmount,
      currency: payments.currency,
      promoCode: payments.promoCode,
      courseId: payments.courseId,
      courseTitle: payments.courseTitle,
      userId: payments.userId,
      userFirstName: users.firstName,
      userLastName: users.lastName,
      userEmail: sql<string | null>`COALESCE(${users.email}, ${payments.receiptEmail})`,
    };
  }

  private buildFilters(filters: PaymentsFilters) {
    const conditions: SQL[] = [];

    if (filters.status) conditions.push(eq(payments.status, filters.status));
    if (filters.courseId) conditions.push(eq(payments.courseId, filters.courseId));
    if (filters.userId) conditions.push(eq(payments.userId, filters.userId));
    if (filters.from) conditions.push(gte(payments.createdAt, `${filters.from}T00:00:00.000Z`));
    if (filters.to) conditions.push(lt(payments.createdAt, addOneDay(filters.to)));

    const search = filters.search?.trim();

    if (search) {
      const pattern = `%${escapeLikePattern(search)}%`;
      const searchCondition = or(
        ilike(users.email, pattern),
        ilike(users.firstName, pattern),
        ilike(users.lastName, pattern),
        sql`(${users.firstName} || ' ' || ${users.lastName}) ILIKE ${pattern}`,
        ilike(payments.receiptEmail, pattern),
        ilike(payments.courseTitle, pattern),
        ilike(payments.providerPaymentId, pattern),
        ilike(payments.promoCode, pattern),
      );

      if (searchCondition) conditions.push(searchCondition);
    }

    return conditions.length ? and(...conditions) : undefined;
  }
}
