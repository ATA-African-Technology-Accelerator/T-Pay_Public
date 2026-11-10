---
title: T-Pay
subtitle: Frontend Engineer Workflow
tagline: Build the Android app one activity at a time
version: 1.1
date: 10 November 2026
author: T-Pay engineering
status: Binding for frontend work. Derived from PRD v1.1 and the API contract.
compact: true
---

## 1. Your job

You own the Android app in `frontend/`. A customer and a merchant use it to complete a PayPal-backed payment with no network. Read PRD sections 3.1, 3.6, 3.8 and 6, then the [API contract](T-Pay-API-Contract.md). The contract is the source of truth for activities and endpoints, and the [backend workflow](T-Pay-Backend-Workflow.md) shows what your teammate is building.

| You own | The backend side owns |
| :--- | :--- |
| Screens, navigation, design and language catalogue | API, PayPal, Postgres, Gemini, certificates and settlement |
| Android adapters for keys, SQLite, camera, QR and speech | Payment rules and contract types in `shared/` |
| Offline user flows | Deciding when a voucher is settled |
| Showing every contract error correctly | Producing contract responses and errors |

**Out of scope:** iOS, NFC, Bluetooth before the QR flow in FE-06 works, budgeting and transit screens, the old web prototype, and any endpoint not in the contract.

## 2. Stack

| Need | Use |
| :--- | :--- |
| App | Expo SDK 58, React Native, TypeScript in strict mode |
| Navigation | A typed stack navigator in `src/nav.tsx`. Payment screens hand signed requests and vouchers to the next screen in memory; file-based routes would put them in URLs, where a deep link could expose or replay them |
| Local database | `expo-sqlite` |
| Private key storage | The Android Keystore, in StrongBox when the phone has it, through the local `modules/tpay-keystore` module. `expo-secure-store` keeps only the key's name, the session and the PIN hash |
| Randomness | `expo-crypto` |
| Signing | Keystore signatures, converted to the contract format by `DeviceSigner`, which implements the shared `ISigner` port. `@noble/curves` verifies and hashes, and signs only in web and development builds |
| Camera and QR | `expo-camera`, `react-native-qrcode-svg` |
| Bluetooth | `expo-nearby-connections`, with the Android Nearby devices permission and the system request to turn Bluetooth on |
| PayPal approval | `expo-web-browser`, deep link scheme `tpay://` |
| Connectivity | `@react-native-community/netinfo` |
| Voice | `expo-audio`, `expo-speech`, `expo-speech-recognition` |
| Tests | Jest with React Native Testing Library |
| Daily login | `expo-local-authentication` with the shared `AppLock` use case |

Do not add a state library or UI kit unless a ticket needs one. Keep the dependency list small.

## 3. Folder structure

```text
frontend/
  modules/
    tpay-keystore/         Android Keystore key and signing (native)
    tpay-radio/            Bluetooth state and the turn-on request (native)
  src/
    App.tsx                routes, unlock, re-lock and the tpay:// return
    nav.tsx                typed stack navigator
    features/
      onboarding/          splash, language, details, PIN and lock
      home/
      vault/               screens and vault activities (ACT-03 to ACT-05, ACT-12)
      payment/             screens, payment activities and the Bluetooth link (ACT-06 to ACT-09)
      transactions/        history and receipts (ACT-11)
      ledger/              Active wallet and withdraw (ACT-13, ACT-14)
      assistant/           speak, proposals and typed input (ACT-15)
      settings/            profile, language, security and help (ACT-16)
    state/                 app state read from SQLite and the last sync
    components/            reusable design components
    theme/                 colours, spacing, typography
    i18n/                  en, pcm, yo, ig, ha catalogues
    adapters/
      api/                 HTTP client implementing ITPayApi
      crypto/              key store and signer
      storage/             SQLite repositories and secure values
      transport/           Nearby (Bluetooth); QR and copy code are drawn by the payment screens
      speech/              speech adapters
      connectivity/        network adapter
    session/               registration, profile and the session guard
    sync/                  background sync coordinator
    composition/           creates adapters
```

