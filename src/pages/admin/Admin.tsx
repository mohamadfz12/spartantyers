import { useEffect, useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import {
  Boxes,
  Bot,
  CreditCard,
  ExternalLink,
  History,
  LayoutDashboard,
  Lock,
  LogOut,
  Mail,
  Menu,
  Package,
  Receipt,
  ShieldCheck,
  Target,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react'
import { Logo, LogoMark } from '@/components/brand/Logo'
import { Button, Sheet, SheetClose, SheetHeader, SheetTitle } from '@/components/ui'
import { ROLE_LABELS, can, type Permission } from '@/lib/admin-roles'
import { cn } from '@/lib/utils'
import { useAdmin, useAdminSession } from '@/store/admin'
import Activity from './Activity'
import AiAssistant from './AiAssistant'
import Balance from './Balance'
import Customers from './Customers'
import Dashboard from './Dashboard'
import Enquiries from './Enquiries'
import Inventory from './Inventory'
import Leads from './Leads'
import Login from './Login'
import Orders from './Orders'
import Payments from './Payments'
import Products from './Products'
import Staff from './Staff'

/* ------------------------------------------------------------------ *
 * Admin shell
 *
 * Mounted by App.tsx at `/admin/*`, so this file owns its own nested
 * routes.
 *
 * The auth gate is deliberately all-or-nothing: an unauthenticated
 * visitor gets the login screen and nothing else. No shell, no empty
 * tiles, no "0 orders" behind a password prompt — a dashboard chrome
 * rendered around data you are not allowed to see is both a lie and a
 * leak of how much there is.
 *
 * Nothing in here is sticky. The site header above is `sticky top-0`,
 * and a second sticky layer underneath it fights for the same pixels at
 * every breakpoint; a shell that simply scrolls is predictable.
 * ------------------------------------------------------------------ */

interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  /** Index route — only active on an exact match. */
  end?: boolean
  /** Shown only to roles that have it (the API enforces it regardless). */
  permission: Permission
}

const NAV: NavItem[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true, permission: 'dashboard' },
  { to: '/admin/orders', label: 'Orders', icon: Receipt, permission: 'orders' },
  { to: '/admin/products', label: 'Products', icon: Package, permission: 'products' },
  { to: '/admin/inventory', label: 'Inventory', icon: Boxes, permission: 'inventory' },
  { to: '/admin/customers', label: 'Customers', icon: Users, permission: 'customers' },
  { to: '/admin/payments', label: 'Payments', icon: CreditCard, permission: 'payments' },
  { to: '/admin/balance', label: 'Balance', icon: Wallet, permission: 'finance' },
  { to: '/admin/enquiries', label: 'Enquiries', icon: Mail, permission: 'enquiries' },
  { to: '/admin/leads', label: 'Leads', icon: Target, permission: 'leads' },
  { to: '/admin/staff', label: 'Staff', icon: UserCog, permission: 'staff' },
  { to: '/admin/activity', label: 'Activity log', icon: History, permission: 'activity' },
  { to: '/admin/ai', label: 'AI assistant', icon: Bot, permission: 'ai' },
]

const TITLES: Record<string, string> = Object.fromEntries(
  NAV.map((item) => [item.to, item.label]),
)

