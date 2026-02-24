/**
 * OCR Module Types
 *
 * Type definitions for the centralized OCR extraction system.
 * Includes per-document-type extraction interfaces and Zod validation schemas.
 */

import { z } from 'zod'

// ============================================================================
// Document Types
// ============================================================================

export const OCR_DOCUMENT_TYPES = [
  'flight_confirmation',
  'hotel_confirmation',
  'cruise_confirmation',
  'passport',
  'transportation_confirmation',
  'dining_confirmation',
  'package_confirmation',
  'general_travel_document',
] as const

export type OcrDocumentType = (typeof OCR_DOCUMENT_TYPES)[number]

// ============================================================================
// Extraction Context
// ============================================================================

export interface OcrExtractionContext {
  /** Pre-specified document type (skip auto-detection if provided) */
  documentType?: OcrDocumentType
  /** Trip context for enrichment */
  tripId?: string
  /** Contact context for passport import */
  contactId?: string
  /** Additional hints for the extraction */
  hints?: string
  /** Supplier-specific extraction hints from runbook system */
  extractionHints?: string
}

// ============================================================================
// Per-Type Extraction Interfaces
// ============================================================================

export interface OcrTraveler {
  firstName: string
  lastName: string
  middleName?: string | null
  prefix?: string | null
  dateOfBirth?: string | null
  gender?: string | null
  nationality?: string | null
  passportNumber?: string | null
  email?: string | null
  phone?: string | null
}

export interface OcrFlightSegment {
  segmentOrder: number
  airline?: string | null
  flightNumber?: string | null
  departureAirportCode?: string | null
  departureAirportName?: string | null
  departureDate?: string | null
  departureTime?: string | null
  departureTerminal?: string | null
  arrivalAirportCode?: string | null
  arrivalAirportName?: string | null
  arrivalDate?: string | null
  arrivalTime?: string | null
  arrivalTerminal?: string | null
  cabinClass?: string | null
  seatAssignment?: string | null
}

export interface OcrFlightExtraction {
  confirmationNumber?: string | null
  airline?: string | null
  segments: OcrFlightSegment[]
  totalPriceCents?: number | null
  currency?: string | null
  bookingDate?: string | null
  termsAndConditions?: string | null
  cancellationPolicy?: string | null
}

export interface OcrLodgingExtraction {
  confirmationNumber?: string | null
  propertyName?: string | null
  address?: string | null
  phone?: string | null
  website?: string | null
  checkInDate?: string | null
  checkInTime?: string | null
  checkOutDate?: string | null
  checkOutTime?: string | null
  roomType?: string | null
  roomCount?: number | null
  amenities?: string[] | null
  specialRequests?: string | null
  totalPriceCents?: number | null
  currency?: string | null
  bookingDate?: string | null
  termsAndConditions?: string | null
  cancellationPolicy?: string | null
}

export interface OcrCruiseExtraction {
  confirmationNumber?: string | null
  cruiseLineName?: string | null
  shipName?: string | null
  voyageCode?: string | null
  departurePort?: string | null
  departureDate?: string | null
  departureTime?: string | null
  arrivalPort?: string | null
  arrivalDate?: string | null
  arrivalTime?: string | null
  cabinCategory?: string | null
  cabinNumber?: string | null
  cabinDeck?: string | null
  nights?: number | null
  totalPriceCents?: number | null
  currency?: string | null
  termsAndConditions?: string | null
  cancellationPolicy?: string | null
}

export interface OcrPassportExtraction {
  /** MRZ line 1 (TD3 format, 44 chars) */
  mrzLine1?: string | null
  /** MRZ line 2 (TD3 format, 44 chars) */
  mrzLine2?: string | null
  firstName?: string | null
  lastName?: string | null
  middleName?: string | null
  dateOfBirth?: string | null
  gender?: string | null
  nationality?: string | null
  passportNumber?: string | null
  issuingCountry?: string | null
  expiryDate?: string | null
  placeOfBirth?: string | null
}

