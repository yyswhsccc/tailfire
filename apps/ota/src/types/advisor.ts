export interface AdvisorProfile {
  id: string
  slug: string
  displayName: string
  title?: string
  bio?: string
  photoUrl?: string
  specialties?: string[]
  certifications?: string[]
  languages?: string[]
  destinations?: string[]
  reviews?: { rating: number; text: string; author: string }[]
  bioSupplement?: string
  socialLinks?: { instagram?: string; linkedin?: string; facebook?: string }
  isPublished: boolean
}
