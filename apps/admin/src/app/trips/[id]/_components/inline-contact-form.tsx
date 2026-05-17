'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCreateTripTraveler } from '@/hooks/use-trip-travelers'
import { useToast } from '@/hooks/use-toast'
import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ApiError } from '@/lib/api'

interface ExistingContactSuggestion {
  id: string
  firstName: string | null
  lastName: string | null
  email: string | null
}

const inlineContactSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().max(50).optional().or(z.literal('')),
  role: z.enum(['primary_contact', 'full_access', 'limited_access']),
  travelerType: z.enum(['adult', 'child', 'infant']),
})

type InlineContactFormValues = z.infer<typeof inlineContactSchema>

interface InlineContactFormProps {
  tripId: string
  onSuccess: () => void
  onCancel: () => void
  addToAllActivities?: boolean
}

export function InlineContactForm({
  tripId,
  onSuccess,
  onCancel,
  addToAllActivities,
}: InlineContactFormProps) {
  const createTraveler = useCreateTripTraveler(tripId)
  const { toast } = useToast()

  // #448 phase 1B: dedup prompt state. The server returns 409 with code
  // TRAVELER_CONTACT_EMAIL_EXISTS when the email maps to an accessible
  // existing contact; we open this dialog so the agent can choose to
  // link to the existing record or proceed with a brand-new contact.
  const [dedupPrompt, setDedupPrompt] = useState<{
    open: boolean
    existing: ExistingContactSuggestion | null
    pendingValues: InlineContactFormValues | null
  }>({ open: false, existing: null, pendingValues: null })

  const form = useForm<InlineContactFormValues>({
    resolver: zodResolver(inlineContactSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      role: 'limited_access',
      travelerType: 'adult',
    },
  })

  const submitTraveler = async (
    data: InlineContactFormValues,
    extra?: { useExistingContactId?: string; overrideDedup?: boolean },
  ) => {
    await createTraveler.mutateAsync({
      contactSnapshot: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email || undefined,
        phone: data.phone || undefined,
      },
      role: data.role,
      travelerType: data.travelerType,
      addToAllActivities,
      ...(extra ?? {}),
    } as any)
    toast({
      title: 'Traveler added',
      description: `${data.firstName} ${data.lastName} has been added to the trip`,
    })
    form.reset()
    onSuccess()
  }

  const onSubmit = async (data: InlineContactFormValues) => {
    try {
      await submitTraveler(data)
    } catch (error) {
      if (error instanceof ApiError && error.code === 'TRAVELER_CONTACT_EMAIL_EXISTS') {
        const existing = error.details?.existingContact as ExistingContactSuggestion | undefined
        if (existing) {
          setDedupPrompt({ open: true, existing, pendingValues: data })
          return
        }
      }
      const message = error instanceof Error ? error.message : 'Failed to add traveler'
      toast({ title: 'Error', description: message, variant: 'destructive' })
    }
  }

  const closeDedupPrompt = () =>
    setDedupPrompt({ open: false, existing: null, pendingValues: null })

  const handleUseExisting = async () => {
    const { existing, pendingValues } = dedupPrompt
    closeDedupPrompt()
    if (!existing || !pendingValues) return
    try {
      await submitTraveler(pendingValues, { useExistingContactId: existing.id })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to link existing contact'
      toast({ title: 'Error', description: message, variant: 'destructive' })
    }
  }

  const handleCreateAnyway = async () => {
    const { pendingValues } = dedupPrompt
    closeDedupPrompt()
    if (!pendingValues) return
    try {
      await submitTraveler(pendingValues, { overrideDedup: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add traveler'
      toast({ title: 'Error', description: message, variant: 'destructive' })
    }
  }

  return (
    <div className="border border-gray-200 rounded-md p-4 bg-gray-50">
      <h4 className="text-sm font-semibold text-gray-900 mb-4">
        Create New Traveler
      </h4>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {/* Name Fields */}
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="firstName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>First Name *</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="lastName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Last Name *</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Contact Fields */}
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Role and Traveler Type */}
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="primary_contact">Primary Contact</SelectItem>
                      <SelectItem value="full_access">Full Access</SelectItem>
                      <SelectItem value="limited_access">Limited Access</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription className="text-xs">
                    Determines portal access level
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="travelerType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Traveler Type *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="adult">Adult</SelectItem>
                      <SelectItem value="child">Child</SelectItem>
                      <SelectItem value="infant">Infant</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Form Actions */}
          <div className="flex items-center gap-2 pt-2">
            <Button
              type="submit"
              disabled={createTraveler.isPending}
              size="sm"
            >
              {createTraveler.isPending ? 'Adding...' : 'Add Traveler'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={createTraveler.isPending}
              size="sm"
            >
              Cancel
            </Button>
          </div>
        </form>
      </Form>

      <AlertDialog
        open={dedupPrompt.open}
        onOpenChange={(open) => { if (!open) closeDedupPrompt() }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Existing contact found</AlertDialogTitle>
            <AlertDialogDescription>
              A contact with email <strong>{dedupPrompt.existing?.email}</strong> already exists
              in your agency:{' '}
              <strong>
                {dedupPrompt.existing?.firstName} {dedupPrompt.existing?.lastName}
              </strong>
              .
              <br /><br />
              Use the existing contact to keep your CRM clean, or create a new one if this is
              a different person who happens to share an email.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
            <AlertDialogCancel onClick={closeDedupPrompt}>Cancel</AlertDialogCancel>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleCreateAnyway} disabled={createTraveler.isPending}>
                Create new anyway
              </Button>
              <AlertDialogAction onClick={(e) => { e.preventDefault(); void handleUseExisting() }}>
                Use existing contact
              </AlertDialogAction>
            </div>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
