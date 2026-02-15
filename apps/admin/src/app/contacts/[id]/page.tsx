'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Pencil, Save, X } from 'lucide-react'
import { TernDashboardLayout } from '@/components/tern/layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { useContact, useUpdateContact, useContactTrips } from '@/hooks/use-contacts'
import { useTasks } from '@/hooks/use-tasks'
import { TaskList } from '@/app/tasks/_components/task-list'
import { TaskFormDialog } from '@/app/tasks/_components/task-form-dialog'
import { DatePickerEnhanced } from '@/components/ui/date-picker-enhanced'
import { TableSkeleton } from '@/components/tern/shared/loading-skeleton'
import { TernBadge } from '@/components/tern/core'
import { useToast } from '@/hooks/use-toast'
import type { UpdateContactDto, TaskResponseDto } from '@tailfire/shared-types/api'
import { ContactAvatar } from '@/components/contacts/contact-avatar'
import { ContactActivityFeed } from '@/components/contacts/ContactActivityFeed'
import { ContactNavigation, type ContactSection } from './_components/contact-navigation'
import { ComingSoonSection } from './_components/coming-soon-section'
import { RelationshipDialog } from './_components/relationship-dialog'
import { RelationshipsCard } from './_components/relationships-card'
import { RelationshipsSection } from './_components/relationships-section'
import {
  CheckSquare,
  StickyNote,
  Mail,
  MessageCircle,
  Calendar,
  FileText,
  Plane,
  MapPin,
  CreditCard,
  Banknote
} from 'lucide-react'
import type { ContactRelationshipResponseDto } from '@tailfire/shared-types/api'

// Map contact lifecycle to badge variant (same as table)
function getLifecycleBadgeVariant(contactType: string | null, contactStatus: string | null): 'inbound' | 'planning' | 'booked' | 'traveling' | 'completed' | 'secondary' {
  if (contactType === 'lead') return 'inbound'

  switch (contactStatus) {
    case 'prospecting':
      return 'planning'
    case 'quoted':
      return 'planning'
    case 'booked':
      return 'booked'
    case 'traveling':
      return 'traveling'
    case 'returned':
      return 'completed'
    case 'awaiting_next':
      return 'booked'
    case 'inactive':
      return 'secondary'
    default:
      return 'secondary'
  }
}

function getLifecycleLabel(contactType: string | null, contactStatus: string | null): string {
  if (contactType === 'lead') return 'Lead'

  switch (contactStatus) {
    case 'prospecting':
      return 'Prospecting'
    case 'quoted':
      return 'Quoted'
    case 'booked':
      return 'Booked'
    case 'traveling':
      return 'Traveling'
    case 'returned':
      return 'Returned'
    case 'awaiting_next':
      return 'Awaiting Next'
    case 'inactive':
      return 'Inactive'
    default:
      return 'Unknown'
  }
}

type EditSection = 'identity' | 'contact' | 'professional' | 'personal' | 'address' | 'lifecycle' | null

/**
 * Contact Detail Page
 * Master-detail layout with inline editing per section
 */
