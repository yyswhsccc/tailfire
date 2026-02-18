/**
 * OCR Import Internal Types
 *
 * Types used internally by the OcrImportService.
 */

export interface ContactMatchResult {
  travelerIndex: number
  firstName: string
  lastName: string
  matchedContactId: string | null
  matchedContactName: string | null
  isNewContact: boolean
  confidence: number
}
