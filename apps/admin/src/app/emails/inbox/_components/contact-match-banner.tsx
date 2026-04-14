'use client'

import { useState } from 'react'
import { ExternalLink, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { useContacts } from '@/hooks/use-contacts'
import { QuickContactDialog } from '@/app/contacts/_components/quick-contact-dialog'

interface ContactMatchBannerProps {
  matchedContactIds: string[]
  fromAddress?: string | null
  fromName?: string | null
}

export function ContactMatchBanner({
  matchedContactIds,
  fromAddress,
  fromName,
}: ContactMatchBannerProps) {
  const [dialogOpen, setDialogOpen] = useState(false)

  // Always search by sender email to resolve contact names
  const { data: searchResults } = useContacts(
    fromAddress ? { search: fromAddress, limit: 5 } : { limit: 0 },
  )

  // Find exact email match from search results
  const matchedByEmail = (searchResults?.data || []).filter(
    (c) => c.email?.toLowerCase() === fromAddress?.toLowerCase(),
  )

  // Combine: matched contacts from sync + email search results
  const resolvedContacts = matchedByEmail.length > 0
    ? matchedByEmail.map((c) => ({
        id: c.id,
        name: c.displayName || [c.firstName, c.lastName].filter(Boolean).join(' ') || 'Contact',
      }))
    : matchedContactIds.length > 0
      ? matchedContactIds.map((id) => {
          // Try to find name from search results (may match on other fields)
          const found = searchResults?.data?.find((c) => c.id === id)
          return {
            id,
            name: found?.displayName || found?.firstName || 'Contact',
          }
        })
      : []

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

  // Parse sender name into first/last for the create dialog
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

  // No match — show "Create Contact" button
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