## 4. Clean code and SOLID rules

| Principle | What it means here |
| :--- | :--- |
| Single responsibility | A screen renders state and sends user intent. A hook coordinates one activity. An adapter talks to one device feature. |
| Open and closed | Nearby Connections is added as an `INearbyTransport` adapter. Its channels are `IProximityTransport`s, so the payment hooks send and receive frames the same way. |
| Liskov substitution | QR, copy-code, Nearby and fake transports all behave the same through `IProximityTransport`, including failures. |
| Interface segregation | A screen receives only the use case it needs, not the whole container. |
| Dependency inversion | Features depend on ports from `shared/`. Only `src/composition/` creates concrete adapters. |

| Clean code rule | Standard |
| :--- | :--- |
| Business rules | Never in a component. Capacity, signing, certificate and status rules come from `shared/`. |
| Domain state | SQLite and the sync result are the owners. No screen keeps a private copy (FR-35). |
| Money | Integer minor units in code. Format only at the screen edge. Never use a float. |
| Text | Every visible and spoken string comes from `src/i18n/`. |
| Names | Use the contract's words, such as vault, voucher, receipt and settle-by. |
| Functions and files | One clear purpose. Split a screen when it mixes unrelated concerns. |
| Errors | Handle contract codes by name. Never show raw server text. |
| Fake behaviour | No fake success, timers or random identifiers in production code. |
| Comments | Explain why, not what. Delete unused code. |

## 5. Activity specifications

The IDs match the API contract. Each activity must show loading, success, empty, offline and failure states where they apply.

### 5.1 Setup and home

| ID | Screen and trigger | App steps | Network | Result |
| :--- | :--- | :--- | :--- | :--- |
| ACT-01 | Splash on app open | Load the key and identity, then unlock with PIN or fingerprint; renew the certificate if near expiry and online | `POST /devices/register` for renewal only | Go to onboarding or home |
| ACT-02 | Language, name, PayPal email and PIN | Create the PIN, create proof, register, store token and certificate | `POST /devices/register` | Go to home with Tier B badge |
| ACT-03 | Home | Show local vault, reserved and remaining amounts; refresh if online | `GET /vaults/current` | Offline home still works |

### 5.2 Locking a vault

| ID | Screen and trigger | App steps | Network | Result |
| :--- | :--- | :--- | :--- | :--- |
| ACT-04 | Customer chooses amount and duration | Validate, then request an order | `POST /vaults` | Receive `approvalUrl` |
| ACT-05 | PayPal in-app browser | Open approval, wait for `tpay://vault/return`, authorise, store the certificate | `POST /vaults/{id}/authorize` | Vault active; cancel returns with no vault |

### 5.3 Offline payment

No activity in this section may wait for a network call. Test each one in airplane mode with Bluetooth turned back on, and again with Bluetooth off to prove the QR fallback.

With Bluetooth there is one scan: the customer scans the merchant's request, and the voucher and receipt travel over Bluetooth. Without it, the voucher and receipt are scanned as QR codes. The [API contract](T-Pay-API-Contract.md) section 5.4 defines the frames and the transport steps.

| ID | Device | Trigger | App steps | Result |
| :--- | :--- | :--- | :--- | :--- |
| ACT-06 | Merchant | Enter or speak an amount | Check Bluetooth readiness and prompt only for what is missing. Create a signed payment request; if Bluetooth is ready, add a session code from `IRandom.nonce()` and start hosting. Show the request QR and copyable code, and keep a voucher scanner ready | Waiting for voucher |
| ACT-07 | Customer | Scan or paste request | Decode the frame, verify the merchant certificate, show amount and merchant. If the frame has a session code, prompt only for what is missing and join in the background. On **Pay**, reserve capacity and sequence, sign, then send the voucher frame over Bluetooth, or show the voucher QR | Sent, not yet confirmed; pending debit |
| ACT-08 | Merchant | Voucher arrives over Bluetooth, or is scanned or pasted | Verify certificates and signature, reject duplicates, save, show pending credit, then send the receipt over the same Bluetooth channel, or show the receipt QR | Pending credit, or a clear refusal |
| ACT-09 | Customer | Receipt arrives over Bluetooth, or is scanned or pasted | Verify and save receipt | Delivered |

