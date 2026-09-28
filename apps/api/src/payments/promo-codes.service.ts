import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PROMO_CODE_DISCOUNT_TYPES } from "@repo/shared";

import { isValidPromoCodeFormat, normalizePromoCode } from "./payment-pricing";
import { PAYMENT_ERRORS } from "./payments.constants";
import { PromoCodesRepository } from "./promo-codes.repository";

import type { CreatePromoCodeBody, PromoCodeResponse, UpdatePromoCodeBody } from "./payments.types";
import type { PromoCodeDiscountType } from "@repo/shared";
import type { CurrentUserType } from "src/common/types/current-user.type";

const MAX_FIXED_DISCOUNT = 100_000_000; // 1 000 000 RUB in kopecks

@Injectable()
export class PromoCodesService {
  constructor(private readonly promoCodesRepository: PromoCodesRepository) {}

  list(): Promise<PromoCodeResponse[]> {
    return this.promoCodesRepository.list();
  }

  async create(body: CreatePromoCodeBody, currentUser: CurrentUserType) {
    const code = this.validateCode(body.code);

    this.validateDiscount(body.discountType, body.discountValue);
    this.validateDates(body.validFrom ?? null, body.validTo ?? null);
    await this.validateCourse(body.courseId ?? null);

    if (await this.promoCodesRepository.existsWithCode(code)) {
      throw new ConflictException(PAYMENT_ERRORS.PROMO_CODE_DUPLICATE);
    }

    const created = await this.promoCodesRepository.insert({
      code,
      discountType: body.discountType,
      discountValue: body.discountValue,
      courseId: body.courseId ?? null,
      validFrom: body.validFrom ?? null,
      validTo: body.validTo ?? null,
      maxActivations: body.maxActivations ?? null,
      isActive: body.isActive ?? true,
      createdBy: currentUser.userId,
    });

    return this.getOrThrow(created.id);
  }

  async update(id: string, body: UpdatePromoCodeBody) {
    const existing = await this.getOrThrow(id);

    const code = body.code !== undefined ? this.validateCode(body.code) : undefined;
    const discountType = body.discountType ?? existing.discountType;
    const discountValue = body.discountValue ?? existing.discountValue;

    this.validateDiscount(discountType, discountValue);
    this.validateDates(
      body.validFrom !== undefined ? body.validFrom : existing.validFrom,
      body.validTo !== undefined ? body.validTo : existing.validTo,
    );

    if (body.courseId !== undefined) await this.validateCourse(body.courseId);

    if (code && (await this.promoCodesRepository.existsWithCode(code, id))) {
      throw new ConflictException(PAYMENT_ERRORS.PROMO_CODE_DUPLICATE);
    }

    await this.promoCodesRepository.update(id, {
      ...(code !== undefined && { code }),
      ...(body.discountType !== undefined && { discountType: body.discountType }),
      ...(body.discountValue !== undefined && { discountValue: body.discountValue }),
      ...(body.courseId !== undefined && { courseId: body.courseId }),
      ...(body.validFrom !== undefined && { validFrom: body.validFrom }),
      ...(body.validTo !== undefined && { validTo: body.validTo }),
      ...(body.maxActivations !== undefined && { maxActivations: body.maxActivations }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    });

    return this.getOrThrow(id);
  }

  async remove(id: string) {
    const deleted = await this.promoCodesRepository.delete(id);

    if (!deleted) throw new NotFoundException(PAYMENT_ERRORS.PROMO_CODE_NOT_FOUND);
  }

  private async getOrThrow(id: string) {
    const promo = await this.promoCodesRepository.findById(id);

    if (!promo) throw new NotFoundException(PAYMENT_ERRORS.PROMO_CODE_NOT_FOUND);

    return promo;
  }

  private validateCode(rawCode: string) {
    if (!isValidPromoCodeFormat(rawCode)) {
      throw new BadRequestException(PAYMENT_ERRORS.PROMO_CODE_INVALID_FORMAT);
    }

    return normalizePromoCode(rawCode);
  }

  private validateDiscount(type: PromoCodeDiscountType, value: number) {
    const isValid =
      Number.isInteger(value) &&
      value > 0 &&
      (type === PROMO_CODE_DISCOUNT_TYPES.PERCENT ? value <= 100 : value <= MAX_FIXED_DISCOUNT);

    if (!isValid) throw new BadRequestException(PAYMENT_ERRORS.PROMO_CODE_INVALID_VALUE);
  }

  private validateDates(validFrom: string | null, validTo: string | null) {
    if (validFrom && validTo && new Date(validFrom).getTime() > new Date(validTo).getTime()) {
      throw new BadRequestException(PAYMENT_ERRORS.PROMO_CODE_INVALID_DATES);
    }
  }

  private async validateCourse(courseId: string | null) {
    if (courseId && !(await this.promoCodesRepository.courseExists(courseId))) {
      throw new NotFoundException(PAYMENT_ERRORS.COURSE_NOT_FOUND);
    }
  }
}
