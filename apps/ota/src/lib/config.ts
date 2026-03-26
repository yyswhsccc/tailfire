// Server-side API base URL (used by Server Components and API routes)
export const API_URL = process.env.API_URL || 'http://localhost:3101/api/v1'

// Service-to-service key for authenticated OTA endpoints
export const OTA_SERVICE_KEY = process.env.OTA_SERVICE_KEY || ''

// Catalog API key for public catalog endpoints (cruise-repository, tour-repository)
export const CATALOG_API_KEY = process.env.CATALOG_API_KEY || ''
