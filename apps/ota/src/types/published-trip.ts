export interface PublishedTrip {
  id: string
  slug: string
  publishType: 'hosted' | 'featured' | 'recommended' | 'custom'
  headline?: string
  callToAction: string
  renderedSnapshot: Record<string, unknown> // Template JSON data
  heroImageUrl?: string
  isPublished: boolean
  advisorProfileId: string
  templateId: string
  createdAt: string
  updatedAt: string
}
