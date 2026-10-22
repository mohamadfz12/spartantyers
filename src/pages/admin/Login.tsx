import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Lock } from 'lucide-react'
import { Logo } from '@/components/brand/Logo'
import { Seo } from '@/components/Seo'
import { AdminNotConfigured } from '@/components/admin/AdminStates'
import { Button, Card, CardContent, Field, Input } from '@/components/ui'
import { useAdmin } from '@/store/admin'

/* ------------------------------------------------------------------ *
 * Admin sign-in
 *
 * Staff sign in with their email and own password; the owner can also
 * leave the email empty and use the owner password. The server owns the
 * messaging — "Incorrect password." and the 503 setup text are written
 * there and shown verbatim, so there is never a second, drifting copy
 * of the truth in the client.
 * ------------------------------------------------------------------ */

export default function Login() {
  const login = useAdmin((s) => s.login)
  const signingIn = useAdmin((s) => s.signingIn)
  const error = useAdmin((s) => s.error)
  const notConfigured = useAdmin((s) => s.notConfigured)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!password) {
      setLocalError(email.trim() ? 'Enter your password.' : 'Enter the owner password, or your email and password.')
      return
    }

    setLocalError(null)
    const ok = await login(password, email.trim() || undefined)
    // Never keep a rejected secret in a controlled input.
    if (!ok) setPassword('')
  }

  const message = localError ?? error

  return (
    <>
      <Seo
        title="Admin sign in — Spartan Tyres"
        description="Staff sign in for the Spartan Tyres admin panel."
        noIndex
      />

      <div className="flex min-h-[80vh] flex-col items-center justify-center gap-6 bg-muted/20 px-4 py-14">
        {notConfigured ? (
          <AdminNotConfigured message={error ?? undefined} headingLevel="h1" />
        ) : (
          <Card className="w-full max-w-md">
            <CardContent className="p-6 pt-6 md:p-8 md:pt-8">
              <div className="flex flex-col items-center gap-4 text-center">
                <Logo />
                <div>
                  <h1 className="font-heading text-2xl font-black uppercase leading-tight tracking-tight">
                    Admin sign in
                  </h1>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    Staff only. Sessions last 12 hours and cannot be renewed.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-5" noValidate>
                <Field
                  label="Email"
                  htmlFor="admin-email"
                  hint="Owner: leave this empty and use the owner password."
                >
                  <Input
                    id="admin-email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    autoFocus
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value)
                      if (localError) setLocalError(null)
                    }}
                    placeholder="you@spartantrucktyres.com.au"
                  />
                </Field>

                <Field
                  label="Password"
                  htmlFor="admin-password"
                  error={message ?? undefined}
                  required
                >
                  <Input
                    id="admin-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value)
                      if (localError) setLocalError(null)
                    }}
                    placeholder="••••••••••••"
                  />
                </Field>

                <Button type="submit" loading={signingIn} className="w-full">
                  <Lock aria-hidden="true" className="h-4 w-4" />
                  {signingIn ? 'Signing in…' : 'Sign in'}
                </Button>

                {/* Announced without stealing focus from the field. */}
                <p aria-live="polite" className="sr-only">
                  {signingIn ? 'Signing in.' : (message ?? '')}
                </p>
              </form>
            </CardContent>
          </Card>
        )}

        <Link
          to="/"
          className="inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
          Back to the storefront
        </Link>
      </div>
    </>
  )
}
