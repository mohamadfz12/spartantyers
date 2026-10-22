# Spartan Tyres

A commercial truck tyre storefront for **Spartan Tyres Pty Ltd** — Yennora, NSW.
React + Vite SPA with Vercel serverless functions, Square payments, an admin
panel, and a procedurally-generated 3D wheel used throughout the site.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

The site runs fully with **no environment variables set**. The storefront reads
the bundled catalogue, Square checkout shows a "call us to order" fallback, and
`/admin` shows a setup panel rather than a login. Nothing crashes on a missing
key — see [Environment](#environment).

```bash
npm run typecheck    # tsc --noEmit, strict
npm run check:api    # loads every API function the way Vercel does — run before deploying
npm run build        # regenerates sitemap.xml, then builds to dist/
npm run preview      # serve the production build locally
```

`npm run dev` starts everything the site needs locally, in one terminal:

| Name | What | Port |
| ---- | ---- | ---- |
| `web` | Vite, the storefront | 5173 |
| `api` | the functions in `api/`, run the way Vercel runs them (`scripts/dev-api.ts`); Vite proxies `/api` to it | 3110 (`API_PORT`) |
| `ai` | the free practice AI, a stand-in for the real model (`scripts/practice-ai.ts`) | 3410 (`PRACTICE_AI_PORT`) |

Edits to anything under `api/` apply on their own; no restart is needed. The AI
keeps its records in a local database under `.data/` (git-ignored). `npm test`
runs the unit tests with no network.

---

## Deploying to Vercel

1. Push the repo to GitHub/GitLab.
2. Import it in Vercel. The framework preset (**Vite**), build command and
   output directory are already set in `vercel.json` — accept the defaults.
3. Add environment variables (Settings → Environment Variables). Copy the keys
   from `.env.example`; nothing is required to get a working deploy, but see
   below for what each one unlocks.
4. Deploy.

`vercel.json` also handles the SPA rewrite (every non-`/api` path falls through
to `index.html`), immutable caching for hashed assets, and baseline security
headers.

### Going live checklist

- [ ] `SQUARE_ENVIRONMENT=production` with production Square credentials
- [ ] A Vercel KV store created and linked (otherwise **orders are lost on cold
      start** — see [Persistence](#persistence))
- [ ] `ADMIN_PASSWORD` and a random `ADMIN_SESSION_SECRET` set
- [ ] `PUBLIC_SITE_URL` set to the real domain
- [ ] Domain added in Vercel, and `ORIGIN` in `scripts/generate-sitemap.mjs`
      updated if the domain differs from `spartantrucktyres.com.au`
- [ ] Replace the Google tag id in `src/config/site.ts` (`analytics.gtagId`) if
      the Ads account changes

---

## Environment

Full annotated list in [`.env.example`](./.env.example). Summary:

| Variable | Required? | Without it |
|---|---|---|
| `SQUARE_ACCESS_TOKEN` `SQUARE_APPLICATION_ID` `SQUARE_LOCATION_ID` | for card checkout | `/api/square/*` returns 503; checkout shows "phone your order through" |
| `SQUARE_ENVIRONMENT` | no (`sandbox`) | Sandbox SDK + sandbox API host |
| `SQUARE_AFTERPAY_ENABLED` | no (on) | Set to `false` to hide the Afterpay option; the AI assistant then stops mentioning it too |
| `ADMIN_PASSWORD` | for `/admin` | Admin endpoints 503; panel shows a setup guide. **Never falls open.** |
| `ADMIN_SESSION_SECRET` | recommended | Derived from `ADMIN_PASSWORD`, so rotating the password logs everyone out |
| `KV_REST_API_URL` `KV_REST_API_TOKEN` | **strongly recommended** | In-memory store, wiped every cold start |
| `OPENAI_API_KEY` | for the AI chat and voice calls | The chat shows quick keyword answers from the real site data, and there is no Call button (see `.env.example`) |
| `OPENAI_CHAT_MODEL` | no | The chat uses `gpt-4.1-mini` |
| `DATABASE_URL` or `POSTGRES_URL` | for the AI on Vercel | The AI keeps its chats, calls and spending in **Postgres, even when the store above uses KV**; without it the AI is off |
| `ADMIN_SESSION_SECRET` | for the AI on Vercel | Keys the hash that identifies a visitor for the limits; without it the AI is off |
| `PROMO_CODES` | no | Built-in code table |
| `LOW_STOCK_THRESHOLD` | no (`24`) | — |
| `PUBLIC_SITE_URL` | no | Falls back to the Vercel deployment URL |

---

## Architecture

```
api/                    Vercel serverless functions (Node) — 9 routable files
  _lib/                 http, auth, pricing, promos, square, store, catalogue
    handlers/           the admin + square handlers, kept out of routing
  square/[action].ts    -> /api/square/config, /api/square/create-payment
  admin/[action].ts     -> /api/admin/{login,stats,products,orders,enquiries,
                           ai-status,ai-settings,ai-conversations,ai-conversation}
  ai/[action].ts        -> /api/ai/{chat,outcome,status,voice}, the customer assistant
                           (chat and voice calls; the code is in api/_lib/ai/)
  inventory, contact, newsletter, orders, promo/, services/
src/
  config/site.ts        SINGLE SOURCE OF TRUTH for every business fact
  data/                 catalogue, brands, content, blog, faq, reviews, types
  lib/                  api client (the UI↔API contract), utils
  hooks/                scroll, pointer, media-query, storage, a11y helpers
  store/                cart, ui (theme/compare/axle/toasts/quality), admin
  components/
    three/              the 3D wheel system (see below)
    motion/             Reveal, Stagger, Parallax, Magnetic, Tilt, Marquee…
    ui/                 hand-rolled accessible primitives (no Radix)
    layout/ shop/ checkout/ marketing/ admin/ brand/
  pages/                one file per route
scripts/                sitemap generator
```

### Key decisions

**`src/config/site.ts` is the only place business facts live.** Phone, email,
both addresses, hours, GST rate, fitting fee, delivery promise, partner
business. Rebranding or changing a phone number is a one-file edit — nothing
else hard-codes them.

**The API never trusts client prices.** `api/_lib/pricing.ts` recomputes the
authoritative order total from product ids + quantities, mirroring the volume
price-break and promo maths in `src/store/cart.ts`. The checkout sends
`lines: [{id, quantity}]` and displays the server's returned total. It also
sends `expectedTotal` — the figure on the Pay button — purely as a check: if
the server's total differs (a price changed under an open cart, an admin
override, a minimum-quantity promo dropped), nothing is charged and the
customer is told why.

**The catalogue follows Spartan's own price list.** `src/data/products.ts`
mirrors the June 2026 Range Catalogue (RETAIL) and the Lionshead Barcode
Catalogue: every SKU is the barcode value, `price` is the published RRP, and a
`null` price is POA (price on application / build to order). POA lines are
listed and fully specced but never reach the cart — they open a quote form
that lands in the admin inbox tagged `quote`, and the API refuses them at
checkout. The TRADE catalogue is confidential and is deliberately not in the
bundle. Manufacturer figures that are not published for a line (load index,
speed symbol, EU label…) are `null` and display as "to be confirmed" rather
than an invented number; `npm run check` guards all of this. Product photos are
the catalogue's own shots, cropped and squared in `public/img/products/`, keyed
by pattern in `src/data/media.ts`.

**A saved cart is re-priced on load.** The cart persists to localStorage, so
`src/store/cart.ts` re-reads every line's price and SKU from the catalogue on
hydration and drops lines that left the range or became POA.

**Square charges are idempotent.** One `idempotencyKey` per checkout attempt,
reused across retries, so a double-click or a retry after a network blip cannot
double-charge.

**Admin auth is stateless and fails closed.** A timing-safe password compare
issues an HMAC-signed token with a 12-hour expiry. With `ADMIN_PASSWORD` unset,
every admin endpoint 503s.

**The admin and Square endpoints share one function each.** Vercel creates a
serverless function per routable file under `api/`, and the Hobby plan allows
twelve per deployment. Rather than drop features, the five admin endpoints and
the two Square endpoints are served by `[action].ts` dynamic routes that
dispatch to handlers in `api/_lib/handlers/` — a path segment starting with `_`
is excluded from routing. **Every public URL is unchanged.** That puts the
deployment at 9 functions. If you add more, keep an eye on the ceiling: the
build will succeed and the *deploy* will fail, which is a confusing place to
discover it.

**Every data module is derived, not duplicated.** Product ids, max load in kg,
max speed in km/h, size counts, brand SKU counts and the home page stats are all
computed from the catalogue, so they cannot drift out of sync with it.

---

## The 3D wheel

The wheel is the site's recurring motif — hero, product pages, cart lines, the
axle diagram, the Wheel Lab. It is **generated from the catalogue**, with no
binary assets at all: no `.glb`, no `.hdr`, no texture files.

| File | Role |
|---|---|
| `wheelGeometry.ts` | Turns a size code into real proportions. `295/80R22.5` → section width, aspect ratio, rim diameter → half-width, rim radius, crown radius. Also the tread pattern table and block layout maths. |
| `wheelTextures.ts` | Every texture drawn at runtime on a 2D canvas — the sidewall is **stamped with the actual brand, pattern, size, load index and ply** of the product being viewed. Includes a procedural studio environment map so the alloy has something to reflect. |
| `TruckWheel.tsx` | The model: a `LatheGeometry` carcass, an `InstancedMesh` of tread blocks, branded sidewall discs, a six-spoke rim and a ten-stud hub. |
| `scene.tsx` | Canvas, lighting rig and the three scene variants. **All three.js imports live here** so Vite keeps them in one lazy chunk. |
| `StaticWheel.tsx` | SVG fallback, drawn from the same pattern table. |
| `index.tsx` | `HeroWheel`, `ProductWheel`, `WheelConfigurator`, `CompactWheel` — lazy wrappers with WebGL detection. |

Because the proportions come from the size code, a `385/65R22.5` super-single
genuinely renders wider and squatter than a `215/75R17.5`, and a low-profile
casing shows proportionally more rim. The tread is real geometry — block count,
groove width and skew angle all differ by family — not a texture.

**It degrades at every level:** no WebGL, a lost context, reduced-motion, a
`balanced`/`off` quality preference, or simply being far down the page all fall
back to the SVG wheel. three.js is never on the critical path.

---

## Accessibility & motion

- Every animation checks `prefers-reduced-motion` and collapses to an instant
  state change. The `motion/` primitives handle this — pages don't hand-roll it.
- The UI primitives are hand-rolled but keyboard-complete: focus trapping and
  restoration in `Dialog`/`Sheet`, roving tabindex with arrow keys in `Tabs`,
  `aria-expanded`/`aria-controls` in `Accordion`, partial-fill `Rating` with a
  real `aria-label`.
- The axle diagram is decorative (`aria-hidden`); the radio-button row beneath it
  is the real control.
- Skip link, one `<h1>` per page, semantic tokens so both colour schemes work.

## SEO

Per-page `<Seo>` writes title, description, canonical, Open Graph, Twitter and
JSON-LD. `index.html` ships hand-written defaults and `AutoPartsStore`
structured data for the home page, and `scripts/generate-sitemap.mjs` emits
every URL from the real data at build time (57 with the current catalogue).
Product JSON-LD carries an `Offer` only for lines with a published price — an
offer without a price is invalid, so POA lines simply have none.

This is a client-rendered SPA, so meta tags are written after hydration.
Googlebot renders JavaScript and sees them; some other crawlers will not.
`src/components/Seo.tsx` is the seam to swap for prerendering if full crawler
coverage of every page becomes a requirement.

## Persistence

`api/_lib/store.ts` uses Vercel KV / Upstash over plain `fetch` when
`KV_REST_API_URL` and `KV_REST_API_TOKEN` are present, and a `globalThis`
in-memory map otherwise.

**The in-memory path is development-only.** Serverless instances are recycled,
so without KV configured, orders, enquiries, subscribers and stock overrides are
lost on every cold start. Set up KV before taking real orders.

## The AI assistant (chat and voice)

The customer assistant is one function, `api/ai/[action].ts`, with its code in
`api/_lib/ai/`. Staff see every chat and call, and switch the chat and voice on
and off and set the daily and monthly US$ limits, in the admin panel (AI
assistant and AI conversations).

- **Database.** It needs Postgres (`DATABASE_URL` or `POSTGRES_URL`) **even when
  the store above uses KV**, and `ADMIN_SESSION_SECRET` on Vercel. Without them
  the AI is off and the site shows quick keyword answers. Locally it keeps its
  records in `.data/` and needs neither.
- **Chat.** OpenAI chat completions (`OPENAI_API_KEY`, `OPENAI_CHAT_MODEL`). It only
  mentions Afterpay while checkout offers it (`SQUARE_AFTERPAY_ENABLED`).
- **Voice.** OpenAI Realtime (`OPENAI_API_KEY`), connected from the customer's
  browser. The function that opens a call also watches it and hangs it up, so it
  needs a long `maxDuration` (`vercel.json` sets 300 s, the Hobby plan's limit,
  and **Fluid compute should be on in the Vercel project settings** so a long
  duration is allowed). A call is shortened to fit: about 4 minutes on 300 s.
  **10-minute calls need Vercel Pro** with `maxDuration` raised to 800 in
  `vercel.json` (and `AI_FUNCTION_MAX_SECONDS=800`, `VOICE_MAX_SECONDS=600`).
  **Each live call keeps one function instance busy for as long as the call
  lasts**, so several calls at once (three at most, one per visitor) mean several
  instances running at the same time, and that is billed as function time.
  A call ends after 120 seconds with no speech from the customer, and as soon as
  voice is switched off in the admin panel (within about 10 seconds).
- **Local testing.** `npm run dev` also starts a free practice AI, so nothing
  real is called. `npm test` needs no network.

## Dependencies

React 18, React Router 6, Tailwind 3, framer-motion 11, three.js + R3F 8 + drei,
zustand, lucide-react, clsx, tailwind-merge. That's it.

No UI component library — the primitives in `src/components/ui/` are
hand-rolled. No chart library — the admin revenue chart is inline SVG. No Square
SDK — the API calls Square's REST endpoints with `fetch`, and the browser loads
the Web Payments SDK from Square's CDN at runtime.