**Bluetooth prompts.** Call `INearbyTransport.readiness()` first. Only when it isn't `READY`, call `requestReady()`, which shows the Android permission prompt, then the system request to turn Bluetooth on. On Android 11 and older, Nearby also needs location services on. A person who already has both never sees a prompt. Never block a payment on the answer.

| Readiness after prompting | Merchant | Customer |
| :--- | :--- | :--- |
| `READY` | Add the session code and host | Join, then send over Bluetooth |
| `NEEDS_PERMISSION`, `BLUETOOTH_OFF` or `UNSUPPORTED` | Show the QR without a session code | Show the voucher QR |

**Fallback.** Abort `join` and show the voucher QR if the channel isn't open within 8 seconds of tapping **Pay**, or if sending fails. On the merchant phone, abort `host` as soon as a voucher is scanned instead. Close every channel when the activity ends.

If delivery fails, resend the same voucher frame, which `encodeFrame` makes identical every time. Never sign the same payment again. If the receipt never arrives, keep the amount reserved and show sent, not confirmed.

### 5.4 Sync and records

| ID | Screen and trigger | App steps | Network | Result |
| :--- | :--- | :--- | :--- | :--- |
| ACT-10 | Background, on connectivity or app open | Upload unsettled vouchers, then read updates | `POST /vouchers`, `GET /vouchers` | Local status updated with no tap |
| ACT-11 | Transaction list and detail | Read local data, refresh detail and history if online | `GET /vouchers/{id}`, `GET /transactions` | Shows status and capture ID |
| ACT-12 | Customer melts the vault | Stop signing, create spend statement, submit | `POST /vaults/{id}/melt` | Released now, or shows scheduled release and blocking voucher |
| ACT-13 | Active wallet | Read balance and entries | `GET /wallet` | Shows collected money linked to captures |
| ACT-14 | Withdraw to PayPal | Confirm amount and submit | `POST /wallet/withdrawals` | Pending withdrawal |

Only a backend response may set `SETTLED`. The phone must never decide this itself.

**Sending the full vault record.** The backend keeps the PayPal hold until the customer's T-Pay app has reported everything, for up to `settleBy`, about 28 days. So once spend-by has passed and the customer's phone is online, ACT-10 uploads every voucher this phone signed, then starts ACT-12 with no tap, sending the spend statement. The person sees that their unspent money is being released. Opening PayPal on its own never releases the hold. Always show `settleBy` and `paypalAuthorizationId` from the latest backend response, because the authorisation ID changes every three days while the vault waits.

### 5.5 Voice and settings

| ID | Screen and trigger | App steps | Network | Result |
| :--- | :--- | :--- | :--- | :--- |
| ACT-15 | Assistant | Capture speech or text, send it, validate the proposal, pre-fill the screen, ask the person to confirm | `POST /assistant/interpret` | Proposal goes to ACT-06, ACT-07 or ACT-17 |
| ACT-15 offline | Assistant with no network | Use the shared rule-based parser. If the person downloaded the offline assistant from Settings, also ask the model on the phone (llama.rn, Qwen2.5 0.5B Instruct) and merge: the rules win where they recognise something, the model fills the gaps, and `checkModelProposal` checks its answer. Tap and type input always work | None | Labelled "AI on your phone" when the model answered, otherwise as offline assistance |
| ACT-16 | Settings | Change language, view profile, key and assurance tier | `GET /profile`, `PATCH /profile` | Strings and profile update everywhere |
| ACT-17 | Merchant sale (P1) | Use shared merchant rules and speak stock result | None | Stock updated locally |

The assistant never signs, never skips confirmation, and never receives keys or tokens.

## 6. Ports you implement

The backend side publishes these interfaces in `shared/`. You provide the Android adapters.

