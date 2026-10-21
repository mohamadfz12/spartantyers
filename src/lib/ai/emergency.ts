/**
 * The fixed safety answer. A message that clearly describes danger on the road (a tyre blowout
 * or failure while driving, a truck or tyre fire, smoke, a crash, someone hurt, being stuck on a
 * highway shoulder) is answered at once with the same safety words, with no AI involved and no
 * limit in the way, also when the assistant is switched off.
 *
 * The test is a list of whole-word patterns. It leans towards answering: a message that only
 * sounds alarming gets the safety answer, which is harmless and useful. What it must not do is
 * answer ordinary tyre talk with it, so every pattern leaves out the everyday phrases that share
 * a word ("fire up the engine", "blowout resistant", "how do I avoid blowouts", "flat tyre at the
 * depot"). Words that mean danger only while it is happening need a present-danger shape ("my
 * steer tyre just blew out", "we've had a blowout") and are ignored in stories about the past and
 * in hypotheticals (VETO). tests/ai-rules.test.ts lists both kinds of phrase; add to it when this
 * changes.
 *
 * React-free: the engine and the tests import it.
 */
import { site } from '../../config/site.js'
import type { ContactAction } from './protocol.js'

/** The truck, trailer or tyre as the thing that is burning, smoking or blown. */
const VEHICLE = String.raw`(?:truck|trailer|tyres?|tires?|wheels?|brakes?|engine|cab|prime\s+mover|rig|bus|vehicle|load|hubs?|axle)`

/** Someone close to the customer, or the customer, as the person something happened to. */
const PERSON = String.raw`(?:someone|somebody|anyone|the\s+driver|my\s+driver|a\s+driver|i|we|he|she|they|my\s+(?:husband|wife|partner|son|daughter|mate|brother|sister|dad|mum|mom|offsider|co-?driver))`

/** What can sit between the person and the verb: "'ve", "have just", "am now", "are". */
const LEAD = String.raw`(?:'ve|'m|'re|'s)?\s+(?:(?:have|has|am|are|is|just|now|also|already|literally)\s+)*`

/** Sure signs of danger: nothing else in the message makes these less urgent. */
const STRONG: string[] = [
  // Fire
  String.raw`\bon\s+fire\b`,
  String.raw`\b(?:caught|catching|catches|catch)\s+fire\b`,
  String.raw`\b${VEHICLE}\s+fire\b(?![-\s]*(?:ban|season|risk|rated|resistant|safety|extinguisher|retardant))`,
  String.raw`\bthere'?s\s+(?:a\s+)?fire\b`,
  String.raw`\bthere\s+is\s+(?:a\s+)?fire\b`,
  String.raw`\b(?:burst|bursting|burst\s+into)\s+(?:into\s+)?flames?\b`,
  String.raw`\bflames?\s+(?:coming|from|shooting|are|is)\b`,
  // Smoke
  String.raw`\bsmoke\s+(?:is\s+|was\s+)?(?:coming|comes|billowing|pouring|rising|from|out\s+of)\b`,
  String.raw`\b(?:see|saw|smell|smelt|smelling|lots\s+of|so\s+much)\s+(?:some\s+|a\s+lot\s+of\s+|thick\s+|black\s+)?smoke\b`,
  String.raw`\b${VEHICLE}\s+(?:is\s+|are\s+|has\s+started\s+|started\s+)?smoking\b`,
  String.raw`\bsmoking\s+${VEHICLE}\b`,
  String.raw`\bsmell(?:s|ing)?\s+(?:like\s+|of\s+)?(?:something\s+)?burn(?:t|ing)\s+(?:rubber|tyre|tire)?`,
  // Emergency services asked for or dialled
  String.raw`\b(?:call|calling|need|get|send|ring)\s+(?:the\s+|an?\s+)?(?:police|ambulance|paramedics?|fire\s+brigade|fire\s+department)\b`,
  // 000, but not the end of a number written with spaces ("1 000 dollars")
  String.raw`(?<![\d,.$])(?<!\d[\s\xa0])000(?!\d)`,
  String.raw`\btriple\s*(?:zero|0)\b`,
  // Someone hurt or unwell right now
  String.raw`\b(?:someone|somebody|anyone|the\s+driver|my\s+driver|a\s+driver|my\s+(?:husband|wife|partner|son|daughter|mate|brother|sister|dad|mum|mom|offsider)|he|she|they)\s+(?:is\s+|has\s+|got\s+|just\s+|been\s+)*(?:badly\s+|seriously\s+)?(?:hurt|injured)\b`,
  String.raw`\b(?:i'?m|i\s+am|i'?ve\s+been|i\s+have\s+been|i\s+got)\s+(?:badly\s+|seriously\s+)?(?:hurt|injured)\b`,
  String.raw`\b(?:badly|seriously)\s+(?:hurt|injured)\b`,
  String.raw`\b(?:unconscious|unresponsive|overdos\w*|choking)\b`,
  String.raw`\b(?:having|is\s+having|just\s+had)\s+a\s+(?:heart\s+attack|stroke|seizure)\b`,
  String.raw`\b(?:not|stopped|stops|can'?t|cannot|isn'?t)\s+breath(?:e|ing)\b`,
  String.raw`\bchest\s+pains?\b`,
  String.raw`\bbleeding\s+(?:badly|heavily|a\s+lot|everywhere)\b`,
]

/**
 * Words that only mean danger when it is happening now: they also turn up in questions, advice
 * and stories. So each needs a present-danger shape, and none counts in a message that is plainly
 * about the past or a hypothetical (VETO).
 */