export interface OcrTransportationExtraction {
  confirmationNumber?: string | null
  transportationType?: string | null
  companyName?: string | null
  pickupLocation?: string | null
  pickupDate?: string | null
  pickupTime?: string | null
  dropoffLocation?: string | null
  dropoffDate?: string | null
  dropoffTime?: string | null
  vehicleType?: string | null
  totalPriceCents?: number | null
  currency?: string | null
  termsAndConditions?: string | null
  cancellationPolicy?: string | null
}

export interface OcrDiningExtraction {
  confirmationNumber?: string | null
  restaurantName?: string | null
  address?: string | null
  phone?: string | null
  reservationDate?: string | null
  reservationTime?: string | null
  partySize?: number | null
  specialRequests?: string | null
  totalPriceCents?: number | null
  currency?: string | null
  termsAndConditions?: string | null
  cancellationPolicy?: string | null
}

// ============================================================================
// Package Extraction
// ============================================================================

export interface OcrPackageComponentFlight {
  flightNumber?: string | null
  departureAirportCode?: string | null
  arrivalAirportCode?: string | null
  departureDate?: string | null
  departureTime?: string | null
  arrivalDate?: string | null
  arrivalTime?: string | null
  cabinClass?: string | null
  confirmationNumber?: string | null
}

export interface OcrPackageComponentLodging {
  propertyName?: string | null
  roomType?: string | null
  checkInDate?: string | null
  checkOutDate?: string | null
  address?: string | null
}

export interface OcrPackageComponentTransportation {
  transportationType?: string | null
  pickupLocation?: string | null
  dropoffLocation?: string | null
  pickupDate?: string | null
  dropoffDate?: string | null
}

export interface OcrPackageComponent {
  componentType: 'flight' | 'lodging' | 'transportation' | 'dining' | 'other'
  name?: string | null
  description?: string | null
  flight?: OcrPackageComponentFlight | null
  lodging?: OcrPackageComponentLodging | null
  transportation?: OcrPackageComponentTransportation | null
}

export interface OcrPerPersonPrice {
  travelerIndex: number
  label: string
  basePriceCents: number
  taxesCents: number
  totalPriceCents: number
}

export interface OcrPaymentEntry {
  paymentName: string
  amount: number
  date?: string | null
  method?: string | null
  referenceNumber?: string | null
}

export interface OcrPackageExtraction {
  supplierName?: string | null
  bookingReference?: string | null
  bookingDate?: string | null
  currency?: string | null
  totalPrice?: number | null
  commissionRate?: number | null
  commissionAmount?: number | null
  taxesAndFees?: number | null
  addOns?: number | null
  components: OcrPackageComponent[]
  perPersonPricing: OcrPerPersonPrice[]
  remarks?: string | null
  payments?: OcrPaymentEntry[]
  termsAndConditions?: string | null
  cancellationPolicy?: string | null
}

// ============================================================================
// Extraction Result
// ============================================================================

export interface OcrExtractionResult {
  documentType: OcrDocumentType
  confidence: number
  /** Supplier name from detection (e.g. "Transat", "Air Canada") */
  supplierName?: string | null
  flight?: OcrFlightExtraction | null
  lodging?: OcrLodgingExtraction | null
  cruise?: OcrCruiseExtraction | null
  passport?: OcrPassportExtraction | null
  transportation?: OcrTransportationExtraction | null
  dining?: OcrDiningExtraction | null
  package?: OcrPackageExtraction | null
  travelers: OcrTraveler[]
  booking?: {
    confirmationNumber?: string | null
    totalPriceCents?: number | null
    currency?: string | null
    bookingDate?: string | null
  } | null
  /** Raw GPT-4o response for debugging */
  rawResponse?: Record<string, unknown>
  /** Token usage */
  usage?: {
    promptTokens: number
    completionTokens: number
  }
  /** Model used */
  model?: string
}

