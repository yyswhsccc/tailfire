'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, lazy, Suspense } from 'react'
import { ConfirmationDialogProvider } from '@/components/ui/confirmation-dialog'
import { LoadingProvider } from '@/context/loading-context'
import { GlobalLoadingOverlay } from '@/components/ui/loading-overlay'
import { Toaster } from '@/components/ui/toaster'
import { AuthProvider } from '@/providers/auth-provider'
import { NotificationsProvider } from '@/providers/notifications-provider'

// Dynamically import devtools only in development
const ReactQueryDevtools =
  process.env.NODE_ENV === 'development'
    ? lazy(() =>
        import('@tanstack/react-query-devtools').then((mod) => ({
          default: mod.ReactQueryDevtools,
        }))
      )
    : () => null

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <NotificationsProvider>
          <LoadingProvider>
            <ConfirmationDialogProvider>
              {children}
            <GlobalLoadingOverlay />
            <Toaster />
            {typeof window !== 'undefined' &&
              process.env.NODE_ENV === 'development' &&
              process.env.NEXT_PUBLIC_ENABLE_DEVTOOLS === 'true' && (
                <Suspense fallback={null}>
                  <ReactQueryDevtools initialIsOpen={false} />
                </Suspense>
              )}
            </ConfirmationDialogProvider>
          </LoadingProvider>
        </NotificationsProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
