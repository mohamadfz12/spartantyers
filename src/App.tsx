import { Suspense, lazy, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { CartDrawer } from '@/components/layout/CartDrawer'
import { CompareTray } from '@/components/shop/CompareTray'
import { QuoteDialog } from '@/components/shop/QuoteDialog'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Toaster } from '@/components/ui'
import { WheelSpinner } from '@/components/three'
import { refreshCatalogue, startLiveCatalogue, useCatalogueVersion } from '@/lib/live-catalogue'
import { applyTheme, useTheme } from '@/store/ui'
import { useAccount } from '@/store/account'

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
const AccountLogin = lazy(() => import('@/pages/account/Login'))
const AccountSignup = lazy(() => import('@/pages/account/Signup'))
const AccountForgot = lazy(() => import('@/pages/account/Forgot'))
const AccountSetPassword = lazy(() => import('@/pages/account/SetPassword'))
const AccountDashboard = lazy(() => import('@/pages/account/Dashboard'))
const AccountDetails = lazy(() => import('@/pages/account/Details'))
const AccountOrders = lazy(() => import('@/pages/account/Orders'))
const AccountStatement = lazy(() => import('@/pages/account/Statement'))
const Admin = lazy(() => import('@/pages/admin/Admin'))
const NotFound = lazy(() => import('@/pages/NotFound'))

// The customer assistant is loaded after the page has painted, so it adds nothing to the first paint.
const Assistant = lazy(() => import('@/components/assistant/Assistant'))

export default function App() {
  const theme = useTheme((s) => s.theme)
  const location = useLocation()

  // Keep the `dark` class on <html> in step with the persisted preference.
  useEffect(() => applyTheme(theme), [theme])

  // Prices and stock set in the admin panel. Subscribing here re-renders the
  // routes when they arrive, so every page shows the live figures.
  useCatalogueVersion()
  useEffect(() => startLiveCatalogue(), [])
  // Who is signed in (the session is an httpOnly cookie; this only asks the server).
  useEffect(() => {
    void useAccount.getState().refresh()
  }, [])
  // Checkout always gets the latest prices before the Pay button is shown.
  useEffect(() => {
    if (location.pathname === '/checkout' || location.pathname === '/cart') void refreshCatalogue(true)
  }, [location.pathname])

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
              {/* The Wheel Lab was retired; old links land on the shop. */}
              <Route path="/wheel-lab" element={<Navigate to="/shop" replace />} />
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
              <Route path="/order" element={<OrderConfirmation />} />
              <Route path="/order/:reference" element={<OrderConfirmation />} />
              <Route path="/compare" element={<Compare />} />
              <Route path="/account" element={<AccountDashboard />} />
              <Route path="/account/login" element={<AccountLogin />} />
              <Route path="/account/signup" element={<AccountSignup />} />
              <Route path="/account/forgot" element={<AccountForgot />} />
              <Route path="/account/set-password" element={<AccountSetPassword />} />
              <Route path="/account/details" element={<AccountDetails />} />
              <Route path="/account/orders" element={<AccountOrders />} />
              <Route path="/account/statement" element={<AccountStatement />} />
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
        <AssistantLoader />
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
 * wrong for a page change. Reset it, or scroll to the section a hash link
 * names once it has rendered.
 */
function ScrollToTop() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0, behavior: 'auto' })
      return
    }
    // A link to a section (e.g. /brands#why-greforce): the page may still be
    // loading, so look for the target for a couple of seconds.
    const id = decodeURIComponent(hash.slice(1))
    let tries = 0
    const timer = setInterval(() => {
      const target = document.getElementById(id)
      if (target || ++tries > 20) {
        clearInterval(timer)
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }, 100)
    return () => clearInterval(timer)
  }, [pathname, hash])

  return null
}

/** Mounts the assistant once the browser is idle (or after a short wait), never during first paint. */
function AssistantLoader() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const idle = (window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
      cancelIdleCallback?: (handle: number) => void
    })
    if (idle.requestIdleCallback) {
      const handle = idle.requestIdleCallback(() => setReady(true), { timeout: 2000 })
      return () => idle.cancelIdleCallback?.(handle)
    }
    const timer = window.setTimeout(() => setReady(true), 800)
    return () => window.clearTimeout(timer)
  }, [])

  return ready ? (
    <Suspense fallback={null}>
      <Assistant />
    </Suspense>
  ) : null
}

function RouteFallback() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <WheelSpinner />
    </div>
  )
}
