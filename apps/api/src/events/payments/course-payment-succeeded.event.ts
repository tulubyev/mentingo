import type { UUIDType } from "src/common";

type CoursePaymentSucceededData = {
  paymentId: UUIDType;
  tenantId: UUIDType;
  userId: UUIDType;
  courseId: UUIDType;
};

/** Emitted once, after a course payment was confirmed by the provider and applied. */
export class CoursePaymentSucceededEvent {
  constructor(public readonly payment: CoursePaymentSucceededData) {}
}
