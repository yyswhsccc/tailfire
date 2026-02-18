export { OcrModule } from './ocr.module'
export { OcrService } from './ocr.service'
export type {
  OcrDocumentType,
  OcrExtractionContext,
  OcrExtractionResult,
  OcrFlightExtraction,
  OcrLodgingExtraction,
  OcrCruiseExtraction,
  OcrPassportExtraction,
  OcrTransportationExtraction,
  OcrDiningExtraction,
  OcrTraveler,
} from './ocr.types'
export { OCR_DOCUMENT_TYPES, validateMrzCheckDigit, validateMrzLine2 } from './ocr.types'
