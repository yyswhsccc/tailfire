"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@tailfire/ui-public";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-phoenix-charcoal flex items-center justify-center">
          <div className="animate-pulse text-phoenix-gold">Loading...</div>
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Show error from auth callback
  useEffect(() => {
    const urlError = searchParams.get("error");
    if (urlError === "auth_callback_failed") {
      setError("Authentication failed. Please try again.");
    }
  }, [searchParams]);

  // Redirect if already logged in
  useEffect(() => {
    if (!loading && user) {
      router.push("/");
    }
  }, [user, loading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setIsLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: false, // Only invited portal users can log in
      },
    });

    setIsLoading(false);

    if (otpError) {
      if (otpError.message?.includes('Signups not allowed') || otpError.message?.includes('not allowed')) {
        setError(
          'No account found with this email. Start by exploring trips on our website — you can create an account when you save your dream board!'
        );
      } else {
        setError(otpError.message);
      }
      return;
    }

    setSent(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-phoenix-charcoal flex items-center justify-center">
        <div className="animate-pulse text-phoenix-gold">Loading...</div>
      </div>
    );
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
              {sent
                ? "Check your email for a login link"
                : "Sign in to manage your trips and documents"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="text-center space-y-4">
                <div className="py-6">
                  <div className="mx-auto w-16 h-16 rounded-full bg-phoenix-gold/20 flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-phoenix-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-phoenix-text-light text-sm">
                    We sent a login link to <strong className="text-white">{email}</strong>.
                    Click the link in the email to sign in.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="w-full border-phoenix-gold/30 text-phoenix-text-light hover:bg-phoenix-gold/10"
                  onClick={() => {
                    setSent(false);
                    setEmail("");
                  }}
                >
                  Use a different email
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="rounded-md bg-red-500/10 border border-red-500/30 p-3">
                    <p className="text-sm text-red-400">{error}</p>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-phoenix-text-light">
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-phoenix-charcoal/50 border-phoenix-gold/30 text-white placeholder:text-phoenix-text-muted"
                    required
                    autoFocus
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full btn-phoenix-primary"
                  disabled={isLoading}
                >
                  {isLoading ? "Sending..." : "Send Login Link"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-phoenix-text-muted mt-4">
          Only invited clients can access this portal.
          Contact your travel advisor if you need access.
        </p>
      </div>
    </div>
  );
}
