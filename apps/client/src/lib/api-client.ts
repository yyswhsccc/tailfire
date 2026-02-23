"use client"

import { createApiClient, type ApiClient } from "@tailfire/api-client"
import { createClient } from "@/lib/supabase/client"

let apiClientInstance: ApiClient | null = null

export function getApiClient(): ApiClient {
  if (apiClientInstance) return apiClientInstance

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3101/api/v1"

  apiClientInstance = createApiClient({
    baseUrl: apiBaseUrl,
    getToken: async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      return session?.access_token ?? null
    },
  })

  return apiClientInstance
}
