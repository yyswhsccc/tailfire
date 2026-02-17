/**
 * OCR Module
 *
 * Reusable OCR extraction module using OpenAI GPT-4o Vision.
 * Can be imported by any module needing document extraction.
 */

import { Module } from '@nestjs/common'
import { OcrService } from './ocr.service'

@Module({
  providers: [OcrService],
  exports: [OcrService],
})
export class OcrModule {}
