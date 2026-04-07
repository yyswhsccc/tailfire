# Agent Micro Site — Storefront Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the advisor page from a profile into a branded lead-generation storefront with personalized AI, curated trips, featured deals, contact form, and dream board funnel — all with referral attribution.

**Architecture:** The advisor page is redesigned as a full-bleed storefront using the same visual language as entity hub pages (ImageCardFrame, gradient overlays). The AI concierge gets advisor context via the existing `ota_ref` cookie and new advisor metadata in the page context. All visitor interactions are attributed to the advisor via the referral cookie.

**Tech Stack:** Next.js 15 App Router, existing advisor API endpoints, Zustand (AI panel store), existing chat widget with openChat(), ImageCardFrame for cards

**Spec:** `docs/superpowers/specs/2026-04-07-advisor-micro-site-storefront-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `apps/ota/src/components/advisor/advisor-storefront-hero.tsx` | Full-bleed hero with photo, name, title, rating, CTAs |
| `apps/ota/src/components/advisor/advisor-contact-form.tsx` | Lead capture form (name, email, phone, message) |
| `apps/ota/src/components/advisor/advisor-curated-trips.tsx` | Published trips section with ImageCardFrame cards |
| `apps/ota/src/components/advisor/advisor-featured-deals.tsx` | Featured deals section with ImageCardFrame cards |
| `apps/ota/src/components/advisor/advisor-testimonials.tsx` | Client testimonials in card format |

### Modified Files

| File | Change |
|------|--------|
| `apps/ota/src/app/advisor/[slug]/page.tsx` | Rewrite with storefront layout, AI integration |
| `apps/ota/src/app/advisor/[slug]/trips/page.tsx` | Fix endpoint path (published-trips → trips) |
| `apps/ota/src/components/chat/chat-suggestion-chips.tsx` | Add advisor-specific suggestions |
| `apps/ota/src/components/ai/ai-contextual-prompt.tsx` | Add advisor entity type |
| `apps/ota/src/app/api/chat/route.ts` | Add advisor context to system prompt |
| `apps/ota/src/components/page-context-bridge.tsx` | Support advisor metadata |
| `apps/ota/src/lib/entity-hubs/types.ts` | Add 'advisor' to EntityType |

---

### Task 1: Fix Trips Endpoint 404 + Add Advisor EntityType

**Files:**
- Modify: `apps/ota/src/app/advisor/[slug]/trips/page.tsx`
- Modify: `apps/ota/src/lib/entity-hubs/types.ts`

- [ ] **Step 1: Fix the trips fetch URL**

Read `apps/ota/src/app/advisor/[slug]/trips/page.tsx`. Find the `fetchAdvisorTrips` function. It calls `/advisor-profiles/by-slug/${slug}/published-trips` — change to `/advisor-profiles/by-slug/${slug}/trips`.

- [ ] **Step 2: Add 'advisor' to EntityType union**

In `apps/ota/src/lib/entity-hubs/types.ts`, add `'advisor'` to the `EntityType` union:

```typescript
export type EntityType = 'destination' | 'ship' | 'sailing' | 'cruise_line' | 'region' | 'deal' | 'advisor'
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd apps/ota && npx tsc --noEmit --pretty 2>&1 | head -10`

- [ ] **Step 4: Commit**

```bash
git add apps/ota/src/app/advisor/[slug]/trips/page.tsx apps/ota/src/lib/entity-hubs/types.ts
git commit -m "fix(ota): fix advisor trips 404 (published-trips → trips), add advisor EntityType"
```

---

### Task 2: Advisor Contact Form

**Files:**
- Create: `apps/ota/src/components/advisor/advisor-contact-form.tsx`

- [ ] **Step 1: Create the contact form component**

```typescript
// apps/ota/src/components/advisor/advisor-contact-form.tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/ota/src/components/advisor/advisor-contact-form.tsx
git commit -m "feat(ota): add AdvisorContactForm — lead capture with advisor attribution"
```

---

### Task 3: Advisor Storefront Hero

**Files:**
- Create: `apps/ota/src/components/advisor/advisor-storefront-hero.tsx`

- [ ] **Step 1: Create the full-bleed hero component**

This replaces the plain centered profile header with a Dream Board-style full-bleed hero.

```typescript
// apps/ota/src/components/advisor/advisor-storefront-hero.tsx
'use client'

