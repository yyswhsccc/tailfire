'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import type { CreateContactDto } from '@tailfire/shared-types/api'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useCreateContact } from '@/hooks/use-contacts'
import { useToast } from '@/hooks/use-toast'

const quickContactSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  email: z.string().email('Invalid email address').or(z.literal('')).default(''),
  phone: z.string().default(''),
})

type QuickContactFormValues = z.infer<typeof quickContactSchema>

interface QuickContactDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultValues?: Partial<QuickContactFormValues>
  onSuccess?: (contactId: string) => void
}

export function QuickContactDialog({
  open,
  onOpenChange,
  defaultValues: prefill,
  onSuccess,
}: QuickContactDialogProps) {
  const router = useRouter()
  const form = useForm<QuickContactFormValues>({
    resolver: zodResolver(quickContactSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
    },
  })

  const createContact = useCreateContact()
  const { toast } = useToast()

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      form.reset({
        firstName: '', lastName: '', email: '', phone: '',
        ...prefill,
      })
    }
  }, [open, form, prefill])

  const onSubmit = async (data: QuickContactFormValues) => {
    try {
      // Remove empty strings to match API expectations
      const cleanData = Object.fromEntries(
        Object.entries(data).filter(([_, v]) => v !== '')
      ) as Partial<QuickContactFormValues>

      const newContact = await createContact.mutateAsync(cleanData as unknown as CreateContactDto)

      toast({
        title: 'Contact created',
        description: 'The contact has been successfully created.',
      })

      onOpenChange(false)
      form.reset()

      if (onSuccess && newContact?.id) {
        onSuccess(newContact.id)
      } else if (newContact?.id) {
        router.push(`/contacts/${newContact.id}`)
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create contact. Please try again.',
        variant: 'destructive',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New contact</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {/* Name Row */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal text-gray-700">First name</FormLabel>
                    <FormControl>
                      <Input className="h-10 border-gray-300" placeholder="First name" {...field} />
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
                    <FormLabel className="text-sm font-normal text-gray-700">Last name</FormLabel>
                    <FormControl>
                      <Input className="h-10 border-gray-300" placeholder="Last name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Contact Info Row */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal text-gray-700">Email (optional)</FormLabel>
                    <FormControl>
                      <Input type="email" className="h-10 border-gray-300" placeholder="email@example.com" {...field} />
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
                    <FormLabel className="text-sm font-normal text-gray-700">Phone number (optional)</FormLabel>
                    <FormControl>
                      <Input className="h-10 border-gray-300" placeholder="(555) 123-4567" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createContact.isPending}
                className="bg-phoenix-gold-500 hover:bg-phoenix-gold-600 text-white"
              >
                {createContact.isPending ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
