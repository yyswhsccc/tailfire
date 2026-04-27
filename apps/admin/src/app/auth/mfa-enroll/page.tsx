'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, ShieldCheck, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { useMfa } from '@/hooks/use-mfa'
import { useAuth } from '@/providers/auth-provider'

type Step = 'setup' | 'verify' | 'complete'

export default function MfaEnrollPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirectTo') || '/trips'
  const { toast } = useToast()
  const { enroll, verify } = useMfa()
  const { recordLogin } = useAuth()

  const [step, setStep] = useState<Step>('setup')
  const [isLoading, setIsLoading] = useState(false)
  const [factorId, setFactorId] = useState('')
  const [qrCode, setQrCode] = useState('')
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [secretCopied, setSecretCopied] = useState(false)

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

    const success = await verify(factorId, code.trim())
    if (success) {
      recordLogin()
      setStep('complete')
      setIsLoading(false)
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

  const handleComplete = () => {
    toast({ title: 'Two-factor authentication enabled', description: 'Your account is now more secure.' })
    router.push(redirectTo)
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
              {step === 'complete' && 'Two-factor authentication is now active'}
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

          {/* Step 3: Complete */}
          {step === 'complete' && (
            <div className="space-y-4 text-center">
              <div className="flex justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                  <Check className="h-8 w-8 text-green-600" />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Your account is now protected with two-factor authentication. You&apos;ll be asked for a code each time you sign in.
              </p>
              <Button onClick={handleComplete} className="w-full bg-orange-600 hover:bg-orange-700">
                Continue to Tailfire
              </Button>
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
