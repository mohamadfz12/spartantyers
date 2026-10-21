/**
 * Lets the checkout tell the server which assistant chat helped fill the cart, so staff see the chat
 * with the order. Reads the chat's record in session storage directly, so the checkout does not
 * have to load the assistant itself.
 */
import { isConversationId } from './protocol.js'

/** Where the assistant keeps its chat for this browser tab (src/store/assistant.ts writes it). */
export const ASSISTANT_STORAGE_KEY = 'spt-assistant-v1'

/**
 * The chat's id when the cart was filled from one of its cards during this session, otherwise
 * undefined. A chat that never put anything in the cart is not linked to the order.
 */
export function assistantConversationForOrder(): string | undefined {
  try {
    const raw = globalThis.sessionStorage?.getItem(ASSISTANT_STORAGE_KEY)
    if (!raw) return undefined
    const kept = JSON.parse(raw) as { conversationId?: unknown; cartFromChat?: unknown }
    return kept.cartFromChat === true && isConversationId(kept.conversationId) ? kept.conversationId : undefined
  } catch {
    // Storage blocked or unreadable: the order simply goes unlinked.
    return undefined
  }
}
