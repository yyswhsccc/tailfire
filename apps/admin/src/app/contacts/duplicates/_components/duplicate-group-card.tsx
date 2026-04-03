'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { GitMerge, X, Mail, Phone, Calendar } from 'lucide-react'
import type { DuplicateGroup } from '@tailfire/shared-types/api'

interface DuplicateGroupCardProps {
  group: DuplicateGroup
  onMerge: (contactIds: [string, string]) => void
  onDismiss: (contactId1: string, contactId2: string, matchType: string) => void
  isDismissing?: boolean
}

function matchTypeLabel(type: string): string {
  switch (type) {
    case 'email': return 'Same Email'
    case 'phone_name': return 'Same Phone + Similar Name'
    case 'dob_name': return 'Same DOB + Similar Name'
    default: return type
  }
}

function matchTypeIcon(type: string) {
  switch (type) {
    case 'email': return <Mail className="h-3 w-3" />
    case 'phone_name': return <Phone className="h-3 w-3" />
    case 'dob_name': return <Calendar className="h-3 w-3" />
    default: return null
  }
}

export function DuplicateGroupCard({ group, onMerge, onDismiss, isDismissing }: DuplicateGroupCardProps) {
  const [a, b] = group.contacts

  return (
    <Card>
      <CardContent className="p-4">
        {/* Match type badge */}
        <div className="flex items-center justify-between mb-3">
          <Badge variant={group.confidence === 'high' ? 'default' : 'secondary'} className="flex items-center gap-1">
            {matchTypeIcon(group.matchType)}
            {matchTypeLabel(group.matchType)}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {group.confidence === 'high' ? 'High confidence' : 'Medium confidence'}
          </span>
        </div>

        {/* Side-by-side contacts */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          {[a, b].map((contact) => (
            <div key={contact.id} className="space-y-1">
              <p className="font-medium text-sm">
                {contact.firstName} {contact.lastName}
              </p>
              {contact.email && (
                <p className="text-xs text-muted-foreground truncate">{contact.email}</p>
              )}
              {contact.phone && (
                <p className="text-xs text-muted-foreground">{contact.phone}</p>
              )}
              {contact.dateOfBirth && (
                <p className="text-xs text-muted-foreground">
                  DOB: {new Date(contact.dateOfBirth).toLocaleDateString()}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="default"
            className="flex-1"
            onClick={() => onMerge([a.id, b.id])}
          >
            <GitMerge className="h-3.5 w-3.5 mr-1" />
            Merge
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => onDismiss(a.id, b.id, group.matchType)}
            disabled={isDismissing}
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Not Duplicates
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