// ============================================================================
// Zod Validation Schemas
// ============================================================================

const ocrTravelerSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  middleName: z.string().nullish(),
  prefix: z.string().nullish(),
  dateOfBirth: z.string().nullish(),
  gender: z.string().nullish(),
  nationality: z.string().nullish(),
  passportNumber: z.string().nullish(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
})

const ocrFlightSegmentSchema = z.object({
  segmentOrder: z.number(),
  airline: z.string().nullish(),
  flightNumber: z.string().nullish(),
  departureAirportCode: z.string().nullish(),
  departureAirportName: z.string().nullish(),
  departureDate: z.string().nullish(),
  departureTime: z.string().nullish(),
  departureTerminal: z.string().nullish(),
  arrivalAirportCode: z.string().nullish(),
  arrivalAirportName: z.string().nullish(),
  arrivalDate: z.string().nullish(),
  arrivalTime: z.string().nullish(),
  arrivalTerminal: z.string().nullish(),
  cabinClass: z.string().nullish(),
  seatAssignment: z.string().nullish(),
})

export const ocrFlightExtractionSchema = z.object({
  documentType: z.literal('flight_confirmation'),
  confidence: z.number().min(0).max(1),
  confirmationNumber: z.string().nullish(),
  airline: z.string().nullish(),
  segments: z.array(ocrFlightSegmentSchema).default([]),
  totalPrice: z.number().nullish(),
  currency: z.string().nullish(),
  bookingDate: z.string().nullish(),
  termsAndConditions: z.string().nullish(),
  cancellationPolicy: z.string().nullish(),
  travelers: z.array(ocrTravelerSchema).default([]),
})

export const ocrLodgingExtractionSchema = z.object({
  documentType: z.literal('hotel_confirmation'),
  confidence: z.number().min(0).max(1),
  confirmationNumber: z.string().nullish(),
  propertyName: z.string().nullish(),
  address: z.string().nullish(),
  phone: z.string().nullish(),
  website: z.string().nullish(),
  checkInDate: z.string().nullish(),
  checkInTime: z.string().nullish(),
  checkOutDate: z.string().nullish(),
  checkOutTime: z.string().nullish(),
  roomType: z.string().nullish(),
  roomCount: z.number().nullish(),
  amenities: z.array(z.string()).nullish(),
  specialRequests: z.string().nullish(),
  totalPrice: z.number().nullish(),
  currency: z.string().nullish(),
  bookingDate: z.string().nullish(),
  termsAndConditions: z.string().nullish(),
  cancellationPolicy: z.string().nullish(),
  travelers: z.array(ocrTravelerSchema).default([]),
})

export const ocrCruiseExtractionSchema = z.object({
  documentType: z.literal('cruise_confirmation'),
  confidence: z.number().min(0).max(1),
  confirmationNumber: z.string().nullish(),
  cruiseLineName: z.string().nullish(),
  shipName: z.string().nullish(),
  voyageCode: z.string().nullish(),
  departurePort: z.string().nullish(),
  departureDate: z.string().nullish(),
  departureTime: z.string().nullish(),
  arrivalPort: z.string().nullish(),
  arrivalDate: z.string().nullish(),
  arrivalTime: z.string().nullish(),
  cabinCategory: z.string().nullish(),
  cabinNumber: z.string().nullish(),
  cabinDeck: z.string().nullish(),
  nights: z.number().nullish(),
  totalPrice: z.number().nullish(),
  currency: z.string().nullish(),
  termsAndConditions: z.string().nullish(),
  cancellationPolicy: z.string().nullish(),
  travelers: z.array(ocrTravelerSchema).default([]),
})

