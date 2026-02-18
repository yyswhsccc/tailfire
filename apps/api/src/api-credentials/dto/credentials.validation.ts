/**
 * Credential Validation Schemas
 *
 * Zod validation schemas for provider-specific credentials.
 * These schemas validate credential structure before encryption.
 */

import { z } from 'zod'
import { ApiProvider } from '@tailfire/shared-types'

// ============================================================================
// SUPABASE STORAGE CREDENTIALS SCHEMA
// ============================================================================

export const supabaseStorageCredentialsSchema = z.object({
  url: z
    .string()
    .url('Must be a valid URL')
    .regex(/^https:\/\/.*\.supabase\.co$/, 'Must be a valid Supabase project URL'),
  serviceRoleKey: z
    .string()
    .min(1, 'Service role key is required')
    .startsWith('eyJ', 'Must be a valid JWT token'),
})

export type ValidatedSupabaseStorageCredentials = z.infer<typeof supabaseStorageCredentialsSchema>

// ============================================================================
// CLOUDFLARE R2 CREDENTIALS SCHEMA
// ============================================================================

export const cloudflareR2CredentialsSchema = z.object({
  accountId: z
    .string()
    .min(1, 'Account ID is required')
    .regex(/^[a-f0-9]{32}$/, 'Must be a valid Cloudflare account ID (32 hex characters)'),
  accessKeyId: z
    .string()
    .min(1, 'Access key ID is required')
    .length(32, 'Access key ID must be 32 characters'),
  secretAccessKey: z
    .string()
    .min(1, 'Secret access key is required')
    .length(64, 'Secret access key must be 64 characters'),
  bucketName: z
    .string()
    .min(3, 'Bucket name must be at least 3 characters')
    .max(63, 'Bucket name must not exceed 63 characters')
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'Bucket name must contain only lowercase letters, numbers, and hyphens'),
  endpoint: z
    .string()
    .url('Endpoint must be a valid URL')
    .regex(/\.r2\.cloudflarestorage\.com$/, 'Must be a valid R2 endpoint')
    .optional(),
})

export type ValidatedCloudflareR2Credentials = z.infer<typeof cloudflareR2CredentialsSchema>

// ============================================================================
// BACKBLAZE B2 CREDENTIALS SCHEMA
// ============================================================================

export const backblazeB2CredentialsSchema = z.object({
  keyId: z
    .string()
    .min(1, 'Key ID is required')
    .regex(/^[a-f0-9]{25}$/, 'Must be a valid Backblaze key ID'),
  applicationKey: z
    .string()
    .min(1, 'Application key is required')
    .length(31, 'Application key must be 31 characters'),
  bucketName: z
    .string()
    .min(6, 'Bucket name must be at least 6 characters')
    .max(63, 'Bucket name must not exceed 63 characters')
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'Bucket name must contain only lowercase letters, numbers, and hyphens'),
  endpoint: z
    .string()
    .url('Endpoint must be a valid URL')
    .regex(/^https?:\/\/s3\.[a-z0-9-]+\.backblazeb2\.com$/, 'Must be a valid B2 S3 endpoint'),
  region: z
    .string()
    .regex(/^[a-z]+-[a-z]+-\d{3}$/, 'Region must be in format: us-west-004')
    .optional(),
})

export type ValidatedBackblazeB2Credentials = z.infer<typeof backblazeB2CredentialsSchema>

// ============================================================================
// UNSPLASH CREDENTIALS SCHEMA
// ============================================================================

export const unsplashCredentialsSchema = z.object({
  accessKey: z
    .string()
    .min(1, 'Access key is required')
    .regex(/^[A-Za-z0-9_-]{20,}$/, 'Must be a valid Unsplash access key'),
  secretKey: z
    .string()
    .regex(/^[A-Za-z0-9_-]{20,}$/, 'Must be a valid Unsplash secret key')
    .optional(),
})

export type ValidatedUnsplashCredentials = z.infer<typeof unsplashCredentialsSchema>

// ============================================================================
// AERODATABOX CREDENTIALS SCHEMA
// ============================================================================

export const aerodataboxCredentialsSchema = z.object({
  // RapidAPI keys vary in format; use permissive validation
  rapidApiKey: z
    .string()
    .min(1, 'RapidAPI key is required')
    .min(20, 'RapidAPI key appears too short')
    .max(100, 'RapidAPI key appears too long'),
})

export type ValidatedAerodataboxCredentials = z.infer<typeof aerodataboxCredentialsSchema>

// ============================================================================
// AMADEUS CREDENTIALS SCHEMA
// ============================================================================

export const amadeusCredentialsSchema = z.object({
  // Amadeus uses OAuth2 client credentials
  // Use .trim() to prevent whitespace-only values
  clientId: z
    .string()
    .trim()
    .min(1, 'Client ID is required'),
  clientSecret: z
    .string()
    .trim()
    .min(1, 'Client Secret is required'),
})

