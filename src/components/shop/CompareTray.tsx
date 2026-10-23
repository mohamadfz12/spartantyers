import { Link, useLocation } from 'react-router-dom'
import { ArrowRight, Scale, X } from 'lucide-react'
import { productById } from '@/data/products'
import { MAX_COMPARE, useCompare } from '@/store/ui'
import { pluralise } from '@/lib/utils'
import { InlinePrice } from './YourPrice'
import { Button } from '@/components/ui'
import { ProductThumb } from './ProductThumb'
import { AnimatePresence, motion } from '@/components/motion'

/**
 * Floating comparison tray.
 *
 * Commercial tyre buying is a spec comparison, so the tray follows the visitor
 * across the whole site rather than living on the shop page. It hides itself on
 * `/compare` — where it would just duplicate the page — and on checkout, where
 * nothing should compete with completing the order.
 */
export function CompareTray() {
  const ids = useCompare((s) => s.ids)
  const remove = useCompare((s) => s.remove)
  const clear = useCompare((s) => s.clear)
  const { pathname } = useLocation()

  const hidden =
    pathname.startsWith('/compare') ||
    pathname.startsWith('/checkout') ||
    pathname.startsWith('/admin')

  const products = ids
    .map((id) => productById.get(id))
    .filter((product): product is NonNullable<typeof product> => Boolean(product))

  const show = products.length > 0 && !hidden

  return (
    <AnimatePresence>
      {show ? (
        <motion.aside
          initial={{ y: 120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 120, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-primary bg-background/95 shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.4)] backdrop-blur-xl"
          aria-label="Tyre comparison tray"
        >
          <div className="shell flex items-center gap-4 py-3">
            <div className="hidden shrink-0 items-center gap-2 sm:flex">
              <Scale className="h-5 w-5 text-primary" />
              <div>
                <p className="font-heading text-xs font-bold uppercase tracking-wide">
                  Compare
                </p>
                <p className="text-[0.7rem] text-muted-foreground">
                  {products.length} of {MAX_COMPARE}
                </p>
              </div>
            </div>

            <ul className="flex flex-1 items-center gap-2 overflow-x-auto no-scrollbar">
              {products.map((product) => (
                <li
                  key={product.id}
                  className="relative flex shrink-0 items-center gap-2.5 rounded-md border border-border bg-card py-1.5 pl-1.5 pr-8"
                >
                  <div className="h-9 w-9 shrink-0">
                    <ProductThumb brand={product.brand} model={product.model} tread={product.tread} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-heading text-xs font-bold">
                      {product.model}
                    </p>
                    <p className="font-mono text-[0.68rem] text-muted-foreground">
                      {product.size} · <InlinePrice product={product} />
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(product.id)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    aria-label={`Remove ${product.brand} ${product.model} from comparison`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={clear}
                className="hidden rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground md:block"
              >
                Clear
              </button>
              <Button asChild size="sm" disabled={products.length < 2}>
                <Link to="/compare">
                  <span className="hidden sm:inline">
                    Compare {products.length}{' '}
                    {pluralise(products.length, 'tyre')}
                  </span>
                  <span className="sm:hidden">Compare</span>
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  )
}
