# Spartan Tyres — Serverless API

Vercel Node serverless functions in TypeScript, zero npm dependencies beyond
what the SPA already uses. Only `node:crypto` and global `fetch` are used.

The contract is defined by [`src/lib/api.ts`](../src/lib/api.ts) — that file is
authoritative. Every response shape below matches it exactly.

## File layout vs URLs

The URLs below are the contract; the files behind them are an implementation
detail. Vercel turns every routable file under `api/` into its own serverless
function, and the Hobby plan caps a deployment at twelve. So two groups are
collapsed into dynamic routes:

| File | Serves |
| --- | --- |
| `api/admin/[action].ts` | `/api/admin/{login,stats,products,orders,enquiries,ai-status,ai-settings,ai-conversations,ai-conversation}` |
| `api/square/[action].ts` | `/api/square/{config,create-payment}` |
| `api/account/[action].ts` | `/api/account/{me,signup,login,logout,forgot,set-password,details,password,prices,order,orders,statement}` (customer accounts; code in `api/_lib/accounts/`; the staff side is the `accounts`, `account` and `account-*` actions of `api/admin/[action].ts`) |
| `api/ai/[action].ts` | `/api/ai/{chat,outcome,status,voice}` (the AI assistant, chat and voice calls; its code is in `api/_lib/ai/`) |

Each dispatches on `req.query.action` to a handler in `api/_lib/handlers/`.
Anything under a path segment beginning with `_` is excluded from routing, so
those handlers do not become functions of their own. **No public URL changes** —
`/api/admin/stats` is still `/api/admin/stats`.

Current count: **10 routable files** (`account/[action]`, `admin/[action]`, `ai/[action]`, `contact`,
`inventory`, `newsletter`, `orders`, `promo/validate`, `services/fitting`,
`square/[action]`). The Hobby plan allows twelve, so a thirteenth will build
successfully and then fail at the deploy step. The whole AI is one function,
`api/ai/[action].ts`.

## Conventions

- **Request/response types** — `@vercel/node` is not installed, so
  `api/_lib/http.ts` declares a minimal structural subset (`ApiRequest` /
  `ApiResponse`). Each endpoint is
  `export default async function handler(req: ApiRequest, res: ApiResponse)`,
  wrapped in `withGuard()`.
- **Errors** — always `{ "error": "<customer-readable message>" }`.
  `src/lib/api.ts` reads `payload.error` for the message it shows the user.
  Stack traces are never returned; secrets are never logged.
- **Method handling** — `OPTIONS` gets a 204 pre-flight, anything outside the
  allowed verbs gets a 405 with an `Allow` header.
- **CORS** — same-origin only. `Access-Control-Allow-Origin` is echoed only
  when the request `Origin` matches this deployment (`VERCEL_URL`,
  `VERCEL_BRANCH_URL`, `VERCEL_PROJECT_PRODUCTION_URL`, `PUBLIC_SITE_URL`, or
  localhost outside production); otherwise the header is omitted.
- **Files under `api/_lib/`** are shared modules, not routes — Vercel excludes
  underscore-prefixed paths from routing.

## Endpoints

