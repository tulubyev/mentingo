import { Inject, Logger } from "@nestjs/common";
import { EventsHandler } from "@nestjs/cqrs";
import { CoursePaymentSucceededEmail } from "@repo/email-templates";
import { match } from "ts-pattern";

import { DatabasePg } from "src/common";
import { EmailService } from "src/common/emails/emails.service";
import { getEmailSubject } from "src/common/emails/translations";
import { resolveTenantOrigin } from "src/common/helpers/resolveTenantOrigin";
import { CourseService } from "src/courses/course.service";
import { CoursePaymentSucceededEvent } from "src/events/payments/course-payment-succeeded.event";
import { DB_ADMIN } from "src/storage/db/db.providers";
import { TenantDbRunnerService } from "src/storage/db/tenant-db-runner.service";

import { PaymentsRepository } from "../payments.repository";

import type { IEventHandler } from "@nestjs/cqrs";
import type { SupportedLanguages } from "@repo/shared";

const formatAmount = (amount: number, currency: string, language: SupportedLanguages) => {
  const locale = match(language)
    .with("ru", () => "ru-RU")
    .with("pl", () => "pl-PL")
    .with("de", () => "de-DE")
    .with("lt", () => "lt-LT")
    .with("cs", () => "cs-CZ")
    .with("es", () => "es-ES")
    .with("fr", () => "fr-FR")
    .otherwise(() => "en-US");

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: amount % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount / 100);
};

/** Sends the payment confirmation e-mail in the student's language. */
@EventsHandler(CoursePaymentSucceededEvent)
export class CoursePaymentSucceededHandler implements IEventHandler<CoursePaymentSucceededEvent> {
  private readonly logger = new Logger(CoursePaymentSucceededHandler.name);

  constructor(
    @Inject(DB_ADMIN) private readonly dbAdmin: DatabasePg,
    private readonly emailService: EmailService,
    private readonly courseService: CourseService,
    private readonly paymentsRepository: PaymentsRepository,
    private readonly tenantRunner: TenantDbRunnerService,
  ) {}

  async handle(event: CoursePaymentSucceededEvent) {
    const { paymentId, tenantId, userId, courseId } = event.payment;

    try {
      const emailSettings = await this.emailService.getDefaultEmailProperties(tenantId, userId);

      const data = await this.tenantRunner.runWithTenant(tenantId, async () => {
        const payment = await this.paymentsRepository.findPaymentById(paymentId);
        const user = await this.paymentsRepository.findUser(userId);
        const courseData = await this.courseService.getCourseEmailData(
          courseId,
          emailSettings.language,
        );

        return { payment, user, courseName: courseData?.courseName || payment?.courseTitle };
      });

      if (!data.payment || !data.user || data.user.deletedAt) return;

      const origin = await resolveTenantOrigin(this.dbAdmin, tenantId);
      const courseName = data.courseName ?? "";

      const { text, html } = new CoursePaymentSucceededEmail({
        courseName,
        courseLink: `${origin}/course/${courseId}`,
        formattedAmount: formatAmount(
          data.payment.amount,
          data.payment.currency,
          emailSettings.language,
        ),
        ...emailSettings,
      });

      await this.emailService.sendEmailWithLogo(
        {
          to: data.user.email,
          subject: getEmailSubject("coursePaymentSucceededEmail", emailSettings.language, {
            courseName,
          }),
          text,
          html,
        },
        { tenantId },
      );
    } catch (error) {
      this.logger.error(
        `Failed to send payment confirmation e-mail: paymentId=${paymentId} error=${
          error instanceof Error ? error.name : "unknown"
        }`,
      );
    }
  }
}
