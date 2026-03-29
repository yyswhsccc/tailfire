// Server-side API base URL (used by Server Components and API routes)
// Doppler stores the base URL (e.g., https://api.tailfire.ca) — we append /api/v1
const baseApiUrl = process.env.API_URL || 'http://localhost:3101'
export const API_URL = baseApiUrl.endsWith('/api/v1') ? baseApiUrl : `${baseApiUrl}/api/v1`

// Service-to-service key for authenticated OTA endpoints
export const OTA_SERVICE_KEY = process.env.OTA_SERVICE_KEY || ''

// Catalog API key for public catalog endpoints (cruise-repository, tour-repository)
export const CATALOG_API_KEY = process.env.CATALOG_API_KEY || ''
