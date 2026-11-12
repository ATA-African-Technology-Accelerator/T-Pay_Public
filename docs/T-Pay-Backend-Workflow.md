---
title: T-Pay
subtitle: Backend Workflow
tagline: Build trusted settlement behind the agreed activities
version: 1.1
date: 10 November 2026
author: T-Pay engineering
status: Binding for backend work. Derived from PRD v1.1 and the API contract.
compact: true
---

## 1. Our job

We own `backend/`, `shared/`, and the API contract's server side. The backend is the only place that holds PayPal and AI secrets, issues certificates, captures funds, and declares a voucher settled. The [API contract](T-Pay-API-Contract.md) lists every activity and endpoint, and the [frontend workflow](T-Pay-Frontend-Workflow.md) shows how each one is used.

| We own | The frontend engineer owns |
| :--- | :--- |
| Payment rules and ports in `shared/` | Android adapters that implement those ports |
| API, authentication and validation | Calling the API from the listed activities |
| PayPal, webhooks, settlement and Payouts | PayPal approval screen and deep link return |
| Postgres, ledger and reconciliation | SQLite and offline records on the phone |
| Gemini and proposal validation | Voice capture, confirmation and playback |

**Out of scope:** new endpoints without a contract change, live PayPal mode, KYC, bank APIs, and budgeting or transit APIs before submission.

## 2. Stack

| Need | Use |
| :--- | :--- |
| Runtime | Node, TypeScript in strict mode, Express |
| Database | Render Postgres, accessed through repositories |
| Validation | Zod schemas in `backend/src/validation/`, typed against `shared/src/contracts/` |
| PayPal | REST: Orders v2, Payments v2, Webhooks, Payouts |
| AI | Gemini through `@google/genai`, behind `IAssistantModel` |
| Crypto | Node `crypto` for ECDSA P-256 behind the shared `ISigner` port; a small dependency-free JCS function in `shared/` with fixtures |
| Tests | Vitest, fast-check and Postman |
| Hosting | Render |

## 3. Folder structure

```text
shared/src/
  contracts/               request, response, error and status types
  domain/                  money, vault, voucher, certificate rules
  application/
    ports/                 interfaces implemented by app and backend
    use-cases/             rules that both sides run

backend/src/
  routes/                  URL to controller mapping
  controllers/             HTTP input and output only
  middleware/              authentication, idempotency, errors
  validation/              Zod request and model-response schemas
  services/                backend-only use cases
  adapters/
    paypal/                PayPal REST client and mapper
    persistence/           Postgres repositories
    ai/                    Gemini adapter
    crypto/                signing and verification adapter
  jobs/                    release and retry jobs
  composition/             creates adapters and services
  server.ts
```

Existing `shared/src/escrow`, `shared/src/shared`, `shared/src/resource-tracking` and `shared/src/hybrid-assistant` code migrates as each ticket touches it. Browser adapters leave `shared/` in BE-03.

## 4. Clean code and SOLID rules

| Principle | What it means here |
| :--- | :--- |
| Single responsibility | A controller handles HTTP, a service runs one use case, a repository persists one aggregate, and an adapter talks to one system. |
| Open and closed | New webhook events map to handlers without rewriting the dispatcher. |
| Liskov substitution | A fake gateway and the PayPal adapter return the same failure classes. |
| Interface segregation | Split PayPal into focused ports such as `IPaymentAuthorizer`, `ICaptureGateway` and `IPayoutGateway`. |
| Dependency inversion | Services depend on ports. Only `src/composition/` creates concrete classes. |

| Clean code rule | Standard |
| :--- | :--- |
| Business rules | Never in controllers, routes or SQL strings. |
| `shared/` purity | No third-party dependency, framework, database, network or secret code. |
| Time and randomness | Always through `IClock` and `IRandom`. |
| Money | Integer minor units only. Convert only through the shared function. |
| Errors | Domain results map to contract error codes in one place. |
| Secrets | Environment variables only. Never in logs or responses. |
| Idempotency | Every mutating path is safe to retry. |
| Logs | Structured, with a correlation ID. No keys, tokens or personal data. |
| Tests | Write the failing test first for each money or security rule. |
| Comments | Explain why, not what. Delete unused code. |

