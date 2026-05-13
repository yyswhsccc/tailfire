/**
 * Tests for PackageForm component
 *
 * Tests cover:
 * - defaultTab prop behavior
 * - Defaults to 'general' when no defaultTab provided
 * - Opens to specified tab when defaultTab is provided
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

// Mock all the hooks used by PackageForm
vi.mock('@/hooks/use-bookings', () => ({
  useBooking: () => ({ data: null, isLoading: false }),
  useBookingLinkedActivities: () => ({ data: [] }),
  useUnlinkedActivities: () => ({ data: { activities: [] } }),
  useLinkActivities: () => ({ mutateAsync: vi.fn() }),
  useUnlinkActivities: () => ({ mutateAsync: vi.fn() }),
  useCreateBooking: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateBooking: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

// use-save-status was removed in #306 along with autosave; no mock needed.

vi.mock('@/hooks/use-payment-schedules', () => ({
  usePaymentSchedule: () => ({ data: null, isLoading: false }),
  useCreatePaymentSchedule: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePaymentSchedule: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePaymentSchedule: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

// Import after mocks are set up
import { PackageForm } from '../package-form'

// Test helper wrapper with QueryClient
const createTestWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  Wrapper.displayName = 'TestQueryClientProvider'
  return Wrapper
}

describe('PackageForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('defaultTab prop', () => {
    it('defaults to general tab when no defaultTab provided', () => {
      const Wrapper = createTestWrapper()
      render(<PackageForm tripId="trip-1" />, { wrapper: Wrapper })

      // General Info tab should be active by default
      const generalTab = screen.getByRole('tab', { name: /general info/i })
      expect(generalTab).toHaveAttribute('data-state', 'active')
    })

    it('opens booking tab when defaultTab="booking"', () => {
      const Wrapper = createTestWrapper()
      render(<PackageForm tripId="trip-1" defaultTab="booking" />, { wrapper: Wrapper })

      // Booking & Pricing tab should be active
      const bookingTab = screen.getByRole('tab', { name: /booking/i })
      expect(bookingTab).toHaveAttribute('data-state', 'active')
    })

    it('opens documents tab when defaultTab="documents"', () => {
      const Wrapper = createTestWrapper()
      render(<PackageForm tripId="trip-1" defaultTab="documents" />, { wrapper: Wrapper })

      // Documents tab should be active
      const documentsTab = screen.getByRole('tab', { name: /documents/i })
      expect(documentsTab).toHaveAttribute('data-state', 'active')
    })

    it('keeps general tab active when creating new package (no packageId)', () => {
      const Wrapper = createTestWrapper()
      render(<PackageForm tripId="trip-1" />, { wrapper: Wrapper })

      const generalTab = screen.getByRole('tab', { name: /general info/i })
      expect(generalTab).toHaveAttribute('data-state', 'active')

      // Verify the other tabs are not active
      const bookingTab = screen.getByRole('tab', { name: /booking/i })
      expect(bookingTab).toHaveAttribute('data-state', 'inactive')
    })
  })
})
