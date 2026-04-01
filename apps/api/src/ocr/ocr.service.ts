/**
 * OCR Service
 *
 * Centralized OCR extraction using OpenAI GPT-4o Vision.
 * Converts PDFs to images, detects document type, extracts structured data.
 */

import { Injectable, Logger } from '@nestjs/common'
import { OpenAiProvider } from '../external-apis/providers/openai'
import type { OcrImageInput } from '../external-apis/providers/openai'
import {
  DOCUMENT_DETECTION_SYSTEM_PROMPT,
  DOCUMENT_DETECTION_USER_PROMPT,
} from './prompts/base.prompt'
import { FLIGHT_EXTRACTION_SYSTEM_PROMPT, FLIGHT_EXTRACTION_USER_PROMPT } from './prompts/flight.prompt'
import { LODGING_EXTRACTION_SYSTEM_PROMPT, LODGING_EXTRACTION_USER_PROMPT } from './prompts/lodging.prompt'
import { CRUISE_EXTRACTION_SYSTEM_PROMPT, CRUISE_EXTRACTION_USER_PROMPT } from './prompts/cruise.prompt'
import { PASSPORT_EXTRACTION_SYSTEM_PROMPT, PASSPORT_EXTRACTION_USER_PROMPT } from './prompts/passport.prompt'
import { TRANSPORTATION_EXTRACTION_SYSTEM_PROMPT, TRANSPORTATION_EXTRACTION_USER_PROMPT } from './prompts/transportation.prompt'
import { DINING_EXTRACTION_SYSTEM_PROMPT, DINING_EXTRACTION_USER_PROMPT } from './prompts/dining.prompt'
import { PACKAGE_EXTRACTION_SYSTEM_PROMPT, PACKAGE_EXTRACTION_USER_PROMPT } from './prompts/package.prompt'
import { EXTRACTION_GUARDRAILS } from './prompts/guardrails.prompt'
import type {
  OcrDocumentType,
  OcrExtractionContext,
  OcrExtractionResult,
  OcrFlightExtraction,
  OcrLodgingExtraction,
  OcrCruiseExtraction,
  OcrPassportExtraction,
  OcrTransportationExtraction,
  OcrDiningExtraction,
  OcrPackageExtraction,
  OcrTraveler,
} from './ocr.types'
import {
  EXTRACTION_SCHEMAS,
  ocrDetectionSchema,
  validateMrzLine2,
} from './ocr.types'

/** Maximum number of PDF pages to process */
const MAX_PAGES = 5