## 5. Endpoint delivery map

The backend is complete for an activity only when the listed endpoint passes its tests and the frontend can use it.

| Endpoint | Activity | Controller | Service | PRD | Ticket |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST /devices/register` | ACT-02, ACT-01 renewal | `DeviceController.register` | `RegisterDevice` | FR-02, FR-36 | BE-05 |
| `POST /vaults` | ACT-04 | `VaultController.create` | `CreateVaultOrder` | FR-06 | BE-06 |
| `GET /paypal/return` | ACT-05 callback | `PayPalReturnController.handle` | None | FR-43 | BE-06 |
| `POST /vaults/{id}/authorize` | ACT-05 | `VaultController.authorize` | `AuthorizeVault` | FR-06, FR-37 | BE-06 |
| `GET /vaults/current` | ACT-03 | `VaultController.current` | `GetCurrentVault` | FR-08 | BE-06 |
| `POST /vouchers` | ACT-10 | `VoucherController.submit` | `SubmitVoucher` | FR-14, FR-18 | BE-08 |
| `GET /vouchers` | ACT-10 | `VoucherController.list` | `ListVouchers` | FR-22, FR-23 | BE-08 |
| `GET /vouchers/{id}` | ACT-11 | `VoucherController.get` | `GetVoucher` | FR-20 | BE-08 |
| `POST /vaults/{id}/melt` | ACT-12 | `VaultController.melt` | `MeltVault` | FR-09 | BE-07 |
| `GET /wallet` | ACT-13 | `WalletController.get` | `GetActiveWallet` | FR-40 | BE-09 |
| `POST /wallet/withdrawals` | ACT-14 | `WalletController.withdraw` | `WithdrawToPayPal` | FR-41 | BE-10 |
| `POST /assistant/interpret` | ACT-15 | `AssistantController.interpret` | `InterpretRequest` | FR-32, FR-46 | BE-11 |
| `POST /webhooks/paypal` | PayPal | `PayPalWebhookController.handle` | `ApplyPayPalEvent` | FR-21 | BE-08 |
| `GET /health` | Operators | `HealthController.check` | `CheckHealth` | NFR-10 | BE-01 |
| `GET /profile` | ACT-16 | `ProfileController.get` | None | FR-02 | BE-05 |
| `PATCH /profile` | ACT-16 | `ProfileController.update` | None | FR-02 | BE-05 |
| `GET /transactions` | ACT-11 | `TransactionController.list` | `ListTransactions` | NFR-03 | BE-05 |

Offline activities ACT-01, ACT-06 to ACT-09, ACT-16 and ACT-17 have no endpoint. We support them through `shared/` rules and tests.

## 6. Data model

| Table | Key fields | Important constraint |
| :--- | :--- | :--- |
| `devices` | `id`, `key_id`, `public_key`, `display_name`, `payout_email`, `revoked_at` | Unique `public_key` |
| `device_tokens` | `device_id`, `token_hash`, `created_at` | Store only a hash |
| `vaults` | `id`, `device_id`, `paypal_order_id`, `paypal_authorization_id`, amounts, `fx_rate`, `status`, `spend_by`, `settle_by`, `honor_ends_at` | One open vault per device |
| `vouchers` | `id`, `vault_id`, `sequence`, `payload_hash`, `payload`, `payer_device_id`, `payee_device_id`, amounts, `status`, `paypal_capture_id`, `attempts`, `next_attempt_at`, `lease_until` | Unique `vault_id, sequence` |
| `ledger_entries` | `id`, `device_id`, `type`, `amount_usd_minor`, `amount_ngn_minor`, `voucher_id`, `withdrawal_id`, `paypal_capture_id` | Unique `voucher_id, type` and `withdrawal_id, type` |
| `withdrawals` | `id`, `device_id`, `receiver_email`, amounts, `paypal_batch_id`, `status`, `attempts`, `next_attempt_at` | The `id` is the PayPal `sender_batch_id` |
| `paypal_events` | `event_id`, `event_type`, `payload`, `processed_at` | Unique `event_id` |
| `idempotency_keys` | `key`, `device_id`, `request_hash`, `response` | Unique `device_id, key` |
| `alerts` | `id`, `type`, `vault_id`, `voucher_id`, `details` | Used for conflicts and overspend |

## 7. Critical flows

### 7.1 Voucher settlement

1. Validate the request and authenticate the device.
2. Verify the vault certificate and voucher signature through `shared/`.
3. Confirm the device is the payer or payee.
4. Lock the vault row in a database transaction.
5. Look up the vault and sequence.
6. If the same payload exists, return the stored result with `replay: true`.
7. If different content exists, set `REJECTED_CONFLICT`, block the vault and raise an alert.
8. If capture would exceed the authorisation, set `REJECTED_OVERSPEND`, block the vault and raise an alert.
9. Store the voucher and settlement attempt, then capture through the gateway.
10. On success, store the capture ID, create the ledger credit, and set `SETTLED`.
11. On timeout or 5xx, read PayPal first, then either complete or schedule a retry.
12. On expired or declined authorisation, set `SETTLEMENT_BLOCKED`.

Captures on one vault are serialised with a voucher lease taken under the vault row lock. A retry never runs until a read-back of the order finds no capture for that voucher.

### 7.2 Vault close

1. `POST /vaults/{id}/melt` stops new vault activity.
2. Verify the spend statement.
3. If all declared vouchers are settled, release the hold now.
4. Otherwise, return the blocking vouchers and schedule release at `settleBy`.
5. A job releases remaining funds after `settleBy` and sets `CLOSED`.

Release uses a void when nothing has been captured. If captures exist, use the method proven by the PayPal sandbox test.

Nothing else releases a hold early. Both phones can stay offline for days, and the customer may open PayPal without opening T-Pay. So the hold must stay in place until the customer's T-Pay app sends its vouchers and its spend statement.

### 7.3 Keeping the hold

| Rule | Value |
| :--- | :--- |
| `spendBy` | Lock time plus the chosen duration, at most 24 hours |
| `settleBy` | One day before PayPal's authorisation expiry, and never more than 28 days after lock |
| `honorEndsAt` | Three days after lock, then three days after each reauthorisation |

`RenewVaultHold` runs with the other jobs. For each `ACTIVE` or `SPEND_CLOSED` vault whose `honorEndsAt` has passed and whose `settleBy` hasn't:

1. Lock the vault row. Skip the vault if a capture lease is active, and try again on the next run.
2. Reauthorise the uncaptured amount, which is authorised minus settled. The `PayPal-Request-Id` is the current authorisation ID plus `-reauthorize`, so a retry can't reauthorise twice.
3. On success, store the new authorisation ID and set `honorEndsAt` three days ahead. Later captures use the new ID.
4. If PayPal doesn't answer, try again in an hour. If PayPal refuses, raise `REAUTHORIZATION_FAILED` and try again the next day.
5. Once everything is captured, clear `honorEndsAt`.

A void notice for an authorisation that has already been replaced matches no vault, so it changes nothing.

**Not yet proven in the sandbox.** PayPal allows reauthorisation only after the first honor period, so the sandbox proof can't run until day four of a real hold. Run it before relying on holds longer than three days. In particular, check reauthorising after a partial capture.

### 7.4 Assistant

1. Accept only `text` or audio.
2. Send a bounded instruction and the language to Gemini.
3. Validate the response against the proposal schema.
4. Reject amounts above the supplied capacity for payment intents.
5. Log the proposal and validation result, without secrets.
6. Return a proposal. Never sign or call payment services.

| Part | File |
| :--- | :--- |
| Port | `IAssistantModel` in `services/ports.ts`: words or audio, plus the language, in; raw output out |
| Adapter | `adapters/ai/GeminiAssistantModel.ts`: JSON schema output, temperature 0, 15-second timeout |
| Service | `services/InterpretRequest.ts`: validates against `modelProposalSchema`, converts naira to kobo, applies capacity, logs |
| Settings | `GEMINI_API_KEY`, which is optional. Without it the endpoint returns `AI_UNAVAILABLE`. `GEMINI_MODEL` defaults to `gemini-3.5-flash`, the fastest model that was reliably available on 10 November. A `503` from Gemini gets one quick retry inside the 15-second limit. A `429`, meaning the free-tier quota of 5 requests a minute is used up, doesn't. |

The model returns whole naira, which is more reliable than kobo. The instruction lists number words for each language, and quotes the request so it can't pose as part of the prompt. The fixed refusal lines in `InterpretRequest.ts`, and the example phrases in the instruction, need a native speaker's review.

## 8. Tickets

Each ticket needs a branch, a pull request, tests, and the activity or endpoint in its title.

| Ticket | Work | Depends on | Target |
| :--- | :--- | :--- | :--- |
| BE-01 | Add `LICENSE`, fix the `userId` error, enable `strict`, add Vitest, real health check and Render blueprint | None | 4–5 Nov |
| BE-02 | Publish `shared/src/contracts/` and all ports from the contract | None | 5 Nov |
| BE-03 | Fix `Money`, add clock and random ports, move browser adapters out of `shared/`, add attack tests | BE-01 | 5 Nov |
| BE-04 | Implement voucher, certificate, sequence, payment request and receipt rules with fixtures | BE-02, BE-03 | 5–6 Nov |
| BE-05 | Postgres setup, device registration, tokens, certificates and auth middleware | BE-01, BE-04 | 6 Nov |
| BE-06 | PayPal sandbox proof, vault creation, return page, authorisation and current vault endpoints | BE-05 | 6–7 Nov |
| BE-07 | Melt, spend statement, release job and hold rules | BE-06 | 7 Nov |
| BE-08 | Voucher submission, settlement, retries, conflict handling, webhooks and list endpoints | BE-06 | 8 Nov |
| BE-09 | Wallet endpoint | BE-08 | 9 Nov |
| BE-10 | Withdraw to PayPal | BE-09 | 9 Nov |
| BE-11 | Gemini interpret endpoint and prompt-injection tests | BE-02 | 9 Nov |
| BE-12 | Concurrency tests, Postman collection, logs and README setup | BE-08 | 10 Nov |
| BE-13 | Final Render deployment, sandbox data, judge instructions and submission support | All P0 | 10–11 Nov |

## 9. Required tests

| Area | Must prove |
| :--- | :--- |
| Money | No floats, negatives or infinite values enter money rules. |
| Signing | A fixture verifies, and any changed field fails. |
| Certificates | Wrong root, wrong device and expired certificates fail. |
| Replay | Lower sequence arriving later still settles; exact replay makes no second capture. |
| Conflict | Same sequence with different content blocks the vault. |
| Overspend | Total captures never exceed the authorisation. |
| Concurrency | 100 duplicate submissions create one capture. |
| PayPal failures | Timeout, 429, 5xx, expired and declined paths reach the right state. |
| Webhooks | Replay changes nothing, and bad signatures are refused. |
| Melt | Early melt never releases funds needed by an issued voucher. |
| Hold | A vault nobody melts stays held for a week. Each honor period ends with a reauthorisation, and a voucher signed on day one settles on day eight. |
| Assistant | Invalid and over-limit model responses never create a proposal. |
| Secrets | No secret appears in responses, logs or the app bundle. |

## 10. Definition of done

A ticket is done only when:

1. It maps to an activity or a listed external endpoint.
2. Failing tests came first for money and security rules.
3. The response matches the contract types and error codes.
4. Mutating paths are authenticated and idempotent.
5. Domain and application code has no Express, Postgres, PayPal SDK, or platform imports.
6. Typecheck and tests pass.
7. Logs contain no secrets or personal data.
8. The endpoint is deployed or has a clear handover note.
9. A teammate reviewed the pull request.

## 11. Working with the frontend

| Topic | Rule |
| :--- | :--- |
| Daily sync | Share what merged, what is deployed, and what is blocked. |
| Contract first | Publish types before endpoints so the frontend can build against them. |
| Handover | Each endpoint gets a Postman example and any sandbox setup. |
| Breaking changes | Change the contract first, with both owners approving. |
| Branch names | `feature/be-08-act-10-settlement` |
| Commit messages | Short, imperative, and tied to one purpose |
