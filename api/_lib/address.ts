/**
 * The delivery address check shared by card checkout and pay-later orders, so both ask for the same
 * things and answer with the same words.
 */
import { asString } from './http.js'
import type { StoredOrder } from './store.js'

const AU_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT']

export type AddressCheck = { ok: true; address: NonNullable<StoredOrder['address']> } | { ok: false; error: string }

/** A delivery address from request input, or the message to show. */
export function checkDeliveryAddress(input: unknown): AddressCheck {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'A delivery address is required for delivered orders.' }
  }

  const raw = input as Record<string, unknown>

  const line1 = asString(raw.line1, 160)
  const suburb = asString(raw.suburb, 80)
  const stateInput = asString(raw.state, 40)
  const postcode = asString(raw.postcode, 10)

  if (!line1) return { ok: false, error: 'Please enter the street address for delivery.' }
  if (!suburb) return { ok: false, error: 'Please enter the delivery suburb.' }

  const state = stateInput ? stateInput.toUpperCase() : ''
  if (!AU_STATES.includes(state)) return { ok: false, error: `State must be one of ${AU_STATES.join(', ')}.` }

  if (!postcode || !/^\d{4}$/.test(postcode)) return { ok: false, error: 'Postcode must be four digits.' }

  return { ok: true, address: { line1, suburb, state, postcode } }
}
