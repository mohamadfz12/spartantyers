import { Phone, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui'
import { startCall, useCall } from '@/store/call'
import { useAssistant } from '@/store/assistant'

/**
 * "Talk to our assistant": a call card for the Contact page, next to the phone and email cards. It
 * starts a voice call with the assistant inside the tap (phones only give the microphone and sound
 * to a tap), and shows only while the server says calls are on and no call is already open.
 */
export function AssistantCallCard() {
  const voice = useAssistant((s) => s.voice)
  const inCall = useCall((s) => s.view !== null)
  if (!voice || inCall) return null
  return (
    <section
      aria-labelledby="contact-assistant-call"
      className="flex flex-col gap-4 rounded-lg border border-primary/40 bg-card p-6 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
          <Sparkles aria-hidden="true" className="h-5 w-5" />
        </span>
        <div>
          <h3
            id="contact-assistant-call"
            className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground"
          >
            Talk to our assistant
          </h3>
          <p className="mt-1.5 font-heading text-base font-bold tracking-tight text-foreground">
            Ask about sizes, stock, delivery or fitting, out loud
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Our AI assistant answers by voice, finds the right tyre and puts the order on screen for you.
          </p>
        </div>
      </div>
      <Button id="contact-call" onClick={startCall} className="w-full shrink-0 sm:w-auto">
        <Phone aria-hidden="true" className="h-4 w-4" />
        Start a voice call
      </Button>
    </section>
  )
}