export default function ContactDetailPage() {
  const params = useParams()
  const router = useRouter()
  const contactId = params?.id as string
  const { toast } = useToast()

  const { data: contact, isLoading, error } = useContact(contactId)
  const { data: contactTrips = [], isLoading: tripsLoading } = useContactTrips(contactId)
  const updateContact = useUpdateContact()

  const [editingSection, setEditingSection] = useState<EditSection>(null)
  const [formData, setFormData] = useState<Partial<UpdateContactDto>>({})
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [activeSection, setActiveSection] = useState<ContactSection>('timeline')

  // Relationship dialog state
  const [relationshipDialogOpen, setRelationshipDialogOpen] = useState(false)
  const [editingRelationship, setEditingRelationship] = useState<ContactRelationshipResponseDto | null>(null)

  // Task state
  const [taskDialogOpen, setTaskDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<TaskResponseDto | null>(null)
  const { data: tasksData, isLoading: tasksLoading, error: tasksError } = useTasks(
    { contactId, sortBy: 'dueDate', sortOrder: 'asc', limit: 50 },
  )
  const contactTasks = tasksData?.data ?? []

  const handleEdit = (section: EditSection) => {
    if (!contact) return
    setEditingSection(section)
    setValidationErrors({})

    // Pre-populate form with current contact data
    setFormData({
      firstName: contact.firstName || '',
      lastName: contact.lastName || '',
      legalFirstName: contact.legalFirstName || '',
      legalLastName: contact.legalLastName || '',
      preferredName: contact.preferredName || '',
      pronouns: contact.pronouns || '',
      email: contact.email || '',
      phone: contact.phone || '',
      contactType: contact.contactType,
      contactStatus: contact.contactStatus,
      dateOfBirth: contact.dateOfBirth || '',
      maritalStatus: contact.maritalStatus || '',
      gender: contact.gender || '',
      addressLine1: contact.addressLine1 || '',
      addressLine2: contact.addressLine2 || '',
      city: contact.city || '',
      province: contact.province || '',
      postalCode: contact.postalCode || '',
      country: contact.country || '',
      marketingEmailOptIn: contact.marketingEmailOptIn,
      marketingSmsOptIn: contact.marketingSmsOptIn,
      marketingPhoneOptIn: contact.marketingPhoneOptIn,
    })
  }

  const handleCancel = () => {
    setEditingSection(null)
    setFormData({})
    setValidationErrors({})
  }

  const validateSection = (section: EditSection): boolean => {
    const errors: Record<string, string> = {}

    if (section === 'identity') {
      // At least one name field required
      if (!formData.firstName && !formData.legalFirstName) {
        errors.firstName = 'First name or legal first name is required'
      }
      if (!formData.lastName && !formData.legalLastName) {
        errors.lastName = 'Last name or legal last name is required'
      }
    }

    if (section === 'contact') {
      // Email format validation
      if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        errors.email = 'Invalid email format'
      }
      // Phone format validation (basic)
      if (formData.phone && formData.phone.length > 0 && formData.phone.length < 10) {
        errors.phone = 'Phone number should be at least 10 digits'
      }
    }

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSave = async () => {
    if (!validateSection(editingSection)) {
      toast({
        title: 'Validation Error',
        description: 'Please fix the errors before saving.',
        variant: 'destructive',
      })
      return
    }

    try {
      // Prepare update data based on section
      let updateData: Partial<UpdateContactDto> = {}

      switch (editingSection) {
        case 'identity':
          updateData = {
            firstName: formData.firstName,
            lastName: formData.lastName,
            legalFirstName: formData.legalFirstName,
            legalLastName: formData.legalLastName,
            preferredName: formData.preferredName,
            pronouns: formData.pronouns,
          }
          break
        case 'contact':
          updateData = {
            email: formData.email,
            phone: formData.phone,
          }
          break
        case 'professional':
          updateData = {
            contactType: formData.contactType,
            contactStatus: formData.contactStatus,
          }
          break
        case 'personal':
          updateData = {
            dateOfBirth: formData.dateOfBirth,
            maritalStatus: formData.maritalStatus,
            gender: formData.gender,
          }
          break
        case 'address':
          updateData = {
            addressLine1: formData.addressLine1,
            addressLine2: formData.addressLine2,
            city: formData.city,
            province: formData.province,
            postalCode: formData.postalCode,
            country: formData.country,
          }
          break
        case 'lifecycle':
          updateData = {
            marketingEmailOptIn: formData.marketingEmailOptIn,
            marketingSmsOptIn: formData.marketingSmsOptIn,
            marketingPhoneOptIn: formData.marketingPhoneOptIn,
          }
          break
      }

      await updateContact.mutateAsync({
        id: contactId,
        data: updateData,
      })

      toast({
        title: 'Contact updated',
        description: 'Changes saved successfully.',
      })

      setEditingSection(null)
      setFormData({})
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save changes. Please try again.',
        variant: 'destructive',
      })
    }
  }

  const handleAddRelationship = () => {
    setEditingRelationship(null)
    setRelationshipDialogOpen(true)
  }

  const handleEditRelationship = (relationship: ContactRelationshipResponseDto) => {
    setEditingRelationship(relationship)
    setRelationshipDialogOpen(true)
  }

  const handleViewAllRelationships = () => {
    setActiveSection('relationships')
  }

  if (isLoading) {
    return (
      <TernDashboardLayout>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/contacts')}
              className="text-tern-gray-600 hover:text-tern-gray-900"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Contacts
            </Button>
          </div>
          <Card className="border-tern-gray-200">
            <CardContent className="p-6">
              <TableSkeleton rows={8} />
            </CardContent>
          </Card>
        </div>
      </TernDashboardLayout>
    )
  }

  if (error || !contact) {
    return (
      <TernDashboardLayout>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/contacts')}
              className="text-tern-gray-600 hover:text-tern-gray-900"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Contacts
            </Button>
          </div>
          <Card className="border-tern-gray-200">
            <CardContent className="p-6">
              <div className="text-center py-12">
                <p className="text-red-600 mb-4">
                  Failed to load contact. Please try again.
                </p>
                <Button variant="outline" onClick={() => window.location.reload()}>
                  Retry
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </TernDashboardLayout>
    )
  }

  return (
    <TernDashboardLayout>
      <div className="space-y-6">
        {/* Back Button */}
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/contacts')}
            className="text-tern-gray-600 hover:text-tern-gray-900"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Contacts
          </Button>
        </div>

        {/* Master-Detail Layout */}
        <div className="flex gap-6">
          {/* Left Column - Fixed width profile sections */}
          <div className="w-96 flex-shrink-0 space-y-4">
            {/* Contact Info Card */}
            <Card className="border-tern-gray-200">
              <CardContent className="pt-6">
                <div className="grid grid-cols-[auto_1fr] gap-4">
                  {/* Left: Avatar */}
                  <div className="flex items-start">
                    <ContactAvatar
                      firstName={contact.firstName}
                      lastName={contact.lastName}
                      // avatarUrl={contact.avatarUrl} // TODO: Add avatarUrl to ContactResponseDto
                      size="lg"
                    />
                  </div>

                  {/* Right: Contact Info */}
                  <div className="space-y-2">
                    {/* Display Name */}
                    <h2 className="text-lg font-semibold text-tern-gray-900">
                      {contact.displayName || `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Unknown Contact'}
                    </h2>

                    {/* Email - only show if exists */}
                    {contact.email && (
                      <p className="text-sm text-tern-gray-600">{contact.email}</p>
                    )}

                    {/* Badges */}
                    <div className="flex items-center gap-2 pt-1 flex-wrap">
                      {/* Contact Type Badge */}
                      <TernBadge
                        variant={contact.contactType === 'lead' ? 'inbound' : 'secondary'}
                      >
                        {contact.contactType === 'lead' ? 'Lead' : 'Client'}
                      </TernBadge>

                      {/* Lifecycle Status Badge (skip for leads — already shown by Contact Type Badge) */}
                      {contact.contactType !== 'lead' && contact.contactStatus && (
                        <TernBadge
                          variant={getLifecycleBadgeVariant(contact.contactType, contact.contactStatus)}
                        >
                          {getLifecycleLabel(contact.contactType, contact.contactStatus)}
                        </TernBadge>
                      )}

                      {/* Marketable Badge */}
                      {(contact.marketingEmailOptIn || contact.marketingSmsOptIn) && (
                        <TernBadge
                          variant="planning"
                        >
                          Marketable
                        </TernBadge>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Identity Section */}
            <Card className="border-tern-gray-200">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold text-tern-gray-900">Identity</CardTitle>
                {editingSection === 'identity' ? (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleCancel}
                      className="h-7 px-2"
                    >
                      <X className="h-3.5 w-3.5 mr-1" />
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSave}
                      disabled={updateContact.isPending}
                      className="h-7 px-2 bg-tern-teal-500 hover:bg-tern-teal-600"
                    >
                      <Save className="h-3.5 w-3.5 mr-1" />
                      Save
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleEdit('identity')}
                    disabled={editingSection !== null}
                    className="h-7 px-2"
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    Edit
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {editingSection === 'identity' ? (
                  <>
                    <div>
                      <Label htmlFor="preferredName" className="text-xs text-tern-gray-600">Preferred Name</Label>
                      <Input
                        id="preferredName"
                        value={formData.preferredName || ''}
                        onChange={(e) => setFormData({ ...formData, preferredName: e.target.value })}
                        className="mt-1 h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label htmlFor="firstName" className="text-xs text-tern-gray-600">First Name</Label>
                      <Input
                        id="firstName"
                        value={formData.firstName || ''}
                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                        className="mt-1 h-8 text-sm"
                      />
                      {validationErrors.firstName && (
                        <p className="text-xs text-red-600 mt-1">{validationErrors.firstName}</p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="lastName" className="text-xs text-tern-gray-600">Last Name</Label>
                      <Input
                        id="lastName"
                        value={formData.lastName || ''}
                        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                        className="mt-1 h-8 text-sm"
                      />
                      {validationErrors.lastName && (
                        <p className="text-xs text-red-600 mt-1">{validationErrors.lastName}</p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="legalFirstName" className="text-xs text-tern-gray-600">Legal First Name</Label>
                      <Input
                        id="legalFirstName"
                        value={formData.legalFirstName || ''}
                        onChange={(e) => setFormData({ ...formData, legalFirstName: e.target.value })}
                        className="mt-1 h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label htmlFor="legalLastName" className="text-xs text-tern-gray-600">Legal Last Name</Label>
                      <Input
                        id="legalLastName"
                        value={formData.legalLastName || ''}
                        onChange={(e) => setFormData({ ...formData, legalLastName: e.target.value })}
                        className="mt-1 h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label htmlFor="pronouns" className="text-xs text-tern-gray-600">Pronouns</Label>
                      <Input
                        id="pronouns"
                        value={formData.pronouns || ''}
                        onChange={(e) => setFormData({ ...formData, pronouns: e.target.value })}
                        className="mt-1 h-8 text-sm"
                        placeholder="e.g. she/her, he/him, they/them"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <p className="text-xs text-tern-gray-600">Display Name</p>
                      <p className="text-sm text-tern-gray-900">{contact.displayName || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-tern-gray-600">Legal Name</p>
                      <p className="text-sm text-tern-gray-900">{contact.legalFullName || '-'}</p>
                    </div>
                    {contact.preferredName && (
                      <div>
                        <p className="text-xs text-tern-gray-600">Preferred Name</p>
                        <p className="text-sm text-tern-gray-900">{contact.preferredName}</p>
                      </div>
                    )}
                    {contact.pronouns && (
                      <div>
                        <p className="text-xs text-tern-gray-600">Pronouns</p>
                        <p className="text-sm text-tern-gray-900">{contact.pronouns}</p>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Contact Section */}
            <Card className="border-tern-gray-200">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold text-tern-gray-900">Contact</CardTitle>
                {editingSection === 'contact' ? (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleCancel}
                      className="h-7 px-2"
                    >
                      <X className="h-3.5 w-3.5 mr-1" />
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSave}
                      disabled={updateContact.isPending}
                      className="h-7 px-2 bg-tern-teal-500 hover:bg-tern-teal-600"
                    >
                      <Save className="h-3.5 w-3.5 mr-1" />
                      Save
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleEdit('contact')}
                    disabled={editingSection !== null}
                    className="h-7 px-2"
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    Edit
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {editingSection === 'contact' ? (
                  <>
                    <div>
                      <Label htmlFor="email" className="text-xs text-tern-gray-600">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email || ''}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="mt-1 h-8 text-sm"
                      />
                      {validationErrors.email && (
                        <p className="text-xs text-red-600 mt-1">{validationErrors.email}</p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="phone" className="text-xs text-tern-gray-600">Phone</Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={formData.phone || ''}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="mt-1 h-8 text-sm"
                      />
                      {validationErrors.phone && (
                        <p className="text-xs text-red-600 mt-1">{validationErrors.phone}</p>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <p className="text-xs text-tern-gray-600">Email</p>
                      <p className="text-sm text-tern-gray-900">{contact.email || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-tern-gray-600">Phone</p>
                      <p className="text-sm text-tern-gray-900">{contact.phone || '-'}</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Professional Section */}
            <Card className="border-tern-gray-200">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold text-tern-gray-900">Professional</CardTitle>
                {editingSection === 'professional' ? (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleCancel}
                      className="h-7 px-2"
                    >
                      <X className="h-3.5 w-3.5 mr-1" />
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSave}
                      disabled={updateContact.isPending}
                      className="h-7 px-2 bg-tern-teal-500 hover:bg-tern-teal-600"
                    >
                      <Save className="h-3.5 w-3.5 mr-1" />
                      Save
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleEdit('professional')}
                    disabled={editingSection !== null}
                    className="h-7 px-2"
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    Edit
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {editingSection === 'professional' ? (
                  <>
                    <div>
                      <Label htmlFor="contactType" className="text-xs text-tern-gray-600">Type</Label>
                      <Select
                        value={formData.contactType || 'lead'}
                        onValueChange={(value) => setFormData({ ...formData, contactType: value as 'lead' | 'client' })}
                      >
                        <SelectTrigger className="mt-1 h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="lead">Lead</SelectItem>
                          <SelectItem value="client">Client</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="contactStatus" className="text-xs text-tern-gray-600">Status</Label>
                      <Select
                        value={formData.contactStatus || 'prospecting'}
                        onValueChange={(value) => setFormData({ ...formData, contactStatus: value as any })}
                      >
                        <SelectTrigger className="mt-1 h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="prospecting">Prospecting</SelectItem>
                          <SelectItem value="quoted">Quoted</SelectItem>
                          <SelectItem value="booked">Booked</SelectItem>
                          <SelectItem value="traveling">Traveling</SelectItem>
                          <SelectItem value="returned">Returned</SelectItem>
                          <SelectItem value="awaiting_next">Awaiting Next</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <p className="text-xs text-tern-gray-600">Type</p>
                      <p className="text-sm text-tern-gray-900 capitalize">{contact.contactType || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-tern-gray-600">Status</p>
                      <p className="text-sm text-tern-gray-900">{getLifecycleLabel(contact.contactType, contact.contactStatus)}</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Personal Section */}
            <Card className="border-tern-gray-200">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold text-tern-gray-900">Personal</CardTitle>
                {editingSection === 'personal' ? (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleCancel}
                      className="h-7 px-2"
                    >
                      <X className="h-3.5 w-3.5 mr-1" />
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSave}
                      disabled={updateContact.isPending}
                      className="h-7 px-2 bg-tern-teal-500 hover:bg-tern-teal-600"
                    >
                      <Save className="h-3.5 w-3.5 mr-1" />
                      Save
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleEdit('personal')}
                    disabled={editingSection !== null}
                    className="h-7 px-2"
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    Edit
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {editingSection === 'personal' ? (
                  <>
                    <div>
                      <Label htmlFor="dateOfBirth" className="text-xs text-tern-gray-600">Date of Birth</Label>
                      <DatePickerEnhanced
                        value={formData.dateOfBirth || null}
                        onChange={(date) => setFormData({ ...formData, dateOfBirth: date || '' })}
                        placeholder="Select date of birth"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="maritalStatus" className="text-xs text-tern-gray-600">Marital Status</Label>
                      <Select
                        value={formData.maritalStatus || ''}
                        onValueChange={(value) => setFormData({ ...formData, maritalStatus: value })}
                      >
                        <SelectTrigger className="mt-1 h-8 text-sm">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="single">Single</SelectItem>
                          <SelectItem value="married">Married</SelectItem>
                          <SelectItem value="domestic_partnership">Domestic Partnership</SelectItem>
                          <SelectItem value="divorced">Divorced</SelectItem>
                          <SelectItem value="widowed">Widowed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="gender" className="text-xs text-tern-gray-600">Gender</Label>
                      <Select
                        value={formData.gender || ''}
                        onValueChange={(value) => setFormData({ ...formData, gender: value })}
                      >
                        <SelectTrigger className="mt-1 h-8 text-sm">
                          <SelectValue placeholder="Select gender" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="male">Male</SelectItem>
                          <SelectItem value="female">Female</SelectItem>
                          <SelectItem value="non-binary">Non-binary</SelectItem>
                          <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                ) : (
                  <>
                    {contact.dateOfBirth && (
                      <div>
                        <p className="text-xs text-tern-gray-600">Date of Birth</p>
                        <p className="text-sm text-tern-gray-900">{contact.dateOfBirth}</p>
                      </div>
                    )}
                    {contact.maritalStatus && (
                      <div>
                        <p className="text-xs text-tern-gray-600">Marital Status</p>
                        <p className="text-sm text-tern-gray-900 capitalize">{contact.maritalStatus.replace('_', ' ')}</p>
                      </div>
                    )}
                    {contact.gender && (
                      <div>
                        <p className="text-xs text-tern-gray-600">Gender</p>
                        <p className="text-sm text-tern-gray-900 capitalize">{contact.gender}</p>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Address Section */}
            <Card className="border-tern-gray-200">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold text-tern-gray-900">Address</CardTitle>
                {editingSection === 'address' ? (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleCancel}
                      className="h-7 px-2"
                    >
                      <X className="h-3.5 w-3.5 mr-1" />
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSave}
                      disabled={updateContact.isPending}
                      className="h-7 px-2 bg-tern-teal-500 hover:bg-tern-teal-600"
                    >
                      <Save className="h-3.5 w-3.5 mr-1" />
                      Save
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleEdit('address')}
                    disabled={editingSection !== null}
                    className="h-7 px-2"
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    Edit
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {editingSection === 'address' ? (
                  <>
                    <div>
                      <Label htmlFor="addressLine1" className="text-xs text-tern-gray-600">Address Line 1</Label>
                      <Input
                        id="addressLine1"
                        value={formData.addressLine1 || ''}
                        onChange={(e) => setFormData({ ...formData, addressLine1: e.target.value })}
                        className="mt-1 h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label htmlFor="addressLine2" className="text-xs text-tern-gray-600">Address Line 2</Label>
                      <Input
                        id="addressLine2"
                        value={formData.addressLine2 || ''}
                        onChange={(e) => setFormData({ ...formData, addressLine2: e.target.value })}
                        className="mt-1 h-8 text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="city" className="text-xs text-tern-gray-600">City</Label>
                        <Input
                          id="city"
                          value={formData.city || ''}
                          onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                          className="mt-1 h-8 text-sm"
                        />
                      </div>
                      <div>
                        <Label htmlFor="province" className="text-xs text-tern-gray-600">Province</Label>
                        <Input
                          id="province"
                          value={formData.province || ''}
                          onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                          className="mt-1 h-8 text-sm"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="postalCode" className="text-xs text-tern-gray-600">Postal Code</Label>
                        <Input
                          id="postalCode"
                          value={formData.postalCode || ''}
                          onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                          className="mt-1 h-8 text-sm"
                        />
                      </div>
                      <div>
                        <Label htmlFor="country" className="text-xs text-tern-gray-600">Country</Label>
                        <Input
                          id="country"
                          value={formData.country || ''}
                          onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                          className="mt-1 h-8 text-sm"
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    {contact.addressLine1 && (
                      <div>
                        <p className="text-xs text-tern-gray-600">Street</p>
                        <p className="text-sm text-tern-gray-900">{contact.addressLine1}</p>
                        {contact.addressLine2 && <p className="text-sm text-tern-gray-900">{contact.addressLine2}</p>}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      {contact.city && (
                        <div>
                          <p className="text-xs text-tern-gray-600">City</p>
                          <p className="text-sm text-tern-gray-900">{contact.city}</p>
                        </div>
                      )}
                      {contact.province && (
                        <div>
                          <p className="text-xs text-tern-gray-600">Province</p>
                          <p className="text-sm text-tern-gray-900">{contact.province}</p>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {contact.postalCode && (
                        <div>
                          <p className="text-xs text-tern-gray-600">Postal Code</p>
                          <p className="text-sm text-tern-gray-900">{contact.postalCode}</p>
                        </div>
                      )}
                      {contact.country && (
                        <div>
                          <p className="text-xs text-tern-gray-600">Country</p>
                          <p className="text-sm text-tern-gray-900">{contact.country}</p>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Lifecycle & Status Section */}
            <Card className="border-tern-gray-200">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold text-tern-gray-900">Lifecycle & Status</CardTitle>
                {editingSection === 'lifecycle' ? (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleCancel}
                      className="h-7 px-2"
                    >
                      <X className="h-3.5 w-3.5 mr-1" />
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSave}
                      disabled={updateContact.isPending}
                      className="h-7 px-2 bg-tern-teal-500 hover:bg-tern-teal-600"
                    >
                      <Save className="h-3.5 w-3.5 mr-1" />
                      Save
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleEdit('lifecycle')}
                    disabled={editingSection !== null}
                    className="h-7 px-2"
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    Edit
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-xs text-tern-gray-600">Lifecycle Stage</p>
                  <TernBadge variant={getLifecycleBadgeVariant(contact.contactType, contact.contactStatus)}>
                    {getLifecycleLabel(contact.contactType, contact.contactStatus)}
                  </TernBadge>
                </div>
                {contact.becameClientAt && (
                  <div>
                    <p className="text-xs text-tern-gray-600">Became Client</p>
                    <p className="text-sm text-tern-gray-900">{new Date(contact.becameClientAt).toLocaleDateString()}</p>
                  </div>
                )}
                {editingSection === 'lifecycle' ? (
                  <div className="space-y-2">
                    <p className="text-xs text-tern-gray-600">Marketing Consent</p>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="marketingEmailOptIn"
                        checked={formData.marketingEmailOptIn || false}
                        onCheckedChange={(checked) => setFormData({ ...formData, marketingEmailOptIn: checked as boolean })}
                      />
                      <Label htmlFor="marketingEmailOptIn" className="text-sm text-tern-gray-900 font-normal">
                        Email
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="marketingSmsOptIn"
                        checked={formData.marketingSmsOptIn || false}
                        onCheckedChange={(checked) => setFormData({ ...formData, marketingSmsOptIn: checked as boolean })}
                      />
                      <Label htmlFor="marketingSmsOptIn" className="text-sm text-tern-gray-900 font-normal">
                        SMS
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="marketingPhoneOptIn"
                        checked={formData.marketingPhoneOptIn || false}
                        onCheckedChange={(checked) => setFormData({ ...formData, marketingPhoneOptIn: checked as boolean })}
                      />
                      <Label htmlFor="marketingPhoneOptIn" className="text-sm text-tern-gray-900 font-normal">
                        Phone
                      </Label>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-tern-gray-600">Marketing Consent</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {contact.marketingEmailOptIn && <TernBadge variant="teal">Email</TernBadge>}
                      {contact.marketingSmsOptIn && <TernBadge variant="teal">SMS</TernBadge>}
                      {contact.marketingPhoneOptIn && <TernBadge variant="teal">Phone</TernBadge>}
                      {!contact.marketingEmailOptIn && !contact.marketingSmsOptIn && !contact.marketingPhoneOptIn && (
                        <span className="text-sm text-tern-gray-500">None</span>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Relationships & Groups Card */}
            <RelationshipsCard
              contactId={contactId}
              onAddRelationship={handleAddRelationship}
              onEditRelationship={handleEditRelationship}
              onViewAll={handleViewAllRelationships}
            />
          </div>

          {/* Right Column - Dynamic tabbed content */}
          <div className="flex-1 min-w-0 flex flex-col gap-4">
            {/* Navigation Header */}
            <div className="bg-white border border-tern-gray-200 rounded-lg">
              <ContactNavigation
                activeSection={activeSection}
                onSectionChange={setActiveSection}
              />
            </div>

            {/* Dynamic Content Area */}
            <div className="bg-white border border-tern-gray-200 rounded-lg">
              {activeSection === 'timeline' && (
                <Card>
                  <CardHeader>
                    <h2 className="text-lg font-semibold text-tern-gray-900">Activity Timeline</h2>
                  </CardHeader>
                  <CardContent>
                    <ContactActivityFeed contactId={contactId} limit={20} showLoadMore={true} />
                  </CardContent>
                </Card>
              )}
              {activeSection === 'tasks' && (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <CheckSquare className="h-5 w-5" />
                      Tasks
                    </CardTitle>
                    <Button
                      size="sm"
                      onClick={() => {
                        setEditingTask(null)
                        setTaskDialogOpen(true)
                      }}
                    >
                      Add Task
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {tasksError ? (
                      <div className="text-center py-8">
                        <p className="text-sm text-red-600 mb-2">Failed to load tasks.</p>
                        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                          Retry
                        </Button>
                      </div>
                    ) : (
                      <TaskList
                        tasks={contactTasks}
                        isLoading={tasksLoading}
                        onCreateTask={() => {
                          setEditingTask(null)
                          setTaskDialogOpen(true)
                        }}
                        onTaskClick={(task) => {
                          setEditingTask(task)
                          setTaskDialogOpen(true)
                        }}
                      />
                    )}
                  </CardContent>
                </Card>
              )}
              {activeSection === 'relationships' && (
                <div className="p-6">
                  <RelationshipsSection
                    contactId={contactId}
                    onAddRelationship={handleAddRelationship}
                    onEditRelationship={handleEditRelationship}
                  />
                </div>
              )}
              {activeSection === 'notes' && (
                <ComingSoonSection
                  title="Notes"
                  description="Internal notes and comments for this contact."
                  icon={StickyNote}
                />
              )}
              {activeSection === 'emails' && (
                <ComingSoonSection
                  title="Emails"
                  description="Email communication history with this contact."
                  icon={Mail}
                />
              )}
              {activeSection === 'sms' && (
                <ComingSoonSection
                  title="SMS"
                  description="Text message history with this contact."
                  icon={MessageCircle}
                />
              )}
              {activeSection === 'calendar' && (
                <ComingSoonSection
                  title="Calendar"
                  description="Scheduled meetings and events with this contact."
                  icon={Calendar}
                />
              )}
              {activeSection === 'files' && (
                <ComingSoonSection
                  title="Files"
                  description="Documents and attachments for this contact."
                  icon={FileText}
                />
              )}
              {activeSection === 'trips' && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Plane className="h-5 w-5" />
                      Trips
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {tripsLoading ? (
                      <TableSkeleton />
                    ) : contactTrips.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">No trips associated with this contact.</p>
                    ) : (
                      <div className="space-y-3">
                        {contactTrips.map((trip) => (
                          <Link
                            key={trip.id}
                            href={`/trips/${trip.id}`}
                            className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                          >
                            <div className="min-w-0">
                              <p className="font-medium truncate">{trip.name}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <TernBadge variant={trip.status === 'booked' ? 'booked' : trip.status === 'completed' ? 'completed' : 'secondary'}>
                                  {trip.status}
                                </TernBadge>
                                {trip.tripType && (
                                  <span className="text-xs text-muted-foreground">{trip.tripType}</span>
                                )}
                                {trip.isPrimaryContact && (
                                  <TernBadge variant="inbound">Primary</TernBadge>
                                )}
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground text-right shrink-0 ml-4">
                              {trip.startDate && <p>{trip.startDate}</p>}
                              {trip.endDate && <p>to {trip.endDate}</p>}
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
              {activeSection === 'bookings' && (
                <ComingSoonSection
                  title="Bookings"
                  description="Booking history and details for this contact."
                  icon={MapPin}
                />
              )}
              {activeSection === 'payments' && (
                <ComingSoonSection
                  title="Payments"
                  description="Payment history and invoices for this contact."
                  icon={CreditCard}
                />
              )}
              {activeSection === 'trust' && (
                <ComingSoonSection
                  title="Trust Account"
                  description="Trust account balance and transactions for this contact."
                  icon={Banknote}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Relationship Dialog */}
      <RelationshipDialog
        open={relationshipDialogOpen}
        onOpenChange={setRelationshipDialogOpen}
        contactId={contactId}
        relationship={editingRelationship}
      />

      {/* Task Dialog */}
      <TaskFormDialog
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
        task={editingTask}
        contactId={contactId}
      />
    </TernDashboardLayout>
  )
}
