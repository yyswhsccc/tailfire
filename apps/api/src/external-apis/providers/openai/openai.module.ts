/**
 * OpenAI Provider Module
 *
 * NestJS module for OpenAI GPT-4o Vision API integration.
 * Used for OCR document extraction (PDF booking confirmations, passports, etc.).
 *
 * Note: Does not use HttpModule — OpenAI SDK handles its own HTTP client.
 */

import { Module } from '@nestjs/common'
import { ApiCredentialsModule } from '../../../api-credentials/api-credentials.module'
import { OpenAiProvider } from './openai.provider'

@Module({
  imports: [ApiCredentialsModule],
  providers: [OpenAiProvider],
  exports: [OpenAiProvider],
})
export class OpenAiModule {}
