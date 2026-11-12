<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="frontend/assets/brand/source/logo-navy.png">
  <source media="(prefers-color-scheme: light)" srcset="frontend/assets/brand/source/logo-white.png">
  <img alt="T-Pay" src="frontend/assets/brand/source/logo-white.png" width="200">
</picture>

# T-Pay

**PayPal payments that keep working when the network doesn't.**

Lock money while you are online, then pay or get paid phone to phone with no internet at all, by QR code, Bluetooth or voice.

[Website](https://t-paypublic-website.vercel.app/) · [Download the app](https://expo.dev/accounts/olayiwola206/projects/tpay-mobile/builds/9a8af0e5-d058-494f-8756-fb112fdac3d5) · [Live API](https://t-pay-public.onrender.com/api/health) · [User guide](docs/T-Pay-User-Guide.md) · [Docs](docs/T-Pay-API-Contract.md) · [Quickstart](#quickstart) · [Architecture](#architecture) · [Contributing](CONTRIBUTING.md)

[![Tests](https://img.shields.io/github/actions/workflow/status/OlayiwolaSherrifSalawu/T-Pay_Public/ci.yml?branch=frontend&style=flat-square&label=tests)](https://github.com/OlayiwolaSherrifSalawu/T-Pay_Public/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![App version](https://img.shields.io/badge/app-v1.0.0-blue?style=flat-square)](frontend/app.json)
[![Status](https://img.shields.io/badge/status-PayPal%20sandbox-orange?style=flat-square)](#roadmap)

<!-- TODO: add a hero screenshot or GIF of the app (for example docs/images/hero.png) and reference it here:
<img src="docs/images/hero.png" alt="T-Pay on Android: Offline vault, voice assistant and a payment QR" width="820">
-->

</div>

---

## Contents

- [Try T-Pay](#try-t-pay)
- [Overview](#overview)
- [Key capabilities](#key-capabilities)
- [Architecture](#architecture)
- [Technology](#technology)
- [Built with](#built-with)
- [Quickstart](#quickstart)
- [Using T-Pay](#using-t-pay)
- [Configuration](#configuration)
- [Repository layout](#repository-layout)
- [Testing](#testing)
- [Security](#security)
- [Roadmap](#roadmap)
- [Team](#team)
- [Contributing](#contributing)
- [License](#license)

## Try T-Pay

| | Link |
| :--- | :--- |
| **Website** | [t-paypublic-website.vercel.app](https://t-paypublic-website.vercel.app/) |
| **Android app** | [Download the build from Expo](https://expo.dev/accounts/olayiwola206/projects/tpay-mobile/builds/9a8af0e5-d058-494f-8756-fb112fdac3d5) |
| **Live API** | [t-pay-public.onrender.com/api/health](https://t-pay-public.onrender.com/api/health) |
| **User guide** | [docs/T-Pay-User-Guide.md](docs/T-Pay-User-Guide.md), with a ten-minute test script for judges |
| **Explainer video** | [T-Pay explainer on YouTube](https://www.youtube.com/watch?v=xpTYEPPETxM) |
| **Test accounts** | [docs/T-Pay-Test-Accounts.md](docs/T-Pay-Test-Accounts.md): the three sandbox logins, and which one is T-Pay's |

> [!NOTE]
> The API runs on Render's free plan and sleeps when idle. The first request after a quiet spell can take up to a minute.

## Overview

In markets across Nigeria, a dropped network means a lost sale: card terminals and transfer apps stop working the moment the signal does. T-Pay lets a customer lock money from PayPal (or their T-Pay Wallet) into an **Offline vault** while they are online, then pay a seller later with **no internet on either phone**. Each payment is a voucher signed by a key that never leaves the customer's phone, so it can't be forged or spent twice. When either phone reconnects, the backend settles the voucher against the PayPal hold and the money reaches the seller's Wallet, and from there their PayPal. A voice assistant in English, Nigerian Pidgin, Yoruba, Igbo and Hausa lets a busy trader do all of this hands-free.

Built for the PayPal AI Hackathon, November 2026. <!-- TODO: link the hackathon page (for example the Devpost listing). -->

## Key capabilities

| Capability | Description |
| :--- | :--- |
| **Offline vault** | Lock money from PayPal (an authorisation hold) or straight from the Wallet. One vault at a time, spendable for 6, 12 or 24 hours, held for up to 28 days. |
| **Pay with no network** | The seller shows a signed payment request as a QR code. The customer scans it and confirms with fingerprint or PIN. The signed voucher goes back over Bluetooth, or as a second QR code. Works in airplane mode. |
| **Double-spend protection** | Each voucher carries the next sequence number under a vault certificate that states how much is locked. A reused number, or a total above the lock, is refused and the vault is blocked. |
| **Settlement** | Either phone can submit a voucher when it reconnects. The backend captures it from the PayPal hold and credits the seller's Wallet. Resubmitting returns the stored result, never a second capture. |
| **Wallet** | Holds money received and added. Add money through PayPal checkout, withdraw to any PayPal email, or share a pay link anyone can pay. Money received offline can go on to the seller's PayPal by itself. |
| **Hands-free voice assistant** | Say "Hey T-Pay" while the app is open. It takes payments, pays, locks and unlocks money, adds money, withdraws, shares the pay link, keeps stock and budget, and opens any screen, then listens for the next request. |
| **AI that never moves money** | Clear requests are read on the phone by fixed rules. Gemini reads the rest online, and an optional model runs on the phone offline. Every proposal is checked, and money moves only after the person's fingerprint, PIN or PayPal sign-in. |
| **Natural voice** | Replies are read by ElevenLabs in English and Pidgin, saved on the phone after the first time, with the phone's own voice as a fallback. |
| **QR reading on any phone** | The camera uses the phone's built-in reader first. If that finds nothing, T-Pay's own JavaScript decoder reads the code from a still photo. |
| **Personal and Business accounts** | Business accounts get Stock & Inventory and record sales by voice ("I sold one Coke for 500"). Personal accounts get a monthly Personal Budget. |
| **Live status** | Money arriving is shown and spoken within seconds. A seller's request screen moves on as soon as the payment arrives, by Bluetooth or through T-Pay. |

## Architecture

```mermaid
flowchart LR
    subgraph Phones["Android phones (Expo / React Native)"]
        C["Customer app<br/>device key, Offline vault,<br/>SQLite, voice"]
        S["Seller app<br/>device key, Wallet,<br/>stock, voice"]
    end

    subgraph Shared["shared/ (runs on phone and server)"]
        R["Payment rules<br/>signing, certificates,<br/>vouchers, frames, intents"]
    end

    subgraph Backend["Backend (Node.js, Express)"]
        API["REST API<br/>/api"]
        JOBS["Background jobs<br/>settlement, hold renewal,<br/>auto cash-out"]
        DB[("PostgreSQL")]
    end

    PP["PayPal<br/>Orders, Payments,<br/>Payouts, Webhooks"]
    AI["Google Gemini"]
    EL["ElevenLabs"]

    C <-->|"QR code or Bluetooth<br/>(no internet)"| S
    C -.->|uses| R
    S -.->|uses| R
    API -.->|uses| R
    C -->|"HTTPS, when online"| API
    S -->|"HTTPS, when online"| API
    API --> DB
    JOBS --> DB
    API --> PP
    JOBS --> PP
    PP -->|webhooks| API
    API --> AI
    API --> EL
```

**Lifecycle of an offline payment**

1. **Register.** On first launch the phone creates a P-256 key in secure storage and registers it. The backend returns a device certificate signed by the T-Pay root key.
2. **Lock.** Online, the customer locks an amount. The backend places a PayPal authorisation hold (or moves Wallet money) and issues a signed vault certificate stating the amount and spending window.
3. **Request.** Offline, the seller's phone signs a payment request and shows it as a QR code, with a Bluetooth session code when Bluetooth is available.
4. **Pay.** The customer scans it. The phone checks the seller's certificate against the root public key it ships with, and the customer confirms with fingerprint or PIN. The phone signs a voucher with the next sequence number and counts it against the vault at once.
5. **Deliver.** The voucher goes to the seller over Bluetooth, which returns a signed receipt, or the seller scans it as a QR code. The seller's phone verifies it fully offline and records it as received, queued.
6. **Settle.** When either phone is online it submits the voucher. The backend checks the signature, certificate, sequence and running total, captures the amount from the PayPal hold, and credits the seller's Wallet.
7. **Pay out.** If automatic cash-out is on, the background job batches settled money into one PayPal payout to the seller.
8. **Close.** The customer closes the vault with fingerprint or PIN. Unspent money is released, either by voiding the rest of the hold or by returning it to the Wallet.

The [API contract](docs/T-Pay-API-Contract.md) is the source of truth for every endpoint and offline message.

## Technology

| Layer | Tools |
| :--- | :--- |
| **Mobile** | ![React Native](https://img.shields.io/badge/React_Native_0.88-61DAFB?style=flat-square&logo=react&logoColor=black) ![Expo](https://img.shields.io/badge/Expo_SDK_58-000020?style=flat-square&logo=expo&logoColor=white) ![React](https://img.shields.io/badge/React_19-61DAFB?style=flat-square&logo=react&logoColor=black) ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white) ![Android](https://img.shields.io/badge/Android-34A853?style=flat-square&logo=android&logoColor=white) ![Kotlin](https://img.shields.io/badge/Kotlin_modules-7F52FF?style=flat-square&logo=kotlin&logoColor=white) |
| **Device** | ![Bluetooth](https://img.shields.io/badge/Nearby_Connections-0082FC?style=flat-square&logo=bluetooth&logoColor=white) ![Camera](https://img.shields.io/badge/expo--camera_+_ML_Kit-4285F4?style=flat-square&logo=google&logoColor=white) ![jsQR](https://img.shields.io/badge/jsQR-555555?style=flat-square) ![Biometrics](https://img.shields.io/badge/expo--local--authentication-000020?style=flat-square&logo=expo&logoColor=white) ![Secure Store](https://img.shields.io/badge/expo--secure--store-000020?style=flat-square&logo=expo&logoColor=white) ![noble-curves](https://img.shields.io/badge/@noble/curves_(P--256)-555555?style=flat-square) |
| **Backend** | ![Node.js](https://img.shields.io/badge/Node.js_22-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white) ![Express](https://img.shields.io/badge/Express_4-000000?style=flat-square&logo=express&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white) ![Zod](https://img.shields.io/badge/Zod_4-3E67B1?style=flat-square&logo=zod&logoColor=white) ![tsx](https://img.shields.io/badge/tsx-555555?style=flat-square) |
| **Data** | ![PostgreSQL](https://img.shields.io/badge/PostgreSQL_17-4169E1?style=flat-square&logo=postgresql&logoColor=white) ![SQLite](https://img.shields.io/badge/SQLite_(on_phone)-003B57?style=flat-square&logo=sqlite&logoColor=white) |
| **AI and voice** | ![Gemini](https://img.shields.io/badge/Google_Gemini-8E75B2?style=flat-square&logo=googlegemini&logoColor=white) ![ElevenLabs](https://img.shields.io/badge/ElevenLabs-000000?style=flat-square&logo=elevenlabs&logoColor=white) ![llama.rn](https://img.shields.io/badge/llama.rn_(on_device)-555555?style=flat-square) ![Speech](https://img.shields.io/badge/expo--speech--recognition-000020?style=flat-square&logo=expo&logoColor=white) |
| **Payments** | ![PayPal](https://img.shields.io/badge/PayPal_REST_APIs-003087?style=flat-square&logo=paypal&logoColor=white) |
| **Infrastructure** | ![Docker](https://img.shields.io/badge/Docker_Compose-2496ED?style=flat-square&logo=docker&logoColor=white) ![Render](https://img.shields.io/badge/Render-000000?style=flat-square&logo=render&logoColor=white) ![EAS](https://img.shields.io/badge/EAS_Build-000020?style=flat-square&logo=expo&logoColor=white) ![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-2088FF?style=flat-square&logo=githubactions&logoColor=white) |
| **Testing** | ![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=flat-square&logo=vitest&logoColor=white) ![Jest](https://img.shields.io/badge/Jest-C21325?style=flat-square&logo=jest&logoColor=white) ![Supertest](https://img.shields.io/badge/Supertest-555555?style=flat-square) ![fast-check](https://img.shields.io/badge/fast--check-555555?style=flat-square) ![Postman](https://img.shields.io/badge/Postman-FF6C37?style=flat-square&logo=postman&logoColor=white) |

<details>
<summary>PayPal products used</summary>

| Product | Used for |
| :--- | :--- |
| Orders v2, intent `AUTHORIZE` | Locking an Offline vault with the customer's approval |
| Payments v2: capture, void, reauthorise | Settling vouchers, releasing unspent money, keeping holds valid |
| Orders v2, intent `CAPTURE` | Adding money to the Wallet, and pay links |
| Payouts | Withdrawals, and automatic cash-out of money received offline |
| Webhooks | Capture results, refunds, reversals and voids |

</details>

<details>
<summary>How the assistant decides</summary>

1. **Rules on the phone first.** Fixed, reviewed rules read clear requests ("collect 2k", "withdraw 5000", "add 10 Coke to stock") at once, online or offline.
2. **Gemini online** (`gemini-3.5-flash` through `@google/genai`, backend only) reads the rest, from text or recorded audio, and returns a structured proposal that the backend validates with Zod.
3. **On-device model offline** (optional download, `llama.rn`) runs only when the rules can't read a request. Its answer passes the same checks.
4. **The app acts, not the model.** Anything that moves no money is done at once. Anything that moves money is asked first, by voice, and then needs the person's fingerprint, PIN or PayPal sign-in.

The model never sees keys, tokens, balances or signed data. Each answer is logged with its outcome; what the person said is not logged.

</details>

## Built with

<p>
  <a href="https://developer.paypal.com"><img alt="PayPal" src="https://img.shields.io/badge/PayPal-003087?style=for-the-badge&logo=paypal&logoColor=white"></a>
  <a href="https://ai.google.dev"><img alt="Google Gemini" src="https://img.shields.io/badge/Google_Gemini-8E75B2?style=for-the-badge&logo=googlegemini&logoColor=white"></a>
  <a href="https://elevenlabs.io"><img alt="ElevenLabs" src="https://img.shields.io/badge/ElevenLabs-000000?style=for-the-badge&logo=elevenlabs&logoColor=white"></a>
  <a href="https://expo.dev"><img alt="Expo" src="https://img.shields.io/badge/Expo-000020?style=for-the-badge&logo=expo&logoColor=white"></a>
  <a href="https://render.com"><img alt="Render" src="https://img.shields.io/badge/Render-000000?style=for-the-badge&logo=render&logoColor=white"></a>
  <a href="https://github.com/ATA-African-Technology-Accelerator"><img alt="African Technology Accelerator" src="https://img.shields.io/badge/African_Technology_Accelerator-0B2F6E?style=for-the-badge"></a>
</p>

<!-- TODO: add the hackathon badge and link (for example Devpost) once the listing is public. -->

## Quickstart

> [!NOTE]
> T-Pay runs against the **PayPal sandbox** only. No real money moves.

**Prerequisites**

| Tool | Version | Needed for |
| :--- | :--- | :--- |
| Node.js | 22 or later | Backend, app tooling, tests |
| npm | Bundled with Node | Installing packages |
| Docker | Docker Desktop or Engine with Compose | Local PostgreSQL |
| PayPal developer account | Sandbox app credentials | Locking, settling, payouts |
| Android Studio and JDK | JDK 17 | Building and running the app |
| Google AI Studio key | Optional | Online assistant |
| ElevenLabs key | Optional | Natural voice |

**1. Clone**

```bash
git clone https://github.com/OlayiwolaSherrifSalawu/T-Pay_Public.git
cd T-Pay_Public
```

**2. Configure and start the backend**

```bash
cd backend
npm install
cp .env.example .env          # Windows: copy .env.example .env
npm run keys:root             # paste the two printed lines into .env
```

Set `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` in `backend/.env` (developer.paypal.com → Apps & Credentials, sandbox). Then:

```bash
npm run db:up                 # PostgreSQL 17 in Docker, on port 5433
npm run db:migrate
npm run dev                   # http://localhost:4000
```

Open http://localhost:4000/api/health. It reports `"database": "ok"` and `"paypal": "ok"`.

**3. Run the app**

```bash
cd ../frontend
npm install
cp .env.example .env
```

Set `EXPO_PUBLIC_API_URL` to the backend and `EXPO_PUBLIC_ROOT_PUBLIC_KEY` to the public key from `npm run keys:root`. The app uses native modules (Bluetooth, biometrics, speech, the on-device model), so it needs a development build, not Expo Go:

```bash
npx expo run:android                                  # phone or emulator
npx eas build --profile preview --platform android    # installable APK
```

> [!TIP]
> A phone can't reach `localhost`. Point `EXPO_PUBLIC_API_URL` at your laptop's network address or at the hosted backend, https://t-pay-public.onrender.com.

<details>
<summary>Check the PayPal sandbox end to end</summary>

```bash
cd backend
npm run paypal:proof
```

You approve one order in the browser. The script places a hold, makes two partial captures and releases the rest. If `PAYPAL_PROOF_PAYOUT_EMAIL` is set, it also sends a test payout.

</details>

<details>
<summary>Deploy the backend on Render</summary>

1. Create a **Web Service** from this repository with root directory `backend`.
2. Build command `npm install`; start command `npm run db:migrate && npm start`. Migrations are safe to repeat.
3. Add the environment variables below, with `PUBLIC_BASE_URL` set to the Render URL.
4. In the PayPal app, add a webhook to `https://<your-render-url>/api/webhooks/paypal` for `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.PENDING`, `PAYMENT.CAPTURE.DECLINED`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED`, `PAYMENT.AUTHORIZATION.VOIDED` and `CHECKOUT.PAYMENT-APPROVAL.REVERSED`, then set `PAYPAL_WEBHOOK_ID`.

</details>

## Using T-Pay

The full walkthrough, including a ten-minute test script for judges, is in the **[user guide](docs/T-Pay-User-Guide.md)**. In short:

1. **Set up** on each phone: language, name, PayPal (sandbox) email, a 4-digit PIN.
2. **Lock money** while online: Offline vault → Lock → amount and hours → from the Wallet or with a PayPal approval.
3. **Go offline.** Airplane mode on, Bluetooth on.
4. **Get paid:** the seller taps Get paid, or says "collect one thousand", and shows the QR code.
5. **Pay:** the customer taps Pay, scans it, and confirms with fingerprint or PIN. The payment reaches the seller over Bluetooth, or as a second QR code.
6. **Reconnect** either phone. The payment settles into the seller's Wallet and, with cash-out on, goes to their PayPal. The customer closes the vault to get unspent money back.

Say **"Hey T-Pay"** at any point to do any of this by voice.

> [!IMPORTANT]
> Hackathon submission rules: T-Pay runs on the PayPal **sandbox** only, needs **Android** phones, and every action that moves money ends with the person's fingerprint, PIN or PayPal sign-in. Judges' test accounts and the install link are listed in the [user guide](docs/T-Pay-User-Guide.md#for-judges-test-t-pay-in-ten-minutes).

## Configuration

**Backend** (`backend/.env`, template in [`backend/.env.example`](backend/.env.example))

| Name | Required | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | Yes | PostgreSQL connection string. Locally `postgres://tpay:tpay@localhost:5433/tpay`. |
| `ROOT_PRIVATE_KEY` | Yes | Signs device and vault certificates. Generate with `npm run keys:root`. Never leaves the backend. |
| `ROOT_PUBLIC_KEY` | Yes | The matching public key. The app ships with it. |
| `PAYPAL_CLIENT_ID` | Yes | PayPal sandbox app client ID |
| `PAYPAL_CLIENT_SECRET` | Yes | PayPal sandbox app secret |
| `PAYPAL_BASE_URL` | Yes | `https://api-m.sandbox.paypal.com` |
| `PUBLIC_BASE_URL` | Yes | Where PayPal returns the person after approval. `http://localhost:4000` locally. |
| `PAYPAL_WEBHOOK_ID` | For webhooks | ID of the PayPal webhook. Until it is set, every webhook is refused. |
| `GEMINI_API_KEY` | No | Google AI Studio key. Without it, the app uses its offline assistant. |
| `GEMINI_MODEL` | No | Defaults to `gemini-3.5-flash` |
| `GEMINI_TTS_MODEL` | No | Gemini voice for languages ElevenLabs doesn't cover. Defaults to `gemini-3.8-flash-tts`. |
| `ELEVENLABS_API_KEY` | No | Natural voice for English and Pidgin replies |
| `ELEVENLABS_VOICE_ID` | No | ElevenLabs voice. Defaults to the premade voice Liam. |
| `ELEVENLABS_MODEL` | No | Defaults to `eleven_flash_v2_5` |
| `FX_RATE` | No | Fixed demo rate in naira per US dollar. Defaults to `1500.00`. |
| `PORT` | No | Defaults to `4000` |
| `PAYPAL_PROOF_PAYOUT_EMAIL` | No | Sandbox email for the payout step of `npm run paypal:proof` |
| `TEST_DATABASE_URL` | No | Database for `npm run test:db`. Defaults to the local Docker database. |

**App** (`frontend/.env`, template in [`frontend/.env.example`](frontend/.env.example))

| Name | Required | Description |
| :--- | :--- | :--- |
| `EXPO_PUBLIC_API_URL` | Yes | Backend base URL |
| `EXPO_PUBLIC_ROOT_PUBLIC_KEY` | Yes | Root public key from `npm run keys:root`, used to verify certificates offline |

> [!WARNING]
> `EXPO_PUBLIC_` values are compiled into the app and are public. Never put a private key or API secret in `frontend/.env`.

## Repository layout

```text
T-Pay_Public/
├── backend/                  Node.js + Express API
│   ├── src/
│   │   ├── adapters/         PayPal, PostgreSQL, Gemini, ElevenLabs, crypto, clock
│   │   ├── controllers/      HTTP handlers, one per resource
│   │   ├── services/         Use cases: register, lock, settle, melt, withdraw, interpret
│   │   ├── routes/           Express routers under /api
│   │   ├── middleware/       Device auth, idempotency, rate limits, request log, errors
│   │   ├── validation/       Zod schemas for every request and model answer
│   │   └── composition/      Wiring, services and background jobs
│   ├── migrations/           SQL migrations, applied by npm run db:migrate
│   ├── scripts/              Root key, migrations, PayPal proof, Postman helper
│   ├── postman/              Postman collection
│   └── tests/                Vitest: domain, HTTP, adapters, PostgreSQL
├── shared/                   Payment rules used by phone and server, no dependencies
│   └── src/
│       ├── contracts/        API types, offline frames, messages, refusals
│       ├── domain/           Signing, certificates, vault capacity, FX, intent rules
│       └── application/      Use cases: create request, issue voucher, accept voucher
├── frontend/                 Expo (React Native) Android app
│   ├── src/
│   │   ├── features/         Screens: payment, vault, ledger, assistant, business, settings
│   │   ├── adapters/         API, storage, crypto, Bluetooth, speech, on-device AI
│   │   ├── sync/             Background sync and settlement submission
│   │   ├── i18n/             English, Pidgin, Yoruba, Igbo and Hausa text
│   │   └── components/       Shared UI
│   ├── modules/              Local native modules: keystore, radio, volume keys, download
│   └── assets/brand/         Logo, icon and splash
├── docs/                     PRD, API contract, backend and frontend workflows
└── .github/workflows/        CI: type checks and tests on every push
```

## Testing

```bash
# Backend and shared
cd backend
npm run lint        # type checks backend and shared/
npm test            # every test, in-memory storage
npm run db:up && npm run test:db   # the same suite on PostgreSQL, migrations included

# App
cd frontend
npm run typecheck
npm test
```

CI runs all of these on every push and pull request ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)). At the time of writing: 908 backend tests and 167 app tests pass.

## Security

- **Keys stay where they belong.** Each phone's signing key is created on the device and kept in Android secure storage; it is never sent anywhere. The root private key lives only in the backend environment.
- **Every payment is signed and checked twice.** The receiving phone verifies the voucher offline; the backend verifies it again before capturing anything.
- **People confirm money, not software.** Paying, withdrawing by voice, locking from the Wallet and closing a vault all need the fingerprint or PIN. The assistant never enters a PIN or password.
- **Secrets never reach the repository.** `.env` files are ignored by git; only `.env.example` templates with empty values are committed.
- **Requests are protected server-side.** Device-token authentication, idempotency keys on money-moving endpoints, rate limits, and PayPal webhook signature checks.
- **Personal data is kept out of logs.** What a person says to the assistant is not logged.

To report a vulnerability, please do **not** open a public issue. See [SECURITY.md](SECURITY.md).

## Roadmap

- [x] Offline vault funded from PayPal or the Wallet
- [x] Offline payments by QR code and Bluetooth, with signed vouchers and receipts
- [x] Settlement, automatic hold renewal and automatic cash-out
- [x] Wallet: add money, withdraw, pay links
- [x] Hands-free voice assistant with "Hey T-Pay", in five languages
- [x] Natural voice with ElevenLabs
- [x] Personal Budget and Stock & Inventory
- [x] CI for backend, shared rules and app
- [ ] Native-speaker review of Yoruba, Igbo and Hausa text
- [x] Public Android build
- [x] Landing page
- [ ] Demo video
- [ ] Live PayPal mode, with KYC
- [ ] Hardware-backed device keys
- [ ] Market exchange rates instead of a fixed demo rate
- [ ] Bank transfers
- [ ] iOS build

## Team

| | Name | Role | GitHub |
| :---: | :--- | :--- | :--- |
| <img src="https://github.com/OlayiwolaSherrifSalawu.png" width="56" alt=""> | Olayiwola Salawu | <!-- TODO: role --> | [@OlayiwolaSherrifSalawu](https://github.com/OlayiwolaSherrifSalawu) |
| <img src="https://github.com/BramTechxxvi.png" width="56" alt=""> | <!-- TODO: full name --> BramTechxxvi | <!-- TODO: role --> | [@BramTechxxvi](https://github.com/BramTechxxvi) |
| <img src="https://github.com/Maximoi22.png" width="56" alt=""> | Abdulmalik Olajuwon | <!-- TODO: role --> | [@Maximoi22](https://github.com/Maximoi22) |

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md) first.

- Branch from `main-copy` with a short prefixed name: `feat/voice-withdraw`, `fix/merchant-wait`, `docs/readme`.
- Write commits in the [Conventional Commits](https://www.conventionalcommits.org) style, for example `fix(app): move on when the seller is paid`.
- Run the type checks and tests above before opening a pull request.

## License

[MIT](LICENSE) © 2026 ATA (African Technology Accelerator)

<div align="center">
<sub>T-Pay · Smart payments. Online or off.</sub>
</div>
