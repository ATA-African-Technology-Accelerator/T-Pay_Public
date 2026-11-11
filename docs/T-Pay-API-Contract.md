---
title: T-Pay
subtitle: Activity and API Contract
tagline: Every endpoint belongs to a screen activity, and every network call is listed here
version: 1.1
date: 10 November 2026
author: T-Pay engineering
status: Binding for frontend and backend work. Derived from PRD v1.1.
compact: true
---

## 1. How this contract works

The PRD says what the product must do. This document says exactly how the app and the backend talk. The [frontend workflow](T-Pay-Frontend-Workflow.md) and [backend workflow](T-Pay-Backend-Workflow.md) are built from it.

| Rule | Meaning |
| :--- | :--- |
| One activity map | Section 2 is the only list of activities. Frontend and backend use the same `ACT` identifiers. |
| No orphan endpoints | An endpoint exists only if an activity or an external system calls it. |
| No hidden calls | The app makes only the calls listed against each activity. |
| Offline means no endpoint | Activities marked offline must work in airplane mode and never wait for the network. |
| Shared types | Request, response and error types live in `shared/src/contracts/`. Neither side redefines them. |
| Pure shared package | `shared/` has no third-party dependencies, so it needs no `node_modules`. Cryptography and validation libraries stay in adapters on each side. |
| Scope guard | Anything not traced to an activity and a PRD requirement waits until after the submission. |
| Contract first | A change here is merged before the code that depends on it, and both engineers approve it. |

## 2. Activity map

P0 must work in the demo. P1 follows only after every P0 activity is verified.

| ID | Activity | Who | Network | Endpoint | PRD | Priority |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| ACT-01 | App start, identity check and unlock | Both | Offline first | `POST /devices/register` only to renew a certificate | FR-01, FR-05, FR-36 | P0 |
| ACT-02 | Language, details, PIN and registration | Both | Online | `POST /devices/register` | FR-02, FR-36, FR-33 | P0 |
| ACT-03 | Home and vault summary | Both | Offline first | `GET /vaults/current` when online | FR-08, FR-35 | P0 |
| ACT-04 | Choose vault amount and duration | Customer | Online | `POST /vaults` | FR-06, FR-10 | P0 |
| ACT-05 | PayPal approval and return | Customer | Online | `POST /vaults/{id}/authorize` | FR-06, FR-37, FR-43 | P0 |
| ACT-06 | Merchant creates payment request | Merchant | Offline | None | FR-38 | P0 |
| ACT-07 | Customer reviews, signs and presents voucher | Customer | Offline | None | FR-07, FR-11, FR-13, FR-38 | P0 |
| ACT-08 | Merchant verifies voucher and presents receipt | Merchant | Offline | None | FR-36 to FR-39 | P0 |
| ACT-09 | Customer receives receipt | Customer | Offline | None | FR-22, FR-38 | P0 |
| ACT-10 | Background sync and settlement | Both | Reconnect | `POST /vouchers`, `GET /vouchers` | FR-15, FR-23, FR-24, FR-44 | P0 |
| ACT-11 | Transaction list and detail | Both | Offline first | `GET /vouchers/{id}`, `GET /transactions` when online | FR-20, FR-22 | P0 |
| ACT-12 | Melt vault | Customer | Online | `POST /vaults/{id}/melt` | FR-09, FR-39 | P0 |
| ACT-13 | Active wallet | Both | Online | `GET /wallet` | FR-40 | P0 |
| ACT-14 | Withdraw to PayPal | Both | Online | `POST /wallet/withdrawals` | FR-41 | P0 |
| ACT-15 | Voice assistant | Both | Online, with offline fallback | `POST /assistant/interpret`, `POST /assistant/speak` | FR-31 to FR-34, FR-46 | P0 |
| ACT-16 | Settings, profile and device trust | Both | Offline first | `GET /profile`, `PATCH /profile` when online | FR-04, FR-33 | P0 |
| ACT-17 | Voice sale and stock | Merchant | Offline | None | FR-26, FR-27 | P1 |
| ACT-18 | Add money to the Online wallet | Both | Online | `POST /wallet/deposits`, `POST /wallet/deposits/{id}/complete` | FR-40, FR-41 | P0 |
| ACT-19 | Get paid by link | Both | Online | `GET /wallet/pay-link`, and the public `/pay/{token}` pages | FR-40 | P1 |

Four routes have no screen in the app, and they are the only exceptions:

| Endpoint | Caller | Reason |
| :--- | :--- | :--- |
| `GET /paypal/return` | PayPal browser redirect | Returns the user to the app after ACT-05 approval. |
| `POST /webhooks/paypal` | PayPal | Updates voucher and vault state. |
| `GET /health` | Render and operators | Reports backend health. |
| `/pay/{token}` pages | Anyone with a pay link | A public web page, so a person with no T-Pay can pay an account by PayPal (4.20). |