export default function Admin() {
  const { authenticated, expiresAt, user } = useAdminSession()
  const logout = useAdmin((s) => s.logout)
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)

  // A client navigation should close the mobile drawer behind it.
  useEffect(() => setDrawerOpen(false), [location.pathname])

  if (!authenticated) return <Login />

  const title = TITLES[location.pathname.replace(/\/+$/, '') || '/admin'] ?? 'Admin'
  const nav = NAV.filter((item) => can(user.role, item.permission))
  const gate = (permission: Permission, page: React.ReactNode) =>
    can(user.role, permission) ? page : <NoAccess />

  return (
    <div className="bg-muted/20">
      <div className="mx-auto flex w-full max-w-[112rem]">
        {/* ---- Sidebar: labelled on desktop, icons on tablet ------- */}
        <nav
          aria-label="Admin sections"
          className={cn(
            'hidden shrink-0 flex-col gap-1 border-r border-white/10',
            'bg-charcoal px-2 py-4 text-charcoal-foreground',
            'md:flex md:w-[4.75rem] md:items-center lg:w-60 lg:items-stretch lg:px-3',
          )}
        >
          <Link
            to="/admin"
            className={cn(
              'mb-4 flex items-center justify-center rounded-md px-1 py-2',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'lg:justify-start lg:px-2',
            )}
            aria-label="Spartan Tyres admin home"
          >
            <LogoMark className="h-8 w-8 shrink-0 text-charcoal-foreground lg:hidden" />
            <Logo compact className="hidden text-charcoal-foreground lg:flex" />
          </Link>

          {nav.map((item) => (
            <SidebarLink key={item.to} item={item} />
          ))}

          <p className="mt-auto hidden px-2 pt-6 text-[0.6875rem] leading-relaxed text-charcoal-foreground/50 lg:block">
            Signed-in staff only. This area is excluded from search engines.
          </p>
        </nav>

        {/* ---- Content column -------------------------------------- */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex flex-wrap items-center gap-3 border-b border-border bg-background px-4 py-3 md:px-6">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open admin menu"
              aria-expanded={drawerOpen}
            >
              <Menu aria-hidden="true" className="h-5 w-5" />
            </Button>

            <div className="min-w-0 flex-1">
              <p className="font-heading text-[0.625rem] font-bold uppercase tracking-brand text-muted-foreground">
                Spartan admin
              </p>
              <h1 className="truncate font-heading text-xl font-extrabold uppercase leading-tight tracking-tight">
                {title}
              </h1>
            </div>

            <p className="hidden items-center gap-1.5 text-xs text-muted-foreground lg:flex">
              <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 text-primary" />
              <span>
                {user.name === ROLE_LABELS[user.role] ? user.name : `${user.name} · ${ROLE_LABELS[user.role]}`}
                {expiresAt ? (
                  <>
                    {' '}
                    &middot; session ends{' '}
                    <time dateTime={expiresAt}>{clockTime(expiresAt)}</time>
                  </>
                ) : null}
              </span>
            </p>

            <Button variant="outline" size="sm" asChild>
              <a href="/" target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">View storefront</span>
                <span className="sr-only sm:hidden">View storefront</span>
              </a>
            </Button>

            <Button variant="ghost" size="sm" onClick={() => logout()}>
              <LogOut aria-hidden="true" className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Log out</span>
              <span className="sr-only sm:hidden">Log out</span>
            </Button>
          </header>

          <div className="min-w-0 flex-1 px-4 py-6 md:px-6 md:py-8">
            <Routes>
              <Route index element={gate('dashboard', <Dashboard />)} />
              <Route path="products" element={gate('products', <Products />)} />
              <Route path="orders" element={gate('orders', <Orders />)} />
              <Route path="inventory" element={gate('inventory', <Inventory />)} />
              <Route path="customers" element={gate('customers', <Customers />)} />
              <Route path="payments" element={gate('payments', <Payments />)} />
              <Route path="balance" element={gate('finance', <Balance />)} />
              <Route path="enquiries" element={gate('enquiries', <Enquiries />)} />
              <Route path="leads" element={gate('leads', <Leads />)} />
              <Route path="staff" element={gate('staff', <Staff />)} />
              <Route path="activity" element={gate('activity', <Activity />)} />
              <Route path="ai" element={gate('ai', <AiAssistant />)} />
              {/* Anything else inside /admin belongs at the dashboard. */}
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Routes>
          </div>
        </div>
      </div>

      {/* ---- Mobile drawer -------------------------------------- */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen} side="left">
        <SheetHeader className="bg-charcoal text-charcoal-foreground">
          <SheetTitle>Admin</SheetTitle>
          <SheetClose className="text-charcoal-foreground/70 hover:bg-white/10 hover:text-charcoal-foreground" />
        </SheetHeader>

        <nav
          aria-label="Admin sections"
          className="flex flex-1 flex-col gap-1 bg-charcoal p-3 text-charcoal-foreground"
        >
          {nav.map((item) => (
            <SidebarLink key={item.to} item={item} expanded />
          ))}

          <div className="mt-auto flex flex-col gap-2 border-t border-white/10 pt-3">
            <a
              href="/"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm text-charcoal-foreground/80 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ExternalLink aria-hidden="true" className="h-4 w-4" />
              View storefront
            </a>
            <button
              type="button"
              onClick={() => logout()}
              className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-sm text-charcoal-foreground/80 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <LogOut aria-hidden="true" className="h-4 w-4" />
              Log out
            </button>
          </div>
        </nav>
      </Sheet>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function NoAccess() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-12 text-center">
      <Lock aria-hidden="true" className="h-8 w-8 text-muted-foreground" />
      <p className="font-heading text-sm font-bold uppercase tracking-brand">Not part of your role</p>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Your account can&apos;t open this page. Ask the owner if you need access.
      </p>
      <Button variant="outline" size="sm" asChild>
        <Link to="/admin">Back to the dashboard</Link>
      </Button>
    </div>
  )
}

function SidebarLink({ item, expanded = false }: { item: NavItem; expanded?: boolean }) {
  const Icon = item.icon

  return (
    <NavLink
      to={item.to}
      end={item.end}
      // The tablet rail shows icons only, so the label also lives on the
      // element itself — the icon alone is not an accessible name.
      aria-label={item.label}
      title={item.label}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded-md text-sm font-semibold transition-colors duration-200 ease-brand',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'focus-visible:ring-offset-charcoal',
          expanded ? 'px-3 py-2.5' : 'justify-center px-3 py-2.5 lg:justify-start',
          isActive
            ? 'bg-primary text-primary-foreground'
            : 'text-charcoal-foreground/70 hover:bg-white/10 hover:text-charcoal-foreground',
        )
      }
    >
      <Icon aria-hidden="true" className="h-[1.1rem] w-[1.1rem] shrink-0" />
      <span className={expanded ? '' : 'hidden lg:inline'}>{item.label}</span>
    </NavLink>
  )
}

function clockTime(iso: string): string {
  const parsed = Date.parse(iso)
  if (!Number.isFinite(parsed)) return 'soon'
  return new Date(parsed).toLocaleTimeString('en-AU', {
    hour: 'numeric',
    minute: '2-digit',
  })
}
