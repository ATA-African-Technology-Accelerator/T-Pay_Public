# T-Pay style lock

Status: set on 2026-11-05 from the owner's supplied wallet reference (/home/gamp/Desktop/d463111bc2c67cb319a04db0ebc95a90.webp). Goal: professional and trustworthy.
Design read: app shell for market traders and customers, mode Operate, calm dark wallet lane, dials variance 3, motion 3, density 5, art direction 5.
Tokens: frontend/src/theme/tokens.ts is the only place colours, type, spacing and motion values live.
Use the reference for layout and colour direction only. Its crypto content and brand marks stay out of the product.

## Direction
Near-black page, quiet panels without borders, one blue glow behind the hero, glass round actions under the balance, a single notice card, one account that can send and receive (by T-Pay number with network, by codes without), two swipeable wallets (Offline, Active) in the hero with their names always visible, one Recent transactions panel with See all, a PIN lock screen, a receipt for every transaction, Help one tap from home, a raised frosted-glass mic in the middle of the menu, large calm keypad for amounts.

## Colour contract
Page #050608. Panel #111317. Raised #1A1E24. Line #262B33. Text #F3F5F9. Muted #9AA6B8.
Glow stops #0C2137, #1D436D, #3265A4, #6F84BA, used only by Aurora.
Primary action: light #F3F5F9 fill with ink #07090D text.
Status, always with its word: Paid #6FD98C, Processing #F0B64A, Locked #8FB4F0, Refused #F58B7C.
White on the brightest glow stop is 3.69:1, so small text stays clear of the top right corner.
Scan codes stay dark on a white plate.

## Type
Inter throughout, because it covers every Yoruba, Igbo and Hausa letter and the naira sign. Lexend does not cover Hausa.

## Motion
Press 0.96 over 150ms, entrances 12px over 300ms with 100ms stagger, tabular numbers.

## Signature patterns
- Payment confirms with press and hold. Letting go cancels.
- Hear it stays on every confirmation.
- Processing never shows a paid tick. The word on screen is Processing, never Pending. Only the backend sets paid.
- Names on a payment screen wrap and money never truncates.

## Design system rules
Every value comes from frontend/src/theme/tokens.ts. If a value is missing, add a token, never a literal.
Spacing: 2, 4, 8, 12, 16, 20, 24, 36. Radius: 12, 16, 24, plus pill for anything fully round. Icons: 18, 22, 26, 46.
Type: use a type token by name, never a font size in a component.
Motion: durations, stagger and cubic-bezier curves from the motion token. Every animation must explain a change and respect reduced motion.
Async: every async action shows progress on its button, and lists show a skeleton while loading.
Copy: no em dashes, no vague slogans, no invented testimonials or stock names.