| Endpoint | Method | Auth | Env vars used | Behaviour without them |
| --- | --- | --- | --- | --- |
| `/api/inventory` | GET | public | `KV_REST_API_URL`, `KV_REST_API_TOKEN` *(optional)* | Returns the bundled catalogue with no overrides |
| `/api/square/config` | GET | public | `SQUARE_APPLICATION_ID`, `SQUARE_LOCATION_ID`, `SQUARE_ACCESS_TOKEN` **(required)**, `SQUARE_ENVIRONMENT`, `SQUARE_AFTERPAY_ENABLED` *(optional)* | **503** `{error}` — checkout shows "card payment unavailable, call us" |
| `/api/square/create-payment` | POST | public | `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID`, `SQUARE_APPLICATION_ID` **(required)**; `SQUARE_ENVIRONMENT`, `PROMO_CODES`, `KV_REST_API_*` *(optional)* | **503** with the phone number |
| `/api/promo/validate` | POST | public | `PROMO_CODES` *(optional)* | Built-in promo table |
| `/api/services/fitting` | POST | public | none | n/a — pure calculation from `site.commerce` |
| `/api/contact` | POST | public | `KV_REST_API_*` *(optional)* | Stored in the dev-only in-memory store |
| `/api/newsletter` | POST | public | `KV_REST_API_*` *(optional)* | Stored in the dev-only in-memory store |
| `/api/orders` | GET | public (reference + email) | `KV_REST_API_*` *(optional)* | **404** with "order lookup unavailable on this deployment" |
| `/api/ai/chat` | POST (streams NDJSON), GET (collect a saved answer) | same-origin only (`Origin` must be this site) | `OPENAI_API_KEY`, `OPENAI_CHAT_MODEL` *(optional)*, `ADMIN_SESSION_SECRET`, a Postgres URL *(see `.env.example`)* | A `fallback` event (`not_configured`), never an error |
| `/api/ai/outcome` | POST | same-origin only | as above | Saves nothing, answers `{ ok: true, saved: 0 }` |
| `/api/ai/status` | GET | public (kept for about 15 s per visitor) | as above | `{ chat: { available: false }, voice: { available: false } }` |
| `/api/ai/voice` | GET (voice status), POST (`start`, `tool`, `line`, `end`, `practice`) | same-origin only (POST) | `OPENAI_API_KEY` plus the settings above; `VOICE_*` *(optional)* | A refusal with a `reason` (`not_configured`, `off`, `busy`, `already`, `daily`, `monthly`, `unavailable`); never an error page |
| `/api/admin/login` | POST | public (issues token) | `ADMIN_PASSWORD` **(required)**, `ADMIN_SESSION_SECRET` *(recommended)* | **503** "admin not configured" |
| `/api/admin/stats` | GET | **Bearer** | `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `LOW_STOCK_THRESHOLD` *(optional)*, `KV_REST_API_*` | **503** if unconfigured, **401** if token invalid/expired |
| `/api/admin/products` | GET, PATCH | **Bearer** | `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `KV_REST_API_*` | **503** / **401** as above |
| `/api/admin/orders` | GET, PATCH | **Bearer** | `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `KV_REST_API_*` | **503** / **401** as above |
| `/api/admin/enquiries` | GET | **Bearer** | `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `KV_REST_API_*` | **503** / **401** as above |
| `/api/admin/ai-status` | GET | **Bearer** | `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, the AI settings | **503** / **401** as above; reports the database as not connected |
| `/api/admin/ai-settings` | GET, PATCH | **Bearer** | as above, and a Postgres URL | **503** / **401** as above |
| `/api/admin/ai-conversations`, `/api/admin/ai-conversation` | GET | **Bearer** | as above, and a Postgres URL | **503** / **401** as above |

### Request / response detail

| Endpoint | Request body / query | Success response |
| --- | --- | --- |
| `GET /api/inventory` | — | `{ products: Product[], updatedAt: string }` |
| `GET /api/square/config` | — | `{ applicationId, locationId, environment, afterpayEnabled, afterpayMaxOrder }` |
| `POST /api/square/create-payment` | `{ sourceId, verificationToken?, idempotencyKey, fulfilment, fittingTyres, promoCode?, customer{name,email,phone,company?}, address?{line1,suburb,state,postcode}, lines[{id,quantity}], notes?, conversationId? }`. A signed-in customer's `spt_session` cookie, if the browser sends one, prices the order at that account's prices (a missing, expired or revoked cookie is a guest, never an error). | `{ ok: true, reference, orderId, paymentId, total, receiptUrl? }`. The stored order also has `channel` (retail / bulk / wholesale), each line's `basis`, and `accountId` for a signed-in customer. |
| `POST /api/promo/validate` | `{ code, tyreCount? }` | `{ valid, code?, percentOff?, description?, reason? }` |
| `POST /api/services/fitting` | `{ tyres }` | `{ tyres, perTyre, total }` |
| `POST /api/contact` | `{ name, email, phone?, company?, enquiryType, message }` | `{ ok: true }` |
| `POST /api/newsletter` | `{ email }` | `{ ok: true, alreadySubscribed? }` |
| `GET /api/orders` | `?reference=…&email=…` | `{ order: Order }` |
| `POST /api/ai/chat` | `{ conversationId, message, page, turn?, outcomes? }` | NDJSON stream, one event per line (`src/lib/ai/protocol.ts`) |
| `GET /api/ai/status` | none | `{ chat: { available }, voice: { available, practice, seconds } }` |
| `POST /api/ai/voice` | `{ action: 'start', conversationId, page, sdp }` and the other actions in the header of `api/ai/[action].ts` | `{ call }`, or `{ error, reason? }` |
| `POST /api/admin/login` | `{ password }` | `{ token, expiresAt }` |
| `GET /api/admin/stats` | — | `{ revenue, orderCount, unitsSold, averageOrderValue, lowStock[], revenueByDay[], topProducts[] }` |
| `GET /api/admin/products` | — | `{ products: Product[] }` |
| `PATCH /api/admin/products` | `{ id, patch: { price?, discount?\|null, stock? } }` | `{ product: Product }` |
| `GET /api/admin/orders` | — | `{ orders: Order[] }` |
| `PATCH /api/admin/orders` | `{ id, status }` | `{ order: Order }` |
| `GET /api/admin/enquiries` | — | `{ enquiries[], subscribers[] }` |
| `GET /api/admin/ai-status` | none | `{ chat, voice, limits, spend, database, warnings, settings }` |

## Customer accounts

One new function, `api/account/[action].ts` (code in `api/_lib/accounts/`); the admin side goes through the
existing admin router (`api/_lib/handlers/admin-accounts.ts`). Tables (`customer_accounts`, `customer_prices`,
`customer_tokens`) live in Postgres next to the AI's, through the shared connection `api/_lib/db.ts` (Neon in
production, PGlite locally). Without `ADMIN_SESSION_SECRET` (and a Postgres URL) on Vercel every account route
answers **503**; there is no built-in key.

### Rules for every customer route

- `Cache-Control: private, no-store` on every answer, errors included.
- A POST needs an allowed `Origin` (403 otherwise), `Content-Type: application/json` (415), and a JSON object body
  of at most 20,000 characters (400 / 413). Errors are `{ error: string, field?: string }`; `field` names the form
  field to highlight.
- The session is the httpOnly cookie `spt_session` (`HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`, plus
  `Secure` on every host except localhost, always on Vercel). The browser sends it by itself; the client must call
  these routes with `credentials: 'same-origin'` (the default for same-site `fetch`). The `Authorization` header is
  never read here, and a staff token never works here (nor a customer cookie on the admin API).
- Rate-limited routes answer **429** `{ error }`.
- The `account` object is: `{ id, email, name, company, phone, abn, address, level: 'customer'|'bulk'|'wholesaler',
  requestedLevel: 'bulk'|'wholesaler'|null, status: 'active'|'suspended', discountPct, payLater, termsDays,
  creditLimit, outstanding, emailVerified }` (numbers are dollars / percent / days; `abn` is `12 345 678 901`).

### Customer routes (`/api/account/<action>`)

| Route | Request | Success | Errors and notes |
| --- | --- | --- | --- |
| `GET me` | none | `{ account }` | `401 { error }` when not signed in (a dead cookie is cleared). |
| `GET session` | none | `{ account }` or `{ account: null }` | Always 200: the browser's "who is signed in" check on every page, so a guest gets no error. Same rules as `me` (only the cookie counts; a dead cookie is cleared). |
| `POST signup` | `{ name, email, password, requestedLevel?: 'customer'\|'bulk'\|'wholesaler', company?, phone?, abn?, address?, message? }` | `{ account }` and the cookie (an active **Customer** account, signed in; `requestedLevel` bulk / wholesaler is kept for staff to approve) | `400` with `field` (name, email, phone, abn, company, address, requestedLevel, message, password); `409` generic "could not open an account with those details" when the email is taken (the owner of that email is told by email instead); `429` (5 per hour per address, 3 per hour per email). |
| `POST login` | `{ email, password }` | `{ account }` and the cookie | `401` the same message for unknown email, wrong password, suspended and not-yet-set-up; `429` (5 per 15 min per email, 30 per hour per address). |
| `POST logout` | none (body optional) | `{ ok: true }` and a clearing cookie | |
| `POST forgot` | `{ email }` | always `{ ok: true }` | Emails a 1-hour reset link only when an active account exists. `429` (3 per hour per email, 10 per hour per address). |
| `POST set-password` | `{ token, password }` | `{ account }` and the cookie | Uses a single-use invite (7 days) or reset (1 hour) link from `/account/set-password?token=`. `400` with `field` password or token; ends the account's other sessions; marks the email verified; `429` (10 per hour per address). |
| `POST details` | `{ name, company?, phone?, abn?, address? }` (all replaced) | `{ account }` | Needs the cookie (401). Email, level, prices and credit cannot be changed here. |
| `POST password` | `{ current, next }` | `{ account }` and a fresh cookie | `400` with `field` current or next; ends other sessions; `429` (5 tries per 15 min). |
| `GET prices` | none | `{ prices: { [productId]: { unit, basis: 'account' } }, discountPct, level }` | Cookie only (`401` otherwise). The account's own unit price (before any volume break) for every tyre where it beats the shop price, and for a price-on-application tyre it has a special price for. Read fresh with the live catalogue, `private, no-store`, never in `/api/inventory` (which is public and cached) or the JS bundle. |
| `GET orders` | none | `{ orders: [{ reference, createdAt, status, fulfilment, lines: [{ name, size, quantity, unitPrice, basis? }], fittingTyres, subtotal, discount, fittingTotal, total, channel, payment: 'card' or 'account', dueDate?, paid?, overdue? }] }` | Cookie only. The signed-in customer's own website orders (those placed while signed in), newest first. `dueDate`, `paid` and `overdue` appear on pay-later orders only. No internal ids, no card payment id. |
| `GET statement` | none | `{ linked, balance: { due, overdue, count }, open: [{ kind: 'ticket' or 'order', reference, date, dueDate, total, paid, owing, overdue }], payments: [{ ref, date, amount, method, allocations: [{ ticketRef, amount }] }] }` | Cookie only. A linked account reads only its OWN till customer's open account tickets (a pay-later order shows by its order reference) and payments received. An unlinked account (`linked: false`) gets its website on-account orders only, and no till data. |
| `POST order` | `{ idempotencyKey, lines: [{ id, quantity }], fulfilment: 'pickup' or 'delivery', fittingTyres?, address?, notes?, promoCode?, expectedTotal }` | `{ ok: true, reference, orderId, total, status: 'account', payment: 'account', dueDate, outstanding, creditAvailable, repeated? }` | A pay-later order (see below). `idempotencyKey` is 8 to 64 letters, numbers, `-` or `_`, one per checkout attempt. `400` with `field` (idempotencyKey, fulfilment, address, expectedTotal) or the pricing problems; `409` for a total that differs from `expectedTotal` ("nothing has been ordered"), "This order is over your credit limit: $x available.", pay later not set up or the account not linked, or a repeat still running; `429` (30 per hour per account). |
| `GET dev-outbox` | none | `{ emails: [{ to, subject, html, text, replyTo?, at }] }` | **Local development only** (404 on Vercel and for any non-localhost host): the emails that would have been sent. |

### Account prices and pay later

One rule prices everything (`src/lib/account-pricing.ts`: React-free, used by the server and by the browser cart).
Per line the customer pays the LOWER of their account price and the normal price after the order's volume break,
never both discounts:

- retail unit = the shelf price (a sale price included); band unit = retail less the order's volume break, to the cent;
- account unit = the account's special price for that tyre, else its agreed % off the RRP, to the cent (half a cent up);
  never above the retail unit;
- the account price is used only when it is lower than the band unit. The line's `basis` is `account`, `volume` (a break
  applies) or `retail`. A line at the account price gets no volume break and no promo code; promo codes only ever touch
  the lines at the normal price, after the break;
- a price-on-application tyre is quote-only, unless the account has a special price for it: then that account can buy it;
- GST is the total over 11, fitting is pickup only and never discounted, everything rounds to the cent as before. A guest's
  totals are byte for byte what they always were.

`priceOrder(input, overrides, account?)` (api/_lib/pricing.ts) adds to every line `basis`, `retailUnitPrice` and
`accountSaving`, and to the result `channel` and `accountSaving`.

Sale label (`channel`): `wholesale` for a Wholesaler account, `bulk` for a Bulk account or an order of 20 or more tyres
(`site.commerce.bulkThreshold`), else `retail`. It is stored on website orders and till tickets.

**Pay later** (`POST /api/account/order`, and "On account" at the till): only for an active account with pay later on
that is linked to its till customer. The credit is taken in ONE guarded update before anything is written:

```sql
UPDATE customer_accounts SET outstanding = outstanding + $total, last_reserved_at = now()
 WHERE id = $id AND status = 'active' AND pay_later AND pos_customer_id IS NOT NULL
   AND outstanding + $total <= credit_limit RETURNING outstanding
