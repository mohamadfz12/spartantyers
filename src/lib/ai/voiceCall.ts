/**
 * A voice call with the assistant, in the browser. The call store (src/store/call.ts) starts one
 * from a tap and shows what happens through `CallHooks`.
 *
 * A real call: the microphone and the assistant's voice go straight between this browser and OpenAI
 * over WebRTC; OpenAI's events arrive on a data channel. Our server (api/ai/[action].ts,
 * api/_lib/ai/voice.ts) opens the call with this browser's offer, runs the assistant's tools, keeps
 * what was said with the chat, and hangs up when time runs out. The OpenAI key never reaches the
 * browser: the server makes the call at OpenAI and hands back only the answer to our offer.
 *
 * A practice call (the server says so): nothing is connected and nothing costs money. The customer
 * types what they would say, the practice AI answers, and the browser's own voice reads the
 * assistant's words out. It goes through the same steps as a real call, so it tests the same code.
 *
 * Ported from the Lodge concierge's call controller, which has been through real phones.
 */
import { site } from '../../config/site.js'
import { isEmergency } from './emergency.js'
import { cleanPage, type ChatEvent } from './protocol.js'
import {
  addUsage,
  emptyUsage,
  refusalText,
  type PracticeAnswer,
  type PracticeMessage,
  type StartedCall,
  type ToolAnswer,
  type VoiceRefusal,
  type VoiceUsage,
} from './voice.js'

export type CallPhase = 'starting' | 'connecting' | 'live' | 'ended'
/** Who is talking: the customer, the assistant, or nobody (the assistant is working something out). */
export type Talk = 'listening' | 'speaking' | 'thinking'
export type EndReason = 'user' | 'time' | 'lost' | 'error' | 'page' | 'mic' | 'refused'

export type CallHooks = {
  phase: (p: CallPhase, info?: { seconds: number; practice: boolean }) => void
  talk: (t: Talk) => void
  /** The customer's words as they are written down; `key` is the same for one stretch of speech. Empty and final: nothing was caught. */
  heard: (key: string, text: string, final: boolean) => void
  /** The assistant's words as they are spoken; `key` is the same for one answer. */
  said: (key: string, text: string, final: boolean) => void
  /** What the assistant's tools did on screen: a page opened, the contact buttons, a card. */
  did: (events: ChatEvent[]) => void
  /** The customer described danger: the call shows the safety steps and the call buttons. */
  danger: () => void
  /** One of the assistant's tools is running (a search, a price, a card). */
  tool: (running: boolean) => void
  /** The call is over; `message` says why when it is not the customer's own choice; `refusal` is the server's reason for a call that could not start. */
  ended: (reason: EndReason, message: string, refusal?: string) => void
}

type ServerEvent = Record<string, any>

const VOICE_URL = '/api/ai/voice'

/** Sent to the model as "(Call: ...)" notes: the website speaking, never read out (api/_lib/ai/voice-openai.ts). */
const note = (text: string) => ({
  type: 'conversation.item.create',
  item: { type: 'message', role: 'system', content: [{ type: 'input_text', text: `(Call: ${text})` }] },
})

/** The safety steps the assistant says on a call: the chat's emergency answer, written to be spoken. */
export const SPOKEN_EMERGENCY = `Pull over safely if you can and stay clear of traffic. If anyone is hurt or in danger, hang up and call triple zero now. Once everyone is safe, call Spartan Tyres on ${site.phone.display}.`

/** The hidden cue that makes the assistant greet first. It starts with the words the practice call looks for. */
const GREETING_START = 'the call started on page '
const greeting = (page: string) =>
  `${GREETING_START}${page}. Greet the customer in one or two short sentences: say you are the ${site.name} assistant, an AI assistant, and ask how you can help.`

const TIME_UP = 'That is the end of the call time. You can keep typing in the chat, or call again.'

/** The page the customer is on (path and query), for the server to tell the assistant. */
export const pageNow = () => `${window.location.pathname}${window.location.search}`

async function post<T>(
  body: Record<string, unknown>,
  keepalive = false,
): Promise<{ ok: true; data: T } | { ok: false; status: number; data: Record<string, unknown> }> {
  try {
    const res = await fetch(VOICE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive,
    })
    const data = await res.json().catch(() => ({}))
    return res.ok ? { ok: true, data: data as T } : { ok: false, status: res.status, data }
  } catch {
    return { ok: false, status: 0, data: {} }
  }
}

