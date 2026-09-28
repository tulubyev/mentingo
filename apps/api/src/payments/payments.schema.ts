import { PAYMENT_PROVIDERS, PAYMENT_STATUSES, PROMO_CODE_DISCOUNT_TYPES } from "@repo/shared";
import { Type, type TSchema } from "@sinclair/typebox";

import { UUIDSchema } from "src/common";

const nullable = <T extends TSchema>(schema: T) => Type.Union([schema, Type.Null()]);

export const paymentStatusSchema = Type.Union(
  Object.values(PAYMENT_STATUSES).map((status) => Type.Literal(status)),
);

export const paymentProviderSchema = Type.Union(
  Object.values(PAYMENT_PROVIDERS).map((provider) => Type.Literal(provider)),
);

export const promoCodeDiscountTypeSchema = Type.Union(
  Object.values(PROMO_CODE_DISCOUNT_TYPES).map((type) => Type.Literal(type)),
);

export const paymentsConfigSchema = Type.Object({
  provider: nullable(paymentProviderSchema),
  currency: nullable(Type.String()),
});

export const checkoutBodySchema = Type.Object({
  courseId: UUIDSchema,
  promoCode: Type.Optional(Type.String({ maxLength: 64 })),
});

export const priceQuoteSchema = Type.Object({
  originalAmount: Type.Integer(),
  discountAmount: Type.Integer(),
  amount: Type.Integer(),
  currency: Type.String(),
  promoCode: nullable(Type.String()),
});

export const checkoutResponseSchema = Type.Object({
  paymentId: UUIDSchema,
  confirmationUrl: Type.String(),
});

export const paymentStatusResponseSchema = Type.Object({
  id: UUIDSchema,
  status: paymentStatusSchema,
  courseId: nullable(UUIDSchema),
  amount: Type.Integer(),
  currency: Type.String(),
});

export const adminPaymentSchema = Type.Object({
  id: UUIDSchema,
  createdAt: Type.String(),
  paidAt: nullable(Type.String()),
  canceledAt: nullable(Type.String()),
  refundedAt: nullable(Type.String()),
  status: paymentStatusSchema,
  provider: paymentProviderSchema,
  providerPaymentId: nullable(Type.String()),
  amount: Type.Integer(),
  originalAmount: Type.Integer(),
  discountAmount: Type.Integer(),
  refundedAmount: Type.Integer(),
  currency: Type.String(),
  promoCode: nullable(Type.String()),
  courseId: nullable(UUIDSchema),
  courseTitle: Type.String(),
  userId: nullable(UUIDSchema),
  userFirstName: nullable(Type.String()),
  userLastName: nullable(Type.String()),
  userEmail: nullable(Type.String()),
});

export const adminPaymentListSchema = Type.Array(adminPaymentSchema);

export const paymentsSummarySchema = Type.Object({
  count: Type.Integer(),
  succeededCount: Type.Integer(),
  totalAmount: Type.Integer(),
  refundedAmount: Type.Integer(),
  netAmount: Type.Integer(),
  currency: nullable(Type.String()),
});

export const paymentsFilterQuerySchemas = [
  { type: "query" as const, name: "status", schema: Type.Optional(paymentStatusSchema) },
  { type: "query" as const, name: "courseId", schema: Type.Optional(UUIDSchema) },
  { type: "query" as const, name: "userId", schema: Type.Optional(UUIDSchema) },
  {
    type: "query" as const,
    name: "search",
    schema: Type.Optional(Type.String({ maxLength: 200 })),
  },
  { type: "query" as const, name: "from", schema: Type.Optional(Type.String({ format: "date" })) },
  { type: "query" as const, name: "to", schema: Type.Optional(Type.String({ format: "date" })) },
];

export const promoCodeSchema = Type.Object({
  id: UUIDSchema,
  code: Type.String(),
  discountType: promoCodeDiscountTypeSchema,
  discountValue: Type.Integer(),
  courseId: nullable(UUIDSchema),
  courseTitle: nullable(Type.String()),
  validFrom: nullable(Type.String()),
  validTo: nullable(Type.String()),
  maxActivations: nullable(Type.Integer()),
  activationsCount: Type.Integer(),
  isActive: Type.Boolean(),
  createdAt: Type.String(),
});

export const promoCodeListSchema = Type.Array(promoCodeSchema);

const promoCodeWritableFields = {
  code: Type.String({ minLength: 3, maxLength: 64 }),
  discountType: promoCodeDiscountTypeSchema,
  discountValue: Type.Integer({ minimum: 1 }),
  courseId: nullable(UUIDSchema),
  validFrom: nullable(Type.String({ format: "date-time" })),
  validTo: nullable(Type.String({ format: "date-time" })),
  maxActivations: nullable(Type.Integer({ minimum: 1 })),
  isActive: Type.Boolean(),
};

export const createPromoCodeSchema = Type.Object({
  code: promoCodeWritableFields.code,
  discountType: promoCodeWritableFields.discountType,
  discountValue: promoCodeWritableFields.discountValue,
  courseId: Type.Optional(promoCodeWritableFields.courseId),
  validFrom: Type.Optional(promoCodeWritableFields.validFrom),
  validTo: Type.Optional(promoCodeWritableFields.validTo),
  maxActivations: Type.Optional(promoCodeWritableFields.maxActivations),
  isActive: Type.Optional(promoCodeWritableFields.isActive),
});

export const updatePromoCodeSchema = Type.Partial(Type.Object(promoCodeWritableFields));

export const webhookAckSchema = Type.Object({ received: Type.Boolean() });
