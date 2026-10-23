/**
 * An account keeps its address as one line of text ("12 Example Rd, Yennora NSW 2161"). The checkout wants four
 * fields. This splits the line only when it clearly ends in a state and a 4 digit postcode; anything else returns
 * null and the customer types the address themselves. It never guesses.
 */
export interface AuAddress {
  line1: string
  suburb: string
  state: string
  postcode: string
}

const STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT']

export function parseAuAddress(text: string | null | undefined): AuAddress | null {
  const value = (text ?? '').replace(/\s+/g, ' ').trim()
  if (!value) return null
  const tail = /^(.+?),\s*([A-Za-z][A-Za-z .'-]*?)\s+(NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\s+(\d{4})$/i.exec(value)
  if (!tail) return null
  const [, street, suburb, state, postcode] = tail
  const line1 = (street ?? '').replace(/,\s*$/, '').trim()
  const upper = (state ?? '').toUpperCase()
  if (!line1 || !suburb?.trim() || !STATES.includes(upper) || !postcode) return null
  return { line1, suburb: suburb.trim(), state: upper, postcode }
}
