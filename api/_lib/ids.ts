/**
 * Identifier generation.
 *
 * References are the string a customer quotes on the phone, so they avoid
 * ambiguous glyphs (0/O, 1/I) and stay short enough to read out loud. Both
 * helpers use `randomUUID`/`randomBytes` rather than `Math.random`, because an
 * order reference is also the lookup token on `/api/orders`.
 */

import { randomBytes, randomUUID } from 'node:crypto'

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

export function newOrderId(): string {
  return randomUUID()
}

/** e.g. `SPT-7KQ4-M2XB` */
export function newOrderReference(): string {
  const bytes = randomBytes(8)
  let out = ''
  for (let i = 0; i < 8; i += 1) {
    out += ALPHABET[bytes[i]! % ALPHABET.length]
    if (i === 3) out += '-'
  }
  return `SPT-${out}`
}

export function newEnquiryId(): string {
  return randomUUID()
}