## 3. Conventions

| Topic | Rule |
| :--- | :--- |
| Base path | All endpoints sit under `/api`, for example `POST /api/vouchers`. |
| Authentication | `Authorization: Bearer <deviceToken>`, except registration, PayPal callbacks and health. |
| Idempotency | Mutating app calls send `Idempotency-Key: <uuid>`. A repeat with the same key and body returns the first success. The same key with a different body, or while the first call is still running, returns `IDEMPOTENCY_CONFLICT`. A failed call can be retried with the same key. Voucher submission is idempotent on vault and sequence instead. |
| Naira | `amountNgnMinor` is an integer in kobo. |
| US dollars | `amountUsdMinor` and related fields are integers in cents. |
| FX rate | `fxRate` is a decimal string of naira per dollar, for example `"1500.00"`. Conversion uses one function in `shared/`. |
| Time | ISO 8601 UTC strings. |
| Identifiers | Strings. Clients never parse their contents. |
| Success body | `{ "data": { ... } }` |
| Error body | `{ "error": { "code": "VAULT_NOT_FOUND", "message": "...", "details": {} } }` |
| Language | Error messages are for logs. The app chooses user-facing text from its catalogue by `code`. |

### 3.1 Shared status values

| Type | Values |
| :--- | :--- |
| `VaultStatus` | `PENDING_APPROVAL`, `ACTIVE`, `SPEND_CLOSED`, `CLOSED`, `BLOCKED` |
| `VoucherStatus` on the phone only | `DRAFT`, `SIGNED`, `DELIVERED` |
| `VoucherStatus` on both sides | `ACKNOWLEDGED`, `SETTLING`, `RETRYABLE_FAILURE` |
| Terminal `VoucherStatus` | `SETTLED`, `SETTLEMENT_BLOCKED`, `REJECTED_CONFLICT`, `REJECTED_OVERSPEND` |
| `Language` | `en`, `pcm`, `yo`, `ig`, `ha` |

## 4. Endpoints

### 4.1 POST /devices/register

Called by ACT-02, and again by ACT-01 when the device certificate is near expiry.

```json
{
  "publicKey": "base64url",
  "displayName": "Mama Nkechi Provisions",
  "language": "pcm",
  "payoutEmail": "merchant-sandbox@example.com",
  "proof": "base64url signature over the other fields"
}
```

`payoutEmail` is required for every account, because one account can both pay and collect. Response `201` for a new key, `200` for a known key. Registering a known key again issues a new token and a fresh 7-day certificate, which is how ACT-01 renews:

```json
{
  "data": {
    "deviceId": "dev_123",
    "keyId": "key_123",
    "deviceToken": "secret",
    "deviceCertificate": "signed certificate, section 5",
    "assuranceTier": "B"
  }
}
```

Errors: `INVALID_SIGNATURE`, `VALIDATION_FAILED`.

### 4.2 POST /vaults

Called by ACT-04. `durationHours` is a whole number from 1 to 24. If the device has an unfinished order that was never approved, this call replaces it.

```json
{ "amountNgnMinor": 1000000, "durationHours": 24 }
```

Response `201`:

```json
{
  "data": {
    "vaultId": "vlt_123",
    "status": "PENDING_APPROVAL",
    "amountNgnMinor": 1000000,
    "amountUsdMinor": 667,
    "fxRate": "1500.00",
    "approvalUrl": "https://www.sandbox.paypal.com/..."
  }
}
```

Errors: `ACTIVE_VAULT_EXISTS`, `VALIDATION_FAILED`, `IDEMPOTENCY_CONFLICT`, `PAYPAL_UNAVAILABLE`.

### 4.3 GET /paypal/return

Redirect page used by PayPal after approval or cancellation. It returns `302` to:

```text
tpay://vault/return?vaultId=vlt_123&outcome=approved
tpay://vault/return?vaultId=vlt_123&outcome=cancelled
```

A cancelled return closes the pending vault, so the person can start again.

### 4.4 POST /vaults/{id}/authorize

Called by ACT-05 after the deep link returns with `approved`. The body is empty. Response `200`:

```json
{ "data": { "vault": "Vault object", "vaultCertificate": "signed certificate, section 5" } }
```

Repeating this call for a locked vault returns the same vault with a valid certificate. PayPal is not called twice.

Errors: `VAULT_NOT_FOUND`, `ORDER_NOT_APPROVED`, `IDEMPOTENCY_CONFLICT`, `PAYPAL_UNAVAILABLE`.

### 4.5 GET /vaults/current

