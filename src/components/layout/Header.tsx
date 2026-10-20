import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  ChevronDown,
  Menu,
  Moon,
  Phone,
  Search,
  ShoppingCart,
  Sun,
  Truck,
  X,
} from 'lucide-react'
import { nav, site } from '@/config/site'
import { cn, priceLabel } from '@/lib/utils'
import { useCart, useCartTotals } from '@/store/cart'
import { useTheme } from '@/store/ui'
import { useScrollDirection, useScrolledPast } from '@/hooks'
import { products, effectivePrice } from '@/data/products'
import { Logo } from '@/components/brand/Logo'
import { Badge, Button, Dialog, DialogContent, Input, Sheet, SheetClose } from '@/components/ui'
import { AnimatePresence, ScrollProgressBar, motion } from '@/components/motion'

export function Header() {
  const condensed = useScrolledPast(40)
  const direction = useScrollDirection(10)
  const location = useLocation()

  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)

  const toggleCart = useCart((s) => s.toggle)
  const { itemCount } = useCartTotals()

  // Any navigation should close every transient surface.
  useEffect(() => {
    setMenuOpen(false)
    setMoreOpen(false)
    setSearchOpen(false)
  }, [location.pathname, location.search])

  // Cmd/Ctrl+K opens search, the convention people now expect.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!moreOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [moreOpen])

  // Slide the bar away when scrolling down, bring it back on the way up.
  const hidden = condensed && direction === 'down' && !menuOpen

  return (
    <>
      <ScrollProgressBar />

      <AnnouncementBar />

      <motion.header
        animate={{ y: hidden ? '-100%' : '0%' }}
        transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
        className={cn(
          'sticky top-0 z-50 border-b transition-[background-color,border-color,box-shadow,padding] duration-300',
          condensed
            ? 'border-border/80 bg-background/85 py-1.5 shadow-lg backdrop-blur-xl'
            : 'border-transparent bg-background py-3',
        )}
      >
        <div className="shell flex items-center justify-between gap-4">
          <Link
            to="/"
            className="shrink-0 rounded-md transition-opacity hover:opacity-85"
            aria-label={`${site.name} — home`}
          >
            <Logo compact={condensed} />
          </Link>

          {/* Desktop navigation */}
          <nav
            className="hidden items-center gap-1 lg:flex"
            aria-label="Primary navigation"
          >
            {nav.primary.map((item) => (
              <NavLink
                key={item.href}
                to={item.href}
                className={({ isActive }) =>
                  cn(
                    'group relative whitespace-nowrap rounded-md px-2.5 py-2 font-heading text-[0.78rem] font-bold uppercase tracking-wide transition-colors xl:px-3',
                    isActive
                      ? 'text-primary'
                      : 'text-foreground/80 hover:text-foreground',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="flex items-center gap-1.5">
                      {item.label}
                      {'badge' in item && item.badge ? (
                        <Badge variant="primary" size="sm">
                          {item.badge}
                        </Badge>
                      ) : null}
                    </span>
                    <span
                      className={cn(
                        'absolute inset-x-3 bottom-1 h-[2px] origin-left rounded-full bg-primary transition-transform duration-300',
                        isActive ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100',
                      )}
                    />
                  </>
                )}
              </NavLink>
            ))}

            {/* Overflow menu for the secondary routes */}
            <div className="relative" ref={moreRef}>
              <button
                type="button"
                onClick={() => setMoreOpen((open) => !open)}
                aria-expanded={moreOpen}
                aria-haspopup="true"
                className="flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-2 font-heading text-[0.78rem] font-bold uppercase tracking-wide text-foreground/80 transition-colors hover:text-foreground xl:px-3"
              >
                More
                <ChevronDown
                  className={cn(
                    'h-3.5 w-3.5 transition-transform duration-200',
                    moreOpen && 'rotate-180',
                  )}
                />
              </button>

              <AnimatePresence>
                {moreOpen ? (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.97 }}
                    transition={{ duration: 0.18 }}
                    className="absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-lg border border-border bg-popover p-1.5 shadow-lift"
                  >
                    {nav.secondary.map((item) => (
                      <Link
                        key={item.href}
                        to={item.href}
                        className="block rounded-md px-3 py-2 text-sm font-medium text-popover-foreground transition-colors hover:bg-accent"
                      >
                        {item.label}
                      </Link>
                    ))}
                    <a
                      href={site.partner.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 flex items-center gap-2 rounded-md border-t border-border px-3 py-2 pt-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <Truck className="h-3.5 w-3.5" />
                      {site.partner.name}
                    </a>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex h-10 items-center gap-2 rounded-md border border-border bg-card px-3 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground sm:w-44"
              aria-label="Search tyres"
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="hidden text-sm sm:inline">Search tyres</span>
              <kbd className="ml-auto hidden rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.65rem] text-muted-foreground lg:inline">
                ⌘K
              </kbd>
            </button>

            <a
              href={site.phone.href}
              className="hidden h-10 items-center gap-2 whitespace-nowrap rounded-md px-3 font-heading text-sm font-bold text-foreground transition-colors hover:text-primary xl:flex"
            >
              <Phone className="h-4 w-4 text-primary" />
              {site.phone.display}
            </a>

            <ThemeToggle />

            <button
              type="button"
              onClick={toggleCart}
              className="relative flex h-10 w-10 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent"
              aria-label={`Open cart — ${itemCount} ${itemCount === 1 ? 'tyre' : 'tyres'}`}
            >
              <ShoppingCart className="h-5 w-5" />
              <AnimatePresence>
                {itemCount > 0 ? (
                  <motion.span
                    key={itemCount}
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.4, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 24 }}
                    className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 font-heading text-[0.65rem] font-black text-primary-foreground"
                  >
                    {itemCount}
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </button>

            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </motion.header>

      <MobileNav open={menuOpen} onOpenChange={setMenuOpen} />
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  )
}

