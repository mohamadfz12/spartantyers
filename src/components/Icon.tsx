import {
  AlertTriangle,
  Banknote,
  Boxes,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock,
  CreditCard,
  Factory,
  FileSignature,
  FileText,
  Gauge,
  HardHat,
  Handshake,
  Headphones,
  Layers,
  Lock,
  Mail,
  MapPin,
  Package,
  PackageCheck,
  Phone,
  RefreshCw,
  Route,
  Ruler,
  Scale,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  Timer,
  Truck,
  Users,
  Warehouse,
  Wrench,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * String-to-component resolver for the `icon` fields in `src/data/content.ts`.
 *
 * The data layer stores lucide icon *names*, never elements, so the content
 * file stays free of JSX and can be edited without touching a component. The
 * map below is explicit rather than a namespace import: `import * as lucide`
 * would defeat tree-shaking and pull the entire icon set into the bundle.
 *
 * Every name used anywhere in `content.ts` is registered here. An unregistered
 * name is not an error — it falls back to a neutral mark so a copy change can
 * never blank out a card or throw.
 */

const REGISTRY: Record<string, LucideIcon> = {
  AlertTriangle,
  Banknote,
  Boxes,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock,
  CreditCard,
  Factory,
  FileSignature,
  FileText,
  Gauge,
  HardHat,
  Handshake,
  Headphones,
  Layers,
  Lock,
  Mail,
  MapPin,
  Package,
  PackageCheck,
  Phone,
  RefreshCw,
  Route,
  Ruler,
  Scale,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  Timer,
  Truck,
  Users,
  Warehouse,
  Wrench,
}

/** The mark shown for a name we do not carry — deliberately quiet. */
const FALLBACK: LucideIcon = Sparkles

export function resolveIcon(name: string): LucideIcon {
  return REGISTRY[name] ?? FALLBACK
}

export interface IconProps extends Omit<LucideProps, 'ref'> {
  /** A lucide-react icon name, as stored in the content data. */
  name: string
  /** Supplying this promotes the icon from decoration to a labelled image. */
  title?: string
}

/**
 * Decorative by default. Pass a `title` only when the icon carries meaning
 * that is not already in adjacent text.
 */
export function Icon({ name, className, title, ...props }: IconProps) {
  const Resolved = resolveIcon(name)

  return (
    <Resolved
      className={cn('h-5 w-5', className)}
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
      aria-label={title}
      {...props}
    />
  )
}

/**
 * Icon inside the square tinted tile used across the marketing pages, so every
 * feature card picks up the same treatment in both colour schemes.
 */
export function IconTile({
  name,
  className,
  iconClassName,
}: {
  name: string
  className?: string
  iconClassName?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-md',
        'border border-primary/20 bg-primary/10 text-primary',
        className,
      )}
    >
      <Icon name={name} className={cn('h-6 w-6', iconClassName)} />
    </span>
  )
}