| Port | Your adapter |
| :--- | :--- |
| `IKeyStore` | `SecureKeyStore`, which keeps the Keystore key's name |
| `ISigner` | `DeviceSigner` |
| `IRandom` and `IClock` | `secureRandom` and `systemClock` |
| `ILocalVaultRepository` | `LocalStore.vaults`, on SQLite |
| `ILocalVoucherRepository` | `LocalStore.vouchers`, on SQLite |
| `ISeenVoucherRepository` | `LocalStore.seen`, on SQLite |
| `IProximityTransport` | QR and copy code are the same frame text drawn by `FrameCode` and read by the scan screen; Nearby channels below |
| `INearbyTransport` | `NearbyTransport`, whose `host` and `join` return `IProximityChannel`s |
| `ITPayApi` | `HttpTPayApi` |
| `IConnectivity` | `NetInfoConnectivity` |
| `ISpeechInput` and `ISpeechOutput` | `ExpoSpeechInput` and `ExpoSpeechOutput` |
| `IPinStore` | `SecurePinStore` |
| `IBiometricUnlock` | `DeviceBiometrics` |

A voucher and the sequence it used are written in one SQLite transaction before the frame is shown or sent. The backend releases a hold only when sequences 1 to `lastSequence` have all arrived, so no sequence may be skipped or reused.

### 6.1 Device keys and signing

Each phone creates its own key pair on first launch. No key is written into the code, except the T-Pay root public key.

| Key | Where it lives | Purpose |
| :--- | :--- | :--- |
| Device private key | Created inside the Android Keystore (StrongBox when present) and never leaves it. Web and development builds fall back to a software key in `expo-secure-store` | Signs registration, vouchers, receipts, payment requests and spend statements |
| Device public key | Sent once in `POST /devices/register` and stored by the backend | Lets the backend and other phones check this phone's signatures |
| T-Pay root public key | Built into the app | Checks device and vault certificates offline |
| T-Pay root private key | Backend `.env` only | Signs certificates. The app never sees it |

If the app is reinstalled, the private key is lost. The phone creates a new key pair and registers again as a new identity.

**Formats.** These must match the backend exactly, or every request fails with `INVALID_SIGNATURE`.

| Item | Format |
| :--- | :--- |
| Curve and hash | ECDSA P-256 (prime256v1) with SHA-256 |
| Private key | 32 raw bytes, base64url |
| Public key | 65-byte uncompressed point starting with `0x04`, base64url |
| Signature | 64 raw bytes `r‖s` with low S, base64url |
| Hash, for `voucherHash` | SHA-256 of the canonical JSON, base64url |
| Signed text | Domain prefix, a newline, then the canonical JSON of the payload |

Build the signed text only with `signingInput` and `MESSAGE_PREFIX` from `shared/`. Never use `JSON.stringify`.

| Message | Prefix |
| :--- | :--- |
| Registration proof | `TPAY-REGISTER-V1` |
| Payment request | `TPAY-REQUEST-V1` |
| Voucher | `TPAY-VOUCHER-V1` |
| Receipt | `TPAY-RECEIPT-V1` |
| Spend statement | `TPAY-STATEMENT-V1` |
| Device certificate, checked only | `TPAY-DEVICE-CERT-V1` |
| Vault certificate, checked only | `TPAY-VAULT-CERT-V1` |

**`NobleP256Signer`.** The backend tests already prove that these `@noble/curves` calls work with the backend:

```ts
import { p256 } from '@noble/curves/nist.js';

const secretKey = p256.utils.randomSecretKey();
const publicKey = p256.getPublicKey(secretKey, false);
const signature = p256.sign(new TextEncoder().encode(signingInput), secretKey);
const valid = p256.verify(signature, new TextEncoder().encode(signingInput), publicKey);
```

`p256.sign` hashes with SHA-256, returns 64 raw bytes and uses low S by default. Pass `false` to `getPublicKey` to get the uncompressed key. Convert the bytes to and from base64url.

**Registration proof.** The proof is a signature over the other four fields:

