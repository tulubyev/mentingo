import { describe, expect, it } from "vitest";

import {
  ALL_COURSES_VALUE,
  EMPTY_PROMO_CODE_FORM,
  formValuesToPromoCodeBody,
  promoCodeFormSchema,
  promoCodeToFormValues,
} from "./promoCodeForm";

import type i18next from "i18next";

const t = ((key: string) => key) as unknown as typeof i18next.t;
const schema = promoCodeFormSchema(t);

describe("promo code form", () => {
  it("maps a percent code for all courses without limits", () => {
    const body = formValuesToPromoCodeBody({
      ...EMPTY_PROMO_CODE_FORM,
      code: " summer20 ",
      percentValue: 20,
    });

    expect(body).toEqual({
      code: "summer20",
      discountType: "percent",
      discountValue: 20,
      courseId: null,
      validFrom: null,
      validTo: null,
      maxActivations: null,
      isActive: true,
    });
  });

  it("maps a fixed discount bound to a course with dates and a limit", () => {
    const body = formValuesToPromoCodeBody({
      ...EMPTY_PROMO_CODE_FORM,
      code: "MINUS500",
      discountType: "fixed",
      fixedValue: 50000,
      courseId: "course-1",
      validFrom: "2026-10-01",
      validTo: "2026-10-31",
      maxActivations: "10",
    });

    expect(body).toMatchObject({
      discountType: "fixed",
      discountValue: 50000,
      courseId: "course-1",
      maxActivations: 10,
    });
    expect(new Date(body.validFrom!).getTime()).toBe(new Date("2026-10-01T00:00:00").getTime());
    expect(new Date(body.validTo!).getTime()).toBe(new Date("2026-10-31T23:59:59.999").getTime());
  });

  it("round-trips an existing promo code", () => {
    const values = promoCodeToFormValues({
      id: "p1",
      code: "SUMMER20",
      discountType: "percent",
      discountValue: 20,
      courseId: null,
      courseTitle: null,
      validFrom: null,
      validTo: null,
      maxActivations: 5,
      activationsCount: 1,
      isActive: false,
      createdAt: "2026-09-28T00:00:00.000Z",
    });

    expect(values).toMatchObject({
      code: "SUMMER20",
      percentValue: 20,
      courseId: ALL_COURSES_VALUE,
      maxActivations: "5",
      isActive: false,
    });
  });

  it.each([
    [{ code: "ab", percentValue: 10 }, "code"],
    [{ code: "BAD CODE", percentValue: 10 }, "code"],
    [{ code: "SUMMER", percentValue: 0 }, "percentValue"],
    [{ code: "SUMMER", percentValue: 101 }, "percentValue"],
    [{ code: "SUMMER", discountType: "fixed" as const }, "fixedValue"],
    [{ code: "SUMMER", percentValue: 5, maxActivations: "0" }, "maxActivations"],
    [
      { code: "SUMMER", percentValue: 5, validFrom: "2026-10-02", validTo: "2026-10-01" },
      "validTo",
    ],
  ])("rejects %p", (overrides, field) => {
    const result = schema.safeParse({ ...EMPTY_PROMO_CODE_FORM, ...overrides });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path[0])).toContain(field);
  });

  it("accepts Cyrillic codes", () => {
    expect(
      schema.safeParse({ ...EMPTY_PROMO_CODE_FORM, code: "ЛЕТО-2026", percentValue: 15 }).success,
    ).toBe(true);
  });
});