Called by ACT-03. Response `200`, with `null` when the device has no locked vault. A vault waiting for PayPal approval counts as not locked:

```json
{
  "data": {
    "vault": {
      "vaultId": "vlt_123",
      "status": "ACTIVE",
      "amountNgnMinor": 1000000,
      "fxRate": "1500.00",
      "authorisedUsdMinor": 667,
      "reservedUsdMinor": 133,
      "settledUsdMinor": 0,
      "remainingUsdMinor": 534,
      "spendBy": "2026-11-09T10:00:00Z",
      "settleBy": "2026-12-06T10:00:00Z",
      "paypalAuthorizationId": "SANDBOX-ID"
    }
  }
}
```

The backend sees only submitted vouchers. While offline vouchers exist, the phone's local reserved amount decides what can be signed.

**Spend-by and settle-by.** `spendBy` is when the customer must stop signing, at most 24 hours after lock. `settleBy` is the last moment any voucher can settle. It is one day before PayPal's 29-day authorisation expires, so about 28 days after lock. Until then the hold stays in place, even if neither phone comes back online for a week. It is released earlier only when the customer melts the vault in T-Pay and every declared voucher has settled (4.6).

PayPal guarantees an authorisation for three days. Each time that honor period ends, the backend reauthorises whatever hasn't been captured. That gives a new `paypalAuthorizationId`, so the app must always read the current ID from the backend and never keep the first one.

### 4.6 POST /vaults/{id}/melt

Called by ACT-12.

```json
{ "spendStatement": "signed statement, section 5" }
```

Response `200`:

```json
{
  "data": {
    "vaultId": "vlt_123",
    "status": "SPEND_CLOSED",
    "releasedAt": null,
    "releaseScheduledFor": "2026-12-06T10:00:00Z",
    "blockingVoucherIds": ["vch_456"]
  }
}
```

When nothing blocks release, `status` is `CLOSED`, `releasedAt` is set, and `releaseScheduledFor` is null. `blockingVoucherIds` lists only vouchers the backend has seen, so it can be empty while `status` is `SPEND_CLOSED` if a declared voucher has not arrived yet. Repeating melt is safe, and the first signed statement stands. A blocked vault stays `BLOCKED` until `settleBy`.

Only this call can release a hold before `settleBy`, and only with the customer's signed spend statement. The customer opening PayPal, or simply going quiet, never releases it.

Errors: `VAULT_NOT_FOUND`, `INVALID_SIGNATURE`, `IDEMPOTENCY_CONFLICT`, `PAYPAL_UNAVAILABLE`.

### 4.7 POST /vouchers

Called by ACT-10 from either phone.

```json
{
  "voucher": "signed voucher, section 5",
  "vaultCertificate": "signed certificate, section 5",
  "receipt": "signed receipt when available"
}
```

Response `200` when terminal, `202` while settlement continues:

```json
{
  "data": {
    "voucherId": "vch_456",
    "status": "SETTLED",
    "paypalCaptureId": "SANDBOX-CAPTURE",
    "replay": false
  }
}
```

A repeated identical voucher returns its stored result with `replay: true` and makes no PayPal call. Verification failures return an error. Settlement outcomes such as `REJECTED_OVERSPEND` return `200` with that status.

`Idempotency-Key` is not needed here. A voucher above a signed spend statement, or on a closed or blocked vault, returns `200` with `SETTLEMENT_BLOCKED`. On `REJECTED_CONFLICT`, `voucherId` is the voucher already stored for that sequence.

Errors: `VALIDATION_FAILED`, `VAULT_NOT_FOUND`, `INVALID_SIGNATURE`, `INVALID_CERTIFICATE`, `VOUCHER_EXPIRED`, `NOT_A_PARTY`.

### 4.8 GET /vouchers

Called by ACT-10 after each submission pass. Newest first. Query: `since` is an optional cursor from `nextCursor`, and `limit` is 1 to 100, default 50.

```json
{
  "data": {
    "items": [
      {
        "voucherId": "vch_456",
        "vaultId": "vlt_123",
        "sequence": 1,
        "view": "PAYEE",
        "status": "SETTLED",
        "amountNgnMinor": 200000,
        "amountUsdMinor": 133,
        "counterpartyName": "Customer",
        "paypalCaptureId": "SANDBOX-CAPTURE",
        "updatedAt": "2026-11-08T12:00:00Z"
      }
    ],
    "nextCursor": "cursor"
  }
}
```

### 4.9 GET /vouchers/{id}

Called by ACT-11. Returns one voucher in the same shape as an item in section 4.8, for the payer or payee only.

Errors: `VOUCHER_NOT_FOUND`.

### 4.10 GET /wallet

