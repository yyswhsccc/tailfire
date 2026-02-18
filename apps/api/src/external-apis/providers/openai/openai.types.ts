/**
 * OpenAI Provider Types
 *
 * Type definitions for OpenAI Vision API integration.
 */

/**
 * Input image for OpenAI Vision API
 */
export interface OcrImageInput {
  /** Base64-encoded image data (without data URL prefix) */
  base64: string
  /** MIME type of the image */
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
}

/**
 * OpenAI Vision API response
 */
export interface OpenAiVisionResponse {
  /** Parsed JSON content from the model */
  content: Record<string, unknown>
  /** Token usage */
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  /** Model used */
  model: string
}

/**
 * OpenAI credentials (resolved from Doppler)
 */
export interface OpenAiCredentials {
  apiKey: string
}
