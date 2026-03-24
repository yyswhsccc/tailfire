'use client'

import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import { Calendar as CalendarIcon, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
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
import { Textarea } from '@/components/ui/textarea'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { useCreateTask, useUpdateTask } from '@/hooks/use-tasks'
import { useUsers } from '@/hooks/use-users'
import { useToast } from '@/hooks/use-toast'
import type { TaskResponseDto } from '@tailfire/shared-types/api'

const taskFormSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  taskType: z.enum(['manual', 'automatic', 'reminder', 'milestone']),
  dueDate: z.date().optional().nullable(),
  isVisibleInCalendar: z.boolean(),
  assigneeType: z.enum(['user', 'contact', 'admin_pool']),
  assigneeUserId: z.string().optional().nullable(),
  assigneeContactId: z.string().optional().nullable(),
  phase: z.enum(['auto', 'pre_booking', 'pre_departure', 'during_travel', 'post_return']).optional().nullable(),
})

type TaskFormValues = z.infer<typeof taskFormSchema>

interface TaskFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task?: TaskResponseDto | null
  contactId?: string
  contactName?: string
  tripId?: string
  phase?: string
}

export function TaskFormDialog({ open, onOpenChange, task, contactId, contactName, tripId, phase }: TaskFormDialogProps) {
  const { toast } = useToast()
  const createTask = useCreateTask()
  const updateTask = useUpdateTask()
  const { data: usersData } = useUsers({ status: 'active', limit: 100 })

  const isEditing = !!task

  const userOptions = useMemo(() => {
    if (!usersData?.users) return []
    return usersData.users.map((u) => ({
      value: u.id,
      label: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email,
    }))
  }, [usersData])

  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: '',
      description: '',
      status: 'pending',
      priority: 'medium',
      taskType: 'manual',
      dueDate: null,
      isVisibleInCalendar: true,
      assigneeType: 'user',
      assigneeUserId: null,
      assigneeContactId: null,
      phase: null,
    },
  })

  const watchAssigneeType = form.watch('assigneeType')

  // Reset form when task changes
  useEffect(() => {
    if (task) {
      form.reset({
        title: task.title,
        description: task.description || '',
        status: task.status,
        priority: task.priority,
        taskType: task.taskType,
        dueDate: task.dueDate ? new Date(task.dueDate) : null,
        isVisibleInCalendar: task.isVisibleInCalendar ?? true,
        assigneeType: task.assigneeType || 'user',
        assigneeUserId: task.assigneeUserId || null,
        assigneeContactId: task.assigneeContactId || null,
        phase: task.phase || null,
      })
    } else {
      form.reset({
        title: '',
        description: '',
        status: 'pending',
        priority: 'medium',
        taskType: 'manual',
        dueDate: null,
        isVisibleInCalendar: true,
        assigneeType: contactId ? 'contact' : 'user',
        assigneeUserId: null,
        assigneeContactId: contactId || null,
        phase: (phase as TaskFormValues['phase']) || null,
      })
    }
  }, [task, form, contactId, phase])

  // Clear irrelevant assignee fields when type changes
  useEffect(() => {
    if (watchAssigneeType === 'user') {
      form.setValue('assigneeContactId', null)
    } else if (watchAssigneeType === 'contact') {
      form.setValue('assigneeUserId', null)
      if (contactId) {
        form.setValue('assigneeContactId', contactId)
      }
    } else if (watchAssigneeType === 'admin_pool') {
      form.setValue('assigneeUserId', null)
      form.setValue('assigneeContactId', null)
    }
  }, [watchAssigneeType, form, contactId])

  const onSubmit = async (values: TaskFormValues) => {
    try {
      const phaseValue = values.phase === 'auto' || !values.phase ? undefined : values.phase
      const data = {
        ...values,
        dueDate: values.dueDate ? format(values.dueDate, 'yyyy-MM-dd') : undefined,
        assigneeUserId: values.assigneeType === 'user' ? values.assigneeUserId || undefined : undefined,
        assigneeContactId: values.assigneeType === 'contact' ? values.assigneeContactId || undefined : undefined,
        phase: phaseValue,
        ...(tripId ? { tripId } : {}),
      }

      if (isEditing && task) {
        await updateTask.mutateAsync({ id: task.id, data })
        toast({ title: 'Task updated', description: values.title })
      } else {
        await createTask.mutateAsync({ ...data, ...(contactId ? { contactId } : {}) })
        toast({ title: 'Task created', description: values.title })
      }
      onOpenChange(false)
    } catch {
      toast({
        title: 'Error',
        description: `Failed to ${isEditing ? 'update' : 'create'} task`,
        variant: 'destructive',
      })
    }
  }

  const isPending = createTask.isPending || updateTask.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Task' : 'Create Task'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Task title" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Task description (optional)"
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
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
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select priority" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="taskType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="manual">Manual</SelectItem>
                        <SelectItem value="automatic">Automatic</SelectItem>
                        <SelectItem value="reminder">Reminder</SelectItem>
                        <SelectItem value="milestone">Milestone</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="dueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Due Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              'w-full pl-3 text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            {field.value ? (
                              format(field.value, 'MMM d, yyyy')
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value || undefined}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Assignee Section */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="assigneeType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assignee Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="user">Team Member</SelectItem>
                        <SelectItem value="contact">Contact</SelectItem>
                        <SelectItem value="admin_pool">Admin Pool</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {watchAssigneeType === 'user' && (
                <FormField
                  control={form.control}
                  name="assigneeUserId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Assignee</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || undefined}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select team member" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {userOptions.map((user) => (
                            <SelectItem key={user.value} value={user.value}>
                              {user.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {watchAssigneeType === 'contact' && (
                <FormItem>
                  <FormLabel>Assignee</FormLabel>
                  {contactId ? (
                    <div className="flex h-9 items-center rounded-md border px-3 text-sm">
                      {contactName || 'Linked contact'}
                    </div>
                  ) : (
                    <div className="flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm text-muted-foreground">
                      <Info className="h-3.5 w-3.5" />
                      Open from contact page
                    </div>
                  )}
                </FormItem>
              )}

              {watchAssigneeType === 'admin_pool' && (
                <FormItem>
                  <FormLabel>Assignee</FormLabel>
                  <div className="flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm text-muted-foreground">
                    <Info className="h-3.5 w-3.5" />
                    Any admin can complete
                  </div>
                </FormItem>
              )}
            </div>

            <FormField
              control={form.control}
              name="isVisibleInCalendar"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel className="text-sm font-medium">
                      Show in Calendar
                    </FormLabel>
                    <p className="text-xs text-muted-foreground">
                      Display this task on the calendar view
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {tripId && (
              <FormField
                control={form.control}
                name="phase"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Trip Phase</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value || 'auto'}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Auto (from due date)" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="auto">Auto (from due date)</SelectItem>
                        <SelectItem value="pre_booking">Pre-Booking</SelectItem>
                        <SelectItem value="pre_departure">Pre-Departure</SelectItem>
                        <SelectItem value="during_travel">During Travel</SelectItem>
                        <SelectItem value="post_return">Post-Return</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Saving...' : isEditing ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
