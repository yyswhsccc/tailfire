'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { Loader2, Search, ExternalLink, Plus, UserPlus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useContacts, useCreateContact } from '@/hooks/use-contacts'
import { useCreateRelationship, useUpdateRelationship } from '@/hooks/use-relationships'
import { useToast } from '@/hooks/use-toast'
import { RELATIONSHIP_CATEGORIES } from '@/lib/relationship-constants'
import type {
  ContactRelationshipResponseDto,
  CreateContactRelationshipDto,
  UpdateContactRelationshipDto,
} from '@tailfire/shared-types/api'

interface RelationshipDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contactId: string
  relationship?: ContactRelationshipResponseDto | null
}

function getInitials(firstName?: string | null, lastName?: string | null): string {
  const first = firstName?.[0] || ''
  const last = lastName?.[0] || ''
  return (first + last).toUpperCase() || '?'
}

export function RelationshipDialog({
  open,
  onOpenChange,
  contactId,
  relationship,
}: RelationshipDialogProps) {
  const isEditing = !!relationship
  const router = useRouter()
  const { toast } = useToast()
  const createRelationship = useCreateRelationship()
  const updateRelationship = useUpdateRelationship()

  const [selectedContactId, setSelectedContactId] = useState<string>('')
  const [selectedContactDisplay, setSelectedContactDisplay] = useState<{ name: string; initials: string } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [contactSearchOpen, setContactSearchOpen] = useState(false)
  const [showCreateContact, setShowCreateContact] = useState(false)
  const [newFirstName, setNewFirstName] = useState('')
  const [newLastName, setNewLastName] = useState('')
  const [newEmail, setNewEmail] = useState('')

  const { data: contactsData } = useContacts({
    search: searchQuery,
    limit: 50,
    isActive: true,
  })
  const createContact = useCreateContact()

  const handleCreateAndSelect = useCallback(async () => {
    if (!newFirstName.trim()) return
    try {
      const newContact = await createContact.mutateAsync({
        firstName: newFirstName.trim(),
        lastName: newLastName.trim() || undefined,
        email: newEmail.trim() || undefined,
      } as Parameters<typeof createContact.mutateAsync>[0])
      const displayName = newContact.displayName || `${newFirstName.trim()} ${newLastName.trim()}`.trim()
      setSelectedContactId(newContact.id)
      setSelectedContactDisplay({
        name: displayName,
        initials: getInitials(newFirstName.trim(), newLastName.trim()),
      })
      setShowCreateContact(false)
      setNewFirstName('')
      setNewLastName('')
      setNewEmail('')
      toast({
        title: 'Contact created',
        description: `${newContact.displayName || newFirstName} has been created and selected.`,
      })
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to create contact. Please try again.',
        variant: 'destructive',
      })
    }
  }, [newFirstName, newLastName, newEmail, createContact, toast])

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
  } = useForm<CreateContactRelationshipDto | UpdateContactRelationshipDto>({
    defaultValues: {
      labelForContact1: relationship?.labelForContact1 || '',
      labelForContact2: relationship?.labelForContact2 || '',
      category: relationship?.category as 'family' | 'business' | 'travel_companions' | 'group' | 'other' | 'custom' || 'family',
      customLabel: relationship?.customLabel || '',
      notes: relationship?.notes || '',
    },
  })

  const category = watch('category')

  useEffect(() => {
    if (relationship) {
      setSelectedContactId(relationship.contactId2)
    }
  }, [relationship])

  useEffect(() => {
    if (open) {
      reset({
        labelForContact1: relationship?.labelForContact1 || '',
        labelForContact2: relationship?.labelForContact2 || '',
        category: relationship?.category as 'family' | 'business' | 'travel_companions' | 'group' | 'other' | 'custom' || 'family',
        customLabel: relationship?.customLabel || '',
        notes: relationship?.notes || '',
      })
      if (relationship) {
        setSelectedContactId(relationship.contactId2)
      } else {
        setSelectedContactId('')
        setSelectedContactDisplay(null)
      }
      setShowCreateContact(false)
      setNewFirstName('')
      setNewLastName('')
      setNewEmail('')
    }
  }, [open, relationship, reset])

  const onSubmit = async (data: CreateContactRelationshipDto | UpdateContactRelationshipDto) => {
    try {
      if (isEditing && relationship) {
        // Update existing relationship
        await updateRelationship.mutateAsync({
          contactId,
          relationshipId: relationship.id,
          data: data as UpdateContactRelationshipDto,
        })

        toast({
          title: 'Relationship updated',
          description: 'The relationship has been successfully updated.',
        })
      } else {
        // Create new relationship
        if (!selectedContactId) {
          toast({
            title: 'Error',
            description: 'Please select a contact to create a relationship with.',
            variant: 'destructive',
          })
          return
        }

        await createRelationship.mutateAsync({
          contactId,
          data: {
            ...(data as CreateContactRelationshipDto),
            contactId2: selectedContactId,
          },
        })

        toast({
          title: 'Relationship created',
          description: 'The relationship has been successfully created.',
        })
      }

      onOpenChange(false)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Please try again.'
      toast({
        title: 'Error',
        description: `Failed to ${isEditing ? 'update' : 'create'} relationship. ${errorMessage}`,
        variant: 'destructive',
      })
    }
  }

  const selectedContact = contactsData?.data.find((c) => c.id === selectedContactId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit' : 'Add'} Relationship</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the details of this relationship.'
              : 'Create a new relationship between this contact and another contact.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Contact Selection (only for new relationships) */}
          {!isEditing && (
            <div className="space-y-2">
              <Label htmlFor="contact">Related Contact *</Label>
              <Popover open={contactSearchOpen} onOpenChange={setContactSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between"
                  >
                    {selectedContact ? (
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-xs bg-phoenix-gold-100 text-phoenix-gold-700">
                            {getInitials(selectedContact.firstName, selectedContact.lastName)}
                          </AvatarFallback>
                        </Avatar>
                        <span>{selectedContact.displayName}</span>
                      </div>
                    ) : selectedContactDisplay ? (
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-xs bg-phoenix-gold-100 text-phoenix-gold-700">
                            {selectedContactDisplay.initials}
                          </AvatarFallback>
                        </Avatar>
                        <span>{selectedContactDisplay.name}</span>
                      </div>
                    ) : (
                      <span className="text-ash-500">Select a contact...</span>
                    )}
                    <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0">
                  <Command>
                    <CommandInput
                      placeholder="Search contacts..."
                      value={searchQuery}
                      onValueChange={setSearchQuery}
                    />
                    <CommandEmpty>No contacts found.</CommandEmpty>
                    <CommandGroup className="max-h-64 overflow-auto">
                      {contactsData?.data
                        .filter((c) => c.id !== contactId) // Exclude current contact
                        .map((contact) => (
                          <CommandItem
                            key={contact.id}
                            value={`${contact.firstName} ${contact.lastName} ${contact.email || ''} ${contact.id}`}
                            onSelect={() => {
                              setSelectedContactId(contact.id)
                              setSelectedContactDisplay(null) // Clear — will use contactsData lookup
                              setContactSearchOpen(false)
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <Avatar className="h-6 w-6">
                                <AvatarFallback className="text-xs bg-phoenix-gold-100 text-phoenix-gold-700">
                                  {getInitials(contact.firstName, contact.lastName)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex flex-col">
                                <span className="text-sm font-medium">{contact.displayName}</span>
                                {contact.email && (
                                  <span className="text-xs text-ash-500">{contact.email}</span>
                                )}
                              </div>
                            </div>
                          </CommandItem>
                        ))}
                    </CommandGroup>
                  </Command>
                </PopoverContent>
              </Popover>

              {/* Create New Contact Option */}
              {!showCreateContact ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCreateContact(true)}
                  className="mt-2 gap-1 text-phoenix-gold-600 hover:text-phoenix-gold-700"
                >
                  <UserPlus className="h-4 w-4" />
                  Create new contact
                </Button>
              ) : (
                <div className="mt-2 space-y-2 rounded-lg border border-dashed border-phoenix-gold-300 bg-phoenix-gold-50/50 p-3">
                  <p className="text-xs font-medium text-ash-700">New Contact</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="First name *"
                      value={newFirstName}
                      onChange={(e) => setNewFirstName(e.target.value)}
                      autoFocus
                    />
                    <Input
                      placeholder="Last name"
                      value={newLastName}
                      onChange={(e) => setNewLastName(e.target.value)}
                    />
                  </div>
                  <Input
                    placeholder="Email (optional)"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleCreateAndSelect}
                      disabled={!newFirstName.trim() || createContact.isPending}
                      className="bg-phoenix-gold-600 hover:bg-phoenix-gold-700"
                    >
                      {createContact.isPending ? (
                        <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Creating...</>
                      ) : (
                        <><Plus className="mr-1 h-3 w-3" /> Create & Select</>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowCreateContact(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="category">Category *</Label>
            <Select
              value={category}
              onValueChange={(value) => setValue('category', value as typeof category)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {RELATIONSHIP_CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Custom Label (only shown if category is 'custom') */}
          {category === 'custom' && (
            <div className="space-y-2">
              <Label htmlFor="customLabel">Custom Label</Label>
              <Input
                id="customLabel"
                {...register('customLabel')}
                placeholder="e.g., Colleague, Mentor"
              />
            </div>
          )}

          {/* Label for Contact 1 (current contact) */}
          <div className="space-y-2">
            <Label htmlFor="labelForContact1">
              Label for This Contact (optional)
            </Label>
            <Input
              id="labelForContact1"
              {...register('labelForContact1')}
              placeholder="e.g., Spouse, Parent, Business Partner"
            />
            <p className="text-xs text-ash-500">
              How this contact relates to the selected contact
            </p>
          </div>

          {/* Label for Contact 2 (related contact) */}
          <div className="space-y-2">
            <Label htmlFor="labelForContact2">
              Label for Related Contact (optional)
            </Label>
            <Input
              id="labelForContact2"
              {...register('labelForContact2')}
              placeholder="e.g., Spouse, Child, Business Partner"
            />
            <p className="text-xs text-ash-500">
              How the selected contact relates to this contact
            </p>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              {...register('notes')}
              placeholder="Add any additional notes about this relationship..."
              rows={3}
            />
          </div>

          <DialogFooter>
            {isEditing && relationship?.contactId2 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push(`/contacts/${relationship.contactId2}`)}
                aria-label={`View ${relationship.relatedContact?.displayName || 'contact'}`}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                View Contact
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createRelationship.isPending || updateRelationship.isPending}
            >
              {createRelationship.isPending || updateRelationship.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isEditing ? 'Updating...' : 'Creating...'}
                </>
              ) : (
                <>{isEditing ? 'Update' : 'Create'} Relationship</>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
