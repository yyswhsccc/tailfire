'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Lock, Loader2, CheckCircle, Flame, Shield } from 'lucide-react'
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
      // Password set — continue to profile setup
      router.replace('/profile?setup=true')
    } catch (err) {
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Left side - Form */}
      <div className="flex w-full flex-col justify-center px-8 lg:w-1/2 lg:px-16">
        <div className="mx-auto w-full max-w-md space-y-8">
          <div className="flex items-center gap-3">
            <Image src="/logo.svg" alt="Tailfire" width={32} height={32} />
            <div>
              <h1 className="text-xl font-semibold text-ash-900">Set Your Password</h1>
              <p className="text-sm text-ash-500">Create a password to secure your account</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-ash-400" />
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
                <Lock className="absolute left-3 top-3 h-4 w-4 text-ash-400" />
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

            <div className="rounded-lg border border-ash-200 bg-ash-50 p-3">
              <div className="flex items-center gap-2 text-xs text-ash-500">
                <Shield className="h-3.5 w-3.5" />
                <span>Password requirements:</span>
              </div>
              <ul className="mt-1.5 space-y-0.5 text-xs text-ash-500">
                <li className={password.length >= 8 ? 'text-green-600' : ''}>
                  {password.length >= 8 ? <CheckCircle className="mr-1 inline h-3 w-3" /> : '•'} At least 8 characters
                </li>
                <li className={/[A-Z]/.test(password) ? 'text-green-600' : ''}>
                  {/[A-Z]/.test(password) ? <CheckCircle className="mr-1 inline h-3 w-3" /> : '•'} One uppercase letter
                </li>
                <li className={/[a-z]/.test(password) ? 'text-green-600' : ''}>
                  {/[a-z]/.test(password) ? <CheckCircle className="mr-1 inline h-3 w-3" /> : '•'} One lowercase letter
                </li>
                <li className={/[0-9]/.test(password) ? 'text-green-600' : ''}>
                  {/[0-9]/.test(password) ? <CheckCircle className="mr-1 inline h-3 w-3" /> : '•'} One number
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
      </div>

      {/* Right side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 lg:items-center lg:justify-center lg:bg-gradient-to-br lg:from-teal-600 lg:to-teal-800">
        <div className="text-center text-white">
          <Flame className="mx-auto h-16 w-16 mb-4 opacity-80" />
          <h2 className="text-2xl font-semibold">Welcome to Tailfire</h2>
          <p className="mt-2 text-teal-100">Set your password to get started</p>
        </div>
      </div>
    </div>
  )
}
