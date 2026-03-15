'use client'

import { useState } from 'react'
import { ExternalLink, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { useContacts } from '@/hooks/use-contacts'
import { QuickContactDialog } from '@/app/contacts/_components/quick-contact-dialog'

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
  const [dialogOpen, setDialogOpen] = useState(false)

  // Real-time fallback: search contacts by fromAddress when matchedContactIds is empty
  const { data: searchResults } = useContacts(
    matchedContactIds.length === 0 && fromAddress
      ? { search: fromAddress, limit: 5 }
      : { limit: 0 },
  )

  // Merge: use matchedContactIds if available, otherwise use search results
  const resolvedContacts = matchedContactIds.length > 0
    ? matchedContactIds
        .map((id) => contacts.find((c) => c.id === id))
        .filter(Boolean) as { id: string; name: string }[]
    : (searchResults?.data || [])
        .filter((c) => c.email?.toLowerCase() === fromAddress?.toLowerCase())
        .map((c) => ({ id: c.id, name: c.displayName || c.firstName || 'Contact' }))

  if (resolvedContacts.length === 0 && matchedContactIds.length > 0) {
    // We have IDs but no contact data loaded — show generic links
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

  if (resolvedContacts.length > 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs">
        <span className="text-muted-foreground">Linked to:</span>
        {resolvedContacts.map((contact, i) => (
          <span key={contact.id}>
            <Link
              href={`/contacts/${contact.id}`}
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              {contact.name}
              <ExternalLink className="h-3 w-3" />
            </Link>
            {i < resolvedContacts.length - 1 && <span className="text-muted-foreground">, </span>}
          </span>
        ))}
      </div>
    )
  }

  // Parse sender name into first/last
  const parsedName = (() => {
    if (!fromName) return {}
    const parts = fromName.split(' ')
    if (parts.length > 1) {
      return {
        firstName: parts.slice(0, -1).join(' '),
        lastName: parts[parts.length - 1]!,
      }
    }
    return { firstName: fromName }
  })()

  // No match found at all — show create button
  return (
    <>
      <div className="flex items-center justify-between rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <span>No matching contact found</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 text-xs"
          onClick={() => setDialogOpen(true)}
        >
          <UserPlus className="h-3 w-3" />
          Create Contact
        </Button>
      </div>
      <QuickContactDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultValues={{
          ...parsedName,
          ...(fromAddress ? { email: fromAddress } : {}),
        }}
        onSuccess={() => setDialogOpen(false)}
      />
    </>
  )
}
