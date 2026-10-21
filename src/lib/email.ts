/**
 * The one rule for what counts as an email address. The server (api/_lib/http.ts `asEmail`) and
 * the assistant's card forms (src/lib/ai/cardForm.ts) both use it, so a form never accepts what
 * the server would refuse. React-free, and its imports end in `.js`, because the API runs it too.
 */

/** Something@something with at least one dot, and no empty part ("a@b..cc" and "a@.b" are refused). */
export const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/

/** The longest address accepted. */
export const EMAIL_MAX = 254

export const isEmail = (value: string): boolean => value.length <= EMAIL_MAX && EMAIL_RE.test(value)
