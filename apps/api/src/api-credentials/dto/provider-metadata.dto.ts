/**
 * Provider Metadata DTO
 *
 * Describes available API providers and their credential requirements.
 * Used by the Admin UI to render dynamic credential forms.
 *
 * Source Policies:
 * - env-only: Managed via Doppler, read from environment variables only
 * - db-only: Managed via Admin UI, stored in database (deprecated)
 * - hybrid: Try env first, fall back to DB (migration period only)
 */

import { ApiProvider } from '@tailfire/shared-types'

/**
 * Credential source policy
 */
export type SourcePolicy = 'env-only' | 'db-only' | 'hybrid'

/**
 * Credential field definition
 */
export interface CredentialFieldDefinition {
  /**
   * Field name (matches the credential interface property)
   */
  name: string

  /**
   * Display label for UI
   */
  label: string

  /**
   * Field type for UI rendering
   */
  type: 'text' | 'password' | 'url' | 'select'

  /**
   * Description/help text
   */
  description: string

  /**
   * Whether field is required
   */
  required: boolean

  /**
   * Placeholder text for input
   */
  placeholder?: string

  /**
   * Validation pattern (regex)
   */
  pattern?: string

  /**
   * Select options (if type is 'select')
   */
  options?: Array<{ value: string; label: string }>
}

/**
 * Provider metadata
 */
export class ProviderMetadataDto {
  /**
   * Provider type enum value
   */
  provider!: ApiProvider

  /**
   * Display name for UI
   */
  displayName!: string

  /**
   * Short description of provider
   */
  description!: string

  /**
   * Detailed setup instructions/documentation
   */
  documentation!: string

  /**
   * Required credential fields for this provider
   */
  requiredFields!: CredentialFieldDefinition[]

  /**
   * Whether provider is currently available (has credentials configured)
   */
  isAvailable!: boolean

  /**
   * Credential source policy
   * - env-only: Managed via Doppler (environment variables)
   * - db-only: Managed via Admin UI (database)
   * - hybrid: Try env first, fall back to DB
   */
  sourcePolicy!: SourcePolicy

  /**
   * Environment variable names for this provider (for env-only/hybrid policies)
   * Maps credential field name to environment variable name
   */
  envVars?: Record<string, string>

  /**
   * Whether this provider's credentials are shared across all environments
   * (vs. being environment-specific like storage providers)
   */
  isShared?: boolean

  /**
   * Estimated monthly cost tier
   */
  costTier!: 'free' | 'low' | 'medium' | 'high'

  /**
   * Key features/benefits
   */
  features!: string[]
}

/**
 * Static provider metadata definitions
 */
