---
title: T-Pay
subtitle: Frontend Engineer Workflow
tagline: Build the Android app one activity at a time
version: 1.0
date: 4 November 2026
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

**Out of scope:** iOS, Bluetooth before M3 is proven, budgeting and transit screens, the old web prototype, and any endpoint not in the contract.

## 2. Stack

| Need | Use |
| :--- | :--- |
| App | Expo SDK 58, React Native, TypeScript in strict mode |
| Navigation | Expo Router |
| Local database | `expo-sqlite` |
| Private key storage | `expo-secure-store` |
| Randomness | `expo-crypto` |
| Signing | `@noble/curves` inside an adapter that implements the shared `ISigner` port |
| Camera and QR | `expo-camera`, `react-native-qrcode-svg` |
| PayPal approval | `expo-web-browser`, deep link scheme `tpay://` |
| Connectivity | `@react-native-community/netinfo` |
| Voice | `expo-audio`, `expo-speech`, `expo-speech-recognition` |
| Tests | Jest with React Native Testing Library |
| Daily login | `expo-local-authentication` with the shared `AppLock` use case |

Do not add a state library or UI kit unless a ticket needs one. Keep the dependency list small.

## 3. Folder structure

```text
frontend/
  app/                     Expo Router routes only
  src/
    features/
      onboarding/          screens, components, hooks
      home/
      vault/
      payment/
      transactions/
      ledger/
      assistant/
      settings/
    components/            reusable design components
    theme/                 colours, spacing, typography
    i18n/                  en, pcm, yo, ig, ha catalogues
    adapters/
      api/                 HTTP client implementing ITPayApi
      crypto/              key store and signer
      storage/             SQLite repositories
      transport/           QR and copyable code
      speech/              speech adapters
      connectivity/        network adapter
    sync/                  background sync coordinator
    composition/           creates adapters and use cases
```

## 4. Clean code and SOLID rules

| Principle | What it means here |
| :--- | :--- |
| Single responsibility | A screen renders state and sends user intent. A hook coordinates one activity. An adapter talks to one device feature. |
| Open and closed | Add Nearby Connections as a new `IProximityTransport` adapter. Screens must not change. |
| Liskov substitution | QR, copy-code and fake transports all behave the same through the port, including failures. |
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

No activity in this section may wait for a network call. Test each one in airplane mode.

| ID | Device | Trigger | App steps | Result |
| :--- | :--- | :--- | :--- | :--- |
| ACT-06 | Merchant | Enter or speak an amount | Create a signed payment request, show QR and copyable code | Waiting for voucher |
| ACT-07 | Customer | Scan or paste request | Verify merchant certificate, show amount and merchant, confirm, reserve capacity and sequence, sign, then show voucher | Sent, not yet confirmed; pending debit |
| ACT-08 | Merchant | Scan or paste voucher | Verify certificates and signature, reject duplicates, save, show pending credit and receipt | Pending credit, or a clear refusal |
| ACT-09 | Customer | Scan or paste receipt | Verify and save receipt | Delivered |

If delivery fails, resend the same voucher bytes. Never sign the same payment again. If the receipt is never scanned, keep the amount reserved and show sent, not confirmed.

### 5.4 Sync and records

| ID | Screen and trigger | App steps | Network | Result |
| :--- | :--- | :--- | :--- | :--- |
| ACT-10 | Background, on connectivity or app open | Upload unsettled vouchers, then read updates | `POST /vouchers`, `GET /vouchers` | Local status updated with no tap |
| ACT-11 | Transaction list and detail | Read local data, refresh detail and history if online | `GET /vouchers/{id}`, `GET /transactions` | Shows status and capture ID |
| ACT-12 | Customer melts the vault | Stop signing, create spend statement, submit | `POST /vaults/{id}/melt` | Released now, or shows scheduled release and blocking voucher |
| ACT-13 | Active wallet | Read balance and entries | `GET /wallet` | Shows collected money linked to captures |
| ACT-14 | Withdraw to PayPal | Confirm amount and submit | `POST /wallet/withdrawals` | Pending withdrawal |

Only a backend response may set `SETTLED`. The phone must never decide this itself.

### 5.5 Voice and settings

| ID | Screen and trigger | App steps | Network | Result |
| :--- | :--- | :--- | :--- | :--- |
| ACT-15 | Assistant | Capture speech or text, send it, validate the proposal, pre-fill the screen, ask the person to confirm | `POST /assistant/interpret` | Proposal goes to ACT-06, ACT-07 or ACT-17 |
| ACT-15 offline | Assistant with no network | Use the shared rule-based parser, or tap and type input | None | Labelled as offline assistance |
| ACT-16 | Settings | Change language, view profile, key and assurance tier | `GET /profile`, `PATCH /profile` | Strings and profile update everywhere |
| ACT-17 | Merchant sale (P1) | Use shared merchant rules and speak stock result | None | Stock updated locally |

The assistant never signs, never skips confirmation, and never receives keys or tokens.

## 6. Ports you implement

The backend side publishes these interfaces in `shared/`. You provide the Android adapters.

| Port | Your adapter |
| :--- | :--- |
| `IKeyStore` | `SecureStoreKeyStore` |
| `ISigner` | `NobleP256Signer` |
| `IRandom` and `IClock` | Expo and device adapters |
| `ILocalVaultRepository` | `SqliteVaultRepository` |
| `ILocalVoucherRepository` | `SqliteVoucherRepository` |
| `ISeenVoucherRepository` | `SqliteSeenVoucherRepository` |
| `IProximityTransport` | `QrTransport`, `CopyCodeTransport` |
| `ITPayApi` | `HttpTPayApi` |
| `IConnectivity` | `NetInfoConnectivity` |
| `ISpeechInput` and `ISpeechOutput` | Expo speech adapters |
| `IPinStore` | `SecureStorePinStore` |
| `IBiometricUnlock` | `ExpoBiometricUnlock` |

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
| FE-08 | Test Nearby for up to half a day; keep QR if it fails | FE-06 | 7 Nov |
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
2. Offline activities work in airplane mode.
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
