import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

// Types matching the backend
export interface ProviderStatus {
  provider: string
  name: string
  category: string
  configured: boolean
  lastCheck?: {
    success: boolean
    responseMs: number
    error?: string
    checkedAt: string
  }
  consecutiveFailures: number
}

export interface HealthCheckEntry {
  id: string
  provider: string
  success: boolean
  responseMs: number | null
  error: string | null
  checkedAt: string
}

export const apiHealthKeys = {
  all: ['api-health'] as const,
  status: () => [...apiHealthKeys.all, 'status'] as const,
  history: (provider: string) => [...apiHealthKeys.all, 'history', provider] as const,
}

export function useApiHealthStatus() {
  return useQuery({
    queryKey: apiHealthKeys.status(),
    queryFn: () => api.get<ProviderStatus[]>('/admin/api-health'),
    refetchInterval: 60000, // Refresh every minute
  })
}

export function useApiHealthHistory(provider: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: apiHealthKeys.history(provider),
    queryFn: () => api.get<HealthCheckEntry[]>(`/admin/api-health/${provider}/history`),
    enabled: options?.enabled ?? true,
  })
}

export function useTriggerHealthCheck() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (provider: string) => api.post(`/admin/api-health/${provider}/check`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiHealthKeys.all })
    },
  })
}
