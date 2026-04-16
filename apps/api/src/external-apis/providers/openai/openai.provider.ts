/**
 * OpenAI Provider
 *
 * Wraps the OpenAI SDK for Vision API calls.
 * Does NOT extend BaseExternalApi — OpenAI SDK handles its own HTTP/retries.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ApiProvider } from '@tailfire/shared-types'
import { CredentialResolverService } from '../../../api-credentials/credential-resolver.service'
import type { OcrImageInput, OpenAiVisionResponse, OpenAiCredentials } from './openai.types'
import OpenAI from 'openai'

@Injectable()
export class OpenAiProvider implements OnModuleInit {
  private readonly logger = new Logger(OpenAiProvider.name)
  private client: OpenAI | null = null

  constructor(
    private readonly credentialResolver: CredentialResolverService,
  ) {}

  async onModuleInit() {
    if (this.credentialResolver.isAvailable(ApiProvider.OPEN_AI)) {
      this.logger.log('OpenAI credentials available')
    } else {
      this.logger.warn('OpenAI credentials not configured — OCR features will be unavailable')
    }
  }

  /**
   * Check if the OpenAI provider is available
   */
  isAvailable(): boolean {
    return this.credentialResolver.isAvailable(ApiProvider.OPEN_AI)
  }

  /**
   * Analyze images using GPT-4o Vision
   *
   * @param images - Array of base64-encoded images
   * @param systemPrompt - System-level instructions
   * @param userPrompt - User-level prompt/question
   * @param signal - Optional AbortSignal for timeout
   * @returns Parsed JSON response with token usage
   */
  async analyzeImages(
    images: OcrImageInput[],
    systemPrompt: string,
    userPrompt: string,
    signal?: AbortSignal,
  ): Promise<OpenAiVisionResponse> {
    const client = await this.getClient()

    // Build content array with images and text
    const imageContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = images.map((img) => ({
      type: 'image_url' as const,
      image_url: {
        url: `data:${img.mimeType};base64,${img.base64}`,
        detail: 'high' as const,
      },
    }))

    const response = await client.chat.completions.create(
      {
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              ...imageContent,
              { type: 'text', text: userPrompt },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 4096,
      },
      { signal },
    )

    const rawContent = response.choices[0]?.message?.content
    if (!rawContent) {
      throw new Error('OpenAI returned empty response')
    }

    let content: Record<string, unknown>
    try {
      // Strip markdown code fences that OpenAI sometimes wraps around JSON
      let jsonStr = rawContent.trim()
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
      }
      content = JSON.parse(jsonStr)
    } catch {
      this.logger.error({ message: 'Failed to parse OpenAI JSON response', rawContent: rawContent.substring(0, 500) })
      throw new Error('OpenAI returned invalid JSON')
    }

    return {
      content,
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      },
      model: response.model,
    }
  }

  /**
   * Get or create the OpenAI client with resolved credentials
   */
  private async getClient(): Promise<OpenAI> {
    if (this.client) return this.client

    const creds = (await this.credentialResolver.resolve(ApiProvider.OPEN_AI)) as unknown as OpenAiCredentials
    this.client = new OpenAI({ apiKey: creds.apiKey })
    return this.client
  }
}
