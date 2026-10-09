/**
 * Square Payments over the REST API.
 *
 * The `square` npm package is intentionally not a dependency — the one call we
 * make (`POST /v2/payments`) is a single JSON request, and global `fetch` on
 * Node 20 covers it. Keeping it dependency-free also keeps the function bundle
 * small, which matters for cold-start latency on a payment path.
 */

const API_VERSION = '2024-10-17'

export type SquareEnvironment = 'sandbox' | 'production'

export interface SquareConfig {
  accessToken: string
  locationId: string
  applicationId: string
  environment: SquareEnvironment
  baseUrl: string
}

/** Public half of the config — safe to hand to the browser SDK. */
export interface SquarePublicConfig {
  applicationId: string
  locationId: string
  environment: SquareEnvironment
}

export class SquareError extends Error {
  status: number
  category?: string
  code?: string

  constructor(message: string, status: number, category?: string, code?: string) {
    super(message)
    this.name = 'SquareError'
    this.status = status
    this.category = category
    this.code = code
  }
}

export function squareEnvironment(): SquareEnvironment {
  return process.env.SQUARE_ENVIRONMENT === 'production' ? 'production' : 'sandbox'
}

export function squareBaseUrl(environment = squareEnvironment()): string {
  return environment === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com'
}

/**
 * Returns null when Square is not configured, so callers can answer 503 with a
 * "card payment unavailable, call us" message instead of crashing.
 */
export function getSquareConfig(): SquareConfig | null {
  const accessToken = process.env.SQUARE_ACCESS_TOKEN
  const locationId = process.env.SQUARE_LOCATION_ID
  const applicationId = process.env.SQUARE_APPLICATION_ID

  if (!accessToken || !locationId || !applicationId) return null

  const environment = squareEnvironment()

  return {
    accessToken,
    locationId,
    applicationId,
    environment,
    baseUrl: squareBaseUrl(environment),
  }
}

/** Which env vars are missing — for operator-facing error messages only. */
export function missingSquareVars(): string[] {
  const missing: string[] = []
  if (!process.env.SQUARE_ACCESS_TOKEN) missing.push('SQUARE_ACCESS_TOKEN')
  if (!process.env.SQUARE_LOCATION_ID) missing.push('SQUARE_LOCATION_ID')
  if (!process.env.SQUARE_APPLICATION_ID) missing.push('SQUARE_APPLICATION_ID')
  return missing
}

/* ------------------------------------------------------------------ *
 * Payments
 * ------------------------------------------------------------------ */

export interface CreatePaymentInput {
  sourceId: string
  verificationToken?: string
  /**
   * Supplied by the client and passed straight through. Square deduplicates
   * on this key for 24 hours, so a retried or double-clicked checkout returns
   * the ORIGINAL payment rather than charging the card twice.
   */
  idempotencyKey: string
  amountCents: number
  referenceId: string
  note?: string
  buyerEmail?: string
}

export interface CreatePaymentResult {
  paymentId: string
  receiptUrl?: string
  status: string
}

interface SquareApiError {
  category?: string
  code?: string
  detail?: string
  field?: string
}

export async function createPayment(
  input: CreatePaymentInput,
): Promise<CreatePaymentResult> {
  const config = getSquareConfig()
  if (!config) {
    throw new SquareError('Card payments are not configured.', 503)
  }

  const body: Record<string, unknown> = {
    source_id: input.sourceId,
    idempotency_key: input.idempotencyKey,
    amount_money: {
      amount: input.amountCents,
      currency: 'AUD',
    },
    // Capture immediately — we do not run a separate authorise/capture flow.
    autocomplete: true,
    location_id: config.locationId,
    // Square truncates reference_id at 40 chars and note at 500.
    reference_id: input.referenceId.slice(0, 40),
  }

  if (input.verificationToken) body.verification_token = input.verificationToken
  if (input.note) body.note = input.note.slice(0, 500)
  if (input.buyerEmail) body.buyer_email_address = input.buyerEmail

  let response: Response
  try {
    response = await fetch(`${config.baseUrl}/v2/payments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Square-Version': API_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch {
    // Network-level failure: no payment was created, so a retry with the same
    // idempotency key is safe.
    throw new SquareError(
      'We could not reach the payment provider. Please try again.',
      502,
    )
  }

  const payload = (await response.json().catch(() => null)) as
    | {
        payment?: {
          id?: string
          status?: string
          receipt_url?: string
        }
        errors?: SquareApiError[]
      }
    | null

  if (!response.ok || !payload?.payment?.id) {
    const first = payload?.errors?.[0]
    // Square's `detail` is written for end users ("Card declined.") — surface
    // it, but never the raw token-bearing request.
    const detail = first?.detail ?? 'The payment could not be completed.'
    throw new SquareError(
      detail,
      response.status >= 400 && response.status < 600 ? response.status : 502,
      first?.category,
      first?.code,
    )
  }

  const payment = payload.payment

  return {
    paymentId: payment.id as string,
    receiptUrl: payment.receipt_url,
    status: payment.status ?? 'UNKNOWN',
  }
}
