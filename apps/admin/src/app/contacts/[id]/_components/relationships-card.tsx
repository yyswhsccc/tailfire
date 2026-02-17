'use client'

import { useRouter } from 'next/navigation'
import { Plus, Users, ArrowRight, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useRelationships } from '@/hooks/use-relationships'
import { getRelationshipCategoryColor, getRelationshipCategoryLabel } from '@/lib/relationship-constants'
import type { ContactRelationshipResponseDto } from '@tailfire/shared-types/api'

interface RelationshipsCardProps {
  contactId: string
  onAddRelationship: () => void
  onEditRelationship: (relationship: ContactRelationshipResponseDto) => void
  onViewAll?: () => void
}

function getInitials(name: string | undefined): string {
  if (!name) return '?'
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function RelationshipsCard({
  contactId,
  onAddRelationship,
  onEditRelationship,
  onViewAll,
}: RelationshipsCardProps) {
  const router = useRouter()
  const { data: relationships, isLoading } = useRelationships(contactId)

  const displayRelationships = relationships?.slice(0, 3) || []
  const hasMore = (relationships?.length || 0) > 3

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-semibold text-ash-900 flex items-center gap-2">
          <Users className="h-4 w-4" />
          Relationships & Groups
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={onAddRelationship}
          className="h-7 w-7 p-0"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-phoenix-gold-600"></div>
          </div>
        ) : !relationships || relationships.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 px-2">
            <div className="rounded-full bg-ash-100 p-3 mb-2">
              <Users className="h-5 w-5 text-ash-400" />
            </div>
            <p className="text-xs text-ash-600 text-center mb-3">
              No relationships yet
            </p>
            <Button
              onClick={onAddRelationship}
              size="sm"
              variant="outline"
              className="text-xs h-8"
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Relationship
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {displayRelationships.map((relationship) => {
                const relatedContact = relationship.relatedContact
                const displayName = relatedContact?.displayName || 'Unknown Contact'
                const label = relationship.labelForContact1 || relationship.labelForContact2 || 'Related to'
                const relatedContactId = relatedContact?.id

                return (
                  <div
                    key={relationship.id}
                    onClick={() => {
                      if (relatedContactId) {
                        router.push(`/contacts/${relatedContactId}`)
                      }
                    }}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-ash-50 cursor-pointer transition-colors"
                    aria-label={`Go to ${displayName}`}
                  >
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      <AvatarFallback className="bg-phoenix-gold-100 text-phoenix-gold-700 text-xs font-semibold">
                        {getInitials(displayName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <p className="text-sm font-medium text-ash-900 truncate">
                          {displayName}
                        </p>
                        <Badge
                          variant="outline"
                          className={`${getRelationshipCategoryColor(relationship.category)} text-[10px] px-1.5 py-0 h-4`}
                        >
                          {getRelationshipCategoryLabel(relationship.category)}
                        </Badge>
                      </div>
                      <p className="text-xs text-ash-600 truncate">{label}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        onEditRelationship(relationship)
                      }}
                      className="h-7 w-7 p-0 hover:bg-ash-100"
                      aria-label={`Edit relationship with ${displayName}`}
                    >
                      <Pencil className="h-3.5 w-3.5 text-ash-600" />
                    </Button>
                    <ArrowRight className="h-4 w-4 text-ash-400 flex-shrink-0" />
                  </div>
                )
              })}
            </div>

            {hasMore && (
              <div className="pt-1 border-t border-ash-200">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onViewAll}
                  className="w-full justify-center text-xs h-8 text-ash-600 hover:text-phoenix-gold-600"
                >
                  View all {relationships.length} relationships
                  <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
