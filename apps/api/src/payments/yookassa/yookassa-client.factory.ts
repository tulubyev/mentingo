import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";

import { PAYMENT_ERRORS, YOOKASSA_FETCH } from "../payments.constants";

import { YooKassaClient } from "./yookassa.client";
import { readYooKassaConfig } from "./yookassa.config";
import { FetchLike } from "./yookassa.types";

import type { YooKassaConfig } from "./yookassa.types";

@Injectable()
export class YooKassaClientFactory {
  constructor(@Inject(YOOKASSA_FETCH) private readonly fetchImpl: FetchLike) {}

  getConfig(): YooKassaConfig {
    return readYooKassaConfig();
  }

  /** Returns the config of an enabled shop or throws "not configured". */
  getEnabledConfig(): YooKassaConfig {
    const config = this.getConfig();

    if (!config.enabled) throw new ServiceUnavailableException(PAYMENT_ERRORS.NOT_CONFIGURED);

    return config;
  }

  create(config: YooKassaConfig = this.getEnabledConfig()) {
    return new YooKassaClient(
      { shopId: config.shopId, secretKey: config.secretKey, apiUrl: config.apiUrl },
      this.fetchImpl,
    );
  }
}
