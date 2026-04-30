'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2, ShieldCheck, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useMfa } from '@/hooks/use-mfa'
import { useAuth } from '@/providers/auth-provider'

type Step = 'setup' | 'verify'

export default function MfaEnrollPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-orange-500" /></div>}>
      <MfaEnrollContent />
    </Suspense>
  )
}

const MFA_GRACE_KEY = 'mfa_enrollment_skipped_at'
const MFA_GRACE_DAYS = 7

function getMfaGraceRemaining(): number {
  if (typeof window === 'undefined') return MFA_GRACE_DAYS
  const skippedAt = localStorage.getItem(MFA_GRACE_KEY)
  if (!skippedAt) return MFA_GRACE_DAYS
  const elapsed = Date.now() - Number(skippedAt)
  const remaining = MFA_GRACE_DAYS - Math.floor(elapsed / (1000 * 60 * 60 * 24))
  return Math.max(remaining, 0)
}

function MfaEnrollContent() {
  const searchParams = useSearchParams()
  const rawRedirect = searchParams.get('redirectTo') || '/trips'
  const redirectTo = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/trips'
  const { enroll, verify } = useMfa()
  const { recordLogin } = useAuth()
  const daysRemaining = getMfaGraceRemaining()
  const canSkip = daysRemaining > 0

  const [step, setStep] = useState<Step>('setup')
  const [isLoading, setIsLoading] = useState(false)
  const [factorId, setFactorId] = useState('')
  const [qrCode, setQrCode] = useState('')
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [secretCopied, setSecretCopied] = useState(false)

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

  const handleSkip = async () => {
    // Set httpOnly grace cookie via server route (unforgeable by client)
    await fetch('/api/mfa-skip', { method: 'POST' })
    // Track locally for UI display only
    if (!localStorage.getItem(MFA_GRACE_KEY)) {
      localStorage.setItem(MFA_GRACE_KEY, String(Date.now()))
    }
    recordLogin()
    window.location.assign(redirectTo)
  }

  const handleSetup = async () => {
    setIsLoading(true)
    setError('')

    const result = await enroll('Tailfire')
    if (!result) {
      setError('Failed to initialize two-factor authentication. Please try again.')
      setIsLoading(false)
      return
    }

    setFactorId(result.factorId)
    setQrCode(result.qrCode)
    setSecret(result.secret)
    setStep('verify')
    setIsLoading(false)
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim() || code.length !== 6) {
      setError('Please enter a 6-digit code')
      return
    }

    setIsLoading(true)
    setError('')

    const verifiedSession = await verify(factorId, code.trim())
    if (verifiedSession) {
      recordLogin(verifiedSession.accessToken)
      setIsLoading(false)
      redirectViaCallback(verifiedSession.accessToken, verifiedSession.refreshToken)
    } else {
      setError('Invalid code. Make sure you entered the current code from your authenticator app.')
      setCode('')
      setIsLoading(false)
    }
  }

  const handleCopySecret = () => {
    navigator.clipboard.writeText(secret)
    setSecretCopied(true)
    setTimeout(() => setSecretCopied(false), 2000)
  }

  return (
    <div className="flex min-h-screen">
      {/* Left panel — form */}
      <div className="flex flex-1 flex-col items-center justify-center px-8">
        <div className="w-full max-w-md space-y-6">
          <div className="flex flex-col items-center space-y-2 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-100">
              <ShieldCheck className="h-6 w-6 text-orange-600" />
            </div>
            <h1 className="text-2xl font-bold">Set Up Two-Factor Authentication</h1>
            <p className="text-sm text-muted-foreground">
              {step === 'setup' && 'Protect your account with an authenticator app'}
              {step === 'verify' && 'Scan the QR code with your authenticator app'}
            </p>
          </div>

          {/* Step 1: Setup */}
          {step === 'setup' && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <h3 className="font-medium text-sm">You&apos;ll need an authenticator app:</h3>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>Google Authenticator (iOS / Android)</li>
                  <li>Authy (iOS / Android / Desktop)</li>
                  <li>1Password, Bitwarden, or similar</li>
                </ul>
              </div>

              {error && <p className="text-sm text-destructive text-center">{error}</p>}

              <Button
                onClick={handleSetup}
                className="w-full bg-orange-600 hover:bg-orange-700"
                disabled={isLoading}
              >
                {isLoading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Setting up...</>
                ) : (
                  'Begin Setup'
                )}
              </Button>

              {canSkip && (
                <Button
                  variant="ghost"
                  className="w-full text-muted-foreground"
                  onClick={handleSkip}
                >
                  Set up later (you have {daysRemaining} day{daysRemaining !== 1 ? 's' : ''} remaining)
                </Button>
              )}
            </div>
          )}

          {/* Step 2: QR Code + Verify */}
          {step === 'verify' && (
            <div className="space-y-4">
              {/* QR Code */}
              <div className="flex justify-center">
                <div className="rounded-lg border bg-white p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrCode} alt="Scan this QR code" width={200} height={200} />
                </div>
              </div>

              {/* Manual entry */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Can&apos;t scan? Enter this code manually:
                </Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded border bg-muted px-3 py-2 text-xs font-mono break-all">
                    {secret}
                  </code>
                  <Button variant="outline" size="sm" onClick={handleCopySecret}>
                    {secretCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {/* Verification */}
              <form onSubmit={handleVerify} className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="verify-code">Enter the 6-digit code from your app:</Label>
                  <Input
                    id="verify-code"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="000000"
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value.replace(/\D/g, ''))
                      setError('')
                    }}
                    autoFocus
                    autoComplete="one-time-code"
                    className="text-center text-2xl tracking-widest"
                  />
                </div>

                {error && <p className="text-sm text-destructive text-center">{error}</p>}

                <Button
                  type="submit"
                  className="w-full bg-orange-600 hover:bg-orange-700"
                  disabled={isLoading || code.length !== 6}
                >
                  {isLoading ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying...</>
                  ) : (
                    'Verify & Enable'
                  )}
                </Button>
              </form>
            </div>
          )}

        </div>
      </div>

      {/* Right panel — branding */}
      <div className="hidden lg:flex lg:flex-1 bg-gradient-to-br from-orange-50 to-amber-50 items-center justify-center">
        <div className="text-center space-y-4 px-12">
          <ShieldCheck className="h-16 w-16 text-orange-500 mx-auto" />
          <h2 className="text-2xl font-bold text-gray-900">Account Security</h2>
          <p className="text-gray-600 max-w-md">
            Two-factor authentication adds an extra layer of security to protect your clients&apos; travel data.
          </p>
        </div>
      </div>
    </div>
  )
}