Called by ACT-13. Returns collected money. Vault funds and PayPal account balances aren't included. `pendingNgnMinor` is money still settling. `entries` holds the latest 50, newest first. `type` is `CREDIT` (a settled payment), `DEPOSIT` (money the person added), `PAYMENT_LINK` (paid through the pay link), `WITHDRAWAL`, `REVERSAL` or `WITHDRAWAL_RETURNED`. `fxRate` is the fixed demo rate, so the app can turn an amount in naira into dollars. The balance can go below zero if a payment is reversed after the money was withdrawn.

```json
{
  "data": {
    "balanceUsdMinor": 133,
    "balanceNgnMinor": 200000,
    "pendingNgnMinor": 0,
    "payoutEmail": "user-sandbox@example.com",
    "fxRate": "1500.00",
    "entries": [
      {
        "entryId": "led_1",
        "type": "CREDIT",
        "amountUsdMinor": 133,
        "amountNgnMinor": 200000,
        "voucherId": "vch_456",
        "paypalCaptureId": "SANDBOX-CAPTURE",
        "createdAt": "2026-11-08T12:00:00Z"
      }
    ]
  }
}
```

### 4.11 POST /wallet/withdrawals

Called by ACT-14. Sends collected money to the account's PayPal email. Send `Idempotency-Key`. The balance drops at once. A refused payout returns the money with a `WITHDRAWAL_RETURNED` entry.

```json
{ "amountUsdMinor": 133, "recipientEmail": "chidi@example.com" }
```

`recipientEmail` is optional. Left out, the money goes to the account's own `payoutEmail`. Any PayPal email works, so a person who is not on T-Pay can be paid; PayPal emails someone with no PayPal account a link to claim it. The email is checked and lower-cased, and the same `Idempotency-Key` with a different recipient is an `IDEMPOTENCY_CONFLICT`.

Response `202`:

```json
{ "data": { "withdrawalId": "wdr_1", "status": "PENDING", "paypalBatchId": "SANDBOX-BATCH" } }
```

`status` is `PENDING` or `FAILED` in this reply. `paypalBatchId` is null until PayPal accepts the payout. If PayPal doesn't answer, the backend keeps retrying the same payout, so the app shows pending and must not start a new withdrawal. The result appears in `GET /transactions` as `WITHDRAWAL_COMPLETED` or `WITHDRAWAL_FAILED`.

Errors: `VALIDATION_FAILED`, `INSUFFICIENT_BALANCE`, `IDEMPOTENCY_CONFLICT`.



### 4.12 POST /assistant/interpret

Called by ACT-15. Exactly one of `text` or `audioBase64` is present. The app never sends keys, tokens or signed data.

```json
{
  "text": "Abeg collect one thousand",
  "audioBase64": null,
  "audioMimeType": null,
  "language": "pcm",
  "context": { "remainingNgnMinor": 800000 }
}
```

Response `200`:

```json
{
  "data": {
    "proposal": { "intent": "CREATE_PAYMENT_REQUEST", "amountNgnMinor": 100000, "itemName": null },
    "transcript": "Abeg collect one thousand",
    "spokenReply": "You wan collect one thousand naira?",
    "needsConfirmation": true
  }
}
```

Allowed intents are `CREATE_PAYMENT_REQUEST`, `PAY_AMOUNT`, `RECORD_SALE`, `CHECK_BALANCE` and `UNKNOWN`. A proposal only pre-fills a screen. A person must confirm it, and only the normal signing activity can sign.

| Rule | Detail |
| :--- | :--- |
| Authentication | Device token required. No `Idempotency-Key`, because nothing changes. |
| `text` | 1 to 500 characters |
| `audioBase64` | Standard base64, at most 1,400,000 characters, which is about a minute of compressed speech. This route alone accepts a body up to 2 MB. |
| `audioMimeType` | Required with audio, otherwise null: `audio/wav`, `audio/x-wav`, `audio/mp3`, `audio/mpeg`, `audio/aac`, `audio/mp4`, `audio/m4a`, `audio/x-m4a`, `audio/ogg`, `audio/webm`, `audio/flac`, `audio/aiff` or `audio/3gpp` |
| What the model sees | Only the words or audio, and the language. Never `context`, tokens, keys or vault data. |
| `amountNgnMinor` | In kobo. Null when no amount was said, so the screen asks for one. Always null for `CHECK_BALANCE` and `UNKNOWN`. |
| Capacity | A `PAY_AMOUNT` above `context.remainingNgnMinor` is refused |

**Refused answers.** If the model's answer breaks the schema, or proposes a payment above capacity, the response is still `200`, but the proposal is `{ "intent": "UNKNOWN", "amountNgnMinor": null, "itemName": null }`. In that case `spokenReply` is a fixed backend line in the request's language, never the model's words. It says either that the request wasn't understood or that the amount is more than the vault has left. The app treats it like any `UNKNOWN` proposal: it shows and speaks the reply and offers typed input.