/* ------------------------------------------------------------------ *
 * Announcement bar
 * ------------------------------------------------------------------ */

function AnnouncementBar() {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  return (
    <div className="relative bg-charcoal text-charcoal-foreground">
      <div className="hazard absolute inset-x-0 top-0 h-[2px] opacity-70" />
      <div className="shell flex items-center justify-between gap-4 py-2">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.72rem] sm:text-xs">
          <span className="flex items-center gap-1.5 font-semibold">
            <Truck className="h-3.5 w-3.5 text-primary" />
            Free delivery to all metro areas — no minimum spend
          </span>
          <span className="hidden text-white/30 sm:inline">|</span>
          <span className="hidden text-white/70 sm:inline">
            Dispatch within {site.commerce.dispatchWindow} from Yennora
          </span>
        </p>

        <div className="flex shrink-0 items-center gap-3">
          <a
            href={site.phone.href}
            className="hidden font-heading text-xs font-bold text-primary hover:underline sm:inline"
          >
            {site.phone.display}
          </a>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss announcement"
            className="rounded p-0.5 text-white/50 transition-colors hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Theme toggle
 * ------------------------------------------------------------------ */

function ThemeToggle() {
  const theme = useTheme((s) => s.theme)
  const toggle = useTheme((s) => s.toggle)

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex h-10 w-10 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent"
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          initial={{ rotate: -90, opacity: 0, scale: 0.7 }}
          animate={{ rotate: 0, opacity: 1, scale: 1 }}
          exit={{ rotate: 90, opacity: 0, scale: 0.7 }}
          transition={{ duration: 0.22 }}
          className="flex"
        >
          {theme === 'dark' ? (
            <Sun className="h-5 w-5" />
          ) : (
            <Moon className="h-5 w-5" />
          )}
        </motion.span>
      </AnimatePresence>
    </button>
  )
}

/* ------------------------------------------------------------------ *
 * Mobile navigation
 * ------------------------------------------------------------------ */

