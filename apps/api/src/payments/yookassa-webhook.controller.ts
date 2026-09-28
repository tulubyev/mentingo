import { Body, Controller, HttpCode, Post, Req } from "@nestjs/common";
import { Request } from "express";
import { Validate } from "nestjs-typebox";

import { BaseResponse, baseResponse } from "src/common";
import { Public } from "src/common/decorators/public.decorator";

import { webhookAckSchema } from "./payments.schema";
import { getWebhookClientIp } from "./yookassa/yookassa-ip";
import { YooKassaWebhookService } from "./yookassa-webhook.service";

/**
 * Public endpoint for ЮKassa HTTP notifications:
 * https://lms.wiki/api/payments/yookassa/webhook (payment.succeeded, payment.canceled,
 * refund.succeeded). Nothing from the body is trusted; see YooKassaWebhookService.
 */
@Public()
@Controller("payments/yookassa")
export class YooKassaWebhookController {
  constructor(private readonly yooKassaWebhookService: YooKassaWebhookService) {}

  @Post("webhook")
  @HttpCode(200)
  @Validate({ response: baseResponse(webhookAckSchema) })
  async handleWebhook(@Body() body: unknown, @Req() request: Request) {
    await this.yooKassaWebhookService.handleNotification(body, getWebhookClientIp(request));

    return new BaseResponse({ received: true });
  }
}
