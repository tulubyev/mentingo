import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { PERMISSIONS, PaymentStatus } from "@repo/shared";
import { Type } from "@sinclair/typebox";
import { Response } from "express";
import { Validate } from "nestjs-typebox";

import {
  BaseResponse,
  baseResponse,
  PaginatedResponse,
  paginatedResponse,
  UUIDSchema,
  UUIDType,
} from "src/common";
import { Public } from "src/common/decorators/public.decorator";
import { RequirePermission } from "src/common/decorators/require-permission.decorator";
import { CurrentUser } from "src/common/decorators/user.decorator";
import { DisallowInSupportModeGuard } from "src/common/guards/disallow-support-mode.guard";
import { CurrentUserType } from "src/common/types/current-user.type";

import {
  adminPaymentListSchema,
  adminPaymentSchema,
  checkoutBodySchema,
  checkoutResponseSchema,
  paymentsConfigSchema,
  paymentsFilterQuerySchemas,
  paymentStatusResponseSchema,
  paymentsSummarySchema,
  priceQuoteSchema,
} from "./payments.schema";
import { PaymentsService } from "./payments.service";
import { CheckoutBody } from "./payments.types";

import type {
  AdminPayment,
  CheckoutResponse,
  PaymentsConfigResponse,
  PaymentsFilters,
  PaymentStatusResponse,
  PaymentsSummary,
  PriceQuote,
} from "./payments.types";

@Controller("payments")
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Public()
  @Get("config")
  @Validate({ response: baseResponse(paymentsConfigSchema) })
  async getPaymentsConfig(): Promise<BaseResponse<PaymentsConfigResponse>> {
    return new BaseResponse(await this.paymentsService.getConfig());
  }

  @Post("yookassa/quote")
  @HttpCode(200)
  @RequirePermission(PERMISSIONS.BILLING_CHECKOUT)
  @Validate({
    request: [{ type: "body", schema: checkoutBodySchema }],
    response: baseResponse(priceQuoteSchema),
  })
  async getYooKassaQuote(
    @Body() body: CheckoutBody,
    @CurrentUser() currentUser: CurrentUserType,
  ): Promise<BaseResponse<PriceQuote>> {
    return new BaseResponse(await this.paymentsService.getQuote(body, currentUser));
  }

  @Post("yookassa/checkout")
  @UseGuards(DisallowInSupportModeGuard)
  @RequirePermission(PERMISSIONS.BILLING_CHECKOUT)
  @Validate({
    request: [{ type: "body", schema: checkoutBodySchema }],
    response: baseResponse(checkoutResponseSchema),
  })
  async createYooKassaCheckout(
    @Body() body: CheckoutBody,
    @CurrentUser() currentUser: CurrentUserType,
  ): Promise<BaseResponse<CheckoutResponse>> {
    return new BaseResponse(await this.paymentsService.createYooKassaCheckout(body, currentUser));
  }

  @Get(":id/status")
  @Validate({
    request: [{ type: "param", name: "id", schema: UUIDSchema }],
    response: baseResponse(paymentStatusResponseSchema),
  })
  async getPaymentStatus(
    @Param("id") id: UUIDType,
    @CurrentUser() currentUser: CurrentUserType,
  ): Promise<BaseResponse<PaymentStatusResponse>> {
    return new BaseResponse(await this.paymentsService.getPaymentStatus(id, currentUser));
  }

  @Get()
  @RequirePermission(PERMISSIONS.BILLING_MANAGE)
  @Validate({
    request: [
      { type: "query", name: "page", schema: Type.Optional(Type.Number({ minimum: 1 })) },
      { type: "query", name: "perPage", schema: Type.Optional(Type.Number({ minimum: 1 })) },
      ...paymentsFilterQuerySchemas,
    ],
    response: paginatedResponse(adminPaymentListSchema),
  })
  async getPayments(
    @Query("page") page?: number,
    @Query("perPage") perPage?: number,
    @Query("status") status?: PaymentStatus,
    @Query("courseId") courseId?: UUIDType,
    @Query("userId") userId?: UUIDType,
    @Query("search") search?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ): Promise<PaginatedResponse<AdminPayment[]>> {
    return new PaginatedResponse(
      await this.paymentsService.listPayments({
        page,
        perPage,
        status,
        courseId,
        userId,
        search,
        from,
        to,
      }),
    );
  }

  @Get("summary")
  @RequirePermission(PERMISSIONS.BILLING_MANAGE)
  @Validate({
    request: paymentsFilterQuerySchemas,
    response: baseResponse(paymentsSummarySchema),
  })
  async getPaymentsSummary(
    @Query("status") status?: PaymentStatus,
    @Query("courseId") courseId?: UUIDType,
    @Query("userId") userId?: UUIDType,
    @Query("search") search?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ): Promise<BaseResponse<PaymentsSummary>> {
    const filters: PaymentsFilters = { status, courseId, userId, search, from, to };

    return new BaseResponse(await this.paymentsService.getSummary(filters));
  }

  @Get("export")
  @RequirePermission(PERMISSIONS.BILLING_MANAGE)
  @Validate({ request: paymentsFilterQuerySchemas })
  async exportPayments(
    @Query("status") status: PaymentStatus | undefined,
    @Query("courseId") courseId: UUIDType | undefined,
    @Query("userId") userId: UUIDType | undefined,
    @Query("search") search: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const csv = await this.paymentsService.exportPaymentsCsv({
      status,
      courseId,
      userId,
      search,
      from,
      to,
    });

    const filename = `payments-${new Date().toISOString().split("T")[0]}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  }

  @Post(":id/refund")
  @HttpCode(200)
  @UseGuards(DisallowInSupportModeGuard)
  @RequirePermission(PERMISSIONS.BILLING_MANAGE)
  @Validate({
    request: [{ type: "param", name: "id", schema: UUIDSchema }],
    response: baseResponse(adminPaymentSchema),
  })
  async refundPayment(@Param("id") id: UUIDType): Promise<BaseResponse<AdminPayment>> {
    return new BaseResponse(await this.paymentsService.refundPayment(id));
  }
}
