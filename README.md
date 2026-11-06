# T-Pay: Hybrid SLM & Time-Locked Offline Market Vault

> **Zero-connectivity mobile commerce & PayPal offline escrow engineered for Africa's blackout crisis.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React 19](https://img.shields.io/badge/React-19.0-61DAFB?style=flat&logo=react&logoColor=black)](https://react.dev/)
[![React Native Expo](https://img.shields.io/badge/Expo-52.0-000020?style=flat&logo=expo&logoColor=white)](https://expo.dev/)
[![DDD Clean Architecture](https://img.shields.io/badge/Architecture-DDD%20Clean%20Architecture-10b981?style=flat)](./docs/DDD_ARCHITECTURE.md)
[![Verification Suite](https://img.shields.io/badge/Tests-9%2F9%20Passed%20(100%25)-brightgreen?style=flat)](./shared/src/__tests__/domain-verification.ts)
[![PayPal Hackathon](https://img.shields.io/badge/PayPal-Offline%20Escrow%20Ready-003087?style=flat&logo=paypal&logoColor=white)](https://developer.paypal.com/)

---

> **Project status (November 2026).** The claims below describe the target product, not the current build. An audit of the codebase found 7 of 23 capabilities met, 9 simulated or partial, and 7 missing — most importantly, device keys, voucher signatures and server-side settlement are prototypes. Read [docs/T-Pay-PRD.pdf](docs/T-Pay-PRD.pdf) for the itemized register, the requirement gaps, and the binding architecture rules; [docs/T-Pay-PRD.md](docs/T-Pay-PRD.md) is the editable source, running `npm run pdf` in `docs/` rebuilds it, and `npm run verify` fails if the committed PDF has drifted from that source.

---

## 🌍 1. The Reality: The African Blackout Crisis

In Nigeria and across sub-Saharan Africa, over **40% of digital point-of-sale transactions fail during grid outages and cellular network blackouts**. 

- **Merchant Reality**: Informal market traders (e.g. Mama Nkechi) juggle 3 to 5 clunky bank POS terminals hoping at least one has signal. When networks collapse, commerce reverts to unrecorded cash or stalls entirely.
- **Literacy Barrier**: Millions of market sellers cannot read or write spreadsheet formulas, making traditional accounting apps useless.
- **Double-Spend Fraud**: Existing "offline payment" attempts fail because unscrupulous actors double-spend their offline balances before syncing.

**T-Pay solves this with a dual-engine breakthrough**:
1. **The Time-Locked Market Vault ("The Budget-Locked Vault")**: Cryptographic pre-authorization on PayPal servers that completely eliminates offline double-spending.
2. **On-Device Hybrid Voice AI**: Natural speech recognition and audio readout in **Nigerian Pidgin, Yoruba, Igbo, Hausa, and English** that automates inventory deduction and physical cash audits without touching a spreadsheet.

---

## ⚡ 2. Core Architectural Pillars

```mermaid
flowchart TD
    subgraph OnlineState["Step 1: Online Pre-Authorization (PayPal Cloud)"]
        User["User App"] -->|"Pre-Auth Lock ₦10,000\n(5 Hours)"| PayPal["PayPal API Gateway"]
        PayPal -->|"Cryptographic Lock\nHMAC-SHA256 Token"| Vault["Time-Locked Market Vault"]
    end

    subgraph BlackoutState["Step 2: Blackout Zone (Zero Internet / BLE Mesh)"]
        Vault -->|"Signed Offline Voucher\n-₦2,000 for Coke"| Merchant["Merchant (Mama Nkechi)"]
        Merchant -->|"Natural Voice:\n'Collect 1k for coke'"| SLM["On-Device Hybrid SLM"]
        SLM -->|"Price-to-Qty Derivation"| Inventory["Stock -2 Bottles\nCash +₦1,000"]
    end

    subgraph SettlementState["Step 3: Opportunistic Clearinghouse"]
        Merchant -->|"Either device reconnects\nto internet first"| Clearing["Opportunistic Sync"]
        Clearing -->|"Transmits Cryptogram"| PayPal
        PayPal -->|"Settles Funds to Merchant\nAuto-Melts Unspent back to User"| Settle["Final Settlement"]
    end
```

### 1. The Time-Locked Market Vault ("The Big Gun")
- **Online Pre-Funding**: While connected, the user pre-authorizes an offline shopping budget (e.g., ₦10,000 for 5 or 24 hours). PayPal's cloud places a cryptographic pre-auth hold on the user's balance.
- **Zero Double-Spend**: Because the funds are locked on PayPal's servers, the user cannot spend that money elsewhere while offline. Every offline spend produces an HMAC-SHA256 voucher verified against the pre-auth.
- **Opportunistic Clearinghouse**: Whichever peer reconnects to the internet first transmits the cryptogram to PayPal APIs for settlement.
- **Auto-Melt Guarantee**: When the timer expires, any unspent funds automatically dissolve back into the user's primary PayPal checking account.

### 2. Zero-Literacy Hybrid Voice AI
- Runs locally offline via **Mobile SLM (Small Language Model)** with online Gemini cloud fallback.
- Native dialect comprehension for **Nigerian Pidgin, Yoruba, Igbo, Hausa, and English**.
- **Spoken Audio Readout**: Closes the literacy gap by speaking confirmations, inventory levels, and reconciliation summaries aloud so informal traders never need to read a screen.

### 3. The 3 Specification Demo Personas
- **Case 1: Mama Nkechi Provisions (Market Trader)**
  - Natural voice sale: *"Collect 1k for coke"*.
  - AI calculates price-to-quantity: ₦1,000 ÷ ₦500 unit price = auto-deducts 2 bottles from stock and logs ₦1,000 cash.
  - Spoken inventory sheet setup: *"Coke, 42 packs, 500 naira for 1; Maltina, 56 packs, 600 for 1"*.
  - Interactive **End-of-Day Physical Stock Audit & Cash Reconciliation** modal with spoken review.
- **Case 2: Salary Earner (Personal Budgeting)**
  - Budgets for Food (₦60k), Transport (₦30k), and Upkeep (₦40k).
  - *"Send 2k for spag"* auto-categorizes under Food budget with a note.
  - Conversational ambiguity resolution: *"Send 5k for sneakers"* prompts the user: *"Does this fall under Food, Transport, or Upkeep?"* with 1-tap classification.
- **Case 3: Morufu Transport (7-Seater Korope Mini-Bus)**
  - Driver announces *"Collect money from everybody"*.
  - Proximity Bluetooth BLE mesh sweeps all passenger devices.
  - Audio alert to driver: *"5 passengers have paid. You have 2 seats left."*

---

## 🏗️ 3. Clean Architecture & Domain-Driven Design (DDD)

The codebase strictly adheres to DDD Clean Architecture in [`shared/src/`](./shared/src/):

```
shared/src/
├── banking/              # BankAccount Aggregate, Balance Value Object
├── escrow/               # Time-Locked Market Vault & Offline Escrow Tokens
│   ├── domain/           # MarketVault Aggregate Root, Domain Events
│   ├── application/      # LockMarketVaultUseCase, MeltMarketVaultUseCase
│   └── infrastructure/   # LocalStorage & PayPal Gateway Adapters
├── resource-tracking/    # Smart Resource Tracking
│   ├── merchant/         # InventoryItem Aggregate, Price-to-Quantity derivation
│   ├── budget/           # MonthlyBudget Aggregate, Ambiguity Resolver
│   └── transit/          # KoropeTrip Aggregate (7-Seater Manifest)
├── assistant/            # Hybrid SLM NLP Parser, Speech Synthesis Adapter
└── __tests__/            # Verification suite (9/9 domain tests passing)
```

To run the architectural domain verification suite:
```bash
cd backend
npm run test:domain
```

---

## 🚀 4. Quickstart Guide

### Backend

```bash
cd backend
npm install
npm start
```

The API runs on port 4000. Copy `backend/.env.example` to `backend/.env` for local settings.

### Web prototype (retired, design reference only)

```bash
cd frontend/web-prototype
npm install
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)** in your browser.

### Mobile app (Expo)

```bash
# 1. Navigate to the mobile app directory
cd frontend

# 2. Install the app's own dependencies
npm install

# 3. Start the Expo development server
npm start
# or: npx expo start --web
```

---

## 🏆 5. Judge Interactive Demo Walkthrough (5-Minute Tour)

For hackathon judges evaluating T-Pay:

1. **The Header & Pitch Hub**:
   - Tap **"🏆 Pitch Hub"** in the top header or hamburger menu.
   - Explore the **Pitch Deck**, the **3 Live Cases**, the **Vault Architecture**, and the **B2B Strategy**.
2. **Experience the Market Vault ("The Big Gun")**:
   - Tap **"🛡️ Vault"** in the top navigation.
   - Select **₦10,000** budget and **5 Hours** duration.
   - Tap **"Lock ₦10,000 on PayPal"** to see live countdown, HMAC-SHA256 hash, and PayPal Pre-Auth ID.
   - Tap **"Simulate Spend ₦2,000 at Mama Nkechi"** to see offline cryptographic voucher creation.
   - Tap **"Auto-Melt Unspent"** to see unspent funds return to checking balance.
3. **Experience the 3 Smart Resource Tracker Personas**:
   - Switch to the **Tracker** tab:
     - **Mama Nkechi**: Tap *"Collect 1k for coke"* to see price-to-quantity derivation (-2 bottles Coke, +₦1,000 cash). Tap *"Daily Stock Review & Audit"* to hear spoken reconciliation.
     - **Salary Budget**: Tap *"Send 2k for spag"* to see auto-budget tagging. Tap *"Send 5k for sneakers"* to test conversational ambiguity resolution.
     - **Morufu Korope**: See the 7-seat mini-bus manifest. Tap *"Collect money from everybody"* to run the Bluetooth proximity sweep and fill the manifest.
4. **Experience the Multilingual Voice Assistant**:
   - Long-press the center circular button with opposing half-barb arrows.
   - Switch dialects between **🇳🇬 Pidgin, 🇬🇧 English, 🇳🇬 Yoruba, 🇳🇬 Igbo, and 🇳🇬 Hausa**.
   - Tap any voice scenario to trigger audio speech synthesis read aloud.

---

## 📈 6. Commercial Strategy: Ecosystem to Open B2B Protocol

- **Phase 1 (Hackathon Launch)**: Closed-loop ecosystem launch for PayPal wallet holders. Gives T-Pay users exclusive access to the Secure Offline Budget Vault.
- **
---

## 📄 License
MIT © 2026 T-Pay Team.
