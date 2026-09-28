import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, ne, sql } from "drizzle-orm";

import { DatabasePg } from "src/common";
import { LocalizationService } from "src/localization/localization.service";
import { DB } from "src/storage/db/db.providers";
import { courses, promoCodes } from "src/storage/schema";

import type { PromoCodeResponse } from "./payments.types";

type NewPromoCode = typeof promoCodes.$inferInsert;
type PromoCodeUpdate = Partial<Omit<NewPromoCode, "id" | "tenantId" | "activationsCount">>;

@Injectable()
export class PromoCodesRepository {
  constructor(
    @Inject(DB) private readonly db: DatabasePg,
    private readonly localizationService: LocalizationService,
  ) {}

  async list(): Promise<PromoCodeResponse[]> {
    return this.db
      .select(this.selection())
      .from(promoCodes)
      .leftJoin(courses, eq(courses.id, promoCodes.courseId))
      .orderBy(desc(promoCodes.createdAt));
  }

  async findById(id: string): Promise<PromoCodeResponse | undefined> {
    const [promo] = await this.db
      .select(this.selection())
      .from(promoCodes)
      .leftJoin(courses, eq(courses.id, promoCodes.courseId))
      .where(eq(promoCodes.id, id))
      .limit(1);

    return promo;
  }

  async existsWithCode(code: string, excludeId?: string) {
    const [promo] = await this.db
      .select({ id: promoCodes.id })
      .from(promoCodes)
      .where(and(eq(promoCodes.code, code), excludeId ? ne(promoCodes.id, excludeId) : undefined))
      .limit(1);

    return Boolean(promo);
  }

  async courseExists(courseId: string) {
    const [course] = await this.db
      .select({ id: courses.id })
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);

    return Boolean(course);
  }

  async insert(values: NewPromoCode) {
    const [promo] = await this.db
      .insert(promoCodes)
      .values(values)
      .returning({ id: promoCodes.id });

    return promo;
  }

  async update(id: string, values: PromoCodeUpdate) {
    const [promo] = await this.db
      .update(promoCodes)
      .set(values)
      .where(eq(promoCodes.id, id))
      .returning({ id: promoCodes.id });

    return promo;
  }

  async delete(id: string) {
    const [promo] = await this.db
      .delete(promoCodes)
      .where(eq(promoCodes.id, id))
      .returning({ id: promoCodes.id });

    return promo;
  }

  private selection() {
    return {
      id: promoCodes.id,
      code: promoCodes.code,
      discountType: promoCodes.discountType,
      discountValue: promoCodes.discountValue,
      courseId: promoCodes.courseId,
      courseTitle: sql<string | null>`NULLIF(${this.localizationService.getLocalizedSqlField(
        courses.title,
      )}, '')`,
      validFrom: promoCodes.validFrom,
      validTo: promoCodes.validTo,
      maxActivations: promoCodes.maxActivations,
      activationsCount: promoCodes.activationsCount,
      isActive: promoCodes.isActive,
      createdAt: promoCodes.createdAt,
    };
  }
}