Every call is logged with its proposal and outcome: `ACCEPTED`, `REJECTED_INVALID` or `REJECTED_OVER_CAPACITY`. What the person said is not logged.

Errors: `AI_UNAVAILABLE` (no Gemini key is set, or Gemini failed or timed out), `VALIDATION_FAILED`.

### 4.13 POST /webhooks/paypal

Called by PayPal. The handler verifies the signature, stores the event identifier, and applies the event once. A refund or reversal moves a settled voucher to `SETTLEMENT_BLOCKED` and adds a `REVERSAL` ledger entry. A bad signature returns `INVALID_SIGNATURE`.

### 4.14 GET /health

Response `200` when dependencies are reachable, `503` otherwise:

```json
{ "data": { "status": "ok", "database": "ok", "paypal": "ok", "mode": "sandbox" } }
```



### 4.15 GET /profile

Called by ACT-16. Response `200`:

```json
{
  "data": {
    "deviceId": "dev_123",
    "displayName": "Mama Nkechi Provisions",
    "language": "pcm",
    "payoutEmail": "merchant-sandbox@example.com",
    "assuranceTier": "B",
    "createdAt": "2026-11-06T10:00:00Z"
  }
}
```

### 4.16 PATCH /profile

Called by ACT-16. All fields are optional.

```json
{ "displayName": "Mama Nkechi Stores", "language": "yo", "payoutEmail": "merchant-sandbox@example.com" }
```

Response `200` returns the same object as `GET /profile`. Errors: `VALIDATION_FAILED`.

### 4.17 GET /transactions

Called by ACT-11. Query: `since` is an optional cursor. Returns the permanent history for the calling device.

```json
{
  "data": {
    "items": [
      {
        "transactionId": "txn_1",
        "type": "VOUCHER_SETTLED",
        "amountNgnMinor": 200000,
        "amountUsdMinor": 133,
        "vaultId": "vlt_123",
        "voucherId": "vch_456",
        "paypalReferenceId": "SANDBOX-CAPTURE",
        "occurredAt": "2026-11-08T12:00:00Z"
      }
    ],
    "nextCursor": null
  }
}
```

Types are `VAULT_LOCKED`, `VAULT_RELEASED`, `VOUCHER_SUBMITTED`, `VOUCHER_SETTLED`, `VOUCHER_REJECTED`, `WITHDRAWAL_REQUESTED`, `WITHDRAWAL_COMPLETED`, `WITHDRAWAL_FAILED`, `DEPOSIT_COMPLETED` and `PAYMENT_LINK_RECEIVED`.





### 4.18 POST /wallet/deposits

Called by ACT-18. Starts a PayPal checkout that is captured straight into the Online wallet, with no hold. Send `Idempotency-Key`.

```json
{ "amountNgnMinor": 1500000 }
```

Response `201`:

```json
{
  "data": {
    "depositId": "dep_123",
    "amountNgnMinor": 1500000,
    "amountUsdMinor": 1000,
    "fxRate": "1500.00",
    "approvalUrl": "https://www.sandbox.paypal.com/..."
  }
}
```

The smallest deposit is $1 and the largest is the vault maximum. The app opens `approvalUrl` in the in-app browser. PayPal sends the payer to `GET /paypal/return?depositId=…&outcome=…`, which redirects to `tpay://wallet/return?depositId=dep_123&outcome=approved`, or `cancelled`, which also cancels the deposit. Nothing is credited yet.

Errors: `VALIDATION_FAILED`, `IDEMPOTENCY_CONFLICT`, `PAYPAL_UNAVAILABLE`.

### 4.19 POST /wallet/deposits/{id}/complete

Called by ACT-18 after the payer returns `approved`. Captures the order and credits the Online wallet. Send `Idempotency-Key`. The body is empty. Repeating it is safe: the wallet is credited once, enforced inside the wallet lock and by a database constraint.

```json
{
  "data": {
    "depositId": "dep_123",
    "status": "COMPLETED",
    "amountNgnMinor": 1500000,
    "amountUsdMinor": 1000,
    "paypalCaptureId": "SANDBOX-CAPTURE"
  }
}
```

`200` when `COMPLETED`. `202` with `PENDING` while PayPal is still confirming the capture, in which case nothing is credited yet and calling again reads the same capture. The transaction history gets `DEPOSIT_COMPLETED`.