export const PROVIDER_METADATA: Record<ApiProvider, Omit<ProviderMetadataDto, 'isAvailable'>> = {
  [ApiProvider.SUPABASE_STORAGE]: {
    provider: ApiProvider.SUPABASE_STORAGE,
    displayName: 'Supabase Storage',
    description: 'Supabase object storage built on S3',
    documentation: 'Get credentials from: Supabase Dashboard → Project Settings → API',
    sourcePolicy: 'env-only',
    envVars: {
      url: 'SUPABASE_URL',
      serviceRoleKey: 'SUPABASE_SERVICE_ROLE_KEY',
    },
    isShared: false,
    costTier: 'medium',
    features: [
      'Integrated with Supabase Auth',
      'Automatic image transformations',
      'Edge CDN distribution',
      '$0.021/GB storage + $0.09/GB bandwidth',
    ],
    requiredFields: [
      {
        name: 'url',
        label: 'Project URL',
        type: 'url',
        description: 'Your Supabase project URL',
        required: true,
        placeholder: 'https://xxxxx.supabase.co',
        pattern: '^https://.*\\.supabase\\.co$',
      },
      {
        name: 'serviceRoleKey',
        label: 'Service Role Key',
        type: 'password',
        description: 'Service role key with storage admin permissions',
        required: true,
        placeholder: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        pattern: '^eyJ',
      },
    ],
  },

  [ApiProvider.CLOUDFLARE_R2]: {
    provider: ApiProvider.CLOUDFLARE_R2,
    displayName: 'Cloudflare R2',
    description: 'S3-compatible object storage with zero egress fees',
    documentation: 'Get credentials from: Cloudflare Dashboard → R2 → Manage R2 API Tokens',
    sourcePolicy: 'env-only',
    envVars: {
      accountId: 'CLOUDFLARE_R2_ACCOUNT_ID',
      accessKeyId: 'CLOUDFLARE_R2_ACCESS_KEY_ID',
      secretAccessKey: 'CLOUDFLARE_R2_SECRET_ACCESS_KEY',
      bucketName: 'CLOUDFLARE_R2_BUCKET_NAME',
      endpoint: 'CLOUDFLARE_R2_ENDPOINT',
    },
    isShared: false,
    costTier: 'low',
    features: [
      'Zero egress fees',
      'S3-compatible API',
      'Global edge network',
      '$0.015/GB storage, free bandwidth',
    ],
    requiredFields: [
      {
        name: 'accountId',
        label: 'Account ID',
        type: 'text',
        description: 'Your Cloudflare account ID (32 hex characters)',
        required: true,
        placeholder: 'a1b2c3d4e5f6...',
        pattern: '^[a-f0-9]{32}$',
      },
      {
        name: 'accessKeyId',
        label: 'Access Key ID',
        type: 'text',
        description: 'R2 API token access key ID (32 characters)',
        required: true,
        placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        pattern: '^.{32}$',
      },
      {
        name: 'secretAccessKey',
        label: 'Secret Access Key',
        type: 'password',
        description: 'R2 API token secret access key (64 characters)',
        required: true,
        placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        pattern: '^.{64}$',
      },
      {
        name: 'bucketName',
        label: 'Bucket Name',
        type: 'text',
        description: 'Name of your R2 bucket',
        required: true,
        placeholder: 'trip-documents',
        pattern: '^[a-z0-9][a-z0-9-]*[a-z0-9]$',
      },
      {
        name: 'endpoint',
        label: 'Endpoint (Optional)',
        type: 'url',
        description: 'Custom R2 endpoint URL',
        required: false,
        placeholder: 'https://xxxxx.r2.cloudflarestorage.com',
        pattern: '\\.r2\\.cloudflarestorage\\.com$',
      },
    ],
  },

  [ApiProvider.BACKBLAZE_B2]: {
    provider: ApiProvider.BACKBLAZE_B2,
    displayName: 'Backblaze B2',
    description: 'Low-cost S3-compatible cloud storage',
    documentation: 'Get credentials from: Backblaze Dashboard → App Keys → Add a New Application Key',
    sourcePolicy: 'env-only',
    envVars: {
      keyId: 'BACKBLAZE_B2_KEY_ID',
      applicationKey: 'BACKBLAZE_B2_APPLICATION_KEY',
      bucketName: 'BACKBLAZE_B2_BUCKET_NAME',
      endpoint: 'BACKBLAZE_B2_ENDPOINT',
      region: 'BACKBLAZE_B2_REGION',
    },
    isShared: false,
    costTier: 'low',
    features: [
      'Lowest storage costs ($6/TB/month)',
      'Free egress up to 3x storage',
      'S3-compatible API',
      'Lifecycle rules for archival',
    ],
    requiredFields: [
      {
        name: 'keyId',
        label: 'Application Key ID',
        type: 'text',
        description: 'Your B2 application key ID',
        required: true,
        placeholder: 'xxxxxxxxxxxxxxxxxxxxxxx',
      },
      {
        name: 'applicationKey',
        label: 'Application Key',
        type: 'password',
        description: 'Your B2 application key (secret)',
        required: true,
        placeholder: 'K000xxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      },
      {
        name: 'bucketName',
        label: 'Bucket Name',
        type: 'text',
        description: 'Name of your B2 bucket',
        required: true,
        placeholder: 'trip-documents',
        pattern: '^[a-z0-9][a-z0-9-]*[a-z0-9]$',
      },
      {
        name: 'endpoint',
        label: 'S3 Endpoint',
        type: 'text',
        description: 'B2 S3-compatible endpoint (found in bucket details)',
        required: true,
        placeholder: 's3.us-west-004.backblazeb2.com',
        pattern: '^s3\\.[a-z]+-[a-z]+-\\d{3}\\.backblazeb2\\.com$',
      },
      {
        name: 'region',
        label: 'Region (Optional)',
        type: 'text',
        description: 'AWS region code (auto-detected from endpoint if not provided)',
        required: false,
        placeholder: 'us-west-004',
        pattern: '^[a-z]+-[a-z]+-\\d{3}$',
      },
    ],
  },

  [ApiProvider.UNSPLASH]: {
    provider: ApiProvider.UNSPLASH,
    displayName: 'Unsplash',
    description: 'Free stock photography API for high-quality images',
    documentation: 'Get credentials from: Unsplash Developers → Your Apps → Keys',
    sourcePolicy: 'env-only',
    envVars: {
      accessKey: 'UNSPLASH_ACCESS_KEY',
    },
    isShared: true,
    costTier: 'free',
    features: [
      'Free tier: 50 requests/hour',
      'High-quality stock photos',
      'Attribution required',
      'Production: Apply for higher limits',
    ],
    requiredFields: [
      {
        name: 'accessKey',
        label: 'Access Key',
        type: 'password',
        description: 'Your Unsplash API access key',
        required: true,
        placeholder: 'HP1rJ9SBFOfnGfZHu6BRrY-...',
      },
      {
        name: 'secretKey',
        label: 'Secret Key (Optional)',
        type: 'password',
        description: 'Your Unsplash API secret key (for OAuth flows)',
        required: false,
        placeholder: 'ViWsW4lFDLobw5Datex...',
      },
    ],
  },

  [ApiProvider.AERODATABOX]: {
    provider: ApiProvider.AERODATABOX,
    displayName: 'Aerodatabox (Flights)',
    description: 'Real-time flight data, airport search, and flight status via RapidAPI',
    documentation: 'Get credentials from: https://rapidapi.com/aerodatabox/api/aerodatabox → Subscribe → Copy API Key',
    sourcePolicy: 'env-only',
    envVars: {
      rapidApiKey: 'AERODATABOX_RAPIDAPI_KEY',
    },
    isShared: true,
    costTier: 'low',
    features: [
      'Flight search by number and date',
      'Airport autocomplete search',
      'Real-time flight status tracking',
      'Free tier: 100 requests/month',
    ],
    requiredFields: [
      {
        name: 'rapidApiKey',
        label: 'RapidAPI Key',
        type: 'password',
        description: 'Your RapidAPI key for Aerodatabox API access',
        required: true,
        placeholder: 'a1b2c3d4e5f6g7h8i9j0...',
      },
    ],
  },

  [ApiProvider.AMADEUS]: {
    provider: ApiProvider.AMADEUS,
    displayName: 'Amadeus',
    description: 'Industry-standard GDS travel APIs - flights, hotels, points of interest, and more',
    documentation: 'Get credentials from: https://developers.amadeus.com → My Self-Service Workspace → Create App',
    sourcePolicy: 'env-only',
    envVars: {
      clientId: 'AMADEUS_CLIENT_ID',
      clientSecret: 'AMADEUS_CLIENT_SECRET',
    },
    isShared: true,
    costTier: 'medium',
    features: [
      'Flight schedules & status',
      'Hotel search & booking',
      'Points of interest',
      'Travel recommendations',
      'Industry-standard GDS data',
    ],
    requiredFields: [
      {
        name: 'clientId',
        label: 'Client ID',
        type: 'text',
        description: 'Your Amadeus API Client ID (from app dashboard)',
        required: true,
        placeholder: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
      },
      {
        name: 'clientSecret',
        label: 'Client Secret',
        type: 'password',
        description: 'Your Amadeus API Client Secret',
        required: true,
        placeholder: 'Enter your client secret...',
      },
    ],
  },

  [ApiProvider.GOOGLE_PLACES]: {
    provider: ApiProvider.GOOGLE_PLACES,
    displayName: 'Google Places',
    description: 'Hotel search with photos, reviews, ratings, and contact info via Google Places API (New)',
    documentation: 'Get credentials from: https://console.cloud.google.com → APIs & Services → Credentials → Create API Key → Enable "Places API (New)"',
    sourcePolicy: 'env-only',
    envVars: {
      apiKey: 'GOOGLE_PLACES_API_KEY',
    },
    isShared: true,
    costTier: 'medium',
    features: [
      'Hotel search by location/name',
      'High-quality photos with attribution',
      'User reviews and ratings',
      'Contact information (phone, website)',
      '~$0.032/Text Search, ~$0.017/Place Details',
    ],
    requiredFields: [
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'password',
        description: 'Google Cloud API key with Places API (New) enabled',
        required: true,
        placeholder: 'AIzaSy...',
        pattern: '^AIza[0-9A-Za-z_-]{35}$',
      },
    ],
  },

  [ApiProvider.BOOKING_COM]: {
    provider: ApiProvider.BOOKING_COM,
    displayName: 'Booking.com',
    description: 'Rich hotel amenities, facilities, and policies via RapidAPI DataCrawler',
    documentation: 'Get credentials from: https://rapidapi.com/DataCrawler/api/booking-com15 → Subscribe → Copy API Key',
    sourcePolicy: 'env-only',
    envVars: {
      rapidApiKey: 'BOOKING_RAPIDAPI_KEY',
    },
    isShared: true,
    costTier: 'medium',
    features: [
      'Detailed amenities (WiFi, Pool, Spa, Gym)',
      'Hotel policies and check-in/out times',
      'Room types and availability',
      'Complements Google Places data',
    ],
    requiredFields: [
      {
        name: 'rapidApiKey',
        label: 'RapidAPI Key',
        type: 'password',
        description: 'Your RapidAPI key for Booking.com DataCrawler API',
        required: true,
        placeholder: 'a1b2c3d4e5f6g7h8i9j0...',
      },
    ],
  },
  [ApiProvider.OPEN_AI]: {
    provider: ApiProvider.OPEN_AI,
    displayName: 'OpenAI',
    description: 'GPT-4o Vision for OCR document extraction (booking confirmations, passports)',
    documentation: 'Get credentials from: https://platform.openai.com/api-keys',
    sourcePolicy: 'env-only',
    envVars: {
      apiKey: 'OPENAI_API_KEY',
    },
    isShared: true,
    costTier: 'medium',
    features: [
      'PDF booking confirmation extraction',
      'Passport MRZ scanning',
      'Multi-document type detection',
      'Structured data output with Zod validation',
    ],
    requiredFields: [
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'password',
        description: 'Your OpenAI API key',
        required: true,
        placeholder: 'sk-...',
        pattern: '^sk-',
      },
    ],
  },
}