export const ocrPassportExtractionSchema = z.object({
  documentType: z.literal('passport'),
  confidence: z.number().min(0).max(1),
  mrzLine1: z.string().nullish(),
  mrzLine2: z.string().nullish(),
  firstName: z.string().nullish(),
  lastName: z.string().nullish(),
  middleName: z.string().nullish(),
  dateOfBirth: z.string().nullish(),
  gender: z.string().nullish(),
  nationality: z.string().nullish(),
  passportNumber: z.string().nullish(),
  issuingCountry: z.string().nullish(),
  expiryDate: z.string().nullish(),
  placeOfBirth: z.string().nullish(),
})

export const ocrTransportationExtractionSchema = z.object({
  documentType: z.literal('transportation_confirmation'),
  confidence: z.number().min(0).max(1),
  confirmationNumber: z.string().nullish(),
  transportationType: z.string().nullish(),
  companyName: z.string().nullish(),
  pickupLocation: z.string().nullish(),
  pickupDate: z.string().nullish(),
  pickupTime: z.string().nullish(),
  dropoffLocation: z.string().nullish(),
  dropoffDate: z.string().nullish(),
  dropoffTime: z.string().nullish(),
  vehicleType: z.string().nullish(),
  totalPrice: z.number().nullish(),
  currency: z.string().nullish(),
  termsAndConditions: z.string().nullish(),
  cancellationPolicy: z.string().nullish(),
  travelers: z.array(ocrTravelerSchema).default([]),
})

export const ocrDiningExtractionSchema = z.object({
  documentType: z.literal('dining_confirmation'),
  confidence: z.number().min(0).max(1),
  confirmationNumber: z.string().nullish(),
  restaurantName: z.string().nullish(),
  address: z.string().nullish(),
  phone: z.string().nullish(),
  reservationDate: z.string().nullish(),
  reservationTime: z.string().nullish(),
  partySize: z.number().nullish(),
  specialRequests: z.string().nullish(),
  totalPrice: z.number().nullish(),
  currency: z.string().nullish(),
  termsAndConditions: z.string().nullish(),
  cancellationPolicy: z.string().nullish(),
  travelers: z.array(ocrTravelerSchema).default([]),
})

const ocrPackageComponentFlightSchema = z.object({
  flightNumber: z.string().nullish(),
  departureAirportCode: z.string().nullish(),
  arrivalAirportCode: z.string().nullish(),
  departureDate: z.string().nullish(),
  departureTime: z.string().nullish(),
  arrivalDate: z.string().nullish(),
  arrivalTime: z.string().nullish(),
  cabinClass: z.string().nullish(),
  confirmationNumber: z.string().nullish(),
})

const ocrPackageComponentLodgingSchema = z.object({
  propertyName: z.string().nullish(),
  roomType: z.string().nullish(),
  checkInDate: z.string().nullish(),
  checkOutDate: z.string().nullish(),
  address: z.string().nullish(),
})

const ocrPackageComponentTransportationSchema = z.object({
  transportationType: z.string().nullish(),
  pickupLocation: z.string().nullish(),
  dropoffLocation: z.string().nullish(),
  pickupDate: z.string().nullish(),
  dropoffDate: z.string().nullish(),
})

const ocrPackageComponentSchema = z.object({
  componentType: z.enum(['flight', 'lodging', 'transportation', 'dining', 'other']),
  name: z.string().nullish(),
  description: z.string().nullish(),
  flight: ocrPackageComponentFlightSchema.nullish(),
  lodging: ocrPackageComponentLodgingSchema.nullish(),
  transportation: ocrPackageComponentTransportationSchema.nullish(),
})

const ocrPerPersonPriceSchema = z.object({
  travelerIndex: z.number(),
  label: z.string(),
  basePriceCents: z.number(),
  taxesCents: z.number(),
  totalPriceCents: z.number(),
})

const ocrPaymentEntrySchema = z.object({
  paymentName: z.string(),
  amount: z.number(),
  date: z.string().nullish(),
  method: z.string().nullish(),
  referenceNumber: z.string().nullish(),
})

