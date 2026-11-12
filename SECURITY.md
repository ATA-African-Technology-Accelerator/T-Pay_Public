# Security policy

T-Pay handles payment authorisations and signed payment vouchers. We take reports seriously and are grateful for them.

## Supported versions

T-Pay is a hackathon project running against the **PayPal sandbox**; no real money moves. Only the latest commit on `main-copy` is supported.

## Reporting a vulnerability

**Do not open a public issue, pull request or discussion.**

Report privately through GitHub: go to the repository's **Security** tab and choose **Report a vulnerability**, or open
<https://github.com/OlayiwolaSherrifSalawu/T-Pay_Public/security/advisories/new>.

<!-- TODO: enable "Private vulnerability reporting" in Settings → Code security, or add a dedicated security email address here. -->

Please include:

- what is affected (backend endpoint, app screen, offline message or shared rule);
- steps to reproduce, or a proof of concept;
- the impact you expect, for example a voucher accepted twice or a payment without confirmation.

We aim to acknowledge reports within 3 working days and to share a plan within 10.

## What is in scope

- Forging, replaying or double-spending vouchers, receipts or certificates.
- Moving money without the person's fingerprint, PIN or PayPal approval, including through the voice assistant.
- Bypassing device authentication, idempotency or rate limits.
- Leaking secrets, device tokens or personal data.
- Accepting forged PayPal webhooks.

## How secrets are handled

- The root private key and all API secrets live only in the backend environment. They are never committed and never sent to the app.
- `.env` files are ignored by git. Only `.env.example` templates, with empty values, are committed.
- `EXPO_PUBLIC_` variables are compiled into the app and must only hold public values, such as the API URL and the root public key.
- Each phone's signing key is created on the device, kept in Android secure storage, and never leaves it.
- What people say to the assistant is not logged.

If you find a secret committed to this repository, report it privately as above so it can be rotated.
