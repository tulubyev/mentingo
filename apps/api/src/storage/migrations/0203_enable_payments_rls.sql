-- Custom SQL migration file, put you code below! --
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "promo_codes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "payments_tenant_isolation" ON "payments";
--> statement-breakpoint
DROP POLICY IF EXISTS "promo_codes_tenant_isolation" ON "promo_codes";
--> statement-breakpoint
CREATE POLICY "payments_tenant_isolation"
  ON "payments"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
CREATE POLICY "promo_codes_tenant_isolation"
  ON "promo_codes"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "promo_codes"
    ADD CONSTRAINT "promo_codes_discount_value_check"
    CHECK ("discount_value" > 0 AND ("discount_type" <> 'percent' OR "discount_value" <= 100));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "promo_codes"
    ADD CONSTRAINT "promo_codes_max_activations_check"
    CHECK ("max_activations" IS NULL OR "max_activations" > 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "payments"
    ADD CONSTRAINT "payments_amounts_check"
    CHECK (
      "amount" >= 0
      AND "original_amount" >= 0
      AND "discount_amount" >= 0
      AND "refunded_amount" >= 0
      AND "refunded_amount" <= "amount"
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
