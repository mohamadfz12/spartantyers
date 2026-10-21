/**
 * Single entry point for the Square endpoints.
 *
 * Collapsed into one dynamic route for the same reason as the admin group:
 * Vercel bills a serverless function per routable file and the Hobby plan
 * allows twelve. The public URLs are unchanged — `/api/square/config` and
 * `/api/square/create-payment` both still resolve exactly as before, so no
 * client code moves.
 *
 * Routes:
 *   GET  /api/square/config
 *   POST /api/square/create-payment
 */

import type { ApiRequest, ApiResponse } from '../_lib/http.js'
import { applyCors, fail } from '../_lib/http.js'
import config from '../_lib/handlers/square-config.js'
import createPayment from '../_lib/handlers/square-create-payment.js'

type Handler = (req: ApiRequest, res: ApiResponse) => Promise<void> | void

const ROUTES: Record<string, Handler> = {
  config,
  'create-payment': createPayment,
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  applyCors(req, res)

  const raw = req.query?.action
  const action = Array.isArray(raw) ? raw[0] : raw

  const route = action ? ROUTES[action] : undefined
  if (!route) {
    fail(res, 404, 'Not found.')
    return
  }

  await route(req, res)
}