```

so two orders at once cannot both fit under the limit. Then the order is written with `status: 'account'`, `payment:
'account'`, `dueDate` (today in Sydney plus the account's terms), `accountId`, `channel`, `posTicketRef`, and a till
ticket for the linked customer (`status: 'account'`, the order's lines, `orderId`, due date), and the stock comes off as in
card checkout. If anything after the reservation fails the credit is given back, the ticket cancelled and the attempt's key
dropped (`customer_order_keys`; the same key twice is one order and answers with the first, `repeated: true`).
The order status `account` means "sold on account, not yet paid": it goes out like a paid order (next steps `packing` or
`cancelled`), and becomes `paid` by itself when its ticket is paid off at the till (`accountPaidAt` is set whatever its
status by then). It is never marked paid from the Orders or Payments pages (409, with the message to take the payment in the
till's customer account); cancelling it cancels its ticket and gives the credit back, unless some of it has been paid; once cancelled it
cannot be moved on again (409). A promo code in the cart is sent with the order and priced as at card checkout (normal-
price lines only).

At the till, a linked customer whose pay later an owner or manager has NOT set yet (`credit_set_at` empty) buys on
account exactly as before (staff decide, no limit), and what they owe is still added to `outstanding`. The first
`account-credit` sets `credit_set_at`; from then on the till applies pay later and the limit, with refusals worded for
staff. Linking an existing till customer copies its terms (and any details the account lacks) into the account, and a
blank on the account never empties a detail on the till record.

`outstanding` goes up on every on-account sale for a linked customer (website or till) and down by what each account
payment applies to their tickets. `reconcileOutstanding` (api/_lib/accounts/credit.ts) recomputes it from the linked till
customer's open account tickets and fixes a difference; it runs when an account is opened in the admin and is the admin
action `account-reconcile`. A sale reserved in the last 2 minutes is left alone (its ticket may not exist yet). It also
runs when an account is linked to a till customer, so the account starts at that customer's real balance.

At the till a customer linked to an account is priced by `GET /api/admin/pos?view=account-items&customerId=` (below);
a counter customer with no account is sold to exactly as before, and never touches the accounts database.

Passwords: 10 to 200 characters and not the email address. Signing out only clears this browser's cookie; the
other devices stay signed in until the password changes, an invite / reset link is used, or staff suspend the account.

### Admin routes (`/api/admin/<action>`, staff `Authorization: Bearer`, audited)

Permission `trade` (Owner, Manager, Sales executive) unless noted. 401 not signed in, 403 no permission.

| Route | Request | Success | Notes |
| --- | --- | --- | --- |
| `GET accounts` | `?q=&level=&status=&pending=1` | `{ accounts: StaffAccount[], counts: { all, pending, suspended } }` | `q` searches name, company, email, phone, ABN. Accounts waiting for approval sort first. |
| `GET account` | `?id=` | `{ account, prices: [{ productId, price, updatedBy, updatedAt }], posCustomer: { id, name, company, email, phone, address, termsDays, balance: { due, overdue, count } } \| null, posMatch: { id, name, company, email } \| null, canEditCredit }` | 404 unknown id. `posMatch` is set when the account is not linked yet but a till customer has its email (see below). |
| `POST account-create` | `{ email, name, level, company?, phone?, abn?, address?, discountPct?, notes? }` | `{ account, emailSent, inviteLink? }` | Links / creates the till customer, sends the set-password email. `inviteLink` is present ONLY when the email was not sent (copy it for the customer). `409` email taken. `503` if customer sign-in is not set up. |
| `POST account-update` | `{ id, name?, company?, phone?, abn?, address?, notes?, email? }` | `{ account }` | An email change signs the customer out, un-verifies it and cancels any link already sent (it went to the old address). Keeps the till customer in step. |
| `POST account-level` | `{ id, level, discountPct }` | `{ account }` | Setting the level the customer asked for settles their request. |
| `POST account-request` | `{ id, decision: 'approve'\|'reject' }` | `{ account }` | `409` when nothing is waiting. Emails the customer. |
| `POST account-prices` | `{ id, prices: [{ productId, price: number\|null }] }` | `{ prices }` (the full list) | 1 to 500 changes, all or nothing; product must exist; `0 < price <= 100000`; `null` removes. |
| `POST account-credit` | `{ id, payLater: boolean, termsDays: 0..120, creditLimit: 0..10000000 }` | `{ account }` | Permission `credit` only (Owner, Manager). Keeps the till customer's terms in step. |
| `POST account-invite` | `{ id }` | `{ account, emailSent, inviteLink? }` | New link (invite if no password yet, otherwise reset); retires older links. `409` if suspended. |
| `POST account-status` | `{ id, status: 'active'\|'suspended' }` | `{ account }` | Suspending ends every session now and cancels waiting links. |
| `POST account-link-pos` | `{ id }` | `{ account }` | Links an unlinked account to the till customer with its email (`posMatch`), or makes a new one if that customer is gone. `409` already linked. The account's `outstanding` then starts at that till customer's balance. |
| `POST account-reconcile` | `{ id }` | `{ account, reconciled: { balance, outstanding, fixed, deferred }, creditAvailable }` | Works out what the account owes from the till's open account tickets and fixes the stored figure. `deferred: true` means a sale was only just recorded and the figure was left (look again in 2 minutes). Audited when it changes. |
| `GET sales-by-channel` | `?from=YYYY-MM-DD&to=YYYY-MM-DD` | see below | Permission `finance` (owner, manager). Default: the last 30 days. `400` for a bad or reversed range, or more than 400 days. |

`sales-by-channel` answers `{ from, to, channels: { retail, bulk, wholesale }, total }`. Each channel is `{ website, till,
all }` and `total` is the same three summed. Each of those is `{ count, total, paid, owing, onAccount: { count, total } }`:
`total` the value of the sales (GST included), `paid` what has been received so far, `owing` the rest, and `onAccount` the
pay-later sales whether or not they have since been paid. Website means orders that are not cancelled; till means tickets
that are paid or on account (a pay-later order's own ticket is counted as the order, once). Days are Sydney days.
Records from before labels existed are labelled by the tyre count (20 or more is bulk, else retail).

`GET account` also returns `creditAvailable`, and checks `outstanding` against the till first. `POST account-credit` with
`payLater: true` answers `409` "Link this account to its till customer first." for an account with no till customer
(turning it off always works).

The till (`GET /api/admin/pos`, permission `pos`) gains: `view=account-items&customerId=` -> `{ account: { id, level,
status, discountPct, payLater, termsDays, creditLimit, outstanding, available, refusal } or null, prices: { [productId]: {
unit, basis: 'account' } } }` (`account` is null for an ordinary counter customer or a one-sided link; a suspended account
gets no prices; `refusal` is null when it may pay later, otherwise the plain reason); the `customers` and `customer` views
carry the same `account` summary for linked customers; tickets carry `channel`, `accountId` and (for a pay-later order)
`orderId`. Staff can still type any price. `ticket-account` for a linked customer needs the account active with pay later on
and takes the credit first (`409` "This sale is over X's credit limit: $y available." or "X cannot pay later: ...").

`StaffAccount` is the account plus `{ posCustomerId, notes, createdBy, approvedBy, approvedAt, lastLoginAt,
createdAt, updatedAt, hasPassword }`; it never has the password hash or token version.

The till customer link: an account made by staff is linked at once to the till customer with the same email (or a
new one). A self sign-up is linked at once only when no till customer has its email. If one does, the account stays
unlinked (`posCustomerId: null`), because nobody has proven the email yet and that till customer carries a real
business's balance and history. It is linked when the customer opens a set-password or reset link sent to that email,
or when staff confirm it with `account-link-pos`.

## Environment variables

### Required for the feature to work at all

| Variable | Used by | Notes |
| --- | --- | --- |
| `SQUARE_ACCESS_TOKEN` | `square/*` | Server-side only. Never returned to the browser. |
| `SQUARE_LOCATION_ID` | `square/*` | |
| `SQUARE_APPLICATION_ID` | `square/*` | Public — handed to the Web Payments SDK. |
| `ADMIN_PASSWORD` | `admin/*` | Absent ⇒ every admin endpoint 503s. Never fails open. |

### Strongly recommended

| Variable | Used by | Notes |
| --- | --- | --- |
| `KV_REST_API_URL` | `_lib/store.ts` | Vercel KV / Upstash Redis REST endpoint. |
| `KV_REST_API_TOKEN` | `_lib/store.ts` | Both must be set, or the store silently falls back to **development-only in-memory storage that resets on every cold start**. Provision KV before taking real payments. |
| `ADMIN_SESSION_SECRET` | `_lib/auth.ts` | HMAC key for admin tokens. If unset it is derived from `ADMIN_PASSWORD`, which means rotating the password invalidates all tokens. |

### Optional

| Variable | Default | Effect |
| --- | --- | --- |
| `SQUARE_ENVIRONMENT` | `sandbox` | `production` switches the base URL to `https://connect.squareup.com`. |
| `SQUARE_AFTERPAY_ENABLED` | enabled | Set to `false` to report `afterpayEnabled: false`. The AI assistant reads the same rule (`afterpayEnabled()` in `_lib/square.ts`), so it only mentions Afterpay while checkout offers it. |
| `PROMO_CODES` | built-in table | JSON array of `{code, percentOff, description, minTyres?}` or an object map. `percentOff` accepts `0.1` or `10`. |
| `LOW_STOCK_THRESHOLD` | `24` | Stock at or below this appears in `admin/stats.lowStock`. |
| `PUBLIC_SITE_URL` | none | Extra allowed CORS origin (for a custom domain), and the address links in account emails point at (on Vercel links never come from the request). |
| `RESEND_API_KEY`, `MAIL_FROM` | none | Email for customer accounts, over Resend. Without them nothing is sent: staff are shown the set-password link to copy, and locally the emails are kept in a dev outbox. |
| `ADMIN_SESSION_SECRET` | none | Also required for customer accounts on Vercel (key of the customer session cookie, derived with its own context label). Without it every account route is 503. |
| `OPENAI_API_KEY` | none | The assistant's chat (OpenAI chat completions) and voice calls (OpenAI Realtime). Without it the chat shows quick keyword answers and there is no Call button. |
| `OPENAI_CHAT_MODEL` | `gpt-4.1-mini` | The chat model. |
| `DATABASE_URL` or `POSTGRES_URL` | none | The AI keeps its chats, calls and spending in Postgres, **even when the store above uses KV**. Without one on Vercel the AI is off (`not_configured`). |
| `ADMIN_SESSION_SECRET` | none | Also required for the AI on Vercel: it keys the hash that identifies a visitor for the limits. Without it the AI is off. |
| `VOICE_MAX_SECONDS`, `AI_FUNCTION_MAX_SECONDS` | `600`, `300` | Call length and the time the AI function is taken to have; see the README's voice section. |
| `AI_STATUS_CACHE_SECONDS` | `15` | How long `/api/ai/status` keeps an answer per visitor. `0` turns it off. |
| `VERCEL_URL`, `VERCEL_BRANCH_URL`, `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_ENV` | set by Vercel | CORS allow-list. |

## Shared modules (`api/_lib/`)

| File | Responsibility |
| --- | --- |
| `http.ts` | `ApiRequest` / `ApiResponse` types, `readBody`, `ok`, `fail`, `methodGuard`, `applyCors`, `withGuard` error boundary, input validators. |
| `catalogue.ts` | Re-exports `src/data/products.ts` (relative import — the `@/` alias does **not** resolve inside `api/`) and merges stored overrides. |
| `store.ts` | Orders / enquiries / subscribers / overrides. Vercel KV over REST when configured, else a dev-only `globalThis` cache. |
| `pricing.ts` | Authoritative order total. Mirrors `cartTotals()` in `src/store/cart.ts`; with an account it uses the shared rule in `src/lib/account-pricing.ts`. |
| `order-stock.ts` | The stock movement for a website sale, shared by card checkout and pay-later orders. |
| `address.ts` | The delivery address check shared by card checkout and pay-later orders. |
| `promos.ts` | Promo table from `PROMO_CODES` or built-ins; `resolvePromo(code, tyreCount)`. |
| `auth.ts` | Owner password and per-staff scrypt passwords, stateless 12-hour HMAC tokens, the `authorize(req, res, permission)` role gate. |
| `square.ts` | `POST /v2/payments` over `fetch`, `Square-Version: 2024-10-17`; `afterpayEnabled()`. |
| `ai/` | The AI assistant: `engine.ts` (a chat turn), `tools.ts`, `rules.ts` (its instructions), `gateway.ts` (the model), `spend.ts` (limits), `voice.ts` and `voice-openai.ts` (calls), `admin.ts` (what staff read), `db.ts` (Postgres, or PGlite locally), `settings.ts`, `retention.ts`, `orders.ts`, `status-cache.ts`, `util.ts`. |
| `db.ts` | The shared Postgres connection (`getDb(schema)`, `query`, `transaction`; Neon or PGlite) and the schema registry. `ai/db.ts` is its AI-flavoured wrapper. |
| `rate.ts` | `hashIp` and `rateLimited` (database-backed), shared by the AI and customer accounts. |
| `email.ts` | `sendEmail` over Resend (never throws), the dev outbox, and the branded escaped template. |
| `accounts/` | Customer accounts: `schema.ts`, `repo.ts` (SQL), `session.ts` (cookie + token, separate from staff), `service.ts`, `emails.ts`, `pos-link.ts` (the till customer), `pricing.ts` (an account's prices as the rule wants them, credit helpers), `credit.ts` (`reconcileOutstanding`), `orders.ts` (pay-later orders), `checkout.ts` (the optional session at card checkout), `api.ts` (the customer routes). |
| `ids.ts` | `crypto`-backed order ids and human-readable `SPT-XXXX-XXXX` references. |

## Security notes

- **Server-side repricing.** `create-payment` accepts only `{id, quantity}`
  pairs and recomputes subtotal, volume break, promo, fitting and total from
  the catalogue. Client prices are never read.
- **Idempotency.** The client's `idempotencyKey` is forwarded to Square, which
  deduplicates for 24 hours — a double-clicked Pay button cannot double-charge.
- **Timing-safe compare.** Admin passwords are compared with
  `crypto.timingSafeEqual` over equal-length SHA-256 digests, so neither length
  nor prefix leaks through response timing.
- **Never fail open.** A missing `ADMIN_PASSWORD` produces 503, not open access.
- **Order lookup.** `/api/orders` requires reference *and* email, and returns an
  identical 404 for "no such order" and "wrong email", so it cannot be used to
  enumerate orders.
- **Account prices.** A customer's prices are read fresh on every order and never cached or sent anywhere public;
  `GET /api/account/prices` answers only the signed-in account's own (cookie only, `no-store`). The assistant is anonymous:
  nothing under `api/_lib/ai/` reads an account, so it can only quote shop prices.
- **Charge-then-persist.** If storing an order fails after a successful charge,
  the endpoint still returns success and logs the reference and payment id for
  reconciliation — asking a charged customer to retry would be worse.
