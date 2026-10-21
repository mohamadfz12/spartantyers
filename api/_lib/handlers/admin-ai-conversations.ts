/**
 * GET /api/admin/ai-conversations?filter=all|chat|call|person&q=&cursor=
 *   -> { conversations, next, total }
 *
 * The assistant's chats, newest activity first, 25 at a time (`next` is the cursor for the next
 * page, or null). `filter`: chat (typed in the chat), call (has a voice call), person (asked for a
 * person on the sales team). `q` searches what was said. No address or hash is ever returned.
 */

import { requireAdmin } from '../auth.js'
import { fail, methodGuard, ok, queryParam, withGuard } from '../http.js'
import { AiDbUnavailable } from '../ai/db.js'
import { isConversationFilter, listConversations } from '../ai/admin.js'

const Q_MAX = 100

export default withGuard(async (req, res) => {
  if (!methodGuard(req, res, ['GET'])) return
  if (!requireAdmin(req, res)) return

  res.setHeader('Cache-Control', 'private, no-store')

  const filter = queryParam(req, 'filter') || 'all'
  if (!isConversationFilter(filter)) {
    fail(res, 400, 'The filter must be all, chat, call or person.')
    return
  }
  const q = (queryParam(req, 'q') ?? '').trim().slice(0, Q_MAX)
  const cursor = queryParam(req, 'cursor')

  try {
    ok(res, await listConversations({ filter, q, cursor }))
  } catch (error) {
    if (error instanceof AiDbUnavailable) {
      fail(res, 503, 'The AI database is not connected, so there are no chats to show.')
      return
    }
    throw error
  }
})
