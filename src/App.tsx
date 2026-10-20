import { Suspense, lazy, useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { CartDrawer } from '@/components/layout/CartDrawer'
import { CompareTray } from '@/components/shop/CompareTray'
import { QuoteDialog } from '@/components/shop/QuoteDialog'
import { ChatWidget } from '@/components/ChatWidget'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Toaster } from '@/components/ui'
import { WheelSpinner } from '@/components/three'
import { applyTheme, useTheme } from '@/store/ui'

/* ------------------------------------------------------------------ *
 * Routes
 *
 * Every page is code-split. The home page is eager because it is the
 * overwhelmingly common entry point and a spinner there would be a
 * regression; everything else loads on navigation.
 * ------------------------------------------------------------------ */

import Home from '@/pages/Home'

const Shop = lazy(() => import('@/pages/Shop'))
const ProductDetail = lazy(() => import('@/pages/ProductDetail'))
const Deals = lazy(() => import('@/pages/Deals'))
const Finder = lazy(() => import('@/pages/Finder'))
const WheelLab = lazy(() => import('@/pages/WheelLab'))
const Brands = lazy(() => import('@/pages/Brands'))
const Range = lazy(() => import('@/pages/Range'))
const FleetSolutions = lazy(() => import('@/pages/FleetSolutions'))
const Wholesale = lazy(() => import('@/pages/Wholesale'))
const About = lazy(() => import('@/pages/About'))
const Contact = lazy(() => import('@/pages/Contact'))
const Faq = lazy(() => import('@/pages/Faq'))
const Guide = lazy(() => import('@/pages/Guide'))
const Blog = lazy(() => import('@/pages/Blog'))
const BlogPostPage = lazy(() => import('@/pages/BlogPost'))
const Shipping = lazy(() => import('@/pages/Shipping'))
const Returns = lazy(() => import('@/pages/Returns'))
const Privacy = lazy(() => import('@/pages/Privacy'))
const Terms = lazy(() => import('@/pages/Terms'))
const Cart = lazy(() => import('@/pages/Cart'))
const Checkout = lazy(() => import('@/pages/Checkout'))
const OrderConfirmation = lazy(() => import('@/pages/OrderConfirmation'))
const Compare = lazy(() => import('@/pages/Compare'))
const Admin = lazy(() => import('@/pages/admin/Admin'))
const NotFound = lazy(() => import('@/pages/NotFound'))

export default function App() {
  const theme = useTheme((s) => s.theme)
  const location = useLocation()

  // Keep the `dark` class on <html> in step with the persisted preference.
  useEffect(() => applyTheme(theme), [theme])

  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink />
      <ScrollToTop />
      <Header />

      <main id="main" className="flex-1">
        {/* Scoped to the route, so navigating away from a broken page clears
            the error instead of stranding the visitor on the fallback. */}
        <ErrorBoundary resetKey={location.pathname}>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/shop" element={<Shop />} />
              <Route path="/product/:id" element={<ProductDetail />} />
              <Route path="/deals" element={<Deals />} />
              <Route path="/finder" element={<Finder />} />
              <Route path="/wheel-lab" element={<WheelLab />} />
              <Route path="/brands" element={<Brands />} />
              <Route path="/products" element={<Range />} />
              <Route path="/fleet-solutions" element={<FleetSolutions />} />
              <Route path="/wholesale" element={<Wholesale />} />
              <Route path="/about" element={<About />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/faq" element={<Faq />} />
              <Route path="/guide" element={<Guide />} />
              <Route path="/blog" element={<Blog />} />
              <Route path="/blog/:slug" element={<BlogPostPage />} />
              <Route path="/shipping" element={<Shipping />} />
              <Route path="/returns" element={<Returns />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/order/:reference" element={<OrderConfirmation />} />
              <Route path="/compare" element={<Compare />} />
              <Route path="/admin/*" element={<Admin />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>

      <Footer />

      <CartDrawer />
      <QuoteDialog />

      {/* Non-essential chrome. If any of it throws, drop it silently rather
          than letting it take the page down — the storefront still works. */}
      <ErrorBoundary fallback={null}>
        <CompareTray />
      </ErrorBoundary>
      <ErrorBoundary fallback={null}>
        <ChatWidget />
      </ErrorBoundary>

      <Toaster />
    </div>
  )
}

/* ------------------------------------------------------------------ */

function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2.5 focus:font-heading focus:text-sm focus:font-bold focus:uppercase focus:text-primary-foreground"
    >
      Skip to main content
    </a>
  )
}

/**
 * React Router keeps the scroll position across client navigations, which is
 * wrong for a page change. Reset it — but leave hash links and browser
 * back/forward alone, where the existing position is the correct one.
 */
function ScrollToTop() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    if (hash) return
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [pathname, hash])

  return null
}

function RouteFallback() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <WheelSpinner />
    </div>
  )
}
