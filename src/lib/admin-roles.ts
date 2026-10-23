/**
 * Who may do what in the admin panel.
 *
 * Shared by the API (which enforces it) and the admin UI (which only uses it
 * to hide what a person cannot open). The server is the authority: hiding a
 * link is a courtesy, never the protection. Imports nothing, so the Vercel
 * functions can load it with a plain relative path.
 */

export const STAFF_ROLES = ['owner', 'manager', 'sales', 'staff'] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

export const ROLE_LABELS: Record<StaffRole, string> = {
  owner: 'Owner',
  manager: 'Manager',
  sales: 'Sales executive',
  staff: 'Staff',
}

export const ROLE_DESCRIPTIONS: Record<StaffRole, string> = {
  owner: 'Everything, including staff accounts and the activity log.',
  manager: 'Everything except creating staff accounts, passwords and roles.',
  sales: 'Customer accounts (open them, agreed prices and discounts), orders, enquiries, leads, customers and the till. No stock, money, staff or pay later settings.',
  staff: 'The till, orders, stock, products, customers, enquiries and leads. No money pages, no price changes.',
}

export type Permission =
  | 'dashboard'
  | 'products'
  /** Changing prices and discounts (stock changes only need `products`). */
  | 'pricing'
  | 'orders'
  | 'enquiries'
  | 'leads'
  | 'inventory'
  | 'customers'
  /** The counter till: selling, taking payment, counter customers. */
  | 'pos'
  | 'payments'
  | 'finance'
  /** The staff list and timesheets. */
  | 'staff'
  /** Creating staff accounts, passwords, roles and deactivating people. */
  | 'accounts'
  | 'activity'
  | 'ai'
  /** Customer accounts: create, invite, approve levels, details, discount %, special prices, suspend. */
  | 'trade'
  /** Pay later on a customer account: switching it on, terms and credit limit. */
  | 'credit'

const EVERYONE: Permission[] = [
  'dashboard',
  'products',
  'orders',
  'enquiries',
  'leads',
  'inventory',
  'customers',
  'pos',
]

const ROLE_PERMISSIONS: Record<StaffRole, ReadonlySet<Permission>> = {
  owner: new Set<Permission>([
    ...EVERYONE,
    'pricing',
    'payments',
    'finance',
    'staff',
    'accounts',
    'activity',
    'ai',
    'trade',
    'credit',
  ]),
  manager: new Set<Permission>([
    ...EVERYONE,
    'pricing',
    'payments',
    'finance',
    'staff',
    'activity',
    'ai',
    'trade',
    'credit',
  ]),
  // No stock receiving, pricing, money or staff pages; no pay later settings.
  sales: new Set<Permission>(EVERYONE.filter((p) => p !== 'inventory').concat('trade')),
  staff: new Set<Permission>(EVERYONE),
}

export function can(role: StaffRole | null | undefined, permission: Permission): boolean {
  if (!role) return false
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false
}

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === 'string' && (STAFF_ROLES as readonly string[]).includes(value)
}