const NOW: string[] = [
  // A blowout or tyre failure, happening or just happened
  String.raw`\b${PERSON}${LEAD}(?:had|got|having|get|getting|suffered)\s+(?:a\s+|an\s+)?(?:(?:tyre|tire|steer|drive|trailer|front|rear)\s+){0,2}(?:blow[- ]?out|tyre\s+failure|tire\s+failure|tread\s+separation)\b`,
  String.raw`\b(?:tyre|tire)s?\s+(?:just\s+|has\s+|have\s+|suddenly\s+)*(?:blew|blown|exploded|burst(?!\s+pressure)|disintegrated|shredded|delaminated)\b`,
  String.raw`\b(?:tyre|tire)s?\s+(?:just\s+|suddenly\s+)*(?:blew\s+out|blown\s+out|came\s+apart|let\s+go|went\s+bang)\b`,
  String.raw`\bblew\s+(?:out\s+)?(?:a|my|our|the|another)\s+(?:steer\s+|drive\s+|trailer\s+|front\s+|rear\s+)?(?:tyre|tire)\b`,
  String.raw`\bblow[- ]?out\s+(?:on|at|in|just)\s+(?:the\s+)?(?:highway|freeway|motorway|road|bridge|tunnel|hume|m\d)\b`,
  String.raw`\b(?:lost|losing)\s+(?:a\s+|the\s+)?(?:tyre|tire|wheel)\s+(?:on|at|while|whilst|at\s+speed)\b`,
  String.raw`\b(?:wheel|wheels)\s+(?:just\s+|has\s+|have\s+)*(?:came|come|fell|fallen|flew|flown)\s+off\b`,
  // A crash, rollover or collision
  String.raw`\b${PERSON}${LEAD}(?:crashed|rolled|jack-?knifed|collided|hit\s+(?:a|another)\s+(?:car|truck|vehicle|tree|barrier|pole))\b`,
  String.raw`\b${PERSON}${LEAD}(?:had|been\s+in|in)\s+(?:a\s+|an\s+)?(?:crash|accident|collision|rollover)\b`,
  String.raw`\b(?:truck|trailer|rig|bus|prime\s+mover|vehicle)\s+(?:just\s+|has\s+|have\s+)*(?:crashed|rolled\s+over|jack-?knifed|overturned|collided)\b`,
  String.raw`\bthere(?:'?s|\s+(?:has|was|is))\s+(?:been\s+)?(?:a\s+|an\s+)?(?:crash|accident|collision)\b`,
  // Stuck or broken down in a dangerous place
  String.raw`\b(?:stuck|stranded|broken\s+down|breakdown|pulled\s+over|stopped|parked)\s+(?:on|at|beside|next\s+to|in)\s+(?:the\s+)?(?:side\s+of\s+(?:the\s+)?)?(?:highway|freeway|motorway|road|hard\s+shoulder|shoulder|breakdown\s+lane|emergency\s+lane|emergency\s+stopping\s+lane|bridge|tunnel|bend)\b`,
  String.raw`\b(?:on|at)\s+the\s+(?:highway|freeway|motorway|hume|pacific|m\d+)\b[^.?!]{0,40}\b(?:stuck|stranded|broken\s+down|blew|blown|flat)\b`,
  // Fainted, collapsed, trapped
  String.raw`\b${PERSON}${LEAD}(?:collapsed|fainted|passed\s+out|trapped)\b`,
  // "Emergency" itself, said about now
  String.raw`\bemergency\s*!`,
  String.raw`^\W*emergency\W*$`,
  String.raw`\b(?:it'?s|it\s+is|this\s+is|its|i\s+have|we\s+have|i'?ve\s+got|we'?ve\s+got|there'?s|there\s+is)\s+an?\s+(?:roadside\s+)?emergency\b`,
]

/**
 * The past and hypotheticals: "how do I avoid", "what causes", "last time", "in case of", "if a
 * tyre blows". A message with one of these is a question, not a report. It is kept narrow on
 * purpose: "my tyre just blew out, how do I get a replacement?" is still a report.
 */
const VETO = String.raw`\b(?:avoid(?:ing)?|prevent(?:ing|ion)?|reduce|reducing|resist(?:ant|ance)?|protect(?:ion|ed|ing)?|proof|cause[sd]?|why\s+(?:do|does|did|would)|last\s+(?:time|year|month|week|visit)|once|years?\s+ago|months?\s+ago|in\s+case|if\s+(?:a|my|the|i|we|one)|insurance|safe\s+from|ever\s+(?:had|been|seen)|have\s+there\s+been|rated|warranty|claim)\b`

const STRONG_TEST = new RegExp(STRONG.join('|'), 'i')
const NOW_TEST = new RegExp(NOW.join('|'), 'i')
const VETO_TEST = new RegExp(VETO, 'i')

/** True when a message describes danger now. */
export function isEmergency(text: string): boolean {
  const t = text.replace(/[‘’]/g, "'")
  return STRONG_TEST.test(t) || (NOW_TEST.test(t) && !VETO_TEST.test(t))
}

/** The emergency answer: the same every time, with call buttons. */
export const EMERGENCY: { text: string; actions: ContactAction[] } = {
  text: `Safety comes first. Pull over safely if you can, turn your hazard lights on and stay well clear of traffic. If anyone is hurt or in danger, call 000 now. Once everyone is safe, call Spartan Tyres on ${site.phone.display} and we will help with a replacement.`,
  actions: [
    { kind: 'call', label: 'Call 000', href: 'tel:000' },
    { kind: 'call', label: `Call ${site.phone.display}`, href: site.phone.href },
  ],
}
