'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Lock, Loader2, CheckCircle, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { createClient } from '@/lib/supabase/client'

export default function SetPasswordPage() {
  const router = useRouter()
  const supabase = createClient()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)

  const validatePassword = (pwd: string): string | null => {
    if (pwd.length < 8) return 'Password must be at least 8 characters'
    if (!/[A-Z]/.test(pwd)) return 'Password must contain at least one uppercase letter'
    if (!/[a-z]/.test(pwd)) return 'Password must contain at least one lowercase letter'
    if (!/[0-9]/.test(pwd)) return 'Password must contain at least one number'
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setValidationError(null)

    const valError = validatePassword(password)
    if (valError) {
      setValidationError(valError)
      return
    }

    if (password !== confirmPassword) {
      setValidationError('Passwords do not match')
      return
    }

    setIsSubmitting(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        setError(updateError.message)
        return
      }

      // Activate the pending account now that password is set.
      // Refresh session first so the token reflects the password change.
      const { data: refreshed } = await supabase.auth.refreshSession()
      const token = refreshed?.session?.access_token
      if (token) {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3101/api/v1'
        const resp = await fetch(`${apiUrl}/user-profiles/me/activate`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!resp.ok) {
          console.error('[SetPassword] Activate failed:', resp.status, await resp.text().catch(() => ''))
        }
      }

      // Hard navigate so middleware picks up the fresh session
      window.location.assign('/profile?setup=true')
    } catch {
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Column - Form */}
      <div className="flex-1 flex items-center justify-center bg-white px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          {/* Logo */}
          <div className="flex flex-col items-center space-y-3">
            <Image
              src="/logo.png"
              alt="Tailfire"
              width={64}
              height={64}
              className="h-16 w-16"
            />
            <div className="text-center">
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                Tailfire
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Travel Agency Management Platform
              </p>
            </div>
          </div>

          {/* Welcome Text */}
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-slate-800">
              Set Your Password
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Create a password to secure your account
            </p>
          </div>

          {/* Form Card */}
          <div className="bg-white rounded-lg shadow-lg p-8 border border-slate-100">
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    className="pl-10"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      setValidationError(null)
                    }}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="Confirm your password"
                    className="pl-10"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value)
                      setValidationError(null)
                    }}
                    required
                  />
                </div>
              </div>

              {validationError && (
                <p className="text-sm text-red-600">{validationError}</p>
              )}

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Shield className="h-3.5 w-3.5" />
                  <span>Password requirements:</span>
                </div>
                <ul className="mt-1.5 space-y-0.5 text-xs text-slate-500">
                  <li className={password.length >= 8 ? 'text-green-600' : ''}>
                    {password.length >= 8 ? <CheckCircle className="mr-1 inline h-3 w-3" /> : <span className="mr-1">&#x2022;</span>} At least 8 characters
                  </li>
                  <li className={/[A-Z]/.test(password) ? 'text-green-600' : ''}>
                    {/[A-Z]/.test(password) ? <CheckCircle className="mr-1 inline h-3 w-3" /> : <span className="mr-1">&#x2022;</span>} One uppercase letter
                  </li>
                  <li className={/[a-z]/.test(password) ? 'text-green-600' : ''}>
                    {/[a-z]/.test(password) ? <CheckCircle className="mr-1 inline h-3 w-3" /> : <span className="mr-1">&#x2022;</span>} One lowercase letter
                  </li>
                  <li className={/[0-9]/.test(password) ? 'text-green-600' : ''}>
                    {/[0-9]/.test(password) ? <CheckCircle className="mr-1 inline h-3 w-3" /> : <span className="mr-1">&#x2022;</span>} One number
                  </li>
                </ul>
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Setting password...
                  </>
                ) : (
                  'Set Password & Continue'
                )}
              </Button>
            </form>
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-slate-400">
            &copy; {new Date().getFullYear()} Tailfire. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right Column - Hero Image (matches login page exactly) */}
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
