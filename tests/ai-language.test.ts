import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { looksForeign } from '../src/lib/ai/language.js'
import { ENGLISH_ONLY_NOTICE, fixedInstructions, instructions } from '../api/_lib/ai/rules.js'

// The real model answered a French question helpfully in English without saying it only helps in
// English (real test S24, 22 Oct 2026): a clearly foreign message now gets an exact sentence to start with.
describe('looksForeign', () => {
  test('clearly foreign messages', () => {
    for (const m of [
      'Bonjour, avez-vous des pneus 11R22.5 ?',
      'Hola, ¿tienen neumáticos para camión?',
      'Guten Tag, haben Sie Reifen 295/80R22.5?',
      'Ciao, avete gomme 11R22.5? Grazie',
      'Olá, vocês têm pneus para caminhão?',
      'هل لديكم إطارات 11R22.5؟',
      '你们有11R22.5的轮胎吗',
      'Здравствуйте, есть шины 11R22.5?',
      'merci',
      'vous avez des stocks ?',
    ]) assert.equal(looksForeign(m), true, m)
  })
  test('ordinary English, including borrowed words and tyre codes, is never foreign', () => {
    for (const m of [
      'Do you have 11R22.5 drive tyres in stock?',
      'What is the cheapest 295/80R22.5 steer tyre?',
      'Is the cafe near the Yennora warehouse open?',
      'Can I send my resume to the sales team?',
      'Bon voyage, see you at pickup',
      'Do me a favor and add 4 to the cart',
      'What does a load index of 146/143 mean?',
      'My steer tyre just blew out on the M4',
      'Order SPT-ABCD-1234 for test@example.com',
      'Show me the Greforce HD01M page',
      '',
    ]) assert.equal(looksForeign(m), false, m)
  })
})

describe('the English-only notice', () => {
  test('is added to the tail only for a foreign message, and the fixed prefix never changes', () => {
    const english = instructions('2026-10-22', '/')
    const foreign = instructions('2026-10-22', '/', true)
    assert.ok(english.startsWith(fixedInstructions()) && foreign.startsWith(fixedInstructions()))
    assert.equal(english.includes(ENGLISH_ONLY_NOTICE), false)
    assert.ok(foreign.endsWith(ENGLISH_ONLY_NOTICE))
    assert.match(ENGLISH_ONLY_NOTICE, /"Sorry, I can only help in English\."/)
    assert.equal(/[\u2013\u2014]/.test(ENGLISH_ONLY_NOTICE), false)
  })
})
