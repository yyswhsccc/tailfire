'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth'
import { usePortalProfile, useUpdatePortalProfile } from '@/hooks/use-portal-data'
import { Loader2, Check, Mail, Shield } from 'lucide-react'

export default function SettingsPage() {
  const { user, logout } = useAuth()
  const { data: profile, isLoading } = usePortalProfile()
  const updateProfile = useUpdatePortalProfile()
  const [saved, setSaved] = useState(false)

  const [form, setForm] = useState({
    preferredName: '',
    phone: '',
  })

  // Sync form with profile data on load
  useEffect(() => {
    if (profile) {
      setForm({
        preferredName: profile.preferredName || '',
        phone: profile.phone || '',
      })
    }
  }, [profile])

  async function handleSave() {
    await updateProfile.mutateAsync({
      preferredName: form.preferredName || undefined,
      phone: form.phone || undefined,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-phoenix-gold" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl py-8">
      <h1 className="text-2xl font-bold text-phoenix-charcoal">Account Settings</h1>
      <p className="mt-1 text-sm text-gray-500">Manage your account preferences</p>

      {/* Account Info */}
      <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-3">
          <Mail className="size-5 text-gray-400" />
          <h2 className="text-base font-semibold text-phoenix-charcoal">Account</h2>
        </div>
        <div className="mt-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-500">Email</label>
            <p className="mt-1 text-sm text-phoenix-charcoal">{user?.email}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Preferred Name</label>
            <input
              type="text"
              value={form.preferredName}
              onChange={(e) => setForm({ ...form, preferredName: e.target.value })}
              placeholder="How should we address you?"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-phoenix-gold focus:outline-none focus:ring-1 focus:ring-phoenix-gold"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Phone</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="Your phone number"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-phoenix-gold focus:outline-none focus:ring-1 focus:ring-phoenix-gold"
            />
          </div>
        </div>
        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={updateProfile.isPending}
            className="rounded-full bg-phoenix-gold px-6 py-2 text-sm font-medium text-white hover:bg-phoenix-gold/90 disabled:opacity-50"
          >
            {updateProfile.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : saved ? (
              <span className="flex items-center gap-1"><Check className="size-4" /> Saved</span>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      </div>

      {/* Security */}
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-3">
          <Shield className="size-5 text-gray-400" />
          <h2 className="text-base font-semibold text-phoenix-charcoal">Security</h2>
        </div>
        <div className="mt-4">
          <p className="text-sm text-gray-600">
            You sign in via magic link sent to your email. Password login coming soon.
          </p>
        </div>
      </div>

      {/* Sign Out */}
      <div className="mt-6">
        <button
          onClick={() => logout()}
          className="text-sm text-red-500 hover:text-red-700"
        >
          Sign out of my account
        </button>
      </div>
    </div>
  )
}
