'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Lock, ArrowLeft, CheckCircle, Loader2, AlertCircle, Flame, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { createClient } from '@/lib/supabase/client'

type PageState = 'loading' | 'ready' | 'success' | 'error'

export default function ResetPasswordPage() {
  const router = useRouter()
  const supabase = createClient()

  const [pageState, setPageState] = useState<PageState>('loading')
  const [error, setError] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  // Check for session (set by callback route) or extract token from URL hash
  useEffect(() => {
    const handleRecoveryToken = async () => {
      // First, check if we already have a session (set by /auth/callback via verifyOtp)
      const { data: { session: existingSession } } = await supabase.auth.getSession()
      if (existingSession) {
        setPageState('ready')
        return
      }

      // Fallback: Supabase puts tokens in URL hash: #access_token=xxx&type=recovery
      const hash = window.location.hash.substring(1)
      if (!hash) {
        setError('Invalid reset link. Please request a new password reset.')
        setPageState('error')
        return
      }

      const hashParams = new URLSearchParams(hash)
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')
      const type = hashParams.get('type')

      // Validate all required tokens are present
      if (type !== 'recovery' || !accessToken || !refreshToken) {
        setError('Invalid reset link. Please request a new password reset.')
        setPageState('error')
        return
      }

      // Set the session from the recovery tokens
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })

      if (sessionError) {
        setError('This reset link has expired or is invalid. Please request a new one.')
        setPageState('error')
        return
      }

      // Clear the hash from URL for security (without triggering navigation)
      window.history.replaceState(null, '', window.location.pathname)

      setPageState('ready')
    }

    handleRecoveryToken()
  }, [supabase.auth])

  const validatePassword = () => {
    if (password.length < 8) {
      setValidationError('Password must be at least 8 characters')
      return false
    }
    if (password !== confirmPassword) {
      setValidationError('Passwords do not match')
      return false
    }
    setValidationError(null)
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // CRITICAL: Block submission until session is set
    if (pageState !== 'ready') return

    if (!validatePassword()) return

    setIsSubmitting(true)
    setError(null)

    try {
      // Now updateUser will work because session is set
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      })

      if (updateError) {
        setError(updateError.message)
        return
      }

      setPageState('success')

      // Sign out and redirect to login after brief delay
      setTimeout(async () => {
        await supabase.auth.signOut()
        router.push('/auth/login?message=Password updated successfully')
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Loading state - validating reset link
  if (pageState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center h-16 w-16 rounded-xl bg-orange-500 text-white shadow-lg mx-auto">
            <Flame className="h-9 w-9" />
          </div>
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-orange-500" />
          <p className="text-slate-500">Validating reset link...</p>
        </div>
      </div>
    )
  }

  // Error state - invalid/expired link
  if (pageState === 'error') {
    return (
      <div className="min-h-screen flex">
        {/* Left Column */}
        <div className="flex-1 flex items-center justify-center bg-white px-4 sm:px-6 lg:px-8">
          <div className="max-w-md w-full space-y-8">
            {/* Logo */}
            <div className="flex flex-col items-center space-y-3">
              <div className="flex items-center justify-center h-16 w-16 rounded-xl bg-orange-500 text-white shadow-lg">
                <Flame className="h-9 w-9" />
              </div>
              <div className="text-center">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                  Tailfire
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Travel Agency Management Platform
                </p>
              </div>
            </div>

            <div className="text-center">
              <h2 className="text-2xl font-semibold text-slate-800">
                Link Invalid
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                This password reset link cannot be used
              </p>
            </div>

            <div className="bg-white rounded-lg shadow-lg p-8 border border-slate-100">
              <div className="text-center space-y-4">
                <div className="flex justify-center">
                  <div className="rounded-full bg-red-100 p-3">
                    <AlertCircle className="h-8 w-8 text-red-600" />
                  </div>
                </div>
                <p className="text-sm text-slate-600">{error}</p>
                <Link href="/auth/forgot-password">
                  <Button className="w-full bg-orange-500 hover:bg-orange-600" size="lg">
                    Request New Reset Link
                  </Button>
                </Link>
              </div>
            </div>

            <div className="text-center">
              <Link
                href="/auth/login"
                className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to sign in
              </Link>
            </div>

            {/* Footer */}
            <p className="text-center text-xs text-slate-400">
              &copy; {new Date().getFullYear()} Tailfire. All rights reserved.
            </p>
          </div>
        </div>

        {/* Right Column - Hero Image */}
        <div className="hidden lg:block lg:flex-1 relative bg-gradient-to-br from-orange-400 to-orange-600">
          <Image
            src="/beach-sunset.jpg"
            alt="Tropical beach at sunset with palm trees silhouetted against orange sky"
            fill
            className="object-cover"
            priority
            quality={85}
            sizes="50vw"
          />
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.15) 0%, rgba(234, 88, 12, 0.15) 100%)'
            }}
          />
          <div className="absolute bottom-12 left-12 right-12 text-white">
            <h2
              className="text-4xl font-bold mb-2 uppercase tracking-wide"
              style={{ fontFamily: 'serif', textShadow: '2px 2px 4px rgba(0,0,0,0.5)' }}
            >
              Ignite Your Journey
            </h2>
            <p className="text-lg" style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.5)' }}>
              Streamline bookings, delight travelers, grow your travel business.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Success state - password updated
  if (pageState === 'success') {
    return (
      <div className="min-h-screen flex">
        {/* Left Column */}
        <div className="flex-1 flex items-center justify-center bg-white px-4 sm:px-6 lg:px-8">
          <div className="max-w-md w-full space-y-8">
            {/* Logo */}
            <div className="flex flex-col items-center space-y-3">
              <div className="flex items-center justify-center h-16 w-16 rounded-xl bg-orange-500 text-white shadow-lg">
                <Flame className="h-9 w-9" />
              </div>
              <div className="text-center">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                  Tailfire
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Travel Agency Management Platform
                </p>
              </div>
            </div>

            <div className="text-center">
              <h2 className="text-2xl font-semibold text-slate-800">
                Password Updated
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Your password has been successfully reset
              </p>
            </div>

            <div className="bg-white rounded-lg shadow-lg p-8 border border-slate-100">
              <div className="text-center space-y-4">
                <div className="flex justify-center">
                  <div className="rounded-full bg-green-100 p-3">
                    <CheckCircle className="h-8 w-8 text-green-600" />
                  </div>
                </div>
                <p className="text-sm text-slate-600">
                  Redirecting you to sign in...
                </p>
                <Loader2 className="h-5 w-5 animate-spin mx-auto text-slate-400" />
              </div>
            </div>

            {/* Footer */}
            <p className="text-center text-xs text-slate-400">
              &copy; {new Date().getFullYear()} Tailfire. All rights reserved.
            </p>
          </div>
        </div>

        {/* Right Column - Hero Image */}
        <div className="hidden lg:block lg:flex-1 relative bg-gradient-to-br from-orange-400 to-orange-600">
          <Image
            src="/beach-sunset.jpg"
            alt="Tropical beach at sunset with palm trees silhouetted against orange sky"
            fill
            className="object-cover"
            priority
            quality={85}
            sizes="50vw"
          />
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.15) 0%, rgba(234, 88, 12, 0.15) 100%)'
            }}
          />
          <div className="absolute bottom-12 left-12 right-12 text-white">
            <h2
              className="text-4xl font-bold mb-2 uppercase tracking-wide"
              style={{ fontFamily: 'serif', textShadow: '2px 2px 4px rgba(0,0,0,0.5)' }}
            >
              Ignite Your Journey
            </h2>
            <p className="text-lg" style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.5)' }}>
              Streamline bookings, delight travelers, grow your travel business.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Ready state - show form (only when session is set)
  return (
    <div className="min-h-screen flex">
      {/* Left Column - Form */}
      <div className="flex-1 flex items-center justify-center bg-white px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          {/* Logo */}
          <div className="flex flex-col items-center space-y-3">
            <div className="flex items-center justify-center h-16 w-16 rounded-xl bg-orange-500 text-white shadow-lg">
              <Flame className="h-9 w-9" />
            </div>
            <div className="text-center">
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                Tailfire
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Travel Agency Management Platform
              </p>
            </div>
          </div>

          <div className="text-center">
            <h2 className="text-2xl font-semibold text-slate-800">
              Reset Your Password
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Enter your new password below
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-8 border border-slate-100">
            {(error || validationError) && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{error || validationError}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium text-slate-700">
                  New Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter new password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 focus-visible:ring-orange-500"
                    required
                    minLength={8}
                    disabled={isSubmitting}
                    autoComplete="new-password"
                  />
                </div>
                <p className="text-xs text-slate-500">Must be at least 8 characters</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-sm font-medium text-slate-700">
                  Confirm Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10 focus-visible:ring-orange-500"
                    required
                    minLength={8}
                    disabled={isSubmitting}
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-orange-500 hover:bg-orange-600"
                size="lg"
                disabled={isSubmitting || !password || !confirmPassword}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  'Reset Password'
                )}
              </Button>
            </form>

            <div className="mt-4 text-center">
              <Link
                href="/auth/login"
                className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to sign in
              </Link>
            </div>
          </div>

          {/* Security Disclaimer */}
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start space-x-3">
              <Shield className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-amber-900 mb-1">
                  Private System Notice
                </h3>
                <p className="text-xs text-amber-800 leading-relaxed">
                  This is a private web application for authorized Tailfire personnel only.
                  Unauthorized access is strictly prohibited. All access attempts are logged.
                </p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-slate-400">
            &copy; {new Date().getFullYear()} Tailfire. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right Column - Hero Image */}
      <div className="hidden lg:block lg:flex-1 relative bg-gradient-to-br from-orange-400 to-orange-600">
        <Image
          src="/beach-sunset.jpg"
          alt="Tropical beach at sunset with palm trees silhouetted against orange sky"
          fill
          className="object-cover"
          priority
          quality={85}
          sizes="50vw"
        />
        {/* Overlay gradient */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.15) 0%, rgba(234, 88, 12, 0.15) 100%)'
          }}
        />

        {/* Tagline Overlay */}
        <div className="absolute bottom-12 left-12 right-12 text-white">
          <h2
            className="text-4xl font-bold mb-2 uppercase tracking-wide"
            style={{
              fontFamily: 'serif',
              textShadow: '2px 2px 4px rgba(0,0,0,0.5)'
            }}
          >
            Ignite Your Journey
          </h2>
          <p
            className="text-lg"
            style={{
              textShadow: '1px 1px 2px rgba(0,0,0,0.5)'
            }}
          >
            Streamline bookings, delight travelers, grow your travel business.
          </p>
        </div>
      </div>
    </div>
  )
}
