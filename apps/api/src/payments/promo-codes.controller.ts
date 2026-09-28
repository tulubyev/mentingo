import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { PERMISSIONS } from "@repo/shared";
import { Type } from "@sinclair/typebox";
import { Validate } from "nestjs-typebox";

import { BaseResponse, baseResponse, UUIDSchema, UUIDType } from "src/common";
import { RequirePermission } from "src/common/decorators/require-permission.decorator";
import { CurrentUser } from "src/common/decorators/user.decorator";
import { CurrentUserType } from "src/common/types/current-user.type";

import {
  createPromoCodeSchema,
  promoCodeListSchema,
  promoCodeSchema,
  updatePromoCodeSchema,
} from "./payments.schema";
import { CreatePromoCodeBody, UpdatePromoCodeBody } from "./payments.types";
import { PromoCodesService } from "./promo-codes.service";

import type { PromoCodeResponse } from "./payments.types";

/** Local promo codes for ЮKassa checkouts (Stripe keeps its own promotion codes). */
@Controller("promo-codes")
@RequirePermission(PERMISSIONS.BILLING_MANAGE)
export class PromoCodesController {
  constructor(private readonly promoCodesService: PromoCodesService) {}

  @Get()
  @Validate({ response: baseResponse(promoCodeListSchema) })
  async getPromoCodes(): Promise<BaseResponse<PromoCodeResponse[]>> {
    return new BaseResponse(await this.promoCodesService.list());
  }

  @Post()
  @Validate({
    request: [{ type: "body", schema: createPromoCodeSchema }],
    response: baseResponse(promoCodeSchema),
  })
  async createPromoCode(
    @Body() body: CreatePromoCodeBody,
    @CurrentUser() currentUser: CurrentUserType,
  ): Promise<BaseResponse<PromoCodeResponse>> {
    return new BaseResponse(await this.promoCodesService.create(body, currentUser));
  }

  @Patch(":id")
  @Validate({
    request: [
      { type: "param", name: "id", schema: UUIDSchema },
      { type: "body", schema: updatePromoCodeSchema },
    ],
    response: baseResponse(promoCodeSchema),
  })
  async updatePromoCode(
    @Param("id") id: UUIDType,
    @Body() body: UpdatePromoCodeBody,
  ): Promise<BaseResponse<PromoCodeResponse>> {
    return new BaseResponse(await this.promoCodesService.update(id, body));
  }

  @Delete(":id")
  @Validate({
    request: [{ type: "param", name: "id", schema: UUIDSchema }],
    response: baseResponse(Type.Object({ deleted: Type.Boolean() })),
  })
  async deletePromoCode(@Param("id") id: UUIDType) {
    await this.promoCodesService.remove(id);

    return new BaseResponse({ deleted: true });
  }
}
