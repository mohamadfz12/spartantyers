import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const AUD = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const AUD_CENTS = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Whole dollars for display; cents only when the amount is not round. */
export function money(value: number): string {
  return Number.isInteger(value) ? AUD.format(value) : AUD_CENTS.format(value)
}

export function moneyExact(value: number): string {
  return AUD_CENTS.format(value)
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-AU').format(value)
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** Maps `value` from one range to another, clamped to the output range. */
export function mapRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  if (inMax === inMin) return outMin
  const t = clamp((value - inMin) / (inMax - inMin), 0, 1)
  return outMin + t * (outMax - outMin)
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Australian postcodes are exactly four digits. */
export function isValidPostcode(value: string): boolean {
  return /^\d{4}$/.test(value.trim())
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim())
}

/** Accepts 04xx, 02xx, +614xx and 1300/1800 formats. */
export function isValidAuPhone(value: string): boolean {
  const digits = value.replace(/[^\d]/g, '')
  if (digits.startsWith('61')) return digits.length === 11
  return digits.length === 10 || (digits.length === 8 && /^1[38]00/.test(digits))
}

export function pluralise(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`)
}

export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  wait = 200,
): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  return (...args: A) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), wait)
  }
}

export function throttle<A extends unknown[]>(
  fn: (...args: A) => void,
  wait = 100,
): (...args: A) => void {
  let last = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  return (...args: A) => {
    const now = Date.now()
    const remaining = wait - (now - last)
    if (remaining <= 0) {
      last = now
      fn(...args)
    } else if (!timer) {
      timer = setTimeout(() => {
        last = Date.now()
        timer = undefined
        fn(...args)
      }, remaining)
    }
  }
}

/** Deterministic 0–1 pseudo-random from a string — keeps SSR/CSR output stable. */
export function seededRandom(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 100000) / 100000
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

/** Generates an order reference like SPT-7K4M2X. */
export function orderReference(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < 6; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return `SPT-${out}`
}