Errors: `VAULT_NOT_FOUND` (not this device's deposit), `ORDER_NOT_APPROVED` (not approved in PayPal yet, or cancelled), `IDEMPOTENCY_CONFLICT`, `PAYPAL_UNAVAILABLE`.

### 4.20 GET /wallet/pay-link and the public pay pages

Called by ACT-19. Returns this account's pay link. It is the same link every time, with an unguessable 22-character token.

```json
{ "data": { "url": "https://t-pay-public.onrender.com/pay/Xk3Jx9QmZaB7rT2pLw0cEa" } }
```

The link opens a public page, with no sign-in, on the backend itself:

| Route | What it does |
| :--- | :--- |
| `GET /pay/{token}` | Shows who will be paid, by display name only (never the email), and asks for an amount in dollars, from $1 to $500 |
| `POST /pay/{token}` | Makes a PayPal order and sends the payer to PayPal. Limited to 10 submits a minute per address. |
| `GET /pay/{token}/return` | PayPal sends the payer back here. If PayPal's order token matches, the order is captured and the owner is credited, once. The payer sees a thank-you page. |

The credit appears in the owner's wallet as `PAYMENT_LINK`, and in the history as `PAYMENT_LINK_RECEIVED`. Every page escapes names, loads nothing from elsewhere, and can't be shown inside another site, using a strict content security policy.

### 4.21 POST /assistant/speak

Reads a short reply aloud in a natural voice, so the assistant does not sound like a screen reader. It needs a device token. The app asks for it only for the assistant's own replies, and uses the phone's built-in voice when it is offline, when this is slow (more than 3 seconds) or when it fails.

Request: `{ "text": "You wan collect one thousand naira?", "language": "pcm" }`

Response: `{ "data": { "audioBase64": "UklGR...", "audioMimeType": "audio/wav" } }`

| Field | Rule |
|---|---|
| `text` | 1 to 300 characters. A longer text is refused with `VALIDATION_FAILED` so one request cannot run up a large bill. |
| `language` | `en`, `pcm`, `yo`, `ig` or `ha`. The voice is asked to speak that language. |
| Audio | A mono, 16-bit, 24,000 Hz WAV file made by Gemini. The model comes from `GEMINI_TTS_MODEL` (default `gemini-3.8-flash-tts`). |

Errors: `AI_UNAVAILABLE` (no Gemini key, the voice model is not available to the key, or Gemini failed or timed out), `VALIDATION_FAILED`.

### 4.22 POST /vaults/from-wallet

Locks money for offline spending straight from the Online wallet. The money is already collected into T-Pay's PayPal account, so there is no PayPal step: the vault is `ACTIVE` at once and the answer is the same as `POST /vaults/{id}/authorize`. Needs a device token and an `Idempotency-Key`.

Request: `{ "amountNgnMinor": 500000, "durationHours": 24 }`, the same rules as `POST /vaults`.

Response `201`: `{ "data": { "vault": { ..., "fundedBy": "WALLET" }, "vaultCertificate": { ... } } }`

| Rule | |
|---|---|
| Balance | The Online wallet must hold the amount in both dollars and naira, or `INSUFFICIENT_BALANCE` (422). Nothing changes. |
| One open vault | `ACTIVE_VAULT_EXISTS` (409) while another vault is open. A PayPal lock started but never approved is replaced. |
| Once only | The wallet debit (`VAULT_LOCK`) and the vault are written in one transaction, and the database allows one `VAULT_LOCK` and one `VAULT_RETURN` per vault. |
| Paying a merchant | A voucher settles with no PayPal capture: the merchant's Online wallet is credited (`CREDIT`) from the locked money. |
| Closing | On melt, or at settle-by, what was not spent goes back to the Online wallet as `VAULT_RETURN`. Nothing is voided at PayPal. |
| Settle-by | 28 days, the same as a PayPal vault. No hold renewal. |

`VaultView.fundedBy` is `PAYPAL` or `WALLET` on every vault. Ledger entries add two types: `VAULT_LOCK` (money out of the Online wallet into a vault) and `VAULT_RETURN` (unspent money back).

### 4.23 Automatic cash-out of money received offline

The **Wallet** holds the money a person receives; the **Offline vault** holds the money they can send offline. Money received from offline payments goes on to the person's own PayPal (`payoutEmail`) by itself, without any call from the app:

| Rule | |
|---|---|
| When | A background job every 30 seconds. Whatever was received offline since the last run becomes **one** payout, so a busy seller is not charged a fee per sale. |
| What | Money received offline (`CREDIT`, less any `REVERSAL`) less what was already cashed out this way. Never money the person added (`DEPOSIT`) or was paid by link (`PAYMENT_LINK`), and never more than the balance. |
| Minimum | $1.00. Smaller amounts wait for the next payment. |
| Payout | The same PayPal Payout as a withdrawal, with the same retries and duplicate protection. Its `WITHDRAWAL` and any `WITHDRAWAL_RETURNED` ledger entries carry `"autoCashOut": true`. |
| Refused | If PayPal refuses (for example an email with no PayPal account), the money returns to the Wallet and automatic cash-out pauses for that account for 24 hours. |
| Turning it off | `PATCH /profile` with `{ "autoCashOut": false }`. `GET /profile` returns `autoCashOut` (default `true`). Registering the phone again keeps the choice. |

## 5. Offline messages

These are signed objects carried between phones and later to the backend. They are created and verified only through `shared/`.

### 5.1 Signing format

| Item | Rule |
| :--- | :--- |
| Signed bytes | Domain prefix plus JCS canonical JSON |
| Algorithm | ECDSA P-256 with SHA-256 |
| Signature | Base64url of raw 64-byte `r‖s` |
| Envelope | `{ "payload": { ... }, "signature": "base64url" }` |
| Wire frame | `TPAY1:<TYPE>:<base64url body>`, the same text for QR, the copyable code and Bluetooth. See 5.4. |

### 5.2 Message types

| Type | Signed by | Prefix | Payload fields |
| :--- | :--- | :--- | :--- |
| Device certificate | Backend | `TPAY-DEVICE-CERT-V1` | `deviceId`, `keyId`, `publicKey`, `displayName`, `expiresAt` |
| Vault certificate | Backend | `TPAY-VAULT-CERT-V1` | `vaultId`, `keyId`, `authorisedUsdMinor`, `amountNgnMinor`, `fxRate`, `spendBy`, `settleBy` |
| Payment request | Merchant | `TPAY-REQUEST-V1` | `requestId`, `merchantKeyId`, `amountNgnMinor`, `nonce`, `expiresAt`, plus the merchant device certificate |
| Voucher | Customer | `TPAY-VOUCHER-V1` | `vaultId`, `keyId`, `deviceId`, `sequence`, `amountNgnMinor`, `amountUsdMinor`, `fxRate`, `payeeKeyId`, `requestNonce`, `issuedAt`, `expiresAt` |
| Receipt | Merchant | `TPAY-RECEIPT-V1` | `vaultId`, `sequence`, `voucherHash`, `merchantKeyId`, `receivedAt` |
| Spend statement | Customer | `TPAY-STATEMENT-V1` | `vaultId`, `lastSequence`, `totalIssuedUsdMinor`, `issuedAt` |

A voucher frame also carries the customer's device certificate and vault certificate. Section 5.4 lists exactly what each frame holds.




### 5.3 Offline refusal codes

The app shows translated text for each code. These never come from the backend.

| Code | Meaning |
| :--- | :--- |
| `INVALID_CERTIFICATE` | A certificate is fake, expired or for the wrong device |
| `INVALID_SIGNATURE` | The signed data was changed or forged |
| `REQUEST_EXPIRED` | The merchant's payment request expired |
| `REQUEST_MISMATCH` | The voucher doesn't match this payment request, or its dollar amount doesn't match the rate |
| `VAULT_EXPIRED` | The vault can no longer be spent |
| `INSUFFICIENT_VAULT_CAPACITY` | The vault doesn't have enough left |
| `WRONG_PAYEE` | The voucher is for another merchant |
| `DUPLICATE_VOUCHER` | This merchant already accepted this voucher |
| `SELF_PAYMENT` | A person can't pay their own account |
| `INVALID_FRAME` | The scanned, pasted or received text isn't a T-Pay code, or it's damaged |

### 5.4 Frames and transport

Phones exchange three frames. Build and read them only with `encodeFrame` and `decodeFrame` from `shared/src/domain/frames.ts`, so every transport sends the same text.

| Frame | Sent by | Body, base64url of canonical JSON | Extra segment |
| :--- | :--- | :--- | :--- |
| `TPAY1:REQUEST:<body>[:<sessionCode>]` | Merchant | The signed payment request envelope | Optional Bluetooth session code |
| `TPAY1:VOUCHER:<body>` | Customer | `{ voucher, customerCertificate, vaultCertificate }`, each a signed envelope | None |
| `TPAY1:RECEIPT:<body>` | Merchant | The signed receipt envelope | None |

`decodeFrame` checks only the frame's shape and refuses anything else with `INVALID_FRAME`. Signatures and certificates are checked afterwards by `issueVoucher` and `acceptVoucher`. A frame longer than 16,000 characters is refused unread.

**Session code.** The merchant's phone makes it with `IRandom.nonce()`. It is 16 to 64 base64url characters and sits after the body, outside the signed request. It only tells the customer's phone which merchant to join over Bluetooth. A wrong or missing code can stop that path, but it can never change the amount or the payee, because both are signed.

**Transports.** QR and the copyable code always work. Bluetooth, through Nearby Connections, is an upgrade that removes the second and third scans:

| Step | Merchant phone | Customer phone |
| :--- | :--- | :--- |
| ACT-06 | Before showing the QR, ask only for what is missing: the Nearby devices permission, then to turn Bluetooth on. If Bluetooth is ready, add the session code and start hosting. | |
| ACT-07 | | Scan the request. Ask only for what is missing, then join the merchant in the background while the person reviews the payment. On **Pay**, sign the voucher and send the voucher frame over Bluetooth. |
| ACT-08 | Receive the voucher frame, verify it, save it, and send the receipt frame back over the same connection. | |
| ACT-09 | | Receive and save the receipt. |
| Fallback | Keep the voucher scanner open while hosting. | If Bluetooth is refused, is off, or isn't connected within 8 seconds of tapping **Pay**, show the voucher QR instead. |

Bluetooth never blocks a payment, and the backend never knows which transport carried a voucher. `POST /vouchers` is unchanged.

**Pairing.** Both phones use Nearby Connections with the point-to-point strategy and the app's package name as the service ID. Each frame travels as one UTF-8 bytes payload, exactly the text of the QR. The session code itself is never broadcast. Both phones derive two 16-character tags from it:

| Tag | Value | Used as |
| :--- | :--- | :--- |
| Advertise | First 16 characters of base64url(SHA-256(`TPAY-NEARBY-V1\nADVERTISE\n<sessionCode>`)) | The merchant's advertised endpoint name |
| Join | The same with `JOIN` in place of `ADVERTISE` | The customer's endpoint name when it connects |

The merchant accepts a connection only from an endpoint named with the join tag and rejects every other. A phone that overhears the advertised tag can't make the join tag without the code, which only travels inside the QR the customer scanned. So it can't take the customer's place.

**Shared rules for each step.** Build and check every message only with these functions from `shared/`:

| Step | Function |
| :--- | :--- |
| ACT-06 | `createPaymentRequest`. A request lives 15 minutes and is refused with `INVALID_CERTIFICATE` when the merchant's certificate has expired |
| ACT-07, before signing | `reviewPaymentRequest`: the merchant's name, the amount in naira and dollars, or the refusal, with no signature yet |
| ACT-07, on Pay | `issueVoucher` |
| ACT-08 | `acceptVoucher` |
| ACT-09 | `acceptReceipt`: the receipt must be signed by the merchant in the request and cover exactly this voucher |
| ACT-12 | `createSpendStatement`, which refuses sequences that are not exactly 1 to n |
| ACT-15 offline | `parseOfflineIntent`. English and Pidgin phrases for now, plus digits in every language. With the optional on-phone model, its answer is checked by `checkModelProposal` with the same intent, amount and capacity rules as `POST /assistant/interpret`, and the rules win where they recognise something |




## 6. Error codes and required app behaviour

| Code | HTTP | App behaviour |
| :--- | :--- | :--- |
| `VALIDATION_FAILED` | 400 | Show the field problem. This is a bug if the UI allowed it. |
| `UNAUTHENTICATED` | 401 | Re-register, then repeat the action once. |
| `DEVICE_REVOKED` | 403 | Stop signing and start ACT-02. |
| `VAULT_NOT_FOUND` | 404 | Refresh the home screen. |
| `VOUCHER_NOT_FOUND` | 404 | Keep the local record and show pending. |
| `ACTIVE_VAULT_EXISTS` | 409 | Open the existing vault. |
| `ORDER_NOT_APPROVED` | 409 | Offer to return to PayPal. |
| `IDEMPOTENCY_CONFLICT` | 409 | Retry after a short wait. If it persists, refresh the state first and use a new key. |
| `NOT_A_PARTY` | 403 | Stop retrying and log the failure. |
| `INVALID_SIGNATURE` | 422 | Stop retrying and show rejected. |
| `INVALID_CERTIFICATE` | 422 | Stop retrying and show rejected. |
| `VOUCHER_EXPIRED` | 422 | Stop retrying and show blocked. |
| `INSUFFICIENT_BALANCE` | 422 | Show the available balance. |
| `RATE_LIMITED` | 429 | Retry with backoff. |
| `PAYPAL_UNAVAILABLE` | 503 | Offer retry and keep local data. |
| `AI_UNAVAILABLE` | 503 | Open the offline assistant path. |
| `ROUTE_NOT_FOUND` | 404 | This is a bug. Log it and show a general error. |
| `INTERNAL_SERVER_ERROR` | 500 | Offer retry and keep local data. |
## 7. Change control

1. Open a pull request against this document first.
2. Name the activity and PRD requirement.
3. Update `shared/src/contracts/` in the same pull request.
4. Get approval from both the frontend and backend owners.
5. Update the Word version with `npm run docx` in `docs/`.
