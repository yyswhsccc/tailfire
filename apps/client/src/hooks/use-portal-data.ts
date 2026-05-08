"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ContactStatus } from "@tailfire/shared-types";
import { portalApi, portalApiMultipart } from "@/lib/api";

export type { ContactStatus };

export interface PortalProfile {
  id: string;
  firstName: string | null;
  lastName: string | null;
  preferredName: string | null;
  displayName: string;
  email: string | null;
  phone: string | null;
  portalActivatedAt: string | null;
  contactStatus: ContactStatus | null;
  agent: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
    phone: string | null;
  } | null;
  // Photo
  photoUrl: string | null;
  // Extended name fields
  legalFirstName: string | null;
  legalLastName: string | null;
  middleName: string | null;
  prefix: string | null;
  suffix: string | null;
  // Identity
  gender: string | null;
  pronouns: string | null;
  dateOfBirth: string | null;
  // Passport
  passportNumber: string | null;
  passportExpiry: string | null;
  passportCountry: string | null;
  passportIssueDate: string | null;
  nationality: string | null;
  // TSA
  redressNumber: string | null;
  knownTravelerNumber: string | null;
  // Address
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  country: string | null;
  // Requirements
  dietaryRequirements: string | null;
  mobilityRequirements: string | null;
  // Travel preferences
  seatPreference: string | null;
  cabinPreference: string | null;
  floorPreference: string | null;
}

export interface PortalTrip {
  id: string;
  name: string;
  status: string;
  tripType: string | null;
  startDate: string | null;
  endDate: string | null;
  coverImageUrl: string | null;
  isPrimaryContact: boolean;
  createdAt: string;
}

export interface PortalDocument {
  id: string;
  documentType: string | null;
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  uploadedAt: string | null;
}

export function usePortalProfile() {
  return useQuery({
    queryKey: ["portal", "profile"],
    queryFn: () => portalApi<PortalProfile>("/portal/me"),
  });
}

export function usePortalTrips() {
  return useQuery({
    queryKey: ["portal", "trips"],
    queryFn: () => portalApi<PortalTrip[]>("/portal/my-trips"),
  });
}

export function usePortalDocuments() {
  return useQuery({
    queryKey: ["portal", "documents"],
    queryFn: () => portalApi<PortalDocument[]>("/portal/my-documents"),
  });
}

export type UpdatePortalProfileInput = Partial<
  Pick<
    PortalProfile,
    | "firstName" | "lastName" | "preferredName" | "prefix" | "suffix"
    | "legalFirstName" | "legalLastName" | "middleName"
    | "phone" | "dateOfBirth" | "gender" | "pronouns"
    | "passportNumber" | "passportExpiry" | "passportCountry" | "passportIssueDate" | "nationality"
    | "redressNumber" | "knownTravelerNumber"
    | "addressLine1" | "addressLine2" | "city" | "province" | "postalCode" | "country"
    | "dietaryRequirements" | "mobilityRequirements"
    | "seatPreference" | "cabinPreference" | "floorPreference"
  >
>;

export function useUpdatePortalProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdatePortalProfileInput) =>
      portalApi<PortalProfile>("/portal/me", {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal", "profile"] });
    },
  });
}

export function useUploadPortalAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return portalApiMultipart<{ photoUrl: string }>("/portal/me/avatar", formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal", "profile"] });
    },
  });
}

export function useDeletePortalAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      portalApi<void>("/portal/me/avatar", {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal", "profile"] });
    },
  });
}

// ============================================================================
// LOYALTY PROGRAMS
// ============================================================================

export interface PortalLoyaltyProgram {
  id: string;
  contactId: string;
  loyaltyProgramId: string | null;
  providerName: string;
  programName: string;
  membershipNumber: string;
  tierLevel: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PortalLoyaltyCatalogItem {
  id: string;
  providerName: string;
  programName: string;
  programType: string;
}

export interface CreatePortalLoyaltyProgramInput {
  loyaltyProgramId?: string;
  providerName: string;
  programName: string;
  membershipNumber: string;
  tierLevel?: string;
  notes?: string;
}

export interface UpdatePortalLoyaltyProgramInput {
  loyaltyProgramId?: string;
  providerName?: string;
  programName?: string;
  membershipNumber?: string;
  tierLevel?: string;
  notes?: string;
}

export function usePortalLoyaltyPrograms() {
  return useQuery({
    queryKey: ["portal", "loyalty-programs"],
    queryFn: () => portalApi<PortalLoyaltyProgram[]>("/portal/my-loyalty-programs"),
  });
}

export function usePortalLoyaltyCatalog() {
  return useQuery({
    queryKey: ["portal", "loyalty-catalog"],
    queryFn: async () => {
      const res = await portalApi<{ programs: PortalLoyaltyCatalogItem[] }>("/portal/loyalty-catalog");
      return res.programs;
    },
  });
}

export function useCreatePortalLoyaltyProgram() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePortalLoyaltyProgramInput) =>
      portalApi<PortalLoyaltyProgram>("/portal/my-loyalty-programs", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal", "loyalty-programs"] });
    },
  });
}

export function useUpdatePortalLoyaltyProgram() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdatePortalLoyaltyProgramInput }) =>
      portalApi<PortalLoyaltyProgram>(`/portal/my-loyalty-programs/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal", "loyalty-programs"] });
    },
  });
}

export function useDeletePortalLoyaltyProgram() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      portalApi<void>(`/portal/my-loyalty-programs/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal", "loyalty-programs"] });
    },
  });
}
