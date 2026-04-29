'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Mail, Lock } from 'lucide-react'

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  token_invalid: 'This invitation or reset link has already been used or has expired. Please log in or request a new link.',
  callback_failed: 'Authentication failed. Please try again or contact your administrator.',
  session_failed: 'Failed to create your session. Please try again.',
  missing_params: 'Invalid authentication link. Please use the link from your email.',
  invalid_callback: 'Invalid authentication response. Please try again.',
}

const AUTH_SUCCESS_MESSAGES: Record<string, string> = {
  password_reset_success: 'Your password has been updated. Please sign in with your new password.',
  password_set_success: 'Your password has been set. Please sign in to continue.',
}

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirectTo') || '/trips'
  const authError = searchParams.get('error')
  const authMessage = searchParams.get('message')
  const [error, setError] = useState<string | null>(
    authError ? AUTH_ERROR_MESSAGES[authError] || 'An authentication error occurred.' : null
  )
  const [successMessage] = useState<string | null>(
    authMessage ? AUTH_SUCCESS_MESSAGES[authMessage] || null : null
  )

  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        if (error.message.includes('User profile incomplete')) {
          setError('Your account setup is incomplete. Please contact an administrator.')
        } else if (error.message.includes('Invalid login credentials')) {
          setError('Invalid email or password. Please check your credentials and try again.')
        } else if (error.message.includes('Email not confirmed')) {
          setError('Please check your email and click the confirmation link before signing in.')
        } else {
          setError(error.message)
        }
        setIsLoading(false)
        return
      }

      // Successful login - redirect. Middleware handles MFA enforcement
      // (redirects to /auth/mfa-verify or /auth/mfa-enroll as needed)
      router.push(redirectTo)
      router.refresh()
    } catch (err) {
      setError('An unexpected error occurred. Please try again.')
      setIsLoading(false)
    }
  }

  return (
    <div className="relative">
      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex items-center justify-center rounded-lg">
          <div className="flex flex-col items-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
            <p className="text-sm font-medium text-slate-700">Signing you in...</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {successMessage && (
          <Alert className="border-green-200 bg-green-50 text-green-800">
            <AlertDescription>{successMessage}</AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-medium text-slate-700">
            Email Address
          </Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
              autoComplete="email"
              aria-describedby={error ? 'login-error' : undefined}
              className="pl-10 focus-visible:ring-orange-500"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-sm font-medium text-slate-700">
              Password
            </Label>
            <Link
              href="/auth/forgot-password"
              className="text-sm text-orange-600 hover:text-orange-700"
              tabIndex={isLoading ? -1 : 0}
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
              autoComplete="current-password"
              aria-describedby={error ? 'login-error' : undefined}
              className="pl-10 focus-visible:ring-orange-500"
            />
          </div>
        </div>

        <Button
          type="submit"
          className="w-full bg-orange-500 hover:bg-orange-600"
          size="lg"
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Signing in...
            </>
          ) : (
            'Sign in'
          )}
        </Button>
      </form>
    </div>
  )
}
