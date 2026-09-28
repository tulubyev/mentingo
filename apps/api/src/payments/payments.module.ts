import { Logger, Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";

import { EmailModule } from "src/common/emails/emails.module";
import { CourseModule } from "src/courses/course.module";
import { LocalizationModule } from "src/localization/localization.module";

import { CoursePaymentSucceededHandler } from "./handlers/course-payment-succeeded.handler";
import { PaymentSyncService } from "./payment-sync.service";
import { YOOKASSA_FETCH } from "./payments.constants";
import { PaymentsController } from "./payments.controller";
import { PaymentsRepository } from "./payments.repository";
import { PaymentsService } from "./payments.service";
import { PromoCodesController } from "./promo-codes.controller";
import { PromoCodesRepository } from "./promo-codes.repository";
import { PromoCodesService } from "./promo-codes.service";
import { YooKassaClientFactory } from "./yookassa/yookassa-client.factory";
import { readYooKassaConfig } from "./yookassa/yookassa.config";
import { YooKassaWebhookController } from "./yookassa-webhook.controller";
import { YooKassaWebhookService } from "./yookassa-webhook.service";

import type { FetchLike } from "./yookassa/yookassa.types";
import type { OnModuleInit } from "@nestjs/common";

@Module({
  imports: [CqrsModule, CourseModule, EmailModule, LocalizationModule],
  controllers: [PaymentsController, YooKassaWebhookController, PromoCodesController],
  providers: [
    PaymentsRepository,
    PaymentsService,
    PaymentSyncService,
    PromoCodesRepository,
    PromoCodesService,
    YooKassaClientFactory,
    YooKassaWebhookService,
    CoursePaymentSucceededHandler,
    {
      provide: YOOKASSA_FETCH,
      useValue: ((input, init) => fetch(input, init)) satisfies FetchLike,
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule implements OnModuleInit {
  private readonly logger = new Logger(PaymentsModule.name);

  onModuleInit() {
    const config = readYooKassaConfig();

    if (!config.enabled) return;

    this.logger.log(
      `ЮKassa payments enabled (receipts: ${
        config.receiptEnabled ? "on" : "off"
      }, webhook IP check: ${config.webhookIpCheck ? "on" : "off"})`,
    );

    if (config.invalidSettings.length) {
      this.logger.warn(
        `Invalid ЮKassa settings ignored, defaults used: ${config.invalidSettings.join(", ")}`,
      );
    }
  }
}
