'use client'

import { ExternalLink, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface ContactMatchBannerProps {
  matchedContactIds: string[]
  contacts: { id: string; name: string }[]
  fromAddress?: string | null
  fromName?: string | null
}

export function ContactMatchBanner({
  matchedContactIds,
  contacts,
  fromAddress,
  fromName,
}: ContactMatchBannerProps) {
  const router = useRouter()

  if (matchedContactIds.length === 0) {
    return (
      <div className="flex items-center justify-between rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <span>No matching contact found</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 text-xs"
          onClick={() => {
            // Navigate to contacts page with pre-filled email and name
            const params = new URLSearchParams()
            if (fromAddress) params.set('email', fromAddress)
            if (fromName) {
              const parts = fromName.split(' ')
              if (parts.length > 1) {
                params.set('firstName', parts.slice(0, -1).join(' '))
                params.set('lastName', parts[parts.length - 1]!)
              } else {
                params.set('firstName', fromName)
              }
            }
            params.set('create', 'true')
            router.push(`/contacts?${params.toString()}`)
          }}
        >
          <UserPlus className="h-3 w-3" />
          Create Contact
        </Button>
      </div>
    )
  }

  const matched = matchedContactIds
    .map((id) => contacts.find((c) => c.id === id))
    .filter(Boolean) as { id: string; name: string }[]

  if (matched.length === 0) {
    // We have IDs but no contact data loaded — show ID links
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs">
        <span className="text-muted-foreground">Linked to:</span>
        {matchedContactIds.map((id, i) => (
          <span key={id}>
            <Link
              href={`/contacts/${id}`}
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              Contact
              <ExternalLink className="h-3 w-3" />
            </Link>
            {i < matchedContactIds.length - 1 && (
              <span className="text-muted-foreground">, </span>
            )}
          </span>
        ))}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs">
      <span className="text-muted-foreground">Linked to:</span>
      {matched.map((contact, i) => (
        <span key={contact.id}>
          <Link
            href={`/contacts/${contact.id}`}
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
          >
            {contact.name}
            <ExternalLink className="h-3 w-3" />
          </Link>
          {i < matched.length - 1 && <span className="text-muted-foreground">, </span>}
        </span>
      ))}
    </div>
  )
}
