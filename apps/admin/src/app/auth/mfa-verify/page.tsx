'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { useMfa } from '@/hooks/use-mfa'
import { useAuth } from '@/providers/auth-provider'

export default function MfaVerifyPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-orange-500" /></div>}>
      <MfaVerifyContent />
    </Suspense>
  )
}

function MfaVerifyContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirectTo') || '/trips'
  const { toast } = useToast()
  const { factors, refreshState, verify, isLoading: mfaLoading } = useMfa()
  const { recordLogin } = useAuth()

  const [code, setCode] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)
  const [error, setError] = useState('')
  const [hasLoadedFactors, setHasLoadedFactors] = useState(false)

  useEffect(() => {
    refreshState().finally(() => setHasLoadedFactors(true))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (hasLoadedFactors && !mfaLoading && factors.length === 0) {
      router.replace(`/auth/mfa-enroll?redirectTo=${encodeURIComponent(redirectTo)}`)
    }
  }, [factors, hasLoadedFactors, mfaLoading, redirectTo, router])

  const redirectViaCallback = (accessToken: string, refreshToken: string) => {
    const callbackUrl = new URL('/auth/callback', window.location.origin)
    callbackUrl.searchParams.set('next', redirectTo)

    const hash = new URLSearchParams({
      access_token: accessToken,
      refresh_token: refreshToken,
      type: 'mfa',
    }).toString()

    window.location.assign(`${callbackUrl.toString()}#${hash}`)
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim() || code.length !== 6) {
      setError('Please enter a 6-digit code')
      return
    }

    const factor = factors[0]
    if (!factor) {
      setError('No authenticator found. Please contact support.')
      return
    }

    setIsVerifying(true)
    setError('')

    try {
      const verifiedSession = await verify(factor.id, code.trim())
      if (verifiedSession) {
        recordLogin(verifiedSession.accessToken)
        toast({ title: 'Verified', description: 'Two-factor authentication successful' })
        redirectViaCallback(verifiedSession.accessToken, verifiedSession.refreshToken)
      } else {
        setError('Invalid code. Please try again. Check your authenticator app for the current code.')
        setCode('')
        setIsVerifying(false)
      }
    } catch (err) {
      console.error('[MFA Verify Page]', err)
      setError('Verification failed. Please try again.')
      setCode('')
      setIsVerifying(false)
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Left panel — form */}
      <div className="flex flex-1 flex-col items-center justify-center px-8">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex flex-col items-center space-y-2 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-100">
              <ShieldCheck className="h-6 w-6 text-orange-600" />
            </div>
            <h1 className="text-2xl font-bold">Two-Factor Authentication</h1>
            <p className="text-sm text-muted-foreground">
              Enter the 6-digit code from your authenticator app
            </p>
          </div>

          <form onSubmit={handleVerify} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="totp-code">Verification Code</Label>
              <Input
                id="totp-code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '')
                  setCode(val)
                  setError('')
                }}
                autoFocus
                autoComplete="one-time-code"
                className="text-center text-2xl tracking-widest"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive text-center">{error}</p>
            )}

            <Button
              type="submit"
              className="w-full bg-orange-600 hover:bg-orange-700"
              disabled={isVerifying || mfaLoading || code.length !== 6}
            >
              {isVerifying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Verify'
              )}
            </Button>
          </form>

          <p className="text-xs text-center text-muted-foreground">
            Open your authenticator app (Google Authenticator, Authy, etc.) and enter the current code for Tailfire.
          </p>
        </div>
      </div>

      {/* Right panel — branding */}
      <div className="hidden lg:flex lg:flex-1 bg-gradient-to-br from-orange-50 to-amber-50 items-center justify-center">
        <div className="text-center space-y-4 px-12">
          <ShieldCheck className="h-16 w-16 text-orange-500 mx-auto" />
          <h2 className="text-2xl font-bold text-gray-900">Secure Access</h2>
          <p className="text-gray-600 max-w-md">
            Two-factor authentication protects your account and your clients&apos; sensitive travel data.
          </p>
        </div>
      </div>
    </div>
  )
}
