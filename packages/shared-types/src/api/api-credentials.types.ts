/**
 * API Credentials Types
 *
 * Type definitions for the API Credentials Manager system.
 * Supports secure storage and rotation of third-party API credentials.
 */

/**
 * Supported API providers
 */
export enum ApiProvider {
  // Storage providers
  SUPABASE_STORAGE = 'supabase_storage',
  CLOUDFLARE_R2 = 'cloudflare_r2',
  BACKBLAZE_B2 = 'backblaze_b2',
  // Image providers
  UNSPLASH = 'unsplash',
  // External APIs
  AERODATABOX = 'aerodatabox',
  AMADEUS = 'amadeus',
  AMADEUS_ACTIVITIES = 'amadeus_activities',
  AMADEUS_HOTELS = 'amadeus_hotels',
  AMADEUS_OFFERS = 'amadeus_offers',
  AMADEUS_TRANSFERS = 'amadeus_transfers',
  GOOGLE_PLACES = 'google_places',
  BOOKING_COM = 'booking_com',
  // AI providers
  OPEN_AI = 'open_ai',
  // Future providers:
  // VISA_REQUIREMENTS = 'visa_requirements',
}

/**
 * Credential status
 */
export enum CredentialStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
}

/**
 * Structure of encrypted credentials data
 */
export interface EncryptedCredentials {
  iv: string
  ciphertext: string
  authTag: string
}

/**
 * Base credential fields
 */
interface BaseCredential {
  id: string
  parentId: string | null
  provider: ApiProvider
  name: string
  version: number
  isActive: boolean
  status: CredentialStatus
  lastRotatedAt: string | null
  expiresAt: string | null
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
}

/**
 * Credential metadata (no secrets)
 * This is the default response for list/get operations
 */
export interface CredentialMetadataDto extends BaseCredential {
  // Metadata only - no decrypted secrets
}

/**
 * Credential with decrypted secrets
 * Only returned from the /reveal endpoint
 */
export interface CredentialSecretsDto extends BaseCredential {
  decryptedCredentials: Record<string, any>
}

/**
 * Create credential request
 */
export interface CreateCredentialDto {
  provider: ApiProvider
  name: string
  credentials: Record<string, any>
  expiresAt?: string
}

/**
 * Update credential metadata request
 * (Cannot update credentials themselves - use rotation instead)
 */
export interface UpdateCredentialDto {
  name?: string
  status?: CredentialStatus
  expiresAt?: string | null
}

/**
 * Rotate credential request
 */
export interface RotateCredentialDto {
  credentials: Record<string, any>
  expiresAt?: string
}

// ============================================================================
// Provider-Specific Credential Interfaces
// ============================================================================

/**
 * Supabase Storage credentials
 * Maps to encryptedCredentials JSONB field
 */
export interface SupabaseStorageCredentials {
  url: string              // Supabase project URL
  serviceRoleKey: string   // Service role key (not anon key)
}

/**
 * Cloudflare R2 credentials
 * S3-compatible object storage with zero egress fees
 * Maps to encryptedCredentials JSONB field
 */
export interface CloudflareR2Credentials {
  accountId: string       // Cloudflare account ID
  accessKeyId: string     // R2 access key ID
  secretAccessKey: string // R2 secret access key
  bucketName: string      // R2 bucket name
  endpoint?: string       // Optional custom endpoint (default: {accountId}.r2.cloudflarestorage.com)
}

/**
 * Backblaze B2 credentials
 * S3-compatible object storage with low storage costs
 * Maps to encryptedCredentials JSONB field
 */
export interface BackblazeB2Credentials {
  keyId: string          // B2 application key ID
  applicationKey: string // B2 application key
  bucketName: string     // B2 bucket name
  endpoint: string       // B2 S3-compatible endpoint (e.g., s3.us-west-004.backblazeb2.com)
  region?: string        // Optional region (e.g., us-west-004)
}

/**
 * Unsplash API credentials
 * For accessing Unsplash stock photos
 * Maps to encryptedCredentials JSONB field
 */
export interface UnsplashCredentials {
  accessKey: string      // Unsplash API access key
  secretKey?: string     // Optional secret key (not required for public API calls)
}

/**
 * Union type of all credential types
 */
export type StorageCredentials =
  | SupabaseStorageCredentials
  | CloudflareR2Credentials
  | BackblazeB2Credentials

/**
 * Aerodatabox API credentials
 * For flight data via RapidAPI
 * Maps to encryptedCredentials JSONB field
 */
export interface AerodataboxCredentials {
  rapidApiKey: string      // RapidAPI key for Aerodatabox
}

/**
 * Amadeus API credentials
 * For flight status data via Amadeus On Demand Flight Status API
 * Uses OAuth2 client credentials flow
 * Maps to encryptedCredentials JSONB field
 */
export interface AmadeusCredentials {
  clientId: string         // Amadeus API Client ID
  clientSecret: string     // Amadeus API Client Secret
}

/**
 * Google Places API credentials
 * For hotel search, photos, and reviews
 * Maps to encryptedCredentials JSONB field
 */
export interface GooglePlacesCredentials {
  apiKey: string           // Google Cloud API key with Places API enabled
}

/**
 * Booking.com API credentials (via RapidAPI DataCrawler)
 * For hotel amenity enrichment
 * Maps to encryptedCredentials JSONB field
 */
export interface BookingComCredentials {
  rapidApiKey: string      // RapidAPI key for Booking.com DataCrawler API
}

/**
 * OpenAI API credentials
 * For GPT-4o Vision OCR document extraction
 * Maps to encryptedCredentials JSONB field
 */
export interface OpenAiCredentials {
  apiKey: string           // OpenAI API key
}

/**
 * Union type of all API credential types
 */
export type ApiCredentials =
  | StorageCredentials
  | UnsplashCredentials
  | AerodataboxCredentials
  | AmadeusCredentials
  | GooglePlacesCredentials
  | BookingComCredentials
  | OpenAiCredentials
