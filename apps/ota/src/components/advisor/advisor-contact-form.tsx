'use client'

import { useState } from 'react'
import { Send, CheckCircle, Loader2 } from 'lucide-react'

interface AdvisorContactFormProps {
  advisorName: string
  advisorSlug: string
}

export function AdvisorContactForm({ advisorName, advisorSlug }: AdvisorContactFormProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  const firstName = advisorName.split(' ')[0]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !email.trim()) return

    setStatus('sending')
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          message: message.trim() || undefined,
          source: 'advisor_contact_form',
          advisorSlug,
        }),
      })
      if (!res.ok) throw new Error('Failed to send')
      setStatus('sent')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'sent') {
    return (
      <div id="contact" className="rounded-2xl border border-[#E0E0E0] bg-[#faf6f0] p-8 text-center">
        <CheckCircle className="mx-auto size-12 text-[#C59746]" />
        <h3 className="mt-4 text-lg font-bold text-[#1A1A1A]">Message sent!</h3>
        <p className="mt-2 text-sm text-[#888]">{firstName} will get back to you shortly.</p>
      </div>
    )
  }

  return (
    <form id="contact" onSubmit={handleSubmit} className="rounded-2xl border border-[#E0E0E0] bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold text-[#1A1A1A]">📩 Contact {firstName}</h3>
      <p className="mt-1 text-sm text-[#888]">Tell {firstName} what you&apos;re dreaming of — no commitment needed.</p>

      <div className="mt-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-[#1A1A1A]">Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="mt-1 h-10 w-full rounded-lg border border-[#E0E0E0] bg-white px-3 text-sm text-[#1A1A1A] focus:border-[#C59746] focus:outline-none focus:ring-1 focus:ring-[#C59746]"
            placeholder="Your name"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[#1A1A1A]">Email *</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="mt-1 h-10 w-full rounded-lg border border-[#E0E0E0] bg-white px-3 text-sm text-[#1A1A1A] focus:border-[#C59746] focus:outline-none focus:ring-1 focus:ring-[#C59746]"
            placeholder="your@email.com"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[#1A1A1A]">Phone <span className="text-[#888]">(optional)</span></label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-[#E0E0E0] bg-white px-3 text-sm text-[#1A1A1A] focus:border-[#C59746] focus:outline-none focus:ring-1 focus:ring-[#C59746]"
            placeholder="(555) 123-4567"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[#1A1A1A]">Message <span className="text-[#888]">(optional)</span></label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-[#E0E0E0] bg-white px-3 py-2 text-sm text-[#1A1A1A] focus:border-[#C59746] focus:outline-none focus:ring-1 focus:ring-[#C59746]"
            placeholder={`Tell ${firstName} what you're dreaming of...`}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={status === 'sending' || !name.trim() || !email.trim()}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-[#C59746] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#B08638] disabled:opacity-50"
      >
        {status === 'sending' ? (
          <><Loader2 className="size-4 animate-spin" /> Sending...</>
        ) : (
          <><Send className="size-4" /> Send to {firstName}</>
        )}
      </button>

      {status === 'error' && (
        <p className="mt-2 text-center text-xs text-red-500">Something went wrong. Please try again.</p>
      )}
    </form>
  )
}