/** Tells the server a call is over (best effort), for example one left behind by a page that went away. */
export function endCallOnServer(call: string, reason: string, beacon = false) {
  const body = JSON.stringify({ action: 'end', call, reason })
  if (beacon && navigator.sendBeacon) navigator.sendBeacon(VOICE_URL, new Blob([body], { type: 'application/json' }))
  else {
    fetch(VOICE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(
      () => {},
    )
  }
}

/** Whether this browser can make a real call: a microphone, WebRTC, and a secure page (https or localhost). */
export const canCall = () =>
  typeof window !== 'undefined' &&
  window.isSecureContext === true &&
  typeof RTCPeerConnection !== 'undefined' &&
  !!navigator.mediaDevices?.getUserMedia

/** How a call reaches OpenAI (or the practice AI): sends client events, delivers server events. */
type Line = { send: (e: Record<string, unknown>) => void; close: () => void }

type Meter = { an: AnalyserNode; buf: Float32Array }

export class VoiceCall {
  private hooks: CallHooks
  private chat: string
  private id = ''
  private practice = false
  private line: Line | null = null
  private pc: RTCPeerConnection | null = null
  private mic: MediaStream | null = null
  private audio: HTMLAudioElement | null = null
  private timers: ReturnType<typeof setTimeout>[] = []
  private usage: VoiceUsage = emptyUsage()
  private heardText = new Map<string, string>()
  private saidText = new Map<string, string>()
  private tools: Promise<void> = Promise.resolve()
  /** An answer is being made (response.created until response.done): a new one has to wait for it. */
  private responding = false
  /** An answer was asked for while another was being made: it is asked for when that one is done. */
  private wanted = false
  /** The assistant's voice is playing (an answer can finish being made before it finishes being spoken). */
  private speaking = false
  private over = false
  private live = false
  private muted = false
  /** Sound: one audio context for the voice meters (the orb) and the louder speaker. */
  private ctx: AudioContext | null = null
  private micMeter: Meter | null = null
  private outMeter: Meter | null = null
  private remote: MediaStream | null = null
  private loud: boolean
  private loudChain: AudioNode[] = []
  /** The website told the assistant to say goodbye (the time or the money ran out): the hang-up that follows is the end of the call, not a drop. */
  private endingSoon = false
  /** A practice call: the browser's own voice is reading the assistant's words out. */
  practiceTalking = false
  private onLeave = () => this.end('page')

  constructor(o: { conversationId: string; hooks: CallHooks; loud?: boolean }) {
    this.chat = o.conversationId
    this.hooks = o.hooks
    this.loud = o.loud === true
  }

  get callId() {
    return this.id
  }

  /**
   * Starts the call. Call it straight from the tap on a Call button: phones only allow the microphone
   * and sound when a tap asked for them. `practice`: the server said calls are practice ones.
   */
  async start(practice: boolean) {
    this.practice = practice
    this.hooks.phase('starting')
    if (!practice) {
      // The speaker and the sound meters first, inside the tap, so a phone lets them play.
      this.audio = document.createElement('audio')
      this.audio.autoplay = true
      this.audio.setAttribute('playsinline', '')
      try {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        this.ctx = Ctx ? new Ctx() : null
        this.ctx?.resume().catch(() => {})
      } catch {
        // No meters: the orb just breathes.
        this.ctx = null
      }
      try {
        this.mic = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        })
      } catch (err) {
        const name = (err as { name?: string })?.name
        return this.stop(
          'mic',
          name === 'NotFoundError' || name === 'OverconstrainedError'
            ? 'No microphone was found. Plug one in, or use your phone, then try again.'
            : 'The microphone is blocked. Allow it for this site (the icon next to the address bar), then try again.',
        )
      }
      if (this.over) return this.release()
      this.micMeter = this.meter(this.mic)
    }

    let offer = ''
    if (!practice) {
      const pc = new RTCPeerConnection()
      this.pc = pc
      pc.ontrack = (e) => {
        if (!this.audio) return
        this.remote = e.streams[0]
        this.audio.srcObject = this.remote
        this.audio.play().catch(() => {})
        this.outMeter = this.meter(this.remote)
        if (this.loud) this.setLoud(true)
      }
      for (const track of this.mic!.getAudioTracks()) pc.addTrack(track, this.mic!)
      const channel = pc.createDataChannel('oai-events')
      channel.onmessage = (m) => {
        try {
          this.handle(JSON.parse(String(m.data)))
        } catch {
          // Not an event: ignored.
        }
      }
      channel.onopen = () => this.opened()
      channel.onclose = () => this.live && this.dropped()
      let dropped: ReturnType<typeof setTimeout> | null = null
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') this.dropped()
        else if (pc.connectionState === 'disconnected') {
          dropped ??= setTimeout(() => pc.connectionState !== 'connected' && this.dropped(), 5000)
        } else if (pc.connectionState === 'connected' && dropped) {
          clearTimeout(dropped)
          dropped = null
        }
      }
      this.line = {
        send: (e) => {
          if (channel.readyState === 'open') channel.send(JSON.stringify(e))
        },
        close: () => channel.close(),
      }
      const o = await pc.createOffer()
      await pc.setLocalDescription(o)
      offer = o.sdp ?? ''
    }

    const r = await post<{ call: StartedCall }>({ action: 'start', conversationId: this.chat, page: pageNow(), sdp: offer })
    if (this.over) {
      if (r.ok) endCallOnServer(r.data.call.id, 'user')
      return
    }
    if (!r.ok) {
      const reason = (r.data.reason as VoiceRefusal) ?? (r.status ? 'error' : 'unavailable')
      return this.stop('refused', refusalText(reason, site.phone.display), reason)
    }
    const call = r.data.call
    this.id = call.id
    this.practice = call.practice
    this.hooks.phase('connecting', { seconds: call.seconds, practice: call.practice })
    // The call's own clock: from the server's length, so a phone set to the wrong time cannot stretch it.
    this.clock(call.seconds)
    if (call.practice) {
      this.line = practiceLine(this)
      return this.opened()
    }
    try {
      await this.pc!.setRemoteDescription({ type: 'answer', sdp: call.sdp ?? '' })
    } catch {
      return this.stop('error', 'The call could not connect. Please try again.')
    }
    // OpenAI's side joins within a few seconds, or it is not coming.
    this.later(15_000, () => !this.live && this.stop('error', 'The call could not connect. Please try again.'))
  }

  /** The line is open: the call is live, and the assistant speaks first. */
  private opened() {
    if (this.over || this.live) return
    this.live = true
    window.addEventListener('pagehide', this.onLeave)
    this.hooks.phase('live')
    this.hooks.talk('thinking')
    this.line?.send(note(greeting(pageNow())))
    this.respond()
  }

  /**
   * Asks the model for an answer now, or as soon as the one being made is done: OpenAI refuses a
   * new answer while one is under way, and a refused request would leave the assistant silent.
   */
  private respond() {
    if (this.responding) {
      this.wanted = true
      return
    }
    this.wanted = false
    this.responding = true
    this.line?.send({ type: 'response.create' })
  }

  /**
   * A word from the website to the assistant, never read out: what the customer did with a card, say.
   * The assistant answers it ("(Call: the customer tapped ...)", see ON_A_CALL in the server's voice rules).
   */
  tell(text: string) {
    if (this.over || !this.live) return
    this.line?.send(note(text))
    this.respond()
  }

  /** Stops the answer being made, and the assistant's voice, now: the customer has the floor. */
  private interrupt() {
    if (this.responding) this.line?.send({ type: 'response.cancel' })
    if (this.responding || this.speaking) this.line?.send({ type: 'output_audio_buffer.clear' })
  }

  /** The time limit: a word to the assistant 30 seconds before, a goodbye 12 seconds before, then the end. */
  private clock(seconds: number) {
    const ms = seconds * 1000
    this.later(ms - 30_000, () =>
      this.line?.send(note('About 30 seconds are left on this call. Do not start anything new: finish what you are saying.')),
    )
    this.later(ms - 12_000, () => {
      this.line?.send(
        note('The call ends in a few seconds. Say goodbye now in one short sentence, and say they can keep typing in the chat or call the sales team.'),
      )
      this.respond()
    })
    this.later(ms, () => this.end('time'))
  }

  private later(ms: number, fn: () => void) {
    this.timers.push(setTimeout(fn, Math.max(0, ms)))
  }

  /** A sound meter on a stream (quiet: it is not heard, only measured). */
  private meter(stream: MediaStream | null): Meter | null {
    if (!this.ctx || !stream) return null
    try {
      const an = this.ctx.createAnalyser()
      an.fftSize = 512
      this.ctx.createMediaStreamSource(stream).connect(an)
      // Some browsers only measure what goes somewhere: on to the speakers, at no volume.
      const silent = this.ctx.createGain()
      silent.gain.value = 0
      an.connect(silent).connect(this.ctx.destination)
      return { an, buf: new Float32Array(an.fftSize) }
    } catch {
      return null
    }
  }

  /** How loud the customer and the assistant are right now, 0 to 1 (for the orb). */
  levels(): { mic: number; out: number } {
    if (this.practice) return { mic: 0, out: this.practiceTalking ? 0.22 + 0.12 * Math.sin(Date.now() / 110) : 0 }
    const rms = (m: Meter | null) => {
      if (!m) return 0
      m.an.getFloatTimeDomainData(m.buf)
      let sum = 0
      for (let i = 0; i < m.buf.length; i += 2) sum += m.buf[i] * m.buf[i]
      return Math.min(1, Math.sqrt(sum / (m.buf.length / 2)) * 4)
    }
    return { mic: this.muted ? 0 : rms(this.micMeter), out: rms(this.outMeter) }
  }

  /**
   * The louder speaker: the assistant's voice through a compressor and extra gain (about 9 dB
   * louder, never clipping), instead of straight to the speaker. Off again: straight to the speaker.
   */
  setLoud(on: boolean) {
    this.loud = on
    for (const n of this.loudChain) {
      try {
        n.disconnect()
      } catch {
        // Already gone.
      }
    }
    this.loudChain = []
    if (this.audio) this.audio.muted = false
    if (!on || !this.ctx || !this.remote) return
    try {
      const src = this.ctx.createMediaStreamSource(this.remote)
      const comp = this.ctx.createDynamicsCompressor()
      comp.threshold.value = -30
      comp.ratio.value = 12
      comp.knee.value = 6
      comp.attack.value = 0.003
      comp.release.value = 0.15
      const gain = this.ctx.createGain()
      gain.gain.value = 4
      const limit = this.ctx.createDynamicsCompressor()
      limit.threshold.value = -2
      limit.ratio.value = 20
      src.connect(comp).connect(gain).connect(limit).connect(this.ctx.destination)
      this.loudChain = [src, comp, gain, limit]
      // The stream stays on the audio element (browsers need that for it to flow), just not heard twice.
      if (this.audio) this.audio.muted = true
      this.ctx.resume().catch(() => {})
    } catch {
      this.loud = false
    }
  }

  get isLoud() {
    return this.loud
  }

  /** The connection closed: the planned end when the assistant was told to say goodbye, otherwise a drop. */
  private dropped() {
    if (this.endingSoon) this.stop('time', TIME_UP)
    else this.stop('lost', 'The call dropped. You can keep typing in the chat, or call again.')
  }

  /** Mutes or unmutes the microphone (on a practice call: the typing box). */
  setMuted(on: boolean) {
    this.muted = on
    for (const t of this.mic?.getAudioTracks() ?? []) t.enabled = !on
  }

  get isMuted() {
    return this.muted
  }

  /**
   * Something the customer typed during a practice call: it stands for what they would have said, so
   * it goes through the same steps as speech (danger included). A real call never sends typed text
   * (the server hangs up a call that does): the customer talks.
   */
  type(text: string) {
    const t = text.trim()
    if (!t || !this.live || !this.practice || this.muted) return
    const key = `typed${Date.now()}`
    this.handle({ type: 'input_audio_buffer.speech_started', item_id: key })
    this.handle({ type: 'conversation.item.input_audio_transcription.completed', item_id: key, transcript: t })
  }

  /** Ends the call (the customer pressed End, its time ran out, or the page is closing). */
  end(reason: Exclude<EndReason, 'refused'>) {
    this.stop(reason, reason === 'time' ? TIME_UP : '')
  }

  private stop(reason: EndReason, message = '', refusal?: string) {
    if (this.over) return
    this.over = true
    const wasLive = this.live
    this.live = false
    // Words still being written down when the call ends are kept as far as they got.
    for (const text of this.heardText.values()) this.save('user', text)
    for (const text of this.saidText.values()) this.save('assistant', text)
    this.heardText.clear()
    this.saidText.clear()
    if (this.id) {
      const body = JSON.stringify({
        action: 'end',
        call: this.id,
        reason: reason === 'refused' ? 'error' : reason,
        usage: this.usage,
      })
      // While the page closes only a beacon is sure to be sent.
      if (reason === 'page' && navigator.sendBeacon) navigator.sendBeacon(VOICE_URL, new Blob([body], { type: 'application/json' }))
      else {
        fetch(VOICE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(
          () => {},
        )
      }
    }
    this.release()
    if (wasLive || reason !== 'page') this.hooks.ended(reason, message, refusal)
    this.hooks.phase('ended')
  }

  /** Lets go of the microphone, the connection, the speaker and the timers. */
  private release() {
    this.timers.forEach(clearTimeout)
    this.timers = []
    window.removeEventListener('pagehide', this.onLeave)
    try {
      this.line?.close()
    } catch {
      // Already closed.
    }
    this.line = null
    try {
      this.pc?.close()
    } catch {
      // Already closed.
    }
    this.pc = null
    for (const t of this.mic?.getTracks() ?? []) t.stop()
    this.mic = null
    for (const n of this.loudChain) {
      try {
        n.disconnect()
      } catch {
        // Already gone.
      }
    }
    this.loudChain = []
    this.micMeter = this.outMeter = null
    this.remote = null
    this.ctx?.close().catch(() => {})
    this.ctx = null
    if (this.audio) {
      this.audio.srcObject = null
      this.audio = null
    }
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
  }

  /**
   * Keeps one line of what was said, with the chat (best effort: the call goes on either way). Only a
   * practice call does: a real call's transcript is written by the server from its own line to
   * OpenAI (api/_lib/ai/voice-openai.ts), never from what the browser says.
   */
  private save(role: 'user' | 'assistant', text: string) {
    if (this.practice && this.id && text.trim()) void post({ action: 'line', call: this.id, role, text }, true)
  }

  /** One event from OpenAI (or from a practice call, which sends the same ones). */
  handle(e: ServerEvent) {
    if (this.over) return
    switch (e.type) {
      case 'input_audio_buffer.speech_started':
        this.heardText.set(e.item_id, '')
        this.hooks.heard(e.item_id, '', false)
        this.hooks.talk('listening')
        break
      case 'conversation.item.input_audio_transcription.delta': {
        const text = (this.heardText.get(e.item_id) ?? '') + String(e.delta ?? '')
        this.heardText.set(e.item_id, text)
        this.hooks.heard(e.item_id, text, false)
        break
      }
      case 'conversation.item.input_audio_transcription.completed': {
        const text = String(e.transcript ?? '').trim()
        this.heardText.delete(e.item_id)
        this.hooks.heard(e.item_id, text, true)
        if (!text) break
        this.save('user', text)
        if (isEmergency(text)) this.danger()
        else if (this.practice) {
          this.line?.send({
            type: 'conversation.item.create',
            item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
            practiceAnswer: true,
          })
        }
        break
      }
      case 'conversation.item.input_audio_transcription.failed':
        this.heardText.delete(e.item_id)
        this.hooks.heard(e.item_id, '', true)
        break
      case 'response.created':
        this.responding = true
        this.hooks.talk('thinking')
        break
      case 'conversation.item.added':
      case 'conversation.item.created':
      case 'conversation.item.done': {
        const text = String(e.item?.content?.[0]?.text ?? '')
        if (e.item?.role === 'system' && /Say goodbye now/.test(text)) this.endingSoon = true
        break
      }
      case 'response.output_audio_transcript.delta': {
        const text = (this.saidText.get(e.response_id) ?? '') + String(e.delta ?? '')
        this.saidText.set(e.response_id, text)
        this.hooks.said(e.response_id, text, false)
        break
      }
      case 'response.output_audio_transcript.done': {
        const text = String(e.transcript ?? this.saidText.get(e.response_id) ?? '').trim()
        this.saidText.delete(e.response_id)
        this.hooks.said(e.response_id, text, true)
        this.save('assistant', text)
        break
      }
      case 'output_audio_buffer.started':
        this.speaking = true
        this.hooks.talk('speaking')
        break
      case 'output_audio_buffer.stopped':
      case 'output_audio_buffer.cleared':
        this.speaking = false
        this.hooks.talk(this.responding ? 'thinking' : 'listening')
        break
      case 'response.done': {
        const r = e.response ?? {}
        this.responding = false
        if (r.usage) this.usage = addUsage(this.usage, r.usage)
        // The answer's tools, complete ones only (a cancelled answer's are dropped), one at a time and in
        // order, so each sees what the one before did. Then the assistant carries on with what they returned.
        const calls = ((r.output ?? []) as { type?: string; status?: string; call_id?: string; name?: string; arguments?: string }[]).filter(
          (o) => o.type === 'function_call' && (o.status === undefined || o.status === 'completed') && o.call_id && o.name,
        )
        if (calls.length && r.status !== 'cancelled') {
          for (const c of calls) {
            this.tools = this.tools.then(() => this.runTool(String(c.call_id), String(c.name), String(c.arguments ?? '{}')))
          }
          void this.tools.then(() => !this.over && this.respond())
        } else if (this.wanted) this.respond()
        // The answer is made, but it may still be playing: the assistant is speaking until its voice stops.
        else this.hooks.talk(this.speaking ? 'speaking' : 'listening')
        break
      }
      case 'error': {
        const code = String(e.error?.code ?? '')
        // An answer was already under way after all: this one is asked for when it is done.
        if (/active_response/.test(code)) {
          this.responding = true
          this.wanted = true
          break
        }
        // Nothing to cancel: not worth a word.
        if (/cancel/.test(code)) break
        console.warn('voice call:', code || e.error?.type, String(e.error?.message ?? '').slice(0, 200))
        if (/session_expired|session_closed/.test(code)) this.stop('lost', 'The call ended. You can keep typing in the chat, or call again.')
        break
      }
      default:
    }
  }

  /** Runs one of the assistant's tools on the server, shows what it did, and hands the result to the model. */
  private async runTool(callId: string, name: string, args: string) {
    if (this.over) return
    this.hooks.tool(true)
    // Always with the page the customer is on now, so the assistant does not open the page they are already on.
    const r = await post<ToolAnswer>({ action: 'tool', call: this.id, name, arguments: args, page: pageNow() })
    this.hooks.tool(false)
    if (this.over) return
    if (r.ok) {
      if (r.data.events.length) this.hooks.did(r.data.events)
    } else if (r.data.ended) {
      return this.stop('time', TIME_UP)
    }
    const output = r.ok
      ? r.data.output
      : JSON.stringify({ error: 'The tool did not answer. Say you could not check that just now, and offer the contact buttons.' })
    this.line?.send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output } })
  }

  /** The customer described danger: stop what the assistant was saying and give the safety steps, at once. */
  private danger() {
    this.hooks.danger()
    this.interrupt()
    this.line?.send(
      note(`The customer has described something dangerous. Say these safety steps now, calmly and clearly, keeping every step: "${SPOKEN_EMERGENCY}" Then ask whether everyone is safe.`),
    )
    this.respond()
  }
}

