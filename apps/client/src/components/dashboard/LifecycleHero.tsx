'use client'

import Link from 'next/link'
import { Sparkles, MessageCircle, MapPin, Plane, Heart, Send } from 'lucide-react'
import type { ContactStatus } from '@/hooks/use-portal-data'

interface LifecycleHeroProps {
  contactStatus: ContactStatus | null | undefined
  hasUnreadMessages?: boolean
}

interface CtaConfig {
  icon: typeof Sparkles
  eyebrow: string
  title: string
  body: string
  ctaLabel: string
  ctaHref: string
  accent: 'gold' | 'ember' | 'orange'
}

function buildCta(props: LifecycleHeroProps): CtaConfig {
  const { contactStatus, hasUnreadMessages } = props

  if (hasUnreadMessages) {
    return {
      icon: MessageCircle,
      eyebrow: 'New message',
      title: 'You have a new message from your travel advisor',
      body: 'Open your inbox to see what they sent.',
      ctaLabel: 'Open messages',
      ctaHref: '/messages',
      accent: 'ember',
    }
  }

  switch (contactStatus) {
    case 'traveling':
      return {
        icon: MapPin,
        eyebrow: 'On the road',
        title: 'Have a wonderful trip',
        body: "We hope you're making memories. Your itinerary is always a tap away.",
        ctaLabel: "Today's plan",
        ctaHref: '/trips',
        accent: 'orange',
      }
    case 'booked':
      return {
        icon: Plane,
        eyebrow: 'Trip confirmed',
        title: 'Your next adventure is booked',
        body: 'Make sure your travel documents are ready before departure.',
        ctaLabel: 'Review documents',
        ctaHref: '/documents',
        accent: 'gold',
      }
    case 'quoted':
      return {
        icon: Send,
        eyebrow: 'In planning',
        title: 'Your advisor is preparing options',
        body: "We'll let you know as soon as a proposal is ready for review.",
        ctaLabel: 'Visit my board',
        ctaHref: '/board',
        accent: 'gold',
      }
    case 'returned':
    case 'awaiting_next':
      return {
        icon: Heart,
        eyebrow: 'Welcome home',
        title: 'Where to next?',
        body: 'Tell us about your next dream destination — your advisor is here to help.',
        ctaLabel: 'Plan another trip',
        ctaHref: process.env.NEXT_PUBLIC_OTA_URL || 'https://phoenixvoyages.ca',
        accent: 'ember',
      }
    case 'prospecting':
    case 'inactive':
    default:
      return {
        icon: Sparkles,
        eyebrow: 'Just getting started',
        title: 'Start dreaming',
        body: 'Save destinations and inspiration to your dream board — your advisor will see what excites you.',
        ctaLabel: 'Browse trips',
        ctaHref: process.env.NEXT_PUBLIC_OTA_URL || 'https://phoenixvoyages.ca',
        accent: 'gold',
      }
  }
}

const ACCENT_STYLES = {
  gold: {
    iconTile: 'bg-phoenix-gold/10',
    icon: 'text-phoenix-gold',
    eyebrow: 'text-phoenix-gold',
    cta: 'bg-phoenix-charcoal hover:bg-phoenix-charcoal/90 text-white',
  },
  ember: {
    iconTile: 'bg-phoenix-ember/10',
    icon: 'text-phoenix-ember',
    eyebrow: 'text-phoenix-ember',
    cta: 'bg-phoenix-ember hover:bg-phoenix-ember/90 text-white',
  },
  orange: {
    iconTile: 'bg-phoenix-orange/10',
    icon: 'text-phoenix-orange',
    eyebrow: 'text-phoenix-ember',
    cta: 'bg-phoenix-charcoal hover:bg-phoenix-charcoal/90 text-white',
  },
}

export function LifecycleHero(props: LifecycleHeroProps) {
  const cta = buildCta(props)
  const Icon = cta.icon
  const styles = ACCENT_STYLES[cta.accent]
  const isExternal = cta.ctaHref.startsWith('http')

  return (
    <section className="rounded-3xl bg-white p-6 shadow-lg md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between md:gap-8">
        <div className="flex items-start gap-4">
          <div
            className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${styles.iconTile} ${styles.icon}`}
          >
            <Icon className="size-6" />
          </div>
          <div className="space-y-1">
            <p className={`text-xs font-semibold uppercase tracking-wider ${styles.eyebrow}`}>
              {cta.eyebrow}
            </p>
            <h2 className="text-xl font-semibold text-phoenix-charcoal md:text-2xl">
              {cta.title}
            </h2>
            <p className="text-sm text-phoenix-text-muted md:text-base">{cta.body}</p>
          </div>
        </div>
        {isExternal ? (
          <a
            href={cta.ctaHref}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex shrink-0 items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold transition-colors ${styles.cta}`}
          >
            {cta.ctaLabel}
          </a>
        ) : (
          <Link
            href={cta.ctaHref}
            className={`inline-flex shrink-0 items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold transition-colors ${styles.cta}`}
          >
            {cta.ctaLabel}
          </Link>
        )}
      </div>
    </section>
  )
}
