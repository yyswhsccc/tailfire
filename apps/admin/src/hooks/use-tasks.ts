import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { calendarKeys } from './use-calendar'
import type {
  TaskResponseDto,
  PaginatedTasksResponseDto,
  CreateTaskDto,
  UpdateTaskDto,
  TaskFilterDto,
  BulkTaskOperationDto,
  BulkTaskResultDto,
  CompleteTaskDto,
  TaskTemplateResponseDto,
  CreateTaskTemplateDto,
  UpdateTaskTemplateDto,
  CreateFromTemplateDto,
} from '@tailfire/shared-types/api'

// ============================================================================
// QUERY KEYS
// ============================================================================

export const taskKeys = {
  all: ['tasks'] as const,
  lists: () => [...taskKeys.all, 'list'] as const,
  list: (filters: TaskFilterDto) => [...taskKeys.lists(), filters] as const,
  details: () => [...taskKeys.all, 'detail'] as const,
  detail: (id: string) => [...taskKeys.details(), id] as const,
  subtasks: (parentId: string) =>
    [...taskKeys.all, 'subtasks', parentId] as const,
  templates: () => [...taskKeys.all, 'templates'] as const,
  templateList: (type?: string, search?: string) =>
    [...taskKeys.templates(), { type, search }] as const,
  template: (id: string) => [...taskKeys.templates(), id] as const,
}

// ============================================================================
// TASK QUERIES
// ============================================================================

/**
 * Fetch paginated list of tasks
 */
export function useTasks(filters: TaskFilterDto = {}) {
  return useQuery({
    queryKey: taskKeys.list(filters),
    queryFn: async () => {
      const params = new URLSearchParams()

      if (filters.page) params.append('page', filters.page.toString())
      if (filters.limit) params.append('limit', filters.limit.toString())
      if (filters.search) params.append('search', filters.search)
      if (filters.sortBy) params.append('sortBy', filters.sortBy)
      if (filters.sortOrder) params.append('sortOrder', filters.sortOrder)

      if (filters.status?.length) {
        (Array.isArray(filters.status) ? filters.status : [filters.status]).forEach(
          (s) => params.append('status', s)
        )
      }
      if (filters.priority?.length) {
        (Array.isArray(filters.priority) ? filters.priority : [filters.priority]).forEach(
          (p) => params.append('priority', p)
        )
      }
      if (filters.taskType?.length) {
        (Array.isArray(filters.taskType) ? filters.taskType : [filters.taskType]).forEach(
          (t) => params.append('taskType', t)
        )
      }

      if (filters.assigneeUserId)
        params.append('assigneeUserId', filters.assigneeUserId)
      if (filters.tripId) params.append('tripId', filters.tripId)
      if (filters.contactId) params.append('contactId', filters.contactId)
      if (filters.activityId) params.append('activityId', filters.activityId)
      if (filters.parentTaskId) params.append('parentTaskId', filters.parentTaskId)
      if (filters.dueDateFrom) params.append('dueDateFrom', filters.dueDateFrom)
      if (filters.dueDateTo) params.append('dueDateTo', filters.dueDateTo)
      if (filters.isOverdue !== undefined)
        params.append('isOverdue', filters.isOverdue.toString())
      if (filters.isVisibleInCalendar !== undefined)
        params.append('isVisibleInCalendar', filters.isVisibleInCalendar.toString())
      if (filters.tagIds?.length) {
        filters.tagIds.forEach((id) => params.append('tagIds', id))
      }
      if (filters.includeDeleted)
        params.append('includeDeleted', filters.includeDeleted.toString())
      if (filters.includeSubtasks)
        params.append('includeSubtasks', filters.includeSubtasks.toString())

      return api.get<PaginatedTasksResponseDto>(`/tasks?${params.toString()}`)
    },
  })
}

/**
 * Fetch single task by ID
 */
export function useTask(id: string | null) {
  return useQuery({
    queryKey: taskKeys.detail(id || ''),
    queryFn: () => api.get<TaskResponseDto>(`/tasks/${id}`),
    enabled: !!id,
  })
}

/**
 * Fetch subtasks for a parent task
 */