export type ValidatedAmadeusCredentials = z.infer<typeof amadeusCredentialsSchema>

// ============================================================================
// GOOGLE PLACES CREDENTIALS SCHEMA
// ============================================================================

export const googlePlacesCredentialsSchema = z.object({
  // Google Cloud API key with Places API (New) enabled
  apiKey: z
    .string()
    .trim()
    .min(1, 'API key is required')
    .regex(/^AIza[0-9A-Za-z_-]{35}$/, 'Must be a valid Google API key (starts with AIza)'),
})

export type ValidatedGooglePlacesCredentials = z.infer<typeof googlePlacesCredentialsSchema>

// ============================================================================
// BOOKING.COM CREDENTIALS SCHEMA
// ============================================================================

export const bookingComCredentialsSchema = z.object({
  // RapidAPI key for Booking.com DataCrawler API
  rapidApiKey: z
    .string()
    .trim()
    .min(1, 'RapidAPI key is required')
    .min(20, 'RapidAPI key appears too short')
    .max(100, 'RapidAPI key appears too long'),
})

export type ValidatedBookingComCredentials = z.infer<typeof bookingComCredentialsSchema>

// ============================================================================
// OPENAI CREDENTIALS SCHEMA
// ============================================================================

export const openAiCredentialsSchema = z.object({
  apiKey: z
    .string()
    .trim()
    .min(1, 'API key is required')
    .startsWith('sk-', 'Must be a valid OpenAI API key (starts with sk-)'),
})

export type ValidatedOpenAiCredentials = z.infer<typeof openAiCredentialsSchema>

// ============================================================================
// CREDENTIAL VALIDATION SCHEMA MAP
// ============================================================================

/**
 * Map of provider types to their validation schemas
 */
export const credentialSchemaMap = {
  [ApiProvider.SUPABASE_STORAGE]: supabaseStorageCredentialsSchema,
  [ApiProvider.CLOUDFLARE_R2]: cloudflareR2CredentialsSchema,
  [ApiProvider.BACKBLAZE_B2]: backblazeB2CredentialsSchema,
  [ApiProvider.UNSPLASH]: unsplashCredentialsSchema,
  [ApiProvider.AERODATABOX]: aerodataboxCredentialsSchema,
  [ApiProvider.AMADEUS]: amadeusCredentialsSchema,
  [ApiProvider.GOOGLE_PLACES]: googlePlacesCredentialsSchema,
  [ApiProvider.BOOKING_COM]: bookingComCredentialsSchema,
  [ApiProvider.OPEN_AI]: openAiCredentialsSchema,
} as const

// ============================================================================
// VALIDATION HELPER FUNCTIONS
// ============================================================================

/**
 * Validate credentials for a specific provider
 *
 * @param provider - The API provider type
 * @param credentials - The credentials object to validate
 * @returns Validated credentials object
 * @throws ZodError if validation fails
 */
export function validateCredentials(
  provider: ApiProvider,
  credentials: Record<string, any>
): ValidatedSupabaseStorageCredentials | ValidatedCloudflareR2Credentials | ValidatedBackblazeB2Credentials | ValidatedUnsplashCredentials | ValidatedAerodataboxCredentials | ValidatedAmadeusCredentials | ValidatedGooglePlacesCredentials | ValidatedBookingComCredentials {
  const schema = credentialSchemaMap[provider]

  if (!schema) {
    throw new Error(`No validation schema found for provider: ${provider}`)
  }

  return schema.parse(credentials)
}

/**
 * Safely validate credentials and return result with errors
 *
 * @param provider - The API provider type
 * @param credentials - The credentials object to validate
 * @returns Object with success flag and either data or error
 */
export function safeValidateCredentials(
  provider: ApiProvider,
  credentials: Record<string, any>
): { success: true; data: ValidatedSupabaseStorageCredentials | ValidatedCloudflareR2Credentials | ValidatedBackblazeB2Credentials | ValidatedUnsplashCredentials | ValidatedAerodataboxCredentials | ValidatedAmadeusCredentials | ValidatedGooglePlacesCredentials | ValidatedBookingComCredentials } | { success: false; error: z.ZodError } {
  const schema = credentialSchemaMap[provider]

  if (!schema) {
    return {
      success: false,
      error: new z.ZodError([{
        code: 'custom',
        message: `No validation schema found for provider: ${provider}`,
        path: ['provider'],
      }]),
    }
  }

  const result = schema.safeParse(credentials)

  if (result.success) {
    return { success: true, data: result.data }
  } else {
    return { success: false, error: result.error }
  }
}

/**
 * Get human-readable validation errors
 *
 * @param error - Zod error object
 * @returns Array of error messages
 */
export function getValidationErrors(error: z.ZodError): string[] {
  return error.errors.map(err => {
    const path = err.path.length > 0 ? `${err.path.join('.')}: ` : ''
    return `${path}${err.message}`
  })
}
