import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  IcTaxProfileDto,
  CreateIcTaxProfileRequest,
  UpdateIcTaxProfileRequest,
  IcPayoutAccountDto,
  CreateIcPayoutAccountRequest,
  IcPayoutAuthorizationDto,
} from '@tailfire/shared-types/api'

// ─── Query key factory ────────────────────────────────────────────────────────

export const icPayoutsKeys = {
  all: ['ic-payouts'] as const,
  me: () => [...icPayoutsKeys.all, 'me'] as const,
  taxProfile: () => [...icPayoutsKeys.me(), 'tax-profile'] as const,
  accounts: () => [...icPayoutsKeys.me(), 'accounts'] as const,
  authorization: () => [...icPayoutsKeys.me(), 'authorization'] as const,
}

// ─── Tax Profile ──────────────────────────────────────────────────────────────

/**
 * Read a tax profile. Without args, returns the authenticated IC's own
 * profile. Pass `onBehalfOfUserId` (admin only) to read the target IC's
 * profile via /ic-payouts/admin/users/:id/tax-profile — used by the
 * "Generate claim on behalf of agent" flow so the GST/HST preview
 * reflects the IC who'll own the invoice.
 */
export function useMyTaxProfile(onBehalfOfUserId?: string) {
  return useQuery<IcTaxProfileDto | null>({
    queryKey: onBehalfOfUserId
      ? (['ic-payouts', 'admin', 'tax-profile', onBehalfOfUserId] as const)
      : icPayoutsKeys.taxProfile(),
    queryFn: async () => {
      const path = onBehalfOfUserId
        ? `/ic-payouts/admin/users/${onBehalfOfUserId}/tax-profile`
        : '/ic-payouts/me/tax-profile'
      try {
        return await api.get<IcTaxProfileDto>(path)
      } catch (err: unknown) {
        // 404 means not yet created — return null, not an error
        if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 404) {
          return null
        }
        throw err
      }
    },
    enabled: onBehalfOfUserId === undefined || onBehalfOfUserId.length > 0,
  })
}

export function useCreateTaxProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateIcTaxProfileRequest) =>
      api.post<IcTaxProfileDto>('/ic-payouts/me/tax-profile', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: icPayoutsKeys.taxProfile() }),
  })
}

export function useUpdateTaxProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateIcTaxProfileRequest) =>
      api.patch<IcTaxProfileDto>('/ic-payouts/me/tax-profile', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: icPayoutsKeys.taxProfile() }),
  })
}

// ─── Payout Accounts ──────────────────────────────────────────────────────────

export function useMyPayoutAccounts() {
  return useQuery<IcPayoutAccountDto[]>({
    queryKey: icPayoutsKeys.accounts(),
    queryFn: () => api.get<IcPayoutAccountDto[]>('/ic-payouts/me/accounts'),
  })
}

export function useCreatePayoutAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateIcPayoutAccountRequest) =>
      api.post<IcPayoutAccountDto>('/ic-payouts/me/accounts', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: icPayoutsKeys.accounts() }),
  })
}

export function useArchivePayoutAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/ic-payouts/me/accounts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: icPayoutsKeys.accounts() }),
  })
}

// ─── Authorization ────────────────────────────────────────────────────────────

export function useMyAuthorization() {
  return useQuery<IcPayoutAuthorizationDto | null>({
    queryKey: icPayoutsKeys.authorization(),
    queryFn: async () => {
      try {
        return await api.get<IcPayoutAuthorizationDto>('/ic-payouts/me/authorization/active')
      } catch (err: unknown) {
        // 404 means no active authorization yet — return null
        if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 404) {
          return null
        }
        throw err
      }
    },
  })
}

export function useAcceptAuthorization() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (form: FormData) =>
      api.postFormData<IcPayoutAuthorizationDto>('/ic-payouts/me/authorization', form),
    onSuccess: () => qc.invalidateQueries({ queryKey: icPayoutsKeys.me() }),
  })
}
