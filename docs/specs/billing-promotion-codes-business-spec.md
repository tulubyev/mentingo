# Billing and Promotion Codes Business Spec

## Business Overview

Billing and promotion codes let Mentingo support paid course access through one of two payment providers: Stripe or ЮKassa (YooKassa, for Russian schools charging in RUB). The feature connects course pricing, learner checkout, discount administration, and a payments registry so commercial training programs can sell selected courses without moving payment handling outside the platform.

For HR, L&D, and training providers, the main business purpose is controlled monetization: course managers can mark a course as free or paid, billing managers can prepare discounts for campaigns, and learners can pay from the course flow.

## Who Uses It

- Learners or customers buying access to paid courses.
- Course administrators setting whether a course is free or paid.
- Billing managers creating, reviewing, and updating promotion codes.
- Commercial L&D teams running limited discounts for Stripe-connected courses.
- School administrators and accountants reconciling ЮKassa payments and issuing refunds.

## Feature Functions

- Set a course as free or paid from the course pricing tab when pricing is enabled.
- Store paid-course prices in the selected course currency.
- Start a Stripe checkout flow for a paid course.
- Accept promotion codes during checkout when Stripe configuration allows it.
- List promotion codes with discount, status, redemption, and expiry information.
- Create fixed-amount or percentage promotion codes.
- Limit promotion codes by assigned Stripe-connected courses.
- Configure promotion-code maximum redemptions and expiration dates.
- Review and update existing promotion-code details.
- With ЮKassa: price courses in RUB, redirect learners to the ЮKassa payment page, and enroll them automatically once ЮKassa confirms the payment.
- With ЮKassa: apply local promo codes (percent or fixed RUB amount, optional course, validity window, activation limit, active flag) with the final price computed on the server.
- With ЮKassa: send 54-ФЗ fiscal receipt data (one "service" item, configurable VAT code and tax system) with the payment and with its refund.
- With ЮKassa: review all payments in an admin registry filtered by date, course, status, and user, see totals, export CSV, and issue a full refund.
- Email the learner a payment confirmation in their language.

## End-User Value

Learners get a familiar checkout path for paid training. Administrators can keep pricing decisions attached to the course record, while billing managers can run targeted discounts without manual enrollment work or one-off invoicing.

The feature also keeps unpaid tenants out of billing complexity: pricing and checkout surfaces depend on a configured payment provider (Stripe or ЮKassa), so organizations that do not sell paid courses are not asked to maintain payment settings. While a provider is configured, learners cannot self-enroll into a paid course without paying.

## How It Works

Course pricing is managed from the admin course edit workflow. When Stripe is available, the pricing tab lets an administrator switch between free and paid access and save the course price. During purchase, the web app requests a Stripe checkout session or payment setup from the API and renders Stripe payment UI in the learner flow.

Promotion-code management lives in the admin billing area. Billing managers create codes, choose percent or fixed discounts, select eligible Stripe-connected courses, and set redemption or date limits. Codes are then managed through list and detail screens.

The API owns the Stripe boundary. Checkout operations require billing checkout permission, promotion-code operations require billing management permission, and webhook handling validates Stripe-signed requests before applying payment-success behavior.

ЮKassa runs in parallel and takes precedence when its shop credentials are configured (one shop per deployment). The learner clicks "Buy", optionally applies a promo code, and is redirected to ЮKassa; after paying they return to a status page that polls the payment and opens the course. The school learns about the payment from ЮKassa notifications, but the platform never trusts the notification content: it re-reads the payment from ЮKassa with the shop credentials, checks that it belongs to the expected order, amount, and currency, and only then marks it paid, counts the promo code, enrolls the learner through the regular enrollment path, and sends the confirmation email. Repeated notifications change nothing. Refunds are issued by billing managers from the registry; access is not revoked automatically.

## Key Technical Context

- Main API implementation: `apps/api/src/stripe`.
- Checkout UI: `apps/web/app/modules/stripe`.
- Promotion-code admin UI: `apps/web/app/modules/Admin/PromotionCodes`.
- Admin routes include `/admin/promotion-codes`, `/admin/promotion-codes/new`, and `/admin/promotion-codes/:id`.
- Course pricing is edited inside the admin course edit workflow.
- Access control uses `PERMISSIONS.BILLING_CHECKOUT` for checkout/payment operations and `PERMISSIONS.BILLING_MANAGE` for promotion-code administration.
- ЮKassa implementation: `apps/api/src/payments` (tables `payments` and `promo_codes`, tenant-scoped with RLS), web modules `apps/web/app/modules/Payments`, `apps/web/app/modules/Admin/Payments`, `apps/web/app/modules/Admin/PromoCodes`; routes `/payment/return` and `/admin/payments`; the ЮKassa promo codes reuse `/admin/promotion-codes`.
- ЮKassa configuration is API environment only (`YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY`, receipt and webhook settings); `GET /api/payments/config` tells the web app which provider is active. Setup guide: `docs/fork/YOOKASSA.md`.

## Test Evidence

- Web E2E coverage verifies that an admin can switch a course between paid and free pricing when pricing is enabled.
- Source evidence covers embedded checkout creation, payment intent creation, Stripe webhook validation, promotion-code list/create/update endpoints, and billing permission gates.
- I did not find dedicated backend E2E coverage for the Stripe controller or promotion-code endpoints in the current API test tree.
- ЮKassa: API E2E (`apps/api/src/payments/__tests__/payments.e2e-spec.ts`, with RLS enforced and a mocked ЮKassa HTTP layer) covers checkout with a promo code and 54-ФЗ receipt, rejection of forged notifications, idempotent confirmation, enrollment, confirmation email, status polling, admin registry/summary/CSV, refunds, promo-code validation, and blocked self-enrollment into paid courses. Unit tests cover the ЮKassa client, amounts, price/promo calculation, IP allowlist, receipt, CSV, and notification verification; web unit tests cover the checkout button, promo-code form, navigation, and translations.
