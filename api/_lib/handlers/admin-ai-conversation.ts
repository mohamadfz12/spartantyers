/**
 * GET /api/admin/ai-conversation?id= -> { conversation }
 *
 * One chat in full and in order: what the customer and the assistant said (words said on a call
 * are marked), what the assistant did (searches, pages opened, cards shown and what the customer
 * did with each), the calls (start, end, seconds, why it ended) and the linked order reference.
 */

import { requireAdmin } from '../auth.js'
import { fail, methodGuard, ok, queryParam, withGuard } from '../http.js'
import { AiDbUnavailable } from '../ai/db.js'
import { getConversation } from '../ai/admin.js'
import { isConversationId } from '../../../src/lib/ai/protocol.js'

export default withGuard(async (req, res) => {
  if (!methodGuard(req, res, ['GET'])) return
  if (!requireAdmin(req, res)) return

  res.setHeader('Cache-Control', 'private, no-store')

  const id = queryParam(req, 'id')
  if (!isConversationId(id)) {
    fail(res, 400, 'Missing or invalid chat id.')
    return
  }

  try {
    const conversation = await getConversation(id)
    if (!conversation) {
      fail(res, 404, 'No such chat. It may have been deleted after its retention period.')
      return
    }
    ok(res, { conversation })
  } catch (error) {
    if (error instanceof AiDbUnavailable) {
      fail(res, 503, 'The AI database is not connected, so there are no chats to show.')
      return
    }
    throw error
  }
})
