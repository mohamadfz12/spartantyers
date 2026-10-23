import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronDown, LogOut, User } from 'lucide-react'
import { shortName } from '@/lib/account-portal'
import { cn } from '@/lib/utils'
import { useAccount } from '@/store/account'

/* ------------------------------------------------------------------ *
 * The account button in the header
 *
 * Signed out: a "Log in" link. Signed in: the customer's first name with a
 * small menu (My account, Orders, Statement, Details, Log out).
 * ------------------------------------------------------------------ */

const itemClass = 'block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-popover-foreground transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none'

export function AccountMenu() {
  const ready = useAccount((s) => s.ready)
  const me = useAccount((s) => s.me)
  const logout = useAccount((s) => s.logout)
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // Hidden on phones, where the menu sheet carries the same links and the bar has no room.
  const wrapper = 'hidden sm:block'

  if (!ready) return <div className={wrapper} aria-hidden="true" />

  if (!me) {
    return (
      <div className={wrapper}>
        <Link
          to="/account/login"
          data-testid="header-login"
          className="flex h-10 items-center gap-2 whitespace-nowrap rounded-md px-2.5 font-heading text-sm font-bold text-foreground transition-colors hover:bg-accent"
          aria-label="Log in"
        >
          <User aria-hidden="true" className="h-5 w-5" />
          <span className="hidden lg:inline">Log in</span>
        </Link>
      </div>
    )
  }

  const name = shortName(me)
  return (
    <div className={cn('relative', wrapper)} ref={ref}>
      <button
        type="button"
        data-testid="header-account"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Account menu for ${name}`}
        className="flex h-10 items-center gap-1.5 rounded-md px-2.5 font-heading text-sm font-bold text-foreground transition-colors hover:bg-accent"
      >
        <User aria-hidden="true" className="h-5 w-5 text-primary" />
        <span className="hidden max-w-[7rem] truncate lg:inline">{name}</span>
        <ChevronDown aria-hidden="true" className={cn('hidden h-3.5 w-3.5 transition-transform lg:block', open && 'rotate-180')} />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-lg border border-border bg-popover p-1.5 shadow-lift">
          <p className="truncate px-3 pb-1.5 pt-1 text-xs text-muted-foreground">{me.company || me.email}</p>
          <Link role="menuitem" to="/account" className={itemClass} onClick={() => setOpen(false)}>
            My account
          </Link>
          <Link role="menuitem" to="/account/orders" className={itemClass} onClick={() => setOpen(false)}>
            Orders
          </Link>
          <Link role="menuitem" to="/account/statement" className={itemClass} onClick={() => setOpen(false)}>
            Statement
          </Link>
          <Link role="menuitem" to="/account/details" className={itemClass} onClick={() => setOpen(false)}>
            Details
          </Link>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => {
              setOpen(false)
              void logout().then(() => navigate('/', { replace: false }))
            }}
          >
            <span className="flex items-center gap-2">
              <LogOut aria-hidden="true" className="h-4 w-4" />
              Log out
            </span>
          </button>
        </div>
      ) : null}
    </div>
  )
}

/** The same links inside the mobile menu sheet. */
export function AccountMobileLinks({ onNavigate }: { onNavigate: () => void }) {
  const ready = useAccount((s) => s.ready)
  const me = useAccount((s) => s.me)
  const logout = useAccount((s) => s.logout)
  const navigate = useNavigate()

  const link = 'block rounded-md px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent'
  if (!ready) return null

  return (
    <div className="mb-6" data-testid="mobile-account">
      <p className="mb-2 font-heading text-[0.65rem] font-bold uppercase tracking-brand text-muted-foreground">Account</p>
      {me ? (
        <ul className="space-y-1">
          <li className="truncate px-3 text-xs text-muted-foreground">
            Signed in as {shortName(me)}
          </li>
          <li>
            <Link to="/account" className={link} onClick={onNavigate}>
              My account
            </Link>
          </li>
          <li>
            <Link to="/account/orders" className={link} onClick={onNavigate}>
              Orders
            </Link>
          </li>
          <li>
            <Link to="/account/statement" className={link} onClick={onNavigate}>
              Statement
            </Link>
          </li>
          <li>
            <Link to="/account/details" className={link} onClick={onNavigate}>
              Details
            </Link>
          </li>
          <li>
            <button
              type="button"
              className={cn(link, 'w-full text-left')}
              onClick={() => {
                onNavigate()
                void logout().then(() => navigate('/'))
              }}
            >
              Log out
            </button>
          </li>
        </ul>
      ) : (
        <ul className="space-y-1">
          <li>
            <Link to="/account/login" className={link} onClick={onNavigate}>
              Log in
            </Link>
          </li>
          <li>
            <Link to="/account/signup" className={link} onClick={onNavigate}>
              Open an account
            </Link>
          </li>
        </ul>
      )}
    </div>
  )
}
