# T-Pay test accounts

Three PayPal **sandbox** logins come with T-Pay for testing. No real money moves with any of them.

| # | Email | Belongs to | Use it for |
| :---: | :--- | :--- | :--- |
| 1 | `sb-n9sfb53729839@business.example.com` | **T-Pay** | Nothing in the app. This is T-Pay's own PayPal business account: it holds the money behind every Offline vault and pays out withdrawals. Don't sign in to the app with it. |
| 2 | `sb-rtur953858269@personal.example.com` | Tester A | Any T-Pay account, **Personal or Business** |
| 3 | `sb-lptu853668987@personal.example.com` | Tester B | Any T-Pay account, **Personal or Business** |

**Passwords** are shared with judges privately, in the hackathon submission, so the accounts can't be signed in to by anyone who finds this page. Ask the team if you need them.

## How to use them

T-Pay itself has no login. Each phone registers itself the first time it opens, and is protected by its own PIN. The PayPal emails come in at two points:

1. **During setup**, in "PayPal email". This is where money you receive or withdraw goes. Use Tester A on one phone and Tester B on the other.
2. **When PayPal asks you to sign in**: when you lock money with PayPal, or add money to the Wallet. Sign in with the **same** email you entered on that phone.

Either tester email works for either kind of T-Pay account:

| Account type | What it adds | How to choose it |
| :--- | :--- | :--- |
| **Personal** | Pay people and shops, Offline vault, Personal Budget | Choose Personal during setup |
| **Business** | Get paid by customers, pay link, Stock & Inventory | Choose Business during setup, or **Menu → Switch to a Business account** at any time |

A good pairing for the two-phone test: **Tester A as a Personal account** (the customer, who locks money and pays) and **Tester B as a Business account** (the seller, who gets paid).

## Why T-Pay's own account is different

When a customer locks money with PayPal, PayPal places a hold for **T-Pay's** account. When a payment settles, T-Pay captures it from that hold and credits the seller's Wallet. When anyone withdraws, the payout comes from T-Pay's account to theirs. So T-Pay's account is the other side of every payment, and signing in to the app with it would mix up whose money is whose.

## Good to know

- These are sandbox accounts. You can see their balances at [sandbox.paypal.com](https://www.sandbox.paypal.com) with the same email and the password from the submission.
- The steps for a full test are in the [user guide](T-Pay-User-Guide.md#for-judges-test-t-pay-in-ten-minutes).
- Using your own PayPal sandbox account instead also works, for any of the tester roles.
