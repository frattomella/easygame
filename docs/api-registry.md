# EasyGame API Registry

Fonte ufficiale da mantenere aggiornata:

- `src/lib/api/registry.ts`

## Convenzioni

- Base path: `/api/v1`
- Auth: `/api/v1/auth/*`
- Risorse applicative: `/api/v1/<resource>`
- Dettaglio risorsa: `/api/v1/<resource>/:id`

## Endpoint auth

- `GET /api/v1/registry`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/session`
- `GET|PATCH /api/v1/auth/user`
- `GET /api/v1/auth/memberships`
- `GET /api/v1/auth/providers`
- `POST /api/v1/auth/verify/email/send`
- `POST /api/v1/auth/verify/email/confirm`
- `POST /api/v1/auth/verify/phone/send`
- `POST /api/v1/auth/verify/phone/confirm`
- `GET /api/v1/auth/oauth/:provider/start`
- `GET /api/v1/auth/oauth/:provider/callback`
- `POST /api/v1/auth/password/forgot`
- `POST /api/v1/auth/password/reset`

## Endpoint amministrazione piattaforma

Riservati a `platform_admin` (`requirePlatformAdmin`). Non fanno parte della
superficie mobile.

- `GET /api/v1/admin/overview`
- `DELETE /api/v1/admin/clubs/:id`
- `DELETE /api/v1/admin/users/:id`
- `GET|PUT /api/v1/admin/email` — provider SMTP
- `POST /api/v1/admin/email/test`
- `GET|PUT /api/v1/admin/imap` — casella IMAP, credenziali separate da SMTP
- `POST /api/v1/admin/imap/test`

## Flusso auth applicativo

- Login password classico
- Registrazione con verifica email
- Registrazione con verifica cellulare
- OAuth web con Google e Microsoft
- Redirect finale su `/auth/complete`

## Risorse principali

- `users`
- `clubs`
- `organizations`
- `dashboards`
- `organization_users`
- `athletes`
- `simplified_athletes`
- `medical_certificates`
- `simplified_certificates`
- `payments`
- `simplified_payments`
- `payment_methods`
- `invoices`
- `receipts`
- `trainer_payments`
- `notifications`
- `simplified_notifications`
- `training_attendance`
- `assets`

## Risorse club aggregate

- `appointments`
- `bank_accounts`
- `categories`
- `clothing_inventory`
- `clothing_kits`
- `clothing_products`
- `discounts`
- `document_templates`
- `expected_expenses`
- `expected_income`
- `jersey_assignments`
- `jersey_groups`
- `kit_assignments`
- `matches`
- `members`
- `opening_hours`
- `payment_plans`
- `procure`
- `secretariat_notes`
- `sponsor_payments`
- `sponsors`
- `staff_members`
- `trainers`
- `trainings`
- `transactions`
- `transfers`
- `weekly_schedule`

## CRUD standard

Per ogni risorsa sopra:

- `GET /api/v1/<resource>`
- `POST /api/v1/<resource>`
- `GET /api/v1/<resource>/:id`
- `PATCH /api/v1/<resource>/:id`
- `DELETE /api/v1/<resource>/:id`
