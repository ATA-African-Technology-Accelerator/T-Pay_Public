# Contributing to T-Pay

Thank you for helping. T-Pay moves money, so changes are held to a high bar: they must be tested, reviewed, and never weaken a payment check.

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Before you start

- For anything larger than a small fix, open an issue first and describe the change. This avoids work that can't be merged.
- Read the [API contract](docs/T-Pay-API-Contract.md). It is the source of truth for every endpoint and offline message. A change to the contract needs its own review.
- Security issues are never reported in public issues. See [SECURITY.md](SECURITY.md).

## Set up

Follow the [Quickstart](README.md#quickstart). You need Node.js 22 or later, Docker, a PayPal sandbox app and, for the app, Android Studio with JDK 17.

## Branches

Branch from `main-copy`. Use a short, prefixed name:

| Prefix | For |
| :--- | :--- |
| `feat/` | A new capability, for example `feat/voice-withdraw` |
| `fix/` | A bug fix, for example `fix/merchant-wait` |
| `docs/` | Documentation only |
| `test/` | Tests only |
| `refactor/` | Code changes with no change in behaviour |
| `chore/` | Tooling, dependencies, CI |

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org):

```text
<type>(<scope>): <summary in the imperative, under 72 characters>
```

- Types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `chore`, `ci`.
- Scopes: `app`, `backend`, `shared`, `docs`, `ci`.
- Examples: `feat(app): withdraw by voice`, `fix(backend): refuse a reused voucher sequence`.

Keep each commit to one logical change.

## Code standards

- **TypeScript everywhere**, with strict type checks passing.
- **`shared/` has no dependencies.** It runs unchanged on the phone and the server; keep it that way.
- **Money is in minor units** (kobo and cents) as integers. Never use floating point for money.
- **The assistant only proposes.** Any new path that moves money must require the person's fingerprint, PIN or PayPal sign-in. The assistant never enters a PIN or password.
- **No secrets in code.** Configuration goes in `.env` files, which are ignored by git. Update the matching `.env.example` with an empty value and a comment.
- **Write for the person using it.** App text is short, plain and specific. Add new strings to `frontend/src/i18n/en.ts`.

## Tests

Every change needs tests that fail without it. Before you open a pull request, run:

```bash
cd backend && npm run lint && npm test
cd ../frontend && npm run typecheck && npm test
```

If you change storage or migrations, also run `npm run db:up && npm run test:db` in `backend/`.

## Pull requests

1. Rebase on the latest `main-copy`.
2. Fill in what changed, why, and how you tested it. Add screenshots for visible app changes.
3. Make sure CI is green.
4. One approving review is needed before merge. Merge with **Create a merge commit** so authorship is kept.

## Questions

Open a [discussion or issue](https://github.com/OlayiwolaSherrifSalawu/T-Pay_Public/issues).