export function useSubtasks(parentTaskId: string | null) {
  return useQuery({
    queryKey: taskKeys.subtasks(parentTaskId || ''),
    queryFn: () =>
      api.get<TaskResponseDto[]>(`/tasks/${parentTaskId}/subtasks`),
    enabled: !!parentTaskId,
  })
}

// ============================================================================
// TASK MUTATIONS
// ============================================================================

/**
 * Create new task
 */
export function useCreateTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateTaskDto) =>
      api.post<TaskResponseDto>('/tasks', data),
    onSuccess: () => {
      // Invalidate task lists and calendar
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
      queryClient.invalidateQueries({ queryKey: calendarKeys.events() })
      queryClient.invalidateQueries({ queryKey: calendarKeys.today() })
    },
  })
}

/**
 * Update existing task
 */
export function useUpdateTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTaskDto }) =>
      api.put<TaskResponseDto>(`/tasks/${id}`, data),
    onSuccess: (_, variables) => {
      // Invalidate specific task and lists
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(variables.id) })
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
      queryClient.invalidateQueries({ queryKey: calendarKeys.events() })
      queryClient.invalidateQueries({ queryKey: calendarKeys.today() })
    },
  })
}

/**
 * Delete task
 */
export function useDeleteTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.delete(`/tasks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
      queryClient.invalidateQueries({ queryKey: calendarKeys.events() })
      queryClient.invalidateQueries({ queryKey: calendarKeys.today() })
    },
  })
}

/**
 * Complete a task
 */
export function useCompleteTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data?: CompleteTaskDto }) =>
      api.post<TaskResponseDto>(`/tasks/${id}/complete`, data || {}),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(variables.id) })
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
      queryClient.invalidateQueries({ queryKey: calendarKeys.events() })
      queryClient.invalidateQueries({ queryKey: calendarKeys.today() })
    },
  })
}

/**
 * Bulk operations on tasks
 */
export function useBulkTaskOperation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: BulkTaskOperationDto) =>
      api.post<BulkTaskResultDto>('/tasks/bulk', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all })
      queryClient.invalidateQueries({ queryKey: calendarKeys.events() })
      queryClient.invalidateQueries({ queryKey: calendarKeys.today() })
    },
  })
}

// ============================================================================
// TEMPLATE QUERIES
// ============================================================================

/**
 * Fetch task templates
 */
export function useTaskTemplates(type?: string, search?: string) {
  return useQuery({
    queryKey: taskKeys.templateList(type, search),
    queryFn: async () => {
      const params = new URLSearchParams()
      if (type) params.append('type', type)
      if (search) params.append('search', search)
      return api.get<TaskTemplateResponseDto[]>(
        `/tasks/templates?${params.toString()}`
      )
    },
  })
}

/**
 * Fetch single template
 */
export function useTaskTemplate(id: string | null) {
  return useQuery({
    queryKey: taskKeys.template(id || ''),
    queryFn: () => api.get<TaskTemplateResponseDto>(`/tasks/templates/${id}`),
    enabled: !!id,
  })
}

// ============================================================================
// TEMPLATE MUTATIONS
// ============================================================================

/**
 * Create task template
 */
export function useCreateTaskTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateTaskTemplateDto) =>
      api.post<TaskTemplateResponseDto>('/tasks/templates', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.templates() })
    },
  })
}

/**
 * Update task template
 */
export function useUpdateTaskTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTaskTemplateDto }) =>
      api.put<TaskTemplateResponseDto>(`/tasks/templates/${id}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.template(variables.id) })
      queryClient.invalidateQueries({ queryKey: taskKeys.templates() })
    },
  })
}

/**
 * Delete task template
 */
export function useDeleteTaskTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.delete(`/tasks/templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.templates() })
    },
  })
}

/**
 * Create task from template
 */
export function useCreateTaskFromTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateFromTemplateDto) =>
      api.post<TaskResponseDto>('/tasks/from-template', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
      queryClient.invalidateQueries({ queryKey: calendarKeys.events() })
      queryClient.invalidateQueries({ queryKey: calendarKeys.today() })
    },
  })
}
