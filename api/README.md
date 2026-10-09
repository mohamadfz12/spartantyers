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
| `api/admin/[action].ts` | `/api/admin/{login,stats,products,orders,enquiries}` |
| `api/square/[action].ts` | `/api/square/{config,create-payment}` |

Each dispatches on `req.query.action` to a handler in `api/_lib/handlers/`.
Anything under a path segment beginning with `_` is excluded from routing, so
those handlers do not become functions of their own. **No public URL changes** —
`/api/admin/stats` is still `/api/admin/stats`.

Current count: **9 routable files**. Adding a tenth is fine; a thirteenth will
build successfully and then fail at the deploy step.

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
| `/api/chat` | POST | public | `ANTHROPIC_API_KEY` *(optional)* | Keyword-matching offline responder built from real site data |
| `/api/admin/login` | POST | public (issues token) | `ADMIN_PASSWORD` **(required)**, `ADMIN_SESSION_SECRET` *(recommended)* | **503** "admin not configured" |
| `/api/admin/stats` | GET | **Bearer** | `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `LOW_STOCK_THRESHOLD` *(optional)*, `KV_REST_API_*` | **503** if unconfigured, **401** if token invalid/expired |
| `/api/admin/products` | GET, PATCH | **Bearer** | `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `KV_REST_API_*` | **503** / **401** as above |
| `/api/admin/orders` | GET, PATCH | **Bearer** | `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `KV_REST_API_*` | **503** / **401** as above |
| `/api/admin/enquiries` | GET | **Bearer** | `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `KV_REST_API_*` | **503** / **401** as above |

### Request / response detail

| Endpoint | Request body / query | Success response |
| --- | --- | --- |
| `GET /api/inventory` | — | `{ products: Product[], updatedAt: string }` |
| `GET /api/square/config` | — | `{ applicationId, locationId, environment, afterpayEnabled, afterpayMaxOrder }` |
| `POST /api/square/create-payment` | `{ sourceId, verificationToken?, idempotencyKey, fulfilment, fittingTyres, promoCode?, customer{name,email,phone,company?}, address?{line1,suburb,state,postcode}, lines[{id,quantity}], notes? }` | `{ ok: true, reference, orderId, paymentId, total, receiptUrl? }` |
| `POST /api/promo/validate` | `{ code, tyreCount? }` | `{ valid, code?, percentOff?, description?, reason? }` |
| `POST /api/services/fitting` | `{ tyres }` | `{ tyres, perTyre, total }` |
| `POST /api/contact` | `{ name, email, phone?, company?, enquiryType, message }` | `{ ok: true }` |
| `POST /api/newsletter` | `{ email }` | `{ ok: true, alreadySubscribed? }` |
| `GET /api/orders` | `?reference=…&email=…` | `{ order: Order }` |
| `POST /api/chat` | `{ messages: [{ role: 'user'\|'assistant', content }] }` | `{ reply }` |
| `POST /api/admin/login` | `{ password }` | `{ token, expiresAt }` |
| `GET /api/admin/stats` | — | `{ revenue, orderCount, unitsSold, averageOrderValue, lowStock[], revenueByDay[], topProducts[] }` |
| `GET /api/admin/products` | — | `{ products: Product[] }` |
| `PATCH /api/admin/products` | `{ id, patch: { price?, discount?\|null, stock? } }` | `{ product: Product }` |
| `GET /api/admin/orders` | — | `{ orders: Order[] }` |
| `PATCH /api/admin/orders` | `{ id, status }` | `{ order: Order }` |
| `GET /api/admin/enquiries` | — | `{ enquiries[], subscribers[] }` |

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
| `SQUARE_AFTERPAY_ENABLED` | enabled | Set to `false` to report `afterpayEnabled: false`. |
| `ANTHROPIC_API_KEY` | — | Enables live `/api/chat` with `claude-haiku-5-5`. Absent ⇒ offline keyword responder. |
| `PROMO_CODES` | built-in table | JSON array of `{code, percentOff, description, minTyres?}` or an object map. `percentOff` accepts `0.1` or `10`. |
| `LOW_STOCK_THRESHOLD` | `24` | Stock at or below this appears in `admin/stats.lowStock`. |
| `PUBLIC_SITE_URL` | — | Extra allowed CORS origin (for a custom domain). |
| `VERCEL_URL`, `VERCEL_BRANCH_URL`, `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_ENV` | set by Vercel | CORS allow-list. |

## Shared modules (`api/_lib/`)

| File | Responsibility |
| --- | --- |
| `http.ts` | `ApiRequest` / `ApiResponse` types, `readBody`, `ok`, `fail`, `methodGuard`, `applyCors`, `withGuard` error boundary, input validators. |
| `catalogue.ts` | Re-exports `src/data/products.ts` (relative import — the `@/` alias does **not** resolve inside `api/`) and merges stored overrides. |
| `store.ts` | Orders / enquiries / subscribers / overrides. Vercel KV over REST when configured, else a dev-only `globalThis` cache. |
| `pricing.ts` | Authoritative order total. Mirrors `cartTotals()` in `src/store/cart.ts`. |
| `promos.ts` | Promo table from `PROMO_CODES` or built-ins; `resolvePromo(code, tyreCount)`. |
| `auth.ts` | Timing-safe password check, stateless 12-hour HMAC tokens, `requireAdmin` gate. |
| `square.ts` | `POST /v2/payments` over `fetch`, `Square-Version: 2024-10-17`. |
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
- **Charge-then-persist.** If storing an order fails after a successful charge,
  the endpoint still returns success and logs the reference and payment id for
  reconciliation — asking a charged customer to retry would be worse.
