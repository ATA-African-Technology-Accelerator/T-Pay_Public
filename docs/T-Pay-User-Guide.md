# T-Pay user guide

How to install T-Pay, set it up, and use every part of it: locking money, paying with no network, getting paid, the Wallet, and the voice assistant. The last section is a ten-minute test script for judges.

T-Pay runs on the **PayPal sandbox**. No real money moves.

## Contents

- [What you need](#what-you-need)
- [Install and set up](#install-and-set-up)
- [The Home screen](#the-home-screen)
- [Lock money for offline use](#lock-money-for-offline-use)
- [Pay with no network](#pay-with-no-network)
- [Get paid with no network](#get-paid-with-no-network)
- [The Wallet: add, withdraw, pay links](#the-wallet-add-withdraw-pay-links)
- [Close the vault](#close-the-vault)
- [Talk to T-Pay](#talk-to-t-pay)
- [Business accounts: stock and sales](#business-accounts-stock-and-sales)
- [Settings](#settings)
- [For judges: test T-Pay in ten minutes](#for-judges-test-t-pay-in-ten-minutes)
- [Known limits](#known-limits)
- [If something goes wrong](#if-something-goes-wrong)

## What you need

| Item | Why |
| :--- | :--- |
| Two Android phones (Android 8 or later) | One pays, one gets paid. One phone can still lock money, use the Wallet and talk to the assistant. |
| Bluetooth on both phones | Carries the payment between the phones with no network. Without it, a second QR code does the same job. |
| A PayPal **sandbox** account | Approves the hold when you lock money from PayPal, and receives withdrawals. The three test logins, and which one not to use in the app, are in [T-Pay test accounts](T-Pay-Test-Accounts.md). |
| Internet, at the start and at the end | To lock money and to settle. The payment itself needs none. |

## Install and set up

1. **Install the app.** Open the [download link](https://expo.dev/accounts/olayiwola206/projects/tpay-mobile/builds/9a8af0e5-d058-494f-8756-fb112fdac3d5) on each phone and install the APK. Android may ask you to allow installs from this source.
2. **Choose a language.** English, Nigerian Pidgin, Yoruba, Igbo or Hausa. You can change it later from the menu.
3. **Enter your name and PayPal email.** The name is what the other person sees when you pay or get paid. The PayPal email is where withdrawals go.
4. **Create a 4-digit PIN.** The PIN opens the app and confirms anything that moves money. If the phone has a fingerprint reader, you can use that instead of the PIN.
5. **Allow the permissions** when asked: camera (to scan codes), microphone (to talk to T-Pay), and nearby devices or Bluetooth (to pass payments between phones).

The phone is now registered. Its signing key was created on the phone and never leaves it.

> The app locks itself after a minute in the background. Enter the PIN or use your fingerprint to continue.

## The Home screen

Home shows two balances. Tap the tab at the top to switch between them.

| Tab | What it holds | Actions |
| :--- | :--- | :--- |
| **Offline vault** | Money you locked, ready to spend with no network | Pay, Lock (or Vault when one is open), Receive, Activity |
| **Wallet** | Money you received and money you added | Receive, Add money, Withdraw, Received |

- The **eye** hides the balance; the **speaker** reads it out.
- The **bell** shows money that arrived and anything that needs you, such as a lock waiting for PayPal approval.
- The **three-line menu** (top left) opens every screen: Activity, Received, Speak, Profile, Stock & Inventory or Personal Budget, language, lock the app, and help.
- The bottom bar has Home, Vault (or Stock for businesses), **Speak**, Activity and Profile.

## Lock money for offline use

Money has to be locked while you are online before you can spend it offline.

1. On Home, choose the **Offline vault** tab and tap **Lock**. Or tap **Pay** with nothing locked, and T-Pay explains and offers to lock money.
2. Enter the amount in naira and choose how long it can be spent: **6, 12 or 24 hours**.
3. Choose where the money comes from:
   - **From the Wallet**, if the Wallet holds enough. Confirm with your fingerprint or PIN. Done at once.
   - **With PayPal**. T-Pay opens PayPal, you sign in with the sandbox account and approve. PayPal places a hold for the amount; nothing is taken until you pay someone.
4. Home now shows the locked amount and the time left to spend it.

One vault is open at a time. Money you don't spend comes back when you close it (see [Close the vault](#close-the-vault)). A hold can last up to 28 days in total.

## Pay with no network

You can do this in airplane mode, as long as Bluetooth is on.

1. Ask the seller to show their payment code (see the next section).
2. On Home, tap **Pay**. The camera opens. Point it at the seller's code.
3. Check the screen: the seller's name, the amount, and what you will have left.
4. Tap **Pay** and confirm with your **fingerprint or PIN**. Your phone signs the payment.
5. The payment travels to the seller's phone over Bluetooth. Both phones show it as **sent** or **received, queued**.
   - If Bluetooth isn't available, your phone shows a QR code instead. The seller scans it with **Scan their code** on their screen.
6. Tap **Done**.

The seller can't be paid twice with the same payment, and a payment can't be changed after it is signed. If you try to pay more than the vault has left, T-Pay refuses and says why.

## Get paid with no network

1. On Home, tap **Get paid** (Wallet tab) or **Receive** (Offline vault tab), or say "collect two thousand".
2. Enter the amount. Your phone shows a QR code.
3. Let the customer scan it. When their payment arrives over Bluetooth, your screen changes by itself to **Got money** and reads the amount out.
   - If it doesn't arrive, tap **Scan their code** and scan the customer's QR code instead.
4. The money shows as **Queued** until a phone has network, then becomes **Paid** and lands in your Wallet.

If this phone is online, it also checks with T-Pay every few seconds, so a payment sent through T-Pay shows up without a scan.

## The Wallet: add, withdraw, pay links

Open the **Wallet** tab or **Received** in the menu.

- **Add money.** Enter an amount (at least ₦1,500), tap **Continue to PayPal** and pay with the sandbox account. The Wallet is credited when PayPal confirms.
- **Withdraw.** Enter the amount and choose **To my PayPal** or **To someone else** (any PayPal email). Sending to someone else asks for your PIN. The money arrives as a PayPal payout, usually within a minute in the sandbox.
- **Pay link.** On the Received screen, **Share** or **Copy** your pay link. Anyone can open it in a browser and pay you with PayPal; they don't need T-Pay. The link is the same every time.
- **Automatic cash-out.** Money you receive offline goes on to your own PayPal by itself once it settles. It's on by default; turn it off in Profile.

## Close the vault

1. Open the **Offline vault** tab and tap the vault, or say "unlock my money".
2. Tap **Close vault** and confirm with your fingerprint or PIN.
3. Unspent money is released: back to PayPal if you locked with PayPal, or back to the Wallet if you locked from the Wallet. Money you already paid out stays with the people you paid.

## Talk to T-Pay

Everything above can be done by voice. The assistant speaks in a natural voice and keeps listening after each answer, so a busy trader can keep working.

**Start it** in any of three ways:

- Say **"Hey T-Pay"** (or just "T-Pay") while the app is open and unlocked.
- Press **Volume Up twice**.
- Tap **Speak** in the bottom bar and hold the microphone while you talk.

**Say what you want**, in English or Pidgin (Yoruba, Igbo and Hausa work online). For example:

| Say | What happens |
| :--- | :--- |
| "Collect two thousand" | Shows the payment QR code for ₦2,000 |
| "Pay five hundred" | Opens the camera to scan the seller's code |
| "Lock five thousand" | Asks you to confirm, then locks ₦5,000 |
| "Withdraw two thousand" | Asks you to confirm, then opens the withdrawal for your fingerprint or PIN |
| "Add ten k" | Asks you to confirm, then opens PayPal |
| "How much do I have?" | Reads out your vault and Wallet balances |
| "Share my pay link" | Opens the share sheet with your link |
| "Open my activity", "Go to settings" | Opens that screen |
| "How do I pay?", "Is my money safe?" | Explains, and offers to take you there |
| "That's all", "Thanks" | Ends the conversation |

**What it never does:** it never enters your PIN, never pays by itself, and never moves money on a spoken "yes" alone. Anything that moves money ends on a screen that asks for your fingerprint, PIN or PayPal sign-in. You can always answer **No**.

If it mishears you, it asks again. If it hears nothing, it goes quiet until you call it.

## Business accounts: stock and sales

Open the menu and tap **Switch to a Business account**. Switching needs no PIN and changes nothing about your money.

- Home opens on the Wallet, and the bottom bar gains **Stock**.
- **Stock & Inventory** (menu) keeps what is on your shelf. Add items by hand, or say "add ten Coke to stock". Tap minus when something sells, plus when more arrives. Items at three or fewer show as running low.
- **Record a sale by voice:** "I sold one Coke for five hundred" records the sale and takes one off the shelf.
- "How many Coke do I have?" reads the count out.
- The phone keeps Bluetooth on so payments can arrive while you serve the next customer.

Personal accounts get **Personal Budget** instead: set a monthly limit and see how much of it is used. Say "set my budget to fifty thousand" or "how is my budget?".

## Settings

Open **Profile** from the bottom bar.

| Setting | What it does |
| :--- | :--- |
| Name and PayPal email | Change what others see, and where withdrawals go |
| Send received money to PayPal | Automatic cash-out, on or off |
| Say "Hey T-Pay" | Turn the wake word on or off. Offers to download the phone's English speech pack so it can listen without the internet. |
| Offline assistant | Download the optional on-device model, so the assistant understands more with no network |
| Service status | Whether T-Pay and PayPal are reachable right now |
| Language | English, Pidgin, Yoruba, Igbo or Hausa |
| Lock the app | Lock it now |

## For judges: test T-Pay in ten minutes

You need two Android phones with T-Pay installed from the [download link](https://expo.dev/accounts/olayiwola206/projects/tpay-mobile/builds/9a8af0e5-d058-494f-8756-fb112fdac3d5) and the two tester logins from [T-Pay test accounts](T-Pay-Test-Accounts.md): one phone as Personal (Ada, the customer), one as Business (Bola, the seller).

1. **Set up both phones** (two minutes). Pick English, enter a name (for example "Ada" and "Bola"), the sandbox PayPal email, and a PIN. Allow the permissions.
2. **Lock money on Ada's phone.** Offline vault → **Lock** → ₦10,000 → 24 hours → **With PayPal** → approve in the sandbox. Home shows ₦10,000 locked.
3. **Go offline.** Turn on airplane mode on both phones, then turn Bluetooth back on. Neither phone can reach the internet.
4. **Bola asks for money by voice.** Bola says "Hey T-Pay, collect one thousand". The app answers at once and shows the QR code.
5. **Ada pays.** Ada taps **Pay**, scans Bola's code, checks the amount, taps **Pay**, and confirms with fingerprint or PIN. Within a few seconds Bola's phone changes to **Got money ₦1,000** and says so.
6. **Try to cheat.** Ada tries to pay ₦20,000: refused, more than the vault holds. Bola tries to show Ada's earlier payment again: refused as already received.
7. **Reconnect.** Turn airplane mode off on either phone. Within a few seconds the payment settles: Bola's Wallet shows ₦1,000 **Paid**, and the phone announces it. With automatic cash-out on, a PayPal payout to Bola's email follows.
8. **Close the vault.** Ada opens the vault, taps **Close vault**, and confirms with the PIN. The ₦9,000 left is released from the PayPal hold.
9. **Hands-free.** On either phone say "Hey T-Pay, how much do I have?", then "withdraw five hundred". It confirms by voice and opens the fingerprint or PIN prompt. Say "that's all" to end.

What to look for: the payment works with no signal at all; every payment needs the customer's fingerprint or PIN; nothing is spent twice; and the assistant proposes but never moves money by itself.

## Known limits

- **Sandbox only.** No live PayPal mode, no real money, no KYC.
- **Android only.** There is no iOS build yet.
- **One fixed exchange rate** for the demo (₦1,500 to the US dollar).
- **Hold limit.** A vault can be open for at most 28 days.
- **Smarter offline answers** need the optional model download in Profile. Without it, offline requests are read by fixed rules, which cover the common ones.
- **Natural voice** is for English and Pidgin. Yoruba, Igbo and Hausa use the server's or phone's voice.
- **Yoruba, Igbo and Hausa text** still needs a native speaker's review.

## If something goes wrong

| Problem | What to do |
| :--- | :--- |
| The first request after a while is slow | The free server sleeps when idle. The first call can take up to a minute; after that it answers at once. |
| The seller's screen doesn't change after paying | Tap **Scan their code** on the seller's phone and scan the customer's QR code. Payment and receipt are the same whichever way they travel. |
| The camera can't read the code | Hold the phone steady about 15 cm away. T-Pay also reads the code from a still photo on phones with no built-in reader; give it a few seconds. Or tap **Paste code** if the code was copied. |
| "Hey T-Pay" doesn't answer | Check Profile → Say "Hey T-Pay" is on, and allow the microphone. Press Volume Up twice or tap Speak instead. |
| PayPal page closed before approval | Open the bell on Home: **Finish locking your money** takes you back to it. |
| Pay is greyed out or explains instead of opening the camera | Nothing is locked yet. Lock money first. |
| Service status shows PayPal down | Offline payments still work. Locking, adding money and withdrawing wait until PayPal is back. |
