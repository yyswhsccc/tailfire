"use client";

import { useQuery } from "@tanstack/react-query";
import { portalApi } from "@/lib/api";

export interface PortalProfile {
  id: string;
  firstName: string | null;
  lastName: string | null;
  preferredName: string | null;
  displayName: string;
  email: string | null;
  phone: string | null;
  portalActivatedAt: string | null;
  agent: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
    phone: string | null;
  } | null;
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