export const ocrPackageExtractionSchema = z.object({
  documentType: z.literal('package_confirmation'),
  confidence: z.number().min(0).max(1),
  supplierName: z.string().nullish(),
  bookingReference: z.string().nullish(),
  bookingDate: z.string().nullish(),
  currency: z.string().nullish(),
  totalPrice: z.number().nullish(),
  commissionRate: z.number().nullish(),
  commissionAmount: z.number().nullish(),
  taxesAndFees: z.number().nullish(),
  addOns: z.number().nullish(),
  remarks: z.string().nullish(),
  payments: z.array(ocrPaymentEntrySchema).default([]),
  components: z.array(ocrPackageComponentSchema).default([]),
  perPersonPricing: z.array(ocrPerPersonPriceSchema).default([]),
  termsAndConditions: z.string().nullish(),
  cancellationPolicy: z.string().nullish(),
  travelers: z.array(ocrTravelerSchema).default([]),
})

export const ocrDetectionSchema = z.object({
  documentType: z.enum(OCR_DOCUMENT_TYPES),
  confidence: z.number().min(0).max(1),
  supplierName: z.string().nullish(),
})

/** Map document types to their Zod schemas */
export const EXTRACTION_SCHEMAS: Record<OcrDocumentType, z.ZodType> = {
  flight_confirmation: ocrFlightExtractionSchema,
  hotel_confirmation: ocrLodgingExtractionSchema,
  cruise_confirmation: ocrCruiseExtractionSchema,
  passport: ocrPassportExtractionSchema,
  transportation_confirmation: ocrTransportationExtractionSchema,
  dining_confirmation: ocrDiningExtractionSchema,
  package_confirmation: ocrPackageExtractionSchema,
  general_travel_document: ocrFlightExtractionSchema, // fallback
}

// ============================================================================
// MRZ Validation
// ============================================================================

const MRZ_CHAR_VALUES: Record<string, number> = {}
// 0-9 = 0-9, A-Z = 10-35, < = 0
for (let i = 0; i <= 9; i++) MRZ_CHAR_VALUES[String(i)] = i
for (let i = 0; i < 26; i++) MRZ_CHAR_VALUES[String.fromCharCode(65 + i)] = i + 10
MRZ_CHAR_VALUES['<'] = 0

/**
 * Validate a single MRZ check digit
 */
export function validateMrzCheckDigit(data: string, checkDigit: string): boolean {
  if (!data || !checkDigit) return false
  const weights = [7, 3, 1]
  let sum = 0
  for (let i = 0; i < data.length; i++) {
    const charVal = MRZ_CHAR_VALUES[data[i]!]
    if (charVal === undefined) return false
    sum += charVal * weights[i % 3]!
  }
  return (sum % 10) === parseInt(checkDigit, 10)
}

/**
 * Validate passport MRZ check digits (TD3 format)
 * Line 2: positions 0-8 (passport number), 9 (check), 13-18 (DOB), 19 (check),
 *          21 (sex), 22-27 (expiry), 28 (check), 29-42 (optional), 43 (composite check)
 */
export function validateMrzLine2(mrzLine2: string): {
  valid: boolean
  passportNumberValid: boolean
  dobValid: boolean
  expiryValid: boolean
} {
  if (!mrzLine2 || mrzLine2.length !== 44) {
    return { valid: false, passportNumberValid: false, dobValid: false, expiryValid: false }
  }

  const passportNumberValid = validateMrzCheckDigit(mrzLine2.substring(0, 9), mrzLine2[9]!)
  const dobValid = validateMrzCheckDigit(mrzLine2.substring(13, 19), mrzLine2[19]!)
  const expiryValid = validateMrzCheckDigit(mrzLine2.substring(21, 27), mrzLine2[27]!)

  return {
    valid: passportNumberValid && dobValid && expiryValid,
    passportNumberValid,
    dobValid,
    expiryValid,
  }
}