import Image from 'next/image'
import { openChat } from '@/components/chat/chat-widget'
import { getCuratedImage } from '@/lib/curated-images'
import type { AdvisorProfile } from '@/types/advisor'

interface AdvisorStorefrontHeroProps {
  advisor: AdvisorProfile
}

function getInitials(name: string): string {
  return name.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

function getAverageRating(reviews?: { rating: number }[]): { avg: number; count: number } | null {
  if (!reviews || reviews.length === 0) return null
  const total = reviews.reduce((sum, r) => sum + r.rating, 0)
  return { avg: total / reviews.length, count: reviews.length }
}

export function AdvisorStorefrontHero({ advisor }: AdvisorStorefrontHeroProps) {
  const firstName = advisor.displayName.split(' ')[0]
  const rating = getAverageRating(advisor.reviews)
  const topDestination = advisor.destinations?.[0] || 'travel'
  const heroImage = getCuratedImage(topDestination, 'default', 'hero')

  return (
    <div className="relative overflow-hidden bg-[#1A1A1A]">
      {/* Background image — advisor's top destination */}
      <img
        src={heroImage}
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-30"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/20" />

      <div className="relative mx-auto max-w-[1280px] px-4 pb-10 pt-20 text-center sm:px-10 sm:pb-12 sm:pt-24 lg:px-[60px]">
        {/* Agent Photo */}
        {advisor.photoUrl ? (
          <div className="relative mx-auto h-24 w-24 overflow-hidden rounded-full border-[3px] border-white shadow-lg sm:h-28 sm:w-28">
            <Image
              src={advisor.photoUrl}
              alt={advisor.displayName}
              fill
              className="object-cover"
              sizes="112px"
              priority
            />
          </div>
        ) : (
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border-[3px] border-white bg-gradient-to-br from-[#C59746] to-[#E89E4A] shadow-lg sm:h-28 sm:w-28">
            <span className="text-2xl font-bold text-white sm:text-3xl">{getInitials(advisor.displayName)}</span>
          </div>
        )}

        {/* Name + Title */}
        <h1 className="mt-5 font-display text-2xl font-bold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.5)] sm:text-3xl lg:text-4xl">
          {advisor.displayName}
        </h1>
        {advisor.title && (
          <p className="mt-1 text-xs font-semibold uppercase tracking-[2px] text-[#C59746] [text-shadow:0_1px_2px_rgba(0,0,0,0.3)]">
            {advisor.title}
          </p>
        )}

        {/* Rating */}
        {rating && (
          <p className="mt-2 text-sm text-white/80">
            ⭐ {rating.avg.toFixed(1)} · {rating.count} {rating.count === 1 ? 'review' : 'reviews'}
          </p>
        )}

        {/* CTAs */}
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={() => openChat(`I'm on ${firstName}'s page — help me plan a trip!`)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#C59746] px-6 py-3 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-[#B08638]"
          >
            ✨ Start Planning
          </button>
          <a
            href="#contact"
            className="inline-flex items-center gap-2 rounded-lg bg-white/15 px-6 py-3 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/25"
          >
            📞 Contact {firstName}
          </a>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/ota/src/components/advisor/advisor-storefront-hero.tsx
git commit -m "feat(ota): add AdvisorStorefrontHero — full-bleed Dream Board style hero"
```

---

### Task 4: Curated Trips + Featured Deals Sections

**Files:**
- Create: `apps/ota/src/components/advisor/advisor-curated-trips.tsx`
- Create: `apps/ota/src/components/advisor/advisor-featured-deals.tsx`

- [ ] **Step 1: Create curated trips section**

```typescript
// apps/ota/src/components/advisor/advisor-curated-trips.tsx

import Link from 'next/link'
import { publicFetch } from '@/lib/api'
import { ImageCardFrame } from '@/components/cards/image-card-frame'
import { getCuratedImage } from '@/lib/curated-images'

interface AdvisorCuratedTripsProps {
  advisorSlug: string
  advisorName: string
}

export async function AdvisorCuratedTrips({ advisorSlug, advisorName }: AdvisorCuratedTripsProps) {
  const firstName = advisorName.split(' ')[0]
  let trips: any[] = []

  try {
    trips = await publicFetch<any[]>(
      `/advisor-profiles/by-slug/${advisorSlug}/trips`,
      { next: { revalidate: 3600, tags: [`advisor-${advisorSlug}`] } },
    )
  } catch {
    return null
  }

  if (!trips || trips.length === 0) return null

  return (
    <section className="mx-auto max-w-[1280px] px-4 py-8 sm:px-10 lg:px-[60px]">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-bold text-[#1A1A1A]">🌴 {firstName}&apos;s Curated Trips</h2>
        <Link href={`/advisor/${advisorSlug}/trips`} className="text-sm font-medium text-[#C59746] hover:underline">
          View all →
        </Link>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {trips.slice(0, 4).map((trip: any) => (
          <ImageCardFrame
            key={trip.id || trip.slug}
            imageUrl={trip.heroImageUrl || getCuratedImage(trip.title || firstName, 'cruise', 'card')}
            fallbackGradient="from-indigo-500 to-indigo-700"
            typeBadge={trip.badge || '🌴 Curated Trip'}
            price={trip.startingPrice ? `from $${Math.round(trip.startingPrice).toLocaleString()}` : null}
            priceLabel="/pp"
            href={`/advisor/${advisorSlug}/trips/${trip.slug}`}
            height={220}
          >
            <p className="text-sm font-bold leading-tight text-white">{trip.title || trip.name}</p>
            {trip.subtitle && <p className="mt-0.5 text-xs text-white/80">{trip.subtitle}</p>}
            {trip.spotsLeft && (
              <span className="mt-1 inline-block rounded-full bg-red-500/90 px-2 py-0.5 text-[10px] font-bold text-white">
                {trip.spotsLeft} spots left
              </span>
            )}
          </ImageCardFrame>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Create featured deals section**

```typescript
// apps/ota/src/components/advisor/advisor-featured-deals.tsx

import { publicFetch } from '@/lib/api'
import { ImageCardFrame } from '@/components/cards/image-card-frame'
import { getCuratedImage } from '@/lib/curated-images'

interface AdvisorFeaturedDealsProps {
  advisorSlug: string
  advisorName: string
}

export async function AdvisorFeaturedDeals({ advisorSlug, advisorName }: AdvisorFeaturedDealsProps) {
  const firstName = advisorName.split(' ')[0]
  let deals: any[] = []

  try {
    deals = await publicFetch<any[]>(
      `/advisor-profiles/by-slug/${advisorSlug}/deals`,
      { next: { revalidate: 3600, tags: [`advisor-${advisorSlug}`] } },
    )
  } catch {
    return null
  }

  if (!deals || deals.length === 0) return null

  return (
    <section className="mx-auto max-w-[1280px] px-4 py-8 sm:px-10 lg:px-[60px]">
      <h2 className="text-lg font-bold text-[#1A1A1A]">⭐ {firstName}&apos;s Top Deals</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {deals.slice(0, 4).map((deal: any) => (
          <ImageCardFrame
            key={deal.id}
            imageUrl={deal.heroImageUrl || getCuratedImage(deal.title || 'travel', 'tropical', 'card')}
            fallbackGradient="from-violet-500 to-purple-400"
            typeBadge="⭐ Offer"
            price={deal.pricing?.fromPrice ? `from $${Math.round(deal.pricing.fromPrice).toLocaleString()}` : null}
            href={`/deals/${deal.slug}`}
            height={200}
          >
            <p className="text-sm font-bold leading-tight text-white">{deal.title}</p>
            {deal.supplierName && <p className="mt-0.5 text-xs text-white/80">{deal.supplierName}</p>}
            {deal.savingsLabel && (
              <span className="mt-1 inline-block rounded-full bg-red-500/90 px-2 py-0.5 text-[10px] font-bold text-white">
                {deal.savingsLabel}
              </span>
            )}
          </ImageCardFrame>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/ota/src/components/advisor/advisor-curated-trips.tsx apps/ota/src/components/advisor/advisor-featured-deals.tsx
git commit -m "feat(ota): add AdvisorCuratedTrips + AdvisorFeaturedDeals with ImageCardFrame"
```

---

### Task 5: Advisor Testimonials Section

**Files:**
- Create: `apps/ota/src/components/advisor/advisor-testimonials.tsx`

- [ ] **Step 1: Create testimonials component**

```typescript
// apps/ota/src/components/advisor/advisor-testimonials.tsx

import type { AdvisorProfile } from '@/types/advisor'

interface AdvisorTestimonialsProps {
  advisor: AdvisorProfile
}

export function AdvisorTestimonials({ advisor }: AdvisorTestimonialsProps) {
  const reviews = advisor.reviews
  if (!reviews || reviews.length === 0) return null

  return (
    <section className="mx-auto max-w-[1280px] px-4 py-8 sm:px-10 lg:px-[60px]">
      <h2 className="text-lg font-bold text-[#1A1A1A]">💬 Client Stories</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {reviews.slice(0, 6).map((review, i) => (
          <div key={i} className="rounded-xl border border-[#E0E0E0] bg-[#faf6f0] p-5">
            {/* Stars */}
            <div className="flex gap-0.5">
              {Array.from({ length: 5 }).map((_, j) => (
                <span key={j} className={j < review.rating ? 'text-[#C59746]' : 'text-[#E0E0E0]'}>★</span>
              ))}
            </div>
            {/* Quote */}
            <p className="mt-3 text-sm leading-relaxed text-[#1A1A1A]" style={{ fontStyle: 'italic' }}>
              &ldquo;{review.text}&rdquo;
            </p>
            {/* Author */}
            <div className="mt-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#E0E0E0] text-[10px] font-bold text-[#888]">
                {review.author.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <span className="text-xs text-[#888]">{review.author}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/ota/src/components/advisor/advisor-testimonials.tsx
git commit -m "feat(ota): add AdvisorTestimonials — client stories in card format"
```

---

### Task 6: Personalized AI for Advisor Pages

**Files:**
- Modify: `apps/ota/src/components/chat/chat-suggestion-chips.tsx`
- Modify: `apps/ota/src/components/ai/ai-contextual-prompt.tsx`
- Modify: `apps/ota/src/app/api/chat/route.ts`

- [ ] **Step 1: Add advisor suggestions to chat chips**

In `chat-suggestion-chips.tsx`, add to `CONTEXT_SUGGESTIONS`:

```typescript
advisor: (name) => [
  `What trips does ${name} recommend?`,
  `Tell me about ${name}'s group cruise`,
  `Help me plan a trip with ${name}`,
  `What makes ${name} special?`,
],
```

- [ ] **Step 2: Add advisor to AI contextual prompt**

In `ai-contextual-prompt.tsx`, add to `SUGGESTIONS`:

```typescript
advisor: (name) => `${name} can help you plan the perfect trip. Ask me anything!`,
```

And to `PROMPTS`:

```typescript
advisor: (name) => `I'm on ${name}'s page — help me plan a trip!`,
```

- [ ] **Step 3: Add advisor context to chat system prompt**

In `apps/ota/src/app/api/chat/route.ts`, in the page context section builder, add advisor-specific handling:

After the existing `if (pageContext?.type && pageContext?.name)` block, add:

```typescript
// If this is an advisor page, add advisor-specific context
if (pageContext?.type === 'advisor' && pageContext?.metadata) {
  const m = pageContext.metadata as Record<string, unknown>
  const lines = [`\n--- Advisor Context ---`]
  lines.push(`The visitor is on ${pageContext.name}'s micro site.`)
  if (m.title) lines.push(`Title: ${m.title}`)
  if (m.specialties) lines.push(`Specializes in: ${m.specialties}`)
  if (m.destinations) lines.push(`Expert destinations: ${m.destinations}`)
  lines.push(`\nWhen helping this visitor:`)
  lines.push(`- Reference ${pageContext.name.split(' ')[0]} by name naturally`)
  lines.push(`- Promote their expertise: "${pageContext.name.split(' ')[0]} is amazing with ${(m.specialties as string) || 'travel planning'}"`)
  lines.push(`- When ready to book: "Want me to connect you with ${pageContext.name.split(' ')[0]} directly?"`)
  lines.push(`- All leads go to ${pageContext.name.split(' ')[0]} — use their slug for captureContact`)
  pageContextSection += lines.join('\n')
}
```

- [ ] **Step 4: Verify TypeScript**

Run: `cd apps/ota && npx tsc --noEmit --pretty 2>&1 | head -10`

- [ ] **Step 5: Commit**

```bash
git add apps/ota/src/components/chat/chat-suggestion-chips.tsx apps/ota/src/components/ai/ai-contextual-prompt.tsx apps/ota/src/app/api/chat/route.ts
git commit -m "feat(ota): personalize AI concierge for advisor pages — suggestions, prompts, system context"
```

---

### Task 7: Rewrite Advisor Page as Storefront

**Files:**
- Modify: `apps/ota/src/app/advisor/[slug]/page.tsx`

- [ ] **Step 1: Rewrite the page with storefront layout**

Replace the entire page with the storefront composition:

```typescript
// apps/ota/src/app/advisor/[slug]/page.tsx

import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { publicFetch } from '@/lib/api'
import type { AdvisorProfile } from '@/types/advisor'
import { PageContextBridge } from '@/components/page-context-bridge'
import { AiContextualPrompt } from '@/components/ai/ai-contextual-prompt'
import { AdvisorStorefrontHero } from '@/components/advisor/advisor-storefront-hero'
import { AdvisorCuratedTrips } from '@/components/advisor/advisor-curated-trips'
import { AdvisorFeaturedDeals } from '@/components/advisor/advisor-featured-deals'
import { AdvisorDestinations } from '@/components/advisor/advisor-destinations'
import { AdvisorTestimonials } from '@/components/advisor/advisor-testimonials'
import { AdvisorBioCard } from '@/components/advisor/advisor-bio-card'
import { AdvisorContactForm } from '@/components/advisor/advisor-contact-form'
import { SectionSkeleton } from '@/components/hub/section-skeleton'
import { FeedDivider } from '@/components/hub/feed-divider'

export const revalidate = 3600

interface Props {
  params: Promise<{ slug: string }>
}

async function fetchAdvisor(slug: string): Promise<AdvisorProfile | null> {
  try {
    return await publicFetch<AdvisorProfile>(
      `/advisor-profiles/by-slug/${slug}`,
      { next: { tags: ['advisors', `advisor-${slug}`] } },
    )
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const advisor = await fetchAdvisor(slug)
  if (!advisor) return { title: 'Advisor Not Found | Phoenix Voyages' }

  const title = `${advisor.displayName} — Travel Advisor | Phoenix Voyages`
  const description = advisor.specialties?.length
    ? `${advisor.displayName} specializes in ${advisor.specialties.slice(0, 3).join(', ')}. Plan your dream trip with a Phoenix Voyages travel advisor.`
    : `Plan your next trip with ${advisor.displayName}, a Phoenix Voyages travel advisor.`

  return {
    title,
    description,
    openGraph: { title, description, type: 'profile', url: `/advisor/${advisor.slug}` },
  }
}

export default async function AdvisorStorefrontPage({ params }: Props) {
  const { slug } = await params
  const advisor = await fetchAdvisor(slug)
  if (!advisor) notFound()

  return (
    <>
      <PageContextBridge
        type="advisor"
        slug={slug}
        name={advisor.displayName}
        metadata={{
          title: advisor.title,
          specialties: advisor.specialties?.join(', '),
          destinations: advisor.destinations?.join(', '),
        }}
      />

      {/* Hero */}
      <AdvisorStorefrontHero advisor={advisor} />

      {/* Specialty pills */}
      {advisor.specialties && advisor.specialties.length > 0 && (
        <div className="border-b border-[#E0E0E0]">
          <div className="mx-auto flex max-w-[1280px] gap-2.5 overflow-x-auto px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible sm:px-10 lg:px-[60px]">
            {advisor.specialties.map((s) => (
              <span key={s} className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-[#C59746]/35 bg-[#C59746]/12 px-3 py-1.5 text-xs font-semibold text-[#C59746]">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* AI Prompt */}
      <AiContextualPrompt entityType="advisor" entityName={advisor.displayName} />

      {/* Curated Trips */}
      <Suspense fallback={<SectionSkeleton variant="grid-2" />}>
        <AdvisorCuratedTrips advisorSlug={slug} advisorName={advisor.displayName} />
      </Suspense>

      <FeedDivider />

      {/* Featured Deals */}
      <Suspense fallback={<SectionSkeleton variant="grid-2" />}>
        <AdvisorFeaturedDeals advisorSlug={slug} advisorName={advisor.displayName} />
      </Suspense>

      <FeedDivider />

      {/* Destinations */}
      <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-10 lg:px-[60px]">
        <AdvisorDestinations advisor={advisor} />
      </div>

      <FeedDivider />

      {/* Testimonials */}
      <AdvisorTestimonials advisor={advisor} />

      <FeedDivider />

      {/* Bio + Contact side by side on desktop */}
      <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-10 lg:px-[60px]">
        <div className="grid gap-6 lg:grid-cols-2">
          <AdvisorBioCard advisor={advisor} />
          <AdvisorContactForm advisorName={advisor.displayName} advisorSlug={slug} />
        </div>
      </div>

      {/* Footer attribution */}
      <div className="border-t border-[#E0E0E0] py-4 text-center">
        <p className="text-xs text-[#888]">
          Powered by <span className="font-semibold text-[#C59746]">Phoenix Voyages</span> · TICO Registered
        </p>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `cd apps/ota && npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Test in browser**

Navigate to `http://localhost:3102/advisor/{any-slug}` — should see storefront layout.

- [ ] **Step 4: Commit**

```bash
git add apps/ota/src/app/advisor/[slug]/page.tsx
git commit -m "feat(ota): rewrite advisor page as branded storefront with curated trips, deals, AI, contact form"
```

---

## What This Plan Produces

After all 7 tasks:

1. **Fixed trips 404** — advisor trips page loads correctly
2. **Contact form** — lead capture with advisor attribution, success state
3. **Storefront hero** — full-bleed Dream Board style with photo, name, rating, CTAs
4. **Curated trips section** — ImageCardFrame cards with urgency badges
5. **Featured deals section** — ImageCardFrame cards with savings badges
6. **Testimonials section** — client stories in warm ivory card format
7. **Personalized AI** — concierge knows the advisor's name, specialties, destinations
8. **"Start Planning" CTA** — opens dream board chat with advisor context
9. **Full referral attribution** — `ota_ref` cookie set by middleware, read by chat + leads

## What's Deferred (Phase 3)

- Group trip availability/urgency system (spots left counter)
- Social sharing OG image generation per advisor
- Advisor analytics dashboard (views, leads, conversions)
- Cover photo upload (using curated images for now)
- Video introduction support