/** Prompt map by document type — guardrails appended to all booking prompts */
const PROMPTS: Record<OcrDocumentType, { system: string; user: string }> = {
  flight_confirmation: { system: FLIGHT_EXTRACTION_SYSTEM_PROMPT + EXTRACTION_GUARDRAILS, user: FLIGHT_EXTRACTION_USER_PROMPT },
  hotel_confirmation: { system: LODGING_EXTRACTION_SYSTEM_PROMPT + EXTRACTION_GUARDRAILS, user: LODGING_EXTRACTION_USER_PROMPT },
  cruise_confirmation: { system: CRUISE_EXTRACTION_SYSTEM_PROMPT + EXTRACTION_GUARDRAILS, user: CRUISE_EXTRACTION_USER_PROMPT },
  passport: { system: PASSPORT_EXTRACTION_SYSTEM_PROMPT, user: PASSPORT_EXTRACTION_USER_PROMPT },
  transportation_confirmation: { system: TRANSPORTATION_EXTRACTION_SYSTEM_PROMPT + EXTRACTION_GUARDRAILS, user: TRANSPORTATION_EXTRACTION_USER_PROMPT },
  dining_confirmation: { system: DINING_EXTRACTION_SYSTEM_PROMPT + EXTRACTION_GUARDRAILS, user: DINING_EXTRACTION_USER_PROMPT },
  package_confirmation: { system: PACKAGE_EXTRACTION_SYSTEM_PROMPT + EXTRACTION_GUARDRAILS, user: PACKAGE_EXTRACTION_USER_PROMPT },
  general_travel_document: { system: FLIGHT_EXTRACTION_SYSTEM_PROMPT + EXTRACTION_GUARDRAILS, user: FLIGHT_EXTRACTION_USER_PROMPT },
}

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name)

  constructor(private readonly openAiProvider: OpenAiProvider) {}

  /**
   * Extract structured data from a PDF buffer
   */
  async extractFromPdf(
    pdfBuffer: Buffer,
    context: OcrExtractionContext = {},
    signal?: AbortSignal,
  ): Promise<OcrExtractionResult> {
    const startTime = Date.now()

    // 1. Convert PDF to images
    const images = await this.pdfToImages(pdfBuffer)
    this.logger.log(`Converted PDF to ${images.length} page image(s)`)

    // 2. Detect or use specified document type
    let documentType = context.documentType
    let detectionConfidence = 1.0
    let detectedSupplierName: string | null | undefined = null

    if (!documentType) {
      const detection = await this.detectDocumentType(images[0] ? [images[0]] : images, signal)
      documentType = detection.documentType
      detectionConfidence = detection.confidence
      detectedSupplierName = detection.supplierName
      this.logger.log(`Auto-detected document type: ${documentType} (confidence: ${detectionConfidence}, supplier: ${detectedSupplierName ?? 'unknown'})`)
    }

    // 3. Extract structured data using type-specific prompt
    const result = await this.extractByType(documentType, images, signal, context.extractionHints)

    const processingTimeMs = Date.now() - startTime
    this.logger.log(`Extraction complete in ${processingTimeMs}ms — type: ${documentType}`)

    // Detection-level supplier wins if confidence is reasonable (>0.6); otherwise fall back to extraction-level
    const supplierName = (detectionConfidence > 0.6 && detectedSupplierName)
      ? detectedSupplierName
      : (result.supplierName || detectedSupplierName || null)

    return {
      ...result,
      documentType,
      confidence: Math.min(result.confidence, detectionConfidence),
      supplierName,
    }
  }

  /**
   * Extract structured data from pre-converted image(s)
   */
  async extractFromImages(
    images: OcrImageInput[],
    context: OcrExtractionContext = {},
    signal?: AbortSignal,
  ): Promise<OcrExtractionResult> {
    let documentType = context.documentType
    let detectionConfidence = 1.0
    let detectedSupplierName: string | null | undefined = null

    if (!documentType) {
      const detection = await this.detectDocumentType(images.slice(0, 1), signal)
      documentType = detection.documentType
      detectionConfidence = detection.confidence
      detectedSupplierName = detection.supplierName
    }

    const result = await this.extractByType(documentType, images, signal, context.extractionHints)

    const supplierName = (detectionConfidence > 0.6 && detectedSupplierName)
      ? detectedSupplierName
      : (result.supplierName || detectedSupplierName || null)

    return {
      ...result,
      documentType,
      confidence: Math.min(result.confidence, detectionConfidence),
      supplierName,
    }
  }

  /**
   * Check if the OCR service is available
   */
  isAvailable(): boolean {
    return this.openAiProvider.isAvailable()
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Convert PDF buffer to base64-encoded PNG images
   */
  private async pdfToImages(pdfBuffer: Buffer): Promise<OcrImageInput[]> {
    // Dynamic import for pdf-to-img (ESM module)
    const { pdf } = await import('pdf-to-img')
    const images: OcrImageInput[] = []
    let pageCount = 0

    for await (const page of await pdf(pdfBuffer, { scale: 2 })) {
      if (pageCount >= MAX_PAGES) {
        this.logger.warn(`PDF exceeds ${MAX_PAGES} pages — truncating`)
        break
      }
      images.push({
        base64: Buffer.from(page).toString('base64'),
        mimeType: 'image/png',
      })
      pageCount++
    }

    if (images.length === 0) {
      throw new Error('PDF contains no pages or could not be converted to images')
    }

    return images
  }

  /**
   * Auto-detect document type from image(s)
   */
  private async detectDocumentType(
    images: OcrImageInput[],
    signal?: AbortSignal,
  ): Promise<{ documentType: OcrDocumentType; confidence: number; supplierName?: string | null }> {
    const response = await this.openAiProvider.analyzeImages(
      images,
      DOCUMENT_DETECTION_SYSTEM_PROMPT,
      DOCUMENT_DETECTION_USER_PROMPT,
      signal,
    )

    const parsed = ocrDetectionSchema.safeParse(response.content)
    if (!parsed.success) {
      this.logger.warn({ message: 'Document detection failed validation', errors: parsed.error.errors })
      return { documentType: 'general_travel_document', confidence: 0.3 }
    }

    return parsed.data
  }

  /**
   * Extract data using type-specific prompts and validate with Zod
   */
  private async extractByType(
    documentType: OcrDocumentType,
    images: OcrImageInput[],
    signal?: AbortSignal,
    extractionHints?: string,
  ): Promise<OcrExtractionResult> {
    const prompts = PROMPTS[documentType]
    const schema = EXTRACTION_SCHEMAS[documentType]

    // Prepend supplier-specific hints to user prompt if available
    const userPrompt = extractionHints
      ? `SUPPLIER-SPECIFIC HINTS:\n${extractionHints}\n\n${prompts.user}`
      : prompts.user

    const response = await this.openAiProvider.analyzeImages(
      images,
      prompts.system,
      userPrompt,
      signal,
    )

    // Validate with Zod (partial results accepted)
    const parsed = schema.safeParse(response.content)
    const rawData = parsed.success ? parsed.data : response.content

    // Build normalized result
    const result = this.buildExtractionResult(documentType, rawData, response.content)

    if (!parsed.success) {
      this.logger.warn({
        message: 'Extraction validation had errors — using raw data',
        documentType,
        errors: parsed.error.errors.slice(0, 5),
      })
    }

    // For passports, validate MRZ check digits
    if (documentType === 'passport' && result.passport?.mrzLine2) {
      const mrzValidation = validateMrzLine2(result.passport.mrzLine2)
      if (!mrzValidation.valid) {
        this.logger.warn({
          message: 'MRZ check digit validation failed',
          passportNumberValid: mrzValidation.passportNumberValid,
          dobValid: mrzValidation.dobValid,
          expiryValid: mrzValidation.expiryValid,
        })
      }
    }

    // Post-extraction guardrail validation (auto-correct + log warnings)
    this.validateAndCorrectExtraction(result)

    result.rawResponse = response.content
    result.usage = {
      promptTokens: response.usage.promptTokens,
      completionTokens: response.usage.completionTokens,
    }
    result.model = response.model

    return result
  }

  /**
   * Build a normalized OcrExtractionResult from the raw parsed data
   */
  private buildExtractionResult(
    documentType: OcrDocumentType,
    data: Record<string, unknown>,
    _rawContent: Record<string, unknown>,
  ): OcrExtractionResult {
    const confidence = typeof data.confidence === 'number' ? data.confidence : 0.5
    const travelers = this.extractTravelers(data)
    const booking = this.extractBookingInfo(data)

    const result: OcrExtractionResult = {
      documentType,
      confidence,
      travelers,
      booking,
    }

    switch (documentType) {
      case 'flight_confirmation':
        result.flight = this.mapFlightExtraction(data)
        result.supplierName = result.flight.airline || null
        break
      case 'hotel_confirmation':
        result.lodging = this.mapLodgingExtraction(data)
        result.supplierName = result.lodging.propertyName || null
        break
      case 'cruise_confirmation':
        result.cruise = this.mapCruiseExtraction(data)
        result.supplierName = result.cruise.cruiseLineName || null
        break
      case 'passport':
        result.passport = this.mapPassportExtraction(data)
        break
      case 'transportation_confirmation':
        result.transportation = this.mapTransportationExtraction(data)
        result.supplierName = result.transportation.companyName || null
        break
      case 'dining_confirmation':
        result.dining = this.mapDiningExtraction(data)
        result.supplierName = result.dining.restaurantName || null
        break
      case 'package_confirmation':
        result.package = this.mapPackageExtraction(data)
        result.supplierName = result.package.supplierName || null
        break
    }

    return result
  }

  private extractTravelers(data: Record<string, unknown>): OcrTraveler[] {
    const travelers = data.travelers
    if (!Array.isArray(travelers)) return []
    return travelers
      .filter((t): t is Record<string, unknown> => typeof t === 'object' && t !== null)
      .map((t) => ({
        firstName: String(t.firstName || ''),
        lastName: String(t.lastName || ''),
        middleName: t.middleName ? String(t.middleName) : null,
        prefix: t.prefix ? String(t.prefix) : null,
        dateOfBirth: t.dateOfBirth ? String(t.dateOfBirth) : null,
        gender: t.gender ? String(t.gender) : null,
        nationality: t.nationality ? String(t.nationality) : null,
        passportNumber: t.passportNumber ? String(t.passportNumber) : null,
        email: t.email ? String(t.email) : null,
        phone: t.phone ? String(t.phone) : null,
      }))
      .filter((t) => t.firstName && t.lastName)
  }

  private extractBookingInfo(data: Record<string, unknown>) {
    const confirmationNumber = data.confirmationNumber ? String(data.confirmationNumber) : null
    const totalPrice = typeof data.totalPrice === 'number' ? Math.round(data.totalPrice * 100) : null
    const currency = data.currency ? String(data.currency) : null
    const bookingDate = data.bookingDate ? String(data.bookingDate) : null

    if (!confirmationNumber && !totalPrice) return null

    return { confirmationNumber, totalPriceCents: totalPrice, currency, bookingDate }
  }

  private mapFlightExtraction(data: Record<string, unknown>): OcrFlightExtraction {
    const segments = Array.isArray(data.segments) ? data.segments : []
    return {
      confirmationNumber: data.confirmationNumber ? String(data.confirmationNumber) : null,
      airline: data.airline ? String(data.airline) : null,
      segments: segments.map((s: Record<string, unknown>, i: number) => ({
        segmentOrder: typeof s.segmentOrder === 'number' ? s.segmentOrder : i + 1,
        airline: s.airline ? String(s.airline) : null,
        flightNumber: s.flightNumber ? String(s.flightNumber) : null,
        departureAirportCode: s.departureAirportCode ? String(s.departureAirportCode) : null,
        departureAirportName: s.departureAirportName ? String(s.departureAirportName) : null,
        departureDate: s.departureDate ? String(s.departureDate) : null,
        departureTime: s.departureTime ? String(s.departureTime) : null,
        departureTerminal: s.departureTerminal ? String(s.departureTerminal) : null,
        arrivalAirportCode: s.arrivalAirportCode ? String(s.arrivalAirportCode) : null,
        arrivalAirportName: s.arrivalAirportName ? String(s.arrivalAirportName) : null,
        arrivalDate: s.arrivalDate ? String(s.arrivalDate) : null,
        arrivalTime: s.arrivalTime ? String(s.arrivalTime) : null,
        arrivalTerminal: s.arrivalTerminal ? String(s.arrivalTerminal) : null,
        cabinClass: s.cabinClass ? String(s.cabinClass) : null,
        seatAssignment: s.seatAssignment ? String(s.seatAssignment) : null,
      })),
      totalPriceCents: typeof data.totalPrice === 'number' ? Math.round(data.totalPrice * 100) : null,
      currency: data.currency ? String(data.currency) : null,
      bookingDate: data.bookingDate ? String(data.bookingDate) : null,
      termsAndConditions: data.termsAndConditions ? String(data.termsAndConditions) : null,
      cancellationPolicy: data.cancellationPolicy ? String(data.cancellationPolicy) : null,
    }
  }

  private mapLodgingExtraction(data: Record<string, unknown>): OcrLodgingExtraction {
    return {
      confirmationNumber: data.confirmationNumber ? String(data.confirmationNumber) : null,
      propertyName: data.propertyName ? String(data.propertyName) : null,
      address: data.address ? String(data.address) : null,
      phone: data.phone ? String(data.phone) : null,
      website: data.website ? String(data.website) : null,
      checkInDate: data.checkInDate ? String(data.checkInDate) : null,
      checkInTime: data.checkInTime ? String(data.checkInTime) : null,
      checkOutDate: data.checkOutDate ? String(data.checkOutDate) : null,
      checkOutTime: data.checkOutTime ? String(data.checkOutTime) : null,
      roomType: data.roomType ? String(data.roomType) : null,
      roomCount: typeof data.roomCount === 'number' ? data.roomCount : null,
      amenities: Array.isArray(data.amenities) ? data.amenities.map(String) : null,
      specialRequests: data.specialRequests ? String(data.specialRequests) : null,
      totalPriceCents: typeof data.totalPrice === 'number' ? Math.round(data.totalPrice * 100) : null,
      currency: data.currency ? String(data.currency) : null,
      bookingDate: data.bookingDate ? String(data.bookingDate) : null,
      termsAndConditions: data.termsAndConditions ? String(data.termsAndConditions) : null,
      cancellationPolicy: data.cancellationPolicy ? String(data.cancellationPolicy) : null,
    }
  }

  private mapCruiseExtraction(data: Record<string, unknown>): OcrCruiseExtraction {
    return {
      confirmationNumber: data.confirmationNumber ? String(data.confirmationNumber) : null,
      cruiseLineName: data.cruiseLineName ? String(data.cruiseLineName) : null,
      shipName: data.shipName ? String(data.shipName) : null,
      voyageCode: data.voyageCode ? String(data.voyageCode) : null,
      departurePort: data.departurePort ? String(data.departurePort) : null,
      departureDate: data.departureDate ? String(data.departureDate) : null,
      departureTime: data.departureTime ? String(data.departureTime) : null,
      arrivalPort: data.arrivalPort ? String(data.arrivalPort) : null,
      arrivalDate: data.arrivalDate ? String(data.arrivalDate) : null,
      arrivalTime: data.arrivalTime ? String(data.arrivalTime) : null,
      cabinCategory: data.cabinCategory ? String(data.cabinCategory) : null,
      cabinNumber: data.cabinNumber ? String(data.cabinNumber) : null,
      cabinDeck: data.cabinDeck ? String(data.cabinDeck) : null,
      nights: typeof data.nights === 'number' ? data.nights : null,
      totalPriceCents: typeof data.totalPrice === 'number' ? Math.round(data.totalPrice * 100) : null,
      netPriceCents: typeof data.netPrice === 'number' ? Math.round(data.netPrice * 100) : null,
      commissionCents: typeof data.commissionAmount === 'number' ? Math.round(data.commissionAmount * 100) : null,
      currency: data.currency ? String(data.currency) : null,
      termsAndConditions: data.termsAndConditions ? String(data.termsAndConditions) : null,
      cancellationPolicy: data.cancellationPolicy ? String(data.cancellationPolicy) : null,
    }
  }

  private mapPassportExtraction(data: Record<string, unknown>): OcrPassportExtraction {
    return {
      mrzLine1: data.mrzLine1 ? String(data.mrzLine1) : null,
      mrzLine2: data.mrzLine2 ? String(data.mrzLine2) : null,
      firstName: data.firstName ? String(data.firstName) : null,
      lastName: data.lastName ? String(data.lastName) : null,
      middleName: data.middleName ? String(data.middleName) : null,
      dateOfBirth: data.dateOfBirth ? String(data.dateOfBirth) : null,
      gender: data.gender ? String(data.gender) : null,
      nationality: data.nationality ? String(data.nationality) : null,
      passportNumber: data.passportNumber ? String(data.passportNumber) : null,
      issuingCountry: data.issuingCountry ? String(data.issuingCountry) : null,
      expiryDate: data.expiryDate ? String(data.expiryDate) : null,
      placeOfBirth: data.placeOfBirth ? String(data.placeOfBirth) : null,
    }
  }

  private mapTransportationExtraction(data: Record<string, unknown>): OcrTransportationExtraction {
    return {
      confirmationNumber: data.confirmationNumber ? String(data.confirmationNumber) : null,
      transportationType: data.transportationType ? String(data.transportationType) : null,
      companyName: data.companyName ? String(data.companyName) : null,
      pickupLocation: data.pickupLocation ? String(data.pickupLocation) : null,
      pickupDate: data.pickupDate ? String(data.pickupDate) : null,
      pickupTime: data.pickupTime ? String(data.pickupTime) : null,
      dropoffLocation: data.dropoffLocation ? String(data.dropoffLocation) : null,
      dropoffDate: data.dropoffDate ? String(data.dropoffDate) : null,
      dropoffTime: data.dropoffTime ? String(data.dropoffTime) : null,
      vehicleType: data.vehicleType ? String(data.vehicleType) : null,
      totalPriceCents: typeof data.totalPrice === 'number' ? Math.round(data.totalPrice * 100) : null,
      currency: data.currency ? String(data.currency) : null,
      termsAndConditions: data.termsAndConditions ? String(data.termsAndConditions) : null,
      cancellationPolicy: data.cancellationPolicy ? String(data.cancellationPolicy) : null,
    }
  }

  private mapDiningExtraction(data: Record<string, unknown>): OcrDiningExtraction {
    return {
      confirmationNumber: data.confirmationNumber ? String(data.confirmationNumber) : null,
      restaurantName: data.restaurantName ? String(data.restaurantName) : null,
      address: data.address ? String(data.address) : null,
      phone: data.phone ? String(data.phone) : null,
      reservationDate: data.reservationDate ? String(data.reservationDate) : null,
      reservationTime: data.reservationTime ? String(data.reservationTime) : null,
      partySize: typeof data.partySize === 'number' ? data.partySize : null,
      specialRequests: data.specialRequests ? String(data.specialRequests) : null,
      totalPriceCents: typeof data.totalPrice === 'number' ? Math.round(data.totalPrice * 100) : null,
      currency: data.currency ? String(data.currency) : null,
      termsAndConditions: data.termsAndConditions ? String(data.termsAndConditions) : null,
      cancellationPolicy: data.cancellationPolicy ? String(data.cancellationPolicy) : null,
    }
  }

  private mapPackageExtraction(data: Record<string, unknown>): OcrPackageExtraction {
    const components = Array.isArray(data.components) ? data.components : []
    const perPersonPricing = Array.isArray(data.perPersonPricing) ? data.perPersonPricing : []

    return {
      supplierName: data.supplierName ? String(data.supplierName) : null,
      bookingReference: data.bookingReference ? String(data.bookingReference) : null,
      bookingDate: data.bookingDate ? String(data.bookingDate) : null,
      currency: data.currency ? String(data.currency) : null,
      totalPrice: typeof data.totalPrice === 'number' ? data.totalPrice : null,
      commissionRate: typeof data.commissionRate === 'number' ? data.commissionRate : null,
      commissionAmount: typeof data.commissionAmount === 'number' ? data.commissionAmount : null,
      taxesAndFees: typeof data.taxesAndFees === 'number' ? data.taxesAndFees : null,
      addOns: typeof data.addOns === 'number' ? data.addOns : null,
      remarks: data.remarks ? String(data.remarks) : null,
      payments: Array.isArray(data.payments)
        ? data.payments
            .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
            .map((p) => ({
              paymentName: p.paymentName ? String(p.paymentName) : 'Payment',
              amount: typeof p.amount === 'number' ? p.amount : 0,
              date: p.date ? String(p.date) : null,
              method: p.method ? String(p.method) : null,
              referenceNumber: p.referenceNumber ? String(p.referenceNumber) : null,
            }))
            .filter((p) => p.amount > 0)
        : [],
      components: components
        .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
        .map((c) => ({
          componentType: (['flight', 'lodging', 'transportation', 'dining', 'other'].includes(String(c.componentType))
            ? String(c.componentType)
            : 'other') as OcrPackageExtraction['components'][number]['componentType'],
          name: c.name ? String(c.name) : null,
          description: c.description ? String(c.description) : null,
          flight: c.flight && typeof c.flight === 'object' ? this.mapComponentFlight(c.flight as Record<string, unknown>) : null,
          lodging: c.lodging && typeof c.lodging === 'object' ? this.mapComponentLodging(c.lodging as Record<string, unknown>) : null,
          transportation: c.transportation && typeof c.transportation === 'object' ? this.mapComponentTransportation(c.transportation as Record<string, unknown>) : null,
        })),
      perPersonPricing: perPersonPricing
        .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
        .map((p) => ({
          travelerIndex: typeof p.travelerIndex === 'number' ? p.travelerIndex : 0,
          label: p.label ? String(p.label) : '',
          basePriceCents: typeof p.basePriceCents === 'number' ? p.basePriceCents : 0,
          taxesCents: typeof p.taxesCents === 'number' ? p.taxesCents : 0,
          totalPriceCents: typeof p.totalPriceCents === 'number' ? p.totalPriceCents : 0,
        })),
      termsAndConditions: data.termsAndConditions ? String(data.termsAndConditions) : null,
      cancellationPolicy: data.cancellationPolicy ? String(data.cancellationPolicy) : null,
    }
  }

  private mapComponentFlight(f: Record<string, unknown>) {
    return {
      flightNumber: f.flightNumber ? String(f.flightNumber) : null,
      departureAirportCode: f.departureAirportCode ? String(f.departureAirportCode) : null,
      arrivalAirportCode: f.arrivalAirportCode ? String(f.arrivalAirportCode) : null,
      departureDate: f.departureDate ? String(f.departureDate) : null,
      departureTime: f.departureTime ? String(f.departureTime) : null,
      arrivalDate: f.arrivalDate ? String(f.arrivalDate) : null,
      arrivalTime: f.arrivalTime ? String(f.arrivalTime) : null,
      cabinClass: f.cabinClass ? String(f.cabinClass) : null,
      confirmationNumber: f.confirmationNumber ? String(f.confirmationNumber) : null,
    }
  }

  private mapComponentLodging(l: Record<string, unknown>) {
    return {
      propertyName: l.propertyName ? String(l.propertyName) : null,
      roomType: l.roomType ? String(l.roomType) : null,
      checkInDate: l.checkInDate ? String(l.checkInDate) : null,
      checkOutDate: l.checkOutDate ? String(l.checkOutDate) : null,
      address: l.address ? String(l.address) : null,
    }
  }

  private mapComponentTransportation(t: Record<string, unknown>) {
    return {
      transportationType: t.transportationType ? String(t.transportationType) : null,
      pickupLocation: t.pickupLocation ? String(t.pickupLocation) : null,
      dropoffLocation: t.dropoffLocation ? String(t.dropoffLocation) : null,
      pickupDate: t.pickupDate ? String(t.pickupDate) : null,
      dropoffDate: t.dropoffDate ? String(t.dropoffDate) : null,
    }
  }

  // ==========================================================================
  // Post-Extraction Guardrail Validation
  // ==========================================================================

  /**
   * Auto-correct obvious extraction mistakes and log warnings.
   * Mutates the result in place.
   */
  private validateAndCorrectExtraction(result: OcrExtractionResult): void {
    // --- Pricing guardrails ---
    const pricing = this.extractPricingFields(result)
    if (pricing) {
      // Gross must be >= Net — swap if reversed
      if (pricing.total !== null && pricing.net !== null && pricing.net > pricing.total) {
        this.logger.warn({
          message: 'Guardrail: net > gross — swapping prices',
          documentType: result.documentType,
          originalTotal: pricing.total,
          originalNet: pricing.net,
        })
        this.swapPricing(result, pricing.net, pricing.total)
      }

      // Prices must be positive
      if (pricing.total !== null && pricing.total < 0) {
        this.logger.warn({
          message: 'Guardrail: negative total price — setting to null',
          documentType: result.documentType,
          value: pricing.total,
        })
        this.setPricingField(result, 'total', null)
      }
      if (pricing.net !== null && pricing.net < 0) {
        this.logger.warn({
          message: 'Guardrail: negative net price — setting to null',
          documentType: result.documentType,
          value: pricing.net,
        })
        this.setPricingField(result, 'net', null)
      }
    }

    // --- Date guardrails ---
    const dates = this.extractDateFields(result)
    if (dates.start && dates.end) {
      const startMs = new Date(dates.start).getTime()
      const endMs = new Date(dates.end).getTime()
      if (!isNaN(startMs) && !isNaN(endMs) && endMs < startMs) {
        this.logger.warn({
          message: 'Guardrail: end date before start date — swapping',
          documentType: result.documentType,
          start: dates.start,
          end: dates.end,
        })
        this.swapDates(result)
      }
    }

    // --- Nights vs date range consistency ---
    if (dates.start && dates.end) {
      const nights = this.extractNights(result)
      if (nights !== null) {
        const startMs = new Date(dates.start).getTime()
        const endMs = new Date(dates.end).getTime()
        if (!isNaN(startMs) && !isNaN(endMs)) {
          const calculatedNights = Math.round((endMs - startMs) / (1000 * 60 * 60 * 24))
          if (calculatedNights > 0 && nights !== calculatedNights) {
            this.logger.warn({
              message: 'Guardrail: nights mismatch — trusting dates',
              documentType: result.documentType,
              extractedNights: nights,
              calculatedNights,
            })
            this.setNights(result, calculatedNights)
          }
        }
      }
    }

    // --- Traveler DOB in the past ---
    const now = new Date()
    for (const traveler of result.travelers) {
      if (traveler.dateOfBirth) {
        const dobMs = new Date(traveler.dateOfBirth).getTime()
        if (!isNaN(dobMs) && dobMs > now.getTime()) {
          this.logger.warn({
            message: 'Guardrail: DOB is in the future — clearing',
            name: `${traveler.firstName} ${traveler.lastName}`,
            dob: traveler.dateOfBirth,
          })
          traveler.dateOfBirth = null
        }
      }
    }

    // --- Currency format ---
    const currency = this.extractCurrency(result)
    if (currency && !/^[A-Z]{3}$/.test(currency)) {
      this.logger.warn({
        message: 'Guardrail: invalid currency format — clearing',
        documentType: result.documentType,
        currency,
      })
      this.setCurrency(result, null)
    }
  }

  /** Extract total and net price (in cents) from the type-specific extraction */
  private extractPricingFields(result: OcrExtractionResult): { total: number | null; net: number | null } | null {
    if (result.flight) return { total: result.flight.totalPriceCents ?? null, net: null }
    if (result.lodging) return { total: result.lodging.totalPriceCents ?? null, net: null }
    if (result.cruise) return { total: result.cruise.totalPriceCents ?? null, net: result.cruise.netPriceCents ?? null }
    if (result.transportation) return { total: result.transportation.totalPriceCents ?? null, net: null }
    if (result.dining) return { total: result.dining.totalPriceCents ?? null, net: null }
    if (result.package) return { total: result.package.totalPrice ? Math.round(result.package.totalPrice * 100) : null, net: null }
    return null
  }

  /** Swap gross/net pricing on the type-specific extraction */
  private swapPricing(result: OcrExtractionResult, newTotal: number, newNet: number): void {
    if (result.cruise) {
      result.cruise.totalPriceCents = newTotal
      result.cruise.netPriceCents = newNet
    }
  }

  /** Set a pricing field to a value */
  private setPricingField(result: OcrExtractionResult, field: 'total' | 'net', value: number | null): void {
    const target = result.flight || result.lodging || result.cruise || result.transportation || result.dining
    if (!target) return
    if (field === 'total') (target as any).totalPriceCents = value
    if (field === 'net' && result.cruise) result.cruise.netPriceCents = value
  }

  /** Extract start/end date strings from the type-specific extraction */
  private extractDateFields(result: OcrExtractionResult): { start: string | null; end: string | null } {
    if (result.flight?.segments?.length) {
      const sorted = [...result.flight.segments].sort((a, b) => (a.segmentOrder ?? 0) - (b.segmentOrder ?? 0))
      return { start: sorted[0]?.departureDate ?? null, end: sorted[sorted.length - 1]?.arrivalDate ?? null }
    }
    if (result.lodging) return { start: result.lodging.checkInDate ?? null, end: result.lodging.checkOutDate ?? null }
    if (result.cruise) return { start: result.cruise.departureDate ?? null, end: result.cruise.arrivalDate ?? null }
    return { start: null, end: null }
  }

  /** Swap start/end dates on the type-specific extraction */
  private swapDates(result: OcrExtractionResult): void {
    if (result.lodging) {
      const tmp = result.lodging.checkInDate
      result.lodging.checkInDate = result.lodging.checkOutDate
      result.lodging.checkOutDate = tmp
    }
    if (result.cruise) {
      const tmp = result.cruise.departureDate
      result.cruise.departureDate = result.cruise.arrivalDate
      result.cruise.arrivalDate = tmp
    }
  }

  /** Extract nights from the type-specific extraction */
  private extractNights(result: OcrExtractionResult): number | null {
    if (result.cruise?.nights != null) return result.cruise.nights
    if (result.lodging) {
      // Lodging doesn't have a nights field — skip
      return null
    }
    return null
  }

  /** Set nights on the type-specific extraction */
  private setNights(result: OcrExtractionResult, nights: number): void {
    if (result.cruise) result.cruise.nights = nights
  }

  /** Extract currency from the type-specific extraction */
  private extractCurrency(result: OcrExtractionResult): string | null {
    return (result.flight?.currency || result.lodging?.currency || result.cruise?.currency
      || result.transportation?.currency || result.dining?.currency || null) ?? null
  }

  /** Set currency on the type-specific extraction */
  private setCurrency(result: OcrExtractionResult, currency: string | null): void {
    const target = result.flight || result.lodging || result.cruise || result.transportation || result.dining
    if (target) (target as any).currency = currency
  }
}
