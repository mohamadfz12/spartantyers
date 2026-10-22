/**
 * The tiny formatting the assistant may use in its answers: `**bold**` and links to pages on this
 * site, `[Tyre Finder](/finder)`. Nothing else is interpreted, and a link to anywhere but this
 * site is shown as its words only, never as a link.
 *
 * React-free so the tests can run it; the chat turns the pieces into elements.
 */

export type Piece =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'link'; text: string; to: string }

/** A path on this site: starts with one slash, no scheme, no host, no backslash. */
export function isInternalPath(to: unknown): to is string {
  return typeof to === 'string' && to.length <= 200 && /^\/(?!\/)[A-Za-z0-9\-._~/?=&%#+,@]*$/.test(to)
}

const TOKEN = /\[([^\]\n]{1,80})\]\(((?:[^()\s]|\([^()\s]*\)){1,200})\)|\*\*([^*\n]{1,200})\*\*/g

/** Half-written markers from a streaming answer ("**Gre") are not shown. */
const clean = (text: string) => text.replace(/\*\*/g, '')

export function parseMarkup(input: string): Piece[] {
  const out: Piece[] = []
  let last = 0
  const push = (piece: Piece) => {
    if (piece.text) out.push(piece)
  }
  for (const m of input.matchAll(TOKEN)) {
    const at = m.index ?? 0
    push({ kind: 'text', text: clean(input.slice(last, at)) })
    if (m[3] !== undefined) push({ kind: 'bold', text: m[3] })
    else if (isInternalPath(m[2])) push({ kind: 'link', text: m[1], to: m[2] })
    else push({ kind: 'text', text: m[1] })
    last = at + m[0].length
  }
  push({ kind: 'text', text: clean(input.slice(last)) })
  return out
}
