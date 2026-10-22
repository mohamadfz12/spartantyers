/**
 * Whether a customer's message is clearly not in English. The assistant answers in English only, and
 * the model was seen answering a French question helpfully in English without saying so; when this is
 * true the instructions for that one answer tell it the exact sentence to start with.
 *
 * Deliberately cautious: another script (Arabic, Chinese, Cyrillic...) counts at once; in the Latin
 * script it takes a word that is unmistakably not English, or two common ones, so everyday English
 * with a borrowed word (cafe, resume, bon voyage) never counts.
 */

const OTHER_SCRIPT =
  /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}\p{Script=Devanagari}\p{Script=Armenian}\p{Script=Georgian}]/u

/** Greetings and tyre words no English speaker writes: one is enough. */
const STRONG = new Set([
  'bonjour', 'bonsoir', 'merci', 'pneus', 'pneu', 'voudrais', 'livraison',
  'hola', 'gracias', 'neumáticos', 'neumaticos', 'llantas', 'quiero', 'necesito', 'envío',
  'grazie', 'gomme', 'pneumatici', 'vorrei',
  'danke', 'bitte', 'reifen', 'möchte', 'lieferung',
  'obrigado', 'obrigada', 'olá', 'vocês',
])

/** Common words of those languages that English does not use: two are needed. */
const WEAK = new Set([
  'avez', 'vous', 'êtes', 'est-ce', 'combien', 'oui', 'nous', 'votre', 'je', "j'ai", "c'est", 'des', 'les', 'une', 'avec',
  'tienen', 'usted', 'cuánto', 'cuanto', 'cuesta', 'buenos', 'días', 'para', 'por', 'favor', 'tengo', 'una',
  'avete', 'quanto', 'costa', 'sono', 'buongiorno',
  'haben', 'sie', 'ich', 'wieviel', 'kosten', 'guten', 'und',
  'têm', 'preciso',
])

export function looksForeign(text: string): boolean {
  if (OTHER_SCRIPT.test(text)) return true
  const words = text.toLowerCase().match(/[\p{L}'-]+/gu) ?? []
  let weak = 0
  for (const w of words) {
    if (STRONG.has(w)) return true
    if (WEAK.has(w)) weak++
  }
  return weak >= 2
}