/* ------------------------------------------------------------ practice calls */

/**
 * A practice call's line: no OpenAI. Client events go into a conversation kept here; each
 * response.create is answered by the practice AI through our server (or, for the website's own
 * notes, with a fixed sentence), and comes back as the same events a real call sends.
 */
function practiceLine(call: VoiceCall): Line {
  const messages: PracticeMessage[] = []
  let n = 0
  let closed = false
  /** The website's latest note (greeting, goodbye, danger, a card outcome): answered with a fixed sentence. */
  let noteText = ''
  /** The customer said something since the last answer: the practice AI answers it. */
  let asked = false
  let busy = Promise.resolve()

  const emit = (e: Record<string, unknown>) => !closed && call.handle(e)

  /** The answer being read out now: a newer one, or the customer typing, cuts it off, as speech does on a real call. */
  let speaking = 0

  /** Stops the browser's voice mid-sentence (the customer started talking). */
  const hush = () => {
    speaking++
    call.practiceTalking = false
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
  }

  /** Reads an answer out with the browser's own voice; the call carries on meanwhile. */
  const speak = (id: string, text: string) => {
    hush()
    const mine = speaking
    const stopped = () => {
      if (mine !== speaking || closed) return
      speaking++
      call.practiceTalking = false
      emit({ type: 'output_audio_buffer.stopped', response_id: id })
    }
    if (typeof speechSynthesis === 'undefined' || !text) return stopped()
    const u = new SpeechSynthesisUtterance(text)
    const voices = speechSynthesis.getVoices()
    const voice = voices.find((v) => v.lang === 'en-AU') ?? voices.find((v) => v.lang === 'en-GB') ?? voices.find((v) => v.lang.startsWith('en'))
    if (voice) u.voice = voice
    u.lang = voice?.lang ?? 'en-AU'
    // The Speaker button is the practice call's volume: the loud setting reads at full volume.
    u.volume = call.isLoud ? 1 : 0.7
    u.onstart = () => {
      if (mine === speaking) call.practiceTalking = true
    }
    u.onend = stopped
    u.onerror = stopped
    speechSynthesis.speak(u)
    // A browser that never says it finished (or has no voices) does not leave the assistant "speaking".
    setTimeout(stopped, 1500 + text.length * 80)
  }

  const say = (id: string, text: string) => {
    emit({ type: 'output_audio_buffer.started', response_id: id })
    emit({ type: 'response.output_audio_transcript.done', response_id: id, transcript: text })
    emit({ type: 'response.done', response: { id, status: 'completed', output: [{ type: 'message' }] } })
    speak(id, text)
  }

  const respond = async () => {
    const id = `practice_${++n}`
    emit({ type: 'response.created', response: { id } })
    const fixed = noteText
    noteText = ''
    if (fixed && !asked) {
      messages.push({ role: 'assistant', content: fixed })
      return say(id, fixed)
    }
    asked = false
    const r = await post<PracticeAnswer>({
      action: 'practice',
      call: call.callId,
      page: cleanPage(pageNow()),
      messages: messages.slice(-30),
    })
    if (closed) return
    if (!r.ok) return say(id, String(r.data.error ?? 'The practice AI is not answering. Is npm run dev running?'))
    const { text, calls } = r.data
    if (calls.length) {
      messages.push({
        role: 'assistant',
        content: text || null,
        tool_calls: calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments } })),
      })
      emit({
        type: 'response.done',
        response: {
          id,
          status: 'completed',
          output: calls.map((c) => ({ type: 'function_call', status: 'completed', call_id: c.id, name: c.name, arguments: c.arguments })),
        },
      })
      return
    }
    messages.push({ role: 'assistant', content: text })
    return say(id, text || 'Sorry, I did not catch that. Could you say it again?')
  }

  /** The fixed sentence for one of the website's notes, as a practice assistant would say it. */
  const fixedFor = (text: string) => {
    if (text.startsWith(`(Call: ${GREETING_START}`)) {
      return `Hello, I'm the ${site.name} assistant, an AI assistant. This is a practice call. How can I help?`
    }
    if (text.includes('Say goodbye now')) return "We're nearly out of time on this call. Thanks for calling. You can keep typing in the chat, or call the sales team."
    if (text.includes('something dangerous')) return `That sounds dangerous. ${SPOKEN_EMERGENCY} Is everyone safe?`
    if (text.startsWith('(Call: the customer tapped')) return 'Thanks, that is done. Is there anything else I can help with?'
    return ''
  }

  return {
    send: (e) => {
      if (closed) return
      if (e.type === 'conversation.item.create') {
        const item = e.item as Record<string, any>
        if (item.type === 'function_call_output') messages.push({ role: 'tool', tool_call_id: item.call_id, content: String(item.output) })
        else if (item.role === 'system') noteText = fixedFor(String(item.content?.[0]?.text ?? ''))
        else if (item.role === 'user') {
          messages.push({ role: 'user', content: String(item.content?.[0]?.text ?? '') })
          asked = true
          // Speech answers itself in a real call (turn detection), and cuts the assistant off: so does practice speech.
          if (e.practiceAnswer) {
            hush()
            busy = busy.then(respond)
          }
        }
      } else if (e.type === 'response.create') busy = busy.then(respond)
      else if (e.type === 'response.cancel' || e.type === 'output_audio_buffer.clear') hush()
    },
    close: () => {
      closed = true
      hush()
    },
  }
}