```text
TPAY-REGISTER-V1
{"displayName":"Ada","language":"en","payoutEmail":"ada@example.com","publicKey":"BHk3..."}
```

```ts
const payload = { publicKey, displayName, language, payoutEmail };
const proof = await signer.sign(signingInput(MESSAGE_PREFIX.REGISTRATION, payload), privateKey);
await api.registerDevice({ ...payload, proof });
```

The backend rebuilds the same text from the request and checks it with the `publicKey` sent. Changing any field after signing gives `INVALID_SIGNATURE`. Save `deviceToken` and `deviceCertificate` from the response in secure storage.

**How public keys are found later.**

- **Online:** the backend never trusts a key sent with a voucher. It loads the payer's key from the vault's owner and the payee's key by `payeeKeyId`.
- **Offline:** each phone shares its device certificate, which contains its public key and is signed by T-Pay. The other phone checks the certificate with the built-in root public key, then uses the public key inside it.

**Check your adapter.** Register through your `NobleP256Signer`. A `201` response means the key and signature formats match. To compare with a working example, run `npm run postman -- device ada` in `backend/`. It prints a valid registration body made with the same steps.

## 7. Tickets

Each ticket needs a branch, a pull request, and the activity ID in its title.

| Ticket | Work | Depends on | Target |
| :--- | :--- | :--- | :--- |
| FE-01 | Replace the prototype Expo app with SDK 58, strict TypeScript, Expo Router, theme and icon | None | 5 Nov |
| FE-02 | Link `@tpay/shared` through Metro and show a contract type in use | BE-02 | 5 Nov |
| FE-03 | Design components and language catalogue structure | FE-01 | 5 Nov |
| FE-04 | Key store, SQLite setup and app composition | FE-01 | 5 Nov |
| FE-05 | ACT-01, ACT-02 and ACT-16 | FE-04, BE-05 | 6 Nov |
| FE-06 | ACT-06 to ACT-09 with QR and copy code, on a fake vault | BE-04, FE-04 | 6–7 Nov |
| FE-07 | ACT-03 to ACT-05, with PayPal approval and deep link | BE-06 | 7 Nov |
| FE-08 | `NearbyTransport`, Bluetooth prompts and the one-scan flow, with QR fallback. Test for up to half a day on two phones; keep QR only if it fails | FE-06 | 10 Nov |
| FE-09 | ACT-10 sync coordinator | BE-08 | 8 Nov |
| FE-10 | ACT-11, ACT-12 and ACT-13, ACT-14 | BE-07, BE-09, BE-10 | 9 Nov |
| FE-11 | ACT-15 with online and offline paths | BE-11 | 9 Nov |
| FE-12 | Five-language strings, accessibility, and every empty, error and blocked state | Native-speaker reviewers | 10 Nov |
| FE-13 | Run the two-phone checklist, kill test and signed APK build | All P0 | 10–11 Nov |
| FE-14 | ACT-17 if all P0 work is verified | NOne | 10 Nov |

Until an endpoint is live, use a fake `ITPayApi` in tests or a development build only. Fakes never ship in the production path.

## 8. Definition of done

A ticket is done only when:

1. Its activity behaves as specified on a real Android phone.
2. Offline activities work in airplane mode, both with Bluetooth turned back on and with it off.
3. Loading, empty, offline and failure states are complete.
4. All strings come from the catalogue.
5. TypeScript and tests pass.
6. No domain rule, private state copy, secret, float amount or fake flow was added.
7. The change maps to an activity and PRD requirement.
8. A teammate reviewed the pull request.

## 9. Working with the backend

| Topic | Rule |
| :--- | :--- |
| Daily sync | Share what merged, what is next, and any contract question. |
| Contract gap | Stop and propose a contract change. Never guess or call an unlisted endpoint. |
| `shared/` change | Request it through the backend owner. |
| Secrets | The app never contains PayPal or Gemini secrets. |
| Branch names | `feature/fe-05-act-02-registration` |
| Commit messages | Short, imperative, and tied to one purpose |
