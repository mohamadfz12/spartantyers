/**
 * Single entry point for the customer account endpoints (one Vercel function).
 *
 *   GET  /api/account/me | prices | orders | statement
 *   POST /api/account/signup | login | logout | forgot | set-password | details | password | order
 *
 * The code is in `api/_lib/accounts/api.ts`; the admin side of accounts goes through
 * `api/admin/[action].ts`, so this is the only new function for the feature.
 */
import type { ApiRequest, ApiResponse } from '../_lib/http.js'
import { applyCors } from '../_lib/http.js'
import { handleAccountRequest } from '../_lib/accounts/api.js'

export default async function handler(req: ApiRequest, res: ApiResponse) {
  applyCors(req, res)
  await handleAccountRequest(req, res)
}
