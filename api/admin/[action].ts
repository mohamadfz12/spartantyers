/**
 * Single entry point for every admin endpoint.
 *
 * WHY THIS IS ONE FILE: Vercel creates one serverless function per routable
 * file, and the Hobby plan allows twelve per deployment. The five admin
 * endpoints were five functions; as a dynamic `[action]` route they are one,
 * and the URLs the client calls are completely unchanged — `/api/admin/stats`
 * still resolves to `/api/admin/stats`. The handlers themselves live under
 * `_lib/handlers/`, which Vercel excludes from routing because of the
 * underscore, so they no longer each become a function of their own.
 *
 * Routes:
 *   POST   /api/admin/login
 *   GET    /api/admin/stats
 *   GET    /api/admin/products   PATCH /api/admin/products
 *   GET    /api/admin/orders     PATCH /api/admin/orders
 *   GET    /api/admin/enquiries
 *   GET    /api/admin/leads       PATCH /api/admin/leads
 */

import type { ApiRequest, ApiResponse } from '../_lib/http.js'
import { applyCors, fail } from '../_lib/http.js'
import login from '../_lib/handlers/admin-login.js'
import stats from '../_lib/handlers/admin-stats.js'
import products from '../_lib/handlers/admin-products.js'
import orders from '../_lib/handlers/admin-orders.js'
import enquiries from '../_lib/handlers/admin-enquiries.js'
import leads from '../_lib/handlers/admin-leads.js'

type Handler = (req: ApiRequest, res: ApiResponse) => Promise<void> | void

const ROUTES: Record<string, Handler> = {
  login,
  stats,
  products,
  orders,
  enquiries,
  leads,
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  applyCors(req, res)

  const raw = req.query?.action
  const action = Array.isArray(raw) ? raw[0] : raw

  const route = action ? ROUTES[action] : undefined
  if (!route) {
    // Never hint at which admin routes exist to an unauthenticated caller.
    fail(res, 404, 'Not found.')
    return
  }

  await route(req, res)
}
