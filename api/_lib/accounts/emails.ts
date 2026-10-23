/**
 * The emails customer accounts send. Each builder returns a ready `Email`; every value goes through
 * `renderEmail`, which escapes it. Names never go into a subject line.
 */
import { site } from '../../../src/config/site.js'
import { header, type ApiRequest } from '../http.js'
import { renderEmail, type Email } from '../email.js'
import type { AccountRecord } from './repo.js'

/**
 * The address links in emails point at. On Vercel it comes ONLY from the environment
 * (`PUBLIC_SITE_URL`, then the production URL, then the site's own address), never from the request:
 * a forged `Host` header must not be able to aim a password-reset link at someone else's site.
 * Only on a developer's machine is the request's own origin used, so a link opens the local site.
 */
export function siteBase(req?: ApiRequest): string {
  const clean = (u: string) => u.replace(/\/+$/, '')
  if (!process.env.VERCEL && process.env.NODE_ENV !== 'production' && req) {
    const origin = header(req, 'origin')
    if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin
    const host = header(req, 'host')
    if (host && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return `http://${host}`
  }
  const configured = process.env.PUBLIC_SITE_URL
  if (configured && /^https?:\/\//.test(configured)) return clean(configured)
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL
  if (production && process.env.VERCEL) return `https://${clean(production)}`
  return clean(site.url)
}

export const setPasswordLink = (base: string, token: string): string =>
  `${base}/account/set-password?token=${encodeURIComponent(token)}`

const first = (name: string): string => name.trim().split(/\s+/)[0] || 'there'

const LEVEL_NAMES: Record<string, string> = { customer: 'Customer', bulk: 'Bulk', wholesaler: 'Wholesaler' }
export const levelName = (level: string): string => LEVEL_NAMES[level] ?? level

export function inviteEmail(a: Pick<AccountRecord, 'email' | 'name' | 'level'>, link: string): Email {
  const { html, text } = renderEmail({
    heading: 'Your Spartan Tyres account is ready',
    paragraphs: [
      `Hi ${first(a.name)},`,
      `We have opened a ${levelName(a.level)} account for you with ${site.name}. Choose a password to sign in and see your prices.`,
    ],
    button: { label: 'Choose your password', url: link },
    note: 'This link works once and expires in 7 days. If you were not expecting it, you can ignore this email.',
  })
  return { to: a.email, subject: `Your ${site.name} account is ready`, html, text }
}

export function resetEmail(a: Pick<AccountRecord, 'email' | 'name'>, link: string): Email {
  const { html, text } = renderEmail({
    heading: 'Reset your password',
    paragraphs: [`Hi ${first(a.name)},`, 'We received a request to reset the password on your account. Use the button below to choose a new one.'],
    button: { label: 'Choose a new password', url: link },
    note: 'This link works once and expires in 1 hour. If you did not ask for it, you can ignore this email; your password has not changed.',
  })
  return { to: a.email, subject: `Reset your ${site.name} password`, html, text }
}

export function signupReceivedEmail(a: Pick<AccountRecord, 'email' | 'name' | 'requestedLevel'>, link: string): Email {
  const upgrade = a.requestedLevel
    ? `You asked for a ${levelName(a.requestedLevel)} account. Our team will review it and email you once it is approved. Until then your account works as a Customer account.`
    : 'You can sign in any time to see your account.'
  const { html, text } = renderEmail({
    heading: 'Welcome to Spartan Tyres',
    paragraphs: [`Hi ${first(a.name)},`, `Thanks for opening an account with ${site.name}. ${upgrade}`],
    button: { label: 'Go to my account', url: link },
  })
  return { to: a.email, subject: `Welcome to ${site.name}`, html, text }
}

export function alreadyRegisteredEmail(a: Pick<AccountRecord, 'email' | 'name'>, link: string): Email {
  const { html, text } = renderEmail({
    heading: 'You already have an account',
    paragraphs: [
      `Hi ${first(a.name)},`,
      `Someone tried to open an account with ${site.name} using this email address, which already has one. If that was you, sign in instead; if you have forgotten your password, you can reset it.`,
    ],
    button: { label: 'Sign in', url: link },
    note: 'If it was not you, no action is needed. Your account has not changed.',
  })
  return { to: a.email, subject: `You already have a ${site.name} account`, html, text }
}

export function newApplicationEmail(a: AccountRecord, adminLink: string): Email {
  const { html, text } = renderEmail({
    heading: a.requestedLevel ? `New ${levelName(a.requestedLevel)} account request` : 'New customer account',
    paragraphs: [
      a.requestedLevel
        ? `A customer opened an account and asked to be upgraded to ${levelName(a.requestedLevel)}. Review it in the admin panel.`
        : 'A customer opened an account on the website.',
    ],
    details: [
      ['Name', a.name],
      ['Company', a.company || '-'],
      ['Email', a.email],
      ['Phone', a.phone || '-'],
      ['ABN', a.abn || '-'],
      ['Address', a.address || '-'],
      ['Asked for', a.requestedLevel ? levelName(a.requestedLevel) : 'Customer'],
    ],
    button: { label: 'Open in admin', url: adminLink },
  })
  return {
    to: site.email.sales,
    subject: a.requestedLevel ? `New ${levelName(a.requestedLevel)} account request` : 'New customer account',
    html,
    text,
    replyTo: a.email,
  }
}

export function levelDecisionEmail(a: Pick<AccountRecord, 'email' | 'name' | 'level'>, approved: boolean, requested: string, link: string): Email {
  const { html, text } = renderEmail({
    heading: approved ? `Your ${levelName(requested)} account is approved` : 'About your account request',
    paragraphs: approved
      ? [`Hi ${first(a.name)},`, `Good news: your ${site.name} account is now a ${levelName(requested)} account. Sign in to see your prices.`]
      : [
          `Hi ${first(a.name)},`,
          `Thanks for asking about a ${levelName(requested)} account. We are not able to offer that level at this time, so your account stays as a ${levelName(a.level)} account. Call us on ${site.phone.display} if you would like to talk it through.`,
        ],
    button: { label: 'Go to my account', url: link },
  })
  return {
    to: a.email,
    subject: approved ? `Your ${site.name} account is approved` : `About your ${site.name} account request`,
    html,
    text,
  }
}

export function passwordChangedEmail(a: Pick<AccountRecord, 'email' | 'name'>, link: string): Email {
  const { html, text } = renderEmail({
    heading: 'Your password was changed',
    paragraphs: [
      `Hi ${first(a.name)},`,
      'The password on your account was just changed, and any other devices were signed out. If this was you, there is nothing more to do.',
      `If it was not you, reset your password now and call us on ${site.phone.display}.`,
    ],
    button: { label: 'Reset my password', url: link },
  })
  return { to: a.email, subject: `Your ${site.name} password was changed`, html, text }
}
