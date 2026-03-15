'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { TripGroupDto } from '@tailfire/shared-types/api'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { useCreateTripGroup, useUpdateTripGroup } from '@/hooks/use-trips'
import { useToast } from '@/hooks/use-toast'
import { SupplierCombobox } from '@/components/suppliers/supplier-combobox'

const groupFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.enum(['folder', 'group_booking']).default('folder'),
  groupNumber: z.string().optional(),
  destination: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.string().optional(),
  primarySupplierId: z.string().nullable().optional(),
  description: z.string().optional(),
})

type GroupFormValues = z.infer<typeof groupFormSchema>

function toGroupDefaults(group?: TripGroupDto): GroupFormValues {
  if (!group) {
    return {
      name: '',
      type: 'folder',
      groupNumber: '',
      destination: '',
      startDate: '',
      endDate: '',
      status: '',
      primarySupplierId: null,
      description: '',
    }
  }
  return {
    name: group.name,
    type: group.type,
    groupNumber: group.groupNumber ?? '',
    destination: group.destination ?? '',
    startDate: group.startDate ? group.startDate.split('T')[0] : '',
    endDate: group.endDate ? group.endDate.split('T')[0] : '',
    status: group.status ?? '',
    primarySupplierId: group.primarySupplierId ?? null,
    description: group.description ?? '',
  }
}

interface GroupFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  group?: TripGroupDto
  /** Called with the new group ID after creation. When provided, skips navigation. */
  onCreated?: (groupId: string) => void
}

export function GroupFormDialog({
  open,
  onOpenChange,
  mode,
  group,
  onCreated,
}: GroupFormDialogProps) {
  const router = useRouter()
  const [rootError, setRootError] = useState<string | null>(null)
  const [supplierName, setSupplierName] = useState<string | null>(null)

  const form = useForm<GroupFormValues>({
    resolver: zodResolver(groupFormSchema),
    defaultValues: toGroupDefaults(),
  })

  const createGroup = useCreateTripGroup()
  const updateGroup = useUpdateTripGroup()
  const { toast } = useToast()

  const groupType = form.watch('type')

  // Reset form when group changes or dialog opens
  useEffect(() => {
    if (open) {
      setRootError(null)
      setSupplierName(null)
      if (group && mode === 'edit') {
        form.reset(toGroupDefaults(group))
      } else if (mode === 'create') {
        form.reset(toGroupDefaults())
      }
    }
  }, [group, mode, form, open])

  const onSubmit = async (data: GroupFormValues) => {
    setRootError(null)

    // Build payload — only include group_booking fields when type is group_booking
    const payload: Record<string, unknown> = {
      name: data.name,
      type: data.type,
      description: data.description || undefined,
    }

    if (data.type === 'group_booking') {
      payload.groupNumber = data.groupNumber || undefined
      payload.destination = data.destination || undefined
      payload.startDate = data.startDate || null
      payload.endDate = data.endDate || null
      payload.status = data.status || undefined
      payload.primarySupplierId = data.primarySupplierId || null
    }

    try {
      if (mode === 'create') {
        const newGroup = await createGroup.mutateAsync(payload as Parameters<typeof createGroup.mutateAsync>[0])

        toast({
          title: 'Group created',
          description: onCreated ? 'Group selected.' : 'Redirecting to your new group...',
        })
        onOpenChange(false)
        form.reset(toGroupDefaults())
        if (onCreated) {
          onCreated(newGroup.id)
        } else {
          router.push(`/trips/groups/${newGroup.id}`)
        }
      } else if (group) {
        await updateGroup.mutateAsync({
          groupId: group.id,
          data: payload,
        })

        toast({
          title: 'Group updated',
          description: 'The group has been successfully updated.',
        })
        onOpenChange(false)
        form.reset(toGroupDefaults())
      }
    } catch (error: any) {
      const message =
        error?.response?.status === 409
          ? 'A group with this name already exists.'
          : `Failed to ${mode} group. Please try again.`
      setRootError(message)
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Create Group' : 'Edit Group'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {mode === 'create'
              ? 'Fill out the form below to create a new group.'
              : 'Update the group details below.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Row 1: Name & Type */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter group name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="folder">Folder</SelectItem>
                        <SelectItem value="group_booking">Group Booking</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Group Booking fields — only shown when type is group_booking */}
            {groupType === 'group_booking' && (
              <>
                {/* Row 2: Group Number & Destination */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="groupNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Group Number</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., GRP-001" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="destination"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Destination</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Italy" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Row 3: Start Date & End Date */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Row 4: Status & Supplier */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="planning">Planning</SelectItem>
                            <SelectItem value="confirmed">Confirmed</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="primarySupplierId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Primary Supplier</FormLabel>
                        <FormControl>
                          <SupplierCombobox
                            value={supplierName}
                            onValueChange={(name) => {
                              setSupplierName(name)
                              if (!name) field.onChange(null)
                            }}
                            onSupplierSelect={(supplier) => {
                              field.onChange(supplier?.id ?? null)
                            }}
                            placeholder="Select supplier..."
                            allowCreate={false}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </>
            )}

            {/* Description — always shown */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Optional description..."
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Root Error Message */}
            {rootError && (
              <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                {rootError}
              </div>
            )}

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
                disabled={createGroup.isPending || updateGroup.isPending}
              >
                {createGroup.isPending || updateGroup.isPending
                  ? 'Saving...'
                  : mode === 'create'
                    ? 'Create Group'
                    : 'Update Group'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
