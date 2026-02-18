"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { useAuth } from "@/lib/auth"
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@tailfire/ui-public"
import { Mail, ArrowLeft, CheckCircle2 } from "lucide-react"

export default function LoginPage() {
  const router = useRouter()
  const { user, loading, signInWithOtp } = useAuth()
  const [email, setEmail] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Redirect if already logged in
  useEffect(() => {
    if (!loading && user) {
      router.push("/")
    }
  }, [user, loading, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return

    setIsSubmitting(true)
    setError(null)

    const { error: signInError } = await signInWithOtp(email)

    setIsSubmitting(false)

    if (signInError) {
      if (signInError.message?.includes("Signups not allowed")) {
        setError("No account found for this email. Please contact your travel advisor for an invitation.")
      } else {
        setError(signInError.message || "Failed to send login link. Please try again.")
      }
      return
    }

    setEmailSent(true)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-phoenix-charcoal flex items-center justify-center">
        <div className="animate-pulse text-phoenix-gold">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-phoenix-charcoal flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Image
            src="/logo.png"
            alt="Phoenix Voyages"
            width={200}
            height={60}
            className="h-16 w-auto"
          />
        </div>

        <Card className="bg-phoenix-charcoal/50 border-phoenix-gold/30">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl text-white font-display">
              Client Portal
            </CardTitle>
            <CardDescription className="text-phoenix-text-muted">
              {emailSent
                ? "Check your email"
                : "Sign in to manage your trips and documents"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {emailSent ? (
              <div className="text-center space-y-4">
                <div className="flex justify-center">
                  <CheckCircle2 className="h-16 w-16 text-phoenix-gold" />
                </div>
                <div className="space-y-2">
                  <p className="text-white">
                    We sent a magic link to
                  </p>
                  <p className="text-phoenix-gold font-medium">{email}</p>
                  <p className="text-phoenix-text-muted text-sm">
                    Click the link in your email to sign in. The link expires in 1 hour.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="mt-4 border-phoenix-gold/30 text-phoenix-text-light hover:bg-phoenix-gold/10"
                  onClick={() => {
                    setEmailSent(false)
                    setEmail("")
                  }}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Use a different email
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-phoenix-text-light">
                    Email Address
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-phoenix-text-muted" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10 bg-phoenix-charcoal/50 border-phoenix-gold/30 text-white placeholder:text-phoenix-text-muted"
                      required
                      autoFocus
                    />
                  </div>
                </div>

                {error && (
                  <p className="text-red-400 text-sm">{error}</p>
                )}

                <Button
                  type="submit"
                  className="w-full btn-phoenix-primary"
                  disabled={isSubmitting || !email}
                >
                  {isSubmitting ? "Sending..." : "Send Magic Link"}
                </Button>

                <p className="text-phoenix-text-muted text-xs text-center">
                  We&apos;ll send you a secure login link. No password needed.
                </p>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-phoenix-text-muted mt-4">
          Don&apos;t have an account? Contact your travel advisor for an invitation.
        </p>
      </div>
    </div>
  )
}
