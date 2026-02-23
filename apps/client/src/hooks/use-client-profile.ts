"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { getApiClient } from "@/lib/api-client"

export interface ClientProfile {
  id: string
  firstName: string | null
  lastName: string | null
  legalFirstName: string | null
  legalLastName: string | null
  middleName: string | null
  preferredName: string | null
  prefix: string | null
  suffix: string | null
  email: string | null
  phone: string | null
  gender: string | null
  pronouns: string | null
  dateOfBirth: string | null
  passportNumber: string | null
  passportExpiry: string | null
  passportCountry: string | null
  passportIssueDate: string | null
  nationality: string | null
  redressNumber: string | null
  knownTravelerNumber: string | null
  address1: string | null
  address2: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  country: string | null
  dietaryRequirements: string | null
  mobilityRequirements: string | null
  seatPreference: string | null
  cabinPreference: string | null
  floorPreference: string | null
  travelPreferences: Record<string, unknown> | null
}

export function useClientProfile() {
  return useQuery<ClientProfile>({
    queryKey: ["client-profile"],
    queryFn: () => getApiClient().get<ClientProfile>("/client-portal/profile"),
  })
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: Partial<ClientProfile>) =>
      getApiClient().fetch("/client-portal/profile", {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-profile"] })
    },
  })
}
