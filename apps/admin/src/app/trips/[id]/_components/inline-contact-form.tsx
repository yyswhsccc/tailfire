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

  const onSubmit = async (data: InlineContactFormValues) => {
    try {
      // Create traveler with contact snapshot
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
      })

      toast({
        title: 'Traveler added',
        description: `${data.firstName} ${data.lastName} has been added to the trip`,
      })

      form.reset()
      onSuccess()
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add traveler',
        variant: 'destructive',
      })
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
    </div>
  )
}