function MobileNav({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} side="right">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border p-4">
          <Logo compact />
          <SheetClose className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <X className="h-5 w-5" />
            <span className="sr-only">Close menu</span>
          </SheetClose>
        </div>

        <nav
          className="flex-1 overflow-y-auto p-4"
          aria-label="Mobile navigation"
        >
          <p className="mb-2 font-heading text-[0.65rem] font-bold uppercase tracking-brand text-muted-foreground">
            Shop
          </p>
          <ul className="mb-6 space-y-1">
            {nav.primary.map((item) => (
              <li key={item.href}>
                <NavLink
                  to={item.href}
                  onClick={() => onOpenChange(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center justify-between rounded-md px-3 py-3 font-heading text-sm font-bold uppercase tracking-wide transition-colors',
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-foreground hover:bg-accent',
                    )
                  }
                >
                  {item.label}
                  {'badge' in item && item.badge ? (
                    <Badge variant="primary" size="sm">
                      {item.badge}
                    </Badge>
                  ) : null}
                </NavLink>
              </li>
            ))}
          </ul>

          <p className="mb-2 font-heading text-[0.65rem] font-bold uppercase tracking-brand text-muted-foreground">
            Company
          </p>
          <ul className="space-y-1">
            {nav.secondary.map((item) => (
              <li key={item.href}>
                <NavLink
                  to={item.href}
                  onClick={() => onOpenChange(false)}
                  className={({ isActive }) =>
                    cn(
                      'block rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'text-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-2 border-t border-border p-4">
          <Button asChild className="w-full justify-start gap-3">
            <a href={site.phone.href}>
              <Phone className="h-4 w-4" />
              {site.phone.display}
            </a>
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {site.hours.label}
          </p>
        </div>
      </div>
    </Sheet>
  )
}

/* ------------------------------------------------------------------ *
 * Search
 * ------------------------------------------------------------------ */

function SearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [query, setQuery] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const results = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (term.length < 2) return []

    // Score on the fields people actually search by: size first, then
    // pattern, then brand. A bare size like "11r22.5" has to rank its
    // matches above a brand that merely contains the digits.
    return products
      .map((product) => {
        const size = product.size.toLowerCase()
        const model = product.model.toLowerCase()
        const brand = product.brand.toLowerCase()
        const normalisedTerm = term.replace(/\s+/g, '')
        const normalisedSize = size.replace(/\s+/g, '')

        let score = 0
        if (normalisedSize === normalisedTerm) score += 100
        else if (normalisedSize.includes(normalisedTerm)) score += 60
        if (model === term) score += 70
        else if (model.includes(term)) score += 40
        if (brand.includes(term)) score += 20
        if (product.application.toLowerCase().includes(term)) score += 12
        if (product.positionLabel.toLowerCase().includes(term)) score += 10

        return { product, score }
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 7)
      .map((entry) => entry.product)
  }, [query])

  const submit = () => {
    const term = query.trim()
    if (!term) return
    onOpenChange(false)
    navigate(`/shop?q=${encodeURIComponent(term)}`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} labelledBy="search-heading">
      <DialogContent size="lg" className="p-0">
        <h2 id="search-heading" className="sr-only">
          Search tyres
        </h2>

        <div className="flex items-center gap-3 border-b border-border p-4">
          <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
          <Input
            data-autofocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit()
            }}
            placeholder="Try 11R22.5, GRD57, Greforce or drive…"
            className="border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
            aria-label="Search by size, pattern or brand"
          />
        </div>

        <div className="max-h-[22rem] overflow-y-auto p-2">
          {query.trim().length < 2 ? (
            <div className="p-4">
              <p className="mb-3 font-heading text-[0.65rem] font-bold uppercase tracking-brand text-muted-foreground">
                Popular sizes
              </p>
              <div className="flex flex-wrap gap-2">
                {['11R22.5', '295/80R22.5', '235/75R17.5', '385/65R22.5', '265/70R19.5'].map(
                  (size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setQuery(size)}
                      className="rounded-md border border-border bg-card px-3 py-1.5 font-mono text-xs font-semibold transition-colors hover:border-primary hover:text-primary"
                    >
                      {size}
                    </button>
                  ),
                )}
              </div>
            </div>
          ) : results.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-sm text-muted-foreground">
                No tyres match “{query}”.
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Call{' '}
                <a href={site.phone.href} className="font-semibold text-primary">
                  {site.phone.display}
                </a>{' '}
                — we source sizes we don't list.
              </p>
            </div>
          ) : (
            <ul>
              {results.map((product) => (
                <li key={product.id}>
                  <Link
                    to={`/product/${product.id}`}
                    onClick={() => onOpenChange(false)}
                    className="flex items-center gap-4 rounded-md p-3 transition-colors hover:bg-accent"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-heading text-sm font-bold">
                        {product.brand} {product.model}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        <span className="font-mono">{product.size}</span> ·{' '}
                        {product.positionLabel} · {product.ply}
                      </p>
                    </div>
                    <span className="shrink-0 font-heading text-sm font-bold text-primary">
                      {priceLabel(effectivePrice(product))}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border p-3">
          <p className="text-xs text-muted-foreground">
            Press Enter to see all matches
          </p>
          <Button size="sm" variant="outline" onClick={submit} disabled={!query.trim()}>
            Browse shop
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
