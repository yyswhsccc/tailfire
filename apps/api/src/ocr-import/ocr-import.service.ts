/**
 * OCR Import Service
 *
 * Orchestrates the full OCR import flow: preview + confirm.
 * Follows the same patterns as ImportBookingService for cruise imports.
 */

import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { eq, and, sql, inArray } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { schema } from '@tailfire/database'
import { OcrService } from '../ocr/ocr.service'
import { ContactsService } from '../contacts/contacts.service'
import { TripsService } from '../trips/trips.service'
import { ItinerariesService } from '../trips/itineraries.service'
import { ItineraryDaysService } from '../trips/itinerary-days.service'
import { ComponentOrchestrationService } from '../trips/component-orchestration.service'
import { TripTravelersService } from '../trips/trip-travelers.service'
import { ActivityTravelersService } from '../trips/activity-travelers.service'
import { TripAccessService } from '../trips/trip-access.service'
import { ActivitiesService } from '../trips/activities.service'
import { StorageService } from '../trips/storage.service'
import { SuppliersService } from '../suppliers/suppliers.service'
import { AutomationService } from '../automation/automation.service'
import type { AuthContext } from '../auth/auth.types'
import type { OcrPreviewDto, OcrConfirmDto } from './dto/ocr-import.dto'
import type {
  OcrDocumentType,
  OcrExtractionResult,
  OcrPackageExtraction,
  OcrTraveler,
} from '../ocr/ocr.types'
import { OCR_DOCUMENT_TYPES } from '../ocr/ocr.types'
import type { ContactMatchResult } from './ocr-import.types'
import type {
  OcrPreviewResponse,
  OcrConfirmResponse,
  OcrJobStatusResponse,
  PolicyDiff,
  PolicyFieldDiff,
} from '@tailfire/shared-types'
import type { CreateTripTravelerDto } from '@tailfire/shared-types'
import { QUEUES, JOB_TYPES } from '../automation/automation.types'

const { ocrImportJobs, ocrSupplierRunbooks } = schema

/** Sync extraction timeout before falling back to async */
const SYNC_TIMEOUT_MS = 90_000

@Injectable()
export class OcrImportService {
  private readonly logger = new Logger(OcrImportService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly ocrService: OcrService,
    private readonly contactsService: ContactsService,
    private readonly tripsService: TripsService,
    private readonly itinerariesService: ItinerariesService,
    private readonly itineraryDaysService: ItineraryDaysService,
    private readonly componentOrchestrationService: ComponentOrchestrationService,
    private readonly activitiesService: ActivitiesService,
    private readonly tripTravelersService: TripTravelersService,
    private readonly activityTravelersService: ActivityTravelersService,
    private readonly tripAccessService: TripAccessService,
    private readonly storageService: StorageService,
    private readonly suppliersService: SuppliersService,
    private readonly automationService: AutomationService,
    @InjectQueue(QUEUES.OCR_PROCESSING) private readonly ocrQueue: Queue,
  ) {}

  // ============================================================================
  // Preview
  // ============================================================================

  async preview(
    file: Express.Multer.File,
    dto: OcrPreviewDto,
    auth: AuthContext,
  ): Promise<OcrPreviewResponse | OcrJobStatusResponse> {
    // 1. Validate access
    if (dto.tripId) {
      await this.tripAccessService.verifyWriteAccess(dto.tripId, auth)
    }

    // 2. Validate document type if specified
    const documentType = dto.documentType as OcrDocumentType | undefined
    if (documentType && !OCR_DOCUMENT_TYPES.includes(documentType)) {
      throw new BadRequestException(`Invalid document type: ${dto.documentType}`)
    }

    // 3. Upload file to storage immediately (durable before extraction)
    let fileStoragePath: string | null = null
    try {
      const folder = `ocr-imports/${auth.agencyId}`
      const timestamp = Date.now()
      const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')
      fileStoragePath = await this.storageService.uploadDocument(
        file.buffer,
        folder,
        `${timestamp}-${safeName}`,
        file.mimetype,
      )
    } catch (error) {
      this.logger.warn({
        message: 'Failed to upload file to storage — continuing without storage',
        error: error instanceof Error ? error.message : String(error),
      })
    }

    // 4. Create job row
    const [job] = await this.db.client
      .insert(ocrImportJobs)
      .values({
        agencyId: auth.agencyId,
        userId: auth.userId,
        status: 'processing',
        fileStoragePath,
        fileName: file.originalname,
        fileMimeType: file.mimetype,
        detectedDocumentType: documentType || null,
      })
      .returning()

    if (!job) {
      throw new Error('Failed to create OCR import job')
    }

    // 5. Try synchronous extraction with timeout
    const startTime = Date.now()
    const abortController = new AbortController()
    const timeoutId = setTimeout(() => abortController.abort(), SYNC_TIMEOUT_MS)

    try {
      // Look up runbook hints if we know the document type
      let extractionHints: string | undefined
      let runbookId: string | null = null
      if (documentType) {
        const runbook = await this.findRunbookHints(documentType)
        if (runbook) {
          extractionHints = runbook.extractionHints
          runbookId = runbook.id
        }
      }

      const extraction = await this.ocrService.extractFromPdf(
        file.buffer,
        { documentType, tripId: dto.tripId, contactId: dto.contactId, extractionHints },
        abortController.signal,
      )
      clearTimeout(timeoutId)

      // If we didn't have the doc type before, try to find a runbook now
      if (!runbookId && extraction.documentType) {
        const runbook = await this.findRunbookHints(extraction.documentType)
        if (runbook) {
          runbookId = runbook.id
        }
      }

      const processingTimeMs = Date.now() - startTime

      // 6. Match travelers to contacts
      const contactMatches = await this.matchTravelersToContacts(
        extraction.travelers,
        auth,
      )

      // 7. Update job with results
      await this.db.client
        .update(ocrImportJobs)
        .set({
          status: 'preview_ready',
          detectedDocumentType: extraction.documentType,
          extractionResult: extraction as unknown as Record<string, unknown>,
          enrichedResult: { contactMatches } as unknown as Record<string, unknown>,
          tokensPrompt: extraction.usage?.promptTokens ?? null,
          tokensCompletion: extraction.usage?.completionTokens ?? null,
          model: extraction.model ?? null,
          runbookId,
          processingTimeMs,
          completedAt: new Date(),
        })
        .where(eq(ocrImportJobs.id, job.id))

      // 8. Build response
      return this.buildPreviewResponse(job.id, extraction, contactMatches)
    } catch (error) {
      clearTimeout(timeoutId)

      // Check if it was a timeout (AbortError)
      if (error instanceof Error && error.name === 'AbortError') {
        this.logger.log(`Extraction timed out after ${SYNC_TIMEOUT_MS}ms — enqueueing async job`)

        // Enqueue BullMQ job
        await this.ocrQueue.add(
          JOB_TYPES.OCR_EXTRACT,
          {
            jobId: job.id,
            fileStoragePath,
            documentType,
            tripId: dto.tripId,
            contactId: dto.contactId,
            agencyId: auth.agencyId,
            userId: auth.userId,
          },
          { jobId: `ocr:${job.id}` },
        )

        return {
          jobId: job.id,
          status: 'processing' as const,
          documentType: null,
          errorMessage: null,
          preview: null,
        }
      }

      // Other error — mark job as failed
      const errorMessage = error instanceof Error ? error.message : String(error)
      await this.db.client
        .update(ocrImportJobs)
        .set({
          status: 'failed',
          errorMessage,
          completedAt: new Date(),
        })
        .where(eq(ocrImportJobs.id, job.id))

      throw error
    }
  }

  // ============================================================================
  // Confirm
  // ============================================================================

  async confirm(dto: OcrConfirmDto, auth: AuthContext): Promise<OcrConfirmResponse> {
    // 1. Load job and validate
    const [job] = await this.db.client
      .select()
      .from(ocrImportJobs)
      .where(
        and(
          eq(ocrImportJobs.id, dto.jobId),
          eq(ocrImportJobs.agencyId, auth.agencyId),
        ),
      )
      .limit(1)

    if (!job) {
      throw new NotFoundException(`OCR import job ${dto.jobId} not found`)
    }

    if (job.status !== 'preview_ready') {
      throw new BadRequestException(`Job ${dto.jobId} is not ready for confirmation (status: ${job.status})`)
    }

    // 2. Access checks
    const tripId = dto.tripId || undefined
    if (tripId) {
      await this.tripAccessService.verifyWriteAccess(tripId, auth)
    }

    // 3. Parse extraction result
    const extraction = job.extractionResult as unknown as OcrExtractionResult
    if (!extraction) {
      throw new BadRequestException('Job has no extraction result')
    }

    const documentType = (dto.documentType || extraction.documentType) as OcrDocumentType
    const enrichedData = job.enrichedResult as Record<string, unknown> | null
    const contactMatches = (enrichedData?.contactMatches ?? []) as ContactMatchResult[]

    // 4. Route by document type
    switch (documentType) {
      case 'flight_confirmation':
        return this.confirmFlight(extraction, contactMatches, dto, auth)
      case 'hotel_confirmation':
        return this.confirmLodging(extraction, contactMatches, dto, auth)
      case 'cruise_confirmation':
        return this.confirmCruise(extraction, contactMatches, dto, auth)
      case 'passport':
        return this.confirmPassport(extraction, dto, auth)
      case 'transportation_confirmation':
        return this.confirmTransportation(extraction, contactMatches, dto, auth)
      case 'dining_confirmation':
        return this.confirmDining(extraction, contactMatches, dto, auth)
      case 'package_confirmation':
        return this.confirmPackage(extraction, contactMatches, dto, auth)
      default:
        throw new BadRequestException(`Unsupported document type for confirm: ${documentType}`)
    }
  }

  // ============================================================================
  // Job Status (for async polling)
  // ============================================================================

  async getJobStatus(jobId: string, auth: AuthContext): Promise<OcrJobStatusResponse> {
    const [job] = await this.db.client
      .select()
      .from(ocrImportJobs)
      .where(
        and(
          eq(ocrImportJobs.id, jobId),
          eq(ocrImportJobs.agencyId, auth.agencyId),
        ),
      )
      .limit(1)

    if (!job) {
      throw new NotFoundException(`OCR import job ${jobId} not found`)
    }

    const response: OcrJobStatusResponse = {
      jobId: job.id,
      status: job.status as OcrJobStatusResponse['status'],
      documentType: job.detectedDocumentType as OcrDocumentType | null,
      errorMessage: job.errorMessage,
      preview: null,
    }

    if (job.status === 'preview_ready' && job.extractionResult) {
      const extraction = job.extractionResult as unknown as OcrExtractionResult
      const enrichedData = job.enrichedResult as Record<string, unknown> | null
      const contactMatches = (enrichedData?.contactMatches ?? []) as ContactMatchResult[]

      response.preview = this.buildPreviewResponse(job.id, extraction, contactMatches)
    }

    return response
  }

  // ============================================================================
  // Type-Specific Confirm Handlers
  // ============================================================================

  private async confirmFlight(
    extraction: OcrExtractionResult,
    contactMatches: ContactMatchResult[],
    dto: OcrConfirmDto,
    auth: AuthContext,
  ): Promise<OcrConfirmResponse> {
    const flight = extraction.flight
    if (!flight || !flight.segments?.length) {
      throw new BadRequestException('No flight data in extraction')
    }

    // Resolve supplier and policies
    const { supplier, policyDiff, extractedTC, extractedCP } = await this.resolveSupplierAndPolicies(extraction)

    const firstSegment = flight.segments[0]!
    const lastSegment = flight.segments[flight.segments.length - 1]!

    // Create or use existing trip
    const { tripId } = await this.resolveTrip(dto, auth, {
      name: dto.tripName || `${firstSegment.departureAirportCode || ''} → ${lastSegment.arrivalAirportCode || ''} Flight`,
      startDate: firstSegment.departureDate || undefined,
      endDate: lastSegment.arrivalDate || firstSegment.departureDate || undefined,
    })

    // Create itinerary
    const itinerary = await this.itinerariesService.create(tripId, {
      name: 'Flight Itinerary',
      startDate: firstSegment.departureDate || undefined,
      endDate: lastSegment.arrivalDate || undefined,
      status: 'approved',
    })

    // Create day + activity
    const departureDay = await this.itineraryDaysService.findOrCreateByDate(
      itinerary.id,
      firstSegment.departureDate || new Date().toISOString().split('T')[0]!,
    )

    const activity = await this.componentOrchestrationService.createFlight({
      itineraryDayId: departureDay.id,
      componentType: 'flight',
      name: flight.airline
        ? `${flight.airline} ${firstSegment.flightNumber || ''}`.trim()
        : `Flight ${flight.confirmationNumber || ''}`.trim(),
      startDatetime: firstSegment.departureDate
        ? `${firstSegment.departureDate}T${firstSegment.departureTime || '00:00'}`
        : undefined,
      endDatetime: lastSegment.arrivalDate
        ? `${lastSegment.arrivalDate}T${lastSegment.arrivalTime || '23:59'}`
        : undefined,
      confirmationNumber: flight.confirmationNumber || undefined,
      status: 'confirmed',
      currency: flight.currency || 'CAD',
      totalPriceCents: flight.totalPriceCents || undefined,
      flightDetails: {
        airline: flight.airline || undefined,
        flightNumber: firstSegment.flightNumber || undefined,
        departureAirportCode: firstSegment.departureAirportCode || undefined,
        departureDate: firstSegment.departureDate || undefined,
        departureTime: firstSegment.departureTime || undefined,
        departureTerminal: firstSegment.departureTerminal || undefined,
        arrivalAirportCode: lastSegment.arrivalAirportCode || undefined,
        arrivalDate: lastSegment.arrivalDate || undefined,
        arrivalTime: lastSegment.arrivalTime || undefined,
        arrivalTerminal: lastSegment.arrivalTerminal || undefined,
        segments: flight.segments.map((s) => ({
          segmentOrder: s.segmentOrder,
          airline: s.airline || undefined,
          flightNumber: s.flightNumber || undefined,
          departureAirportCode: s.departureAirportCode || undefined,
          departureAirportName: s.departureAirportName || undefined,
          departureDate: s.departureDate || undefined,
          departureTime: s.departureTime || undefined,
          departureTerminal: s.departureTerminal || undefined,
          arrivalAirportCode: s.arrivalAirportCode || undefined,
          arrivalAirportName: s.arrivalAirportName || undefined,
          arrivalDate: s.arrivalDate || undefined,
          arrivalTime: s.arrivalTime || undefined,
          arrivalTerminal: s.arrivalTerminal || undefined,
        })),
      },
    })

    // Create travelers and link
    const { travelersCreated, travelersMatched } = await this.createAndLinkTravelers(
      extraction.travelers,
      contactMatches,
      dto.contactOverrides || {},
      tripId,
      activity.id,
      auth,
    )

    // Store extracted policies at activity level
    await this.storeActivityPolicies(activity.id, extractedTC, extractedCP)

    // Link stored PDF as activity document
    await this.linkDocumentToActivity(dto.jobId, activity.id)

    // Update job
    await this.updateJobConfirmed(dto.jobId, tripId, null, activity.id, 'flight_confirmation')

    return {
      tripId,
      activityId: activity.id,
      contactId: null,
      documentType: 'flight_confirmation',
      travelersCreated,
      travelersMatched,
      supplierId: supplier?.id || null,
      policyDiff,
    }
  }

  private async confirmLodging(
    extraction: OcrExtractionResult,
    contactMatches: ContactMatchResult[],
    dto: OcrConfirmDto,
    auth: AuthContext,
  ): Promise<OcrConfirmResponse> {
    const lodging = extraction.lodging
    if (!lodging) {
      throw new BadRequestException('No lodging data in extraction')
    }

    // Resolve supplier and policies
    const { supplier, policyDiff, extractedTC, extractedCP } = await this.resolveSupplierAndPolicies(extraction)

    const { tripId } = await this.resolveTrip(dto, auth, {
      name: dto.tripName || lodging.propertyName || 'Hotel Stay',
      startDate: lodging.checkInDate || undefined,
      endDate: lodging.checkOutDate || undefined,
    })

    const itinerary = await this.itinerariesService.create(tripId, {
      name: lodging.propertyName || 'Hotel Itinerary',
      startDate: lodging.checkInDate || undefined,
      endDate: lodging.checkOutDate || undefined,
      status: 'approved',
    })

    const checkInDay = await this.itineraryDaysService.findOrCreateByDate(
      itinerary.id,
      lodging.checkInDate || new Date().toISOString().split('T')[0]!,
    )

    const activity = await this.componentOrchestrationService.createLodging({
      itineraryDayId: checkInDay.id,
      componentType: 'lodging',
      name: lodging.propertyName || 'Hotel',
      startDatetime: lodging.checkInDate
        ? `${lodging.checkInDate}T${lodging.checkInTime || '15:00'}`
        : undefined,
      endDatetime: lodging.checkOutDate
        ? `${lodging.checkOutDate}T${lodging.checkOutTime || '11:00'}`
        : undefined,
      confirmationNumber: lodging.confirmationNumber || undefined,
      status: 'confirmed',
      currency: lodging.currency || 'CAD',
      totalPriceCents: lodging.totalPriceCents || undefined,
      address: lodging.address || undefined,
      lodgingDetails: {
        propertyName: lodging.propertyName || undefined,
        address: lodging.address || undefined,
        phone: lodging.phone || undefined,
        website: lodging.website || undefined,
        checkInDate: lodging.checkInDate || undefined,
        checkInTime: lodging.checkInTime || undefined,
        checkOutDate: lodging.checkOutDate || undefined,
        checkOutTime: lodging.checkOutTime || undefined,
        roomType: lodging.roomType || undefined,
        roomCount: lodging.roomCount || undefined,
        amenities: lodging.amenities || undefined,
        specialRequests: lodging.specialRequests || undefined,
      },
    })

    const { travelersCreated, travelersMatched } = await this.createAndLinkTravelers(
      extraction.travelers,
      contactMatches,
      dto.contactOverrides || {},
      tripId,
      activity.id,
      auth,
    )

    // Store extracted policies at activity level
    await this.storeActivityPolicies(activity.id, extractedTC, extractedCP)

    // Enqueue background photo enrichment (non-blocking)
    if (lodging.propertyName) {
      try {
        await this.automationService.schedule(
          QUEUES.ENRICHMENT,
          JOB_TYPES.HOTEL_PHOTO_ENRICHMENT,
          {
            type: JOB_TYPES.HOTEL_PHOTO_ENRICHMENT,
            activityId: activity.id,
            hotelName: lodging.propertyName,
            address: lodging.address || null,
            agencyId: auth.agencyId,
            userId: auth.userId,
            maxPhotos: 3,
          },
          { jobId: `hotel-photo-${activity.id}`, attempts: 2 },
        )
      } catch (error) {
        this.logger.warn({
          message: 'Failed to enqueue photo enrichment — non-blocking',
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    await this.linkDocumentToActivity(dto.jobId, activity.id)
    await this.updateJobConfirmed(dto.jobId, tripId, null, activity.id, 'hotel_confirmation')

    return {
      tripId,
      activityId: activity.id,
      contactId: null,
      documentType: 'hotel_confirmation',
      travelersCreated,
      travelersMatched,
      supplierId: supplier?.id || null,
      policyDiff,
    }
  }

  private async confirmCruise(
    extraction: OcrExtractionResult,
    contactMatches: ContactMatchResult[],
    dto: OcrConfirmDto,
    auth: AuthContext,
  ): Promise<OcrConfirmResponse> {
    const cruise = extraction.cruise
    if (!cruise) {
      throw new BadRequestException('No cruise data in extraction')
    }

    // Resolve supplier and policies
    const { supplier, policyDiff, extractedTC, extractedCP } = await this.resolveSupplierAndPolicies(extraction)

    const { tripId } = await this.resolveTrip(dto, auth, {
      name: dto.tripName || `${cruise.cruiseLineName || 'Cruise'} — ${cruise.shipName || ''}`.trim(),
      startDate: cruise.departureDate || undefined,
      endDate: cruise.arrivalDate || undefined,
    })

    const itinerary = await this.itinerariesService.create(tripId, {
      name: cruise.shipName || 'Cruise Itinerary',
      startDate: cruise.departureDate || undefined,
      endDate: cruise.arrivalDate || undefined,
      status: 'approved',
    })

    const departureDay = await this.itineraryDaysService.findOrCreateByDate(
      itinerary.id,
      cruise.departureDate || new Date().toISOString().split('T')[0]!,
    )

    const activity = await this.componentOrchestrationService.createCustomCruise({
      itineraryDayId: departureDay.id,
      componentType: 'custom_cruise',
      name: cruise.cruiseLineName
        ? `${cruise.cruiseLineName} ${cruise.shipName || ''}`.trim()
        : 'Cruise',
      startDatetime: cruise.departureDate || undefined,
      endDatetime: cruise.arrivalDate || undefined,
      confirmationNumber: cruise.confirmationNumber || undefined,
      status: 'confirmed',
      currency: cruise.currency || 'CAD',
      totalPriceCents: cruise.totalPriceCents || undefined,
      customCruiseDetails: {
        cruiseLineName: cruise.cruiseLineName || null,
        shipName: cruise.shipName || null,
        voyageCode: cruise.voyageCode || null,
        departurePort: cruise.departurePort || null,
        departureDate: cruise.departureDate || null,
        arrivalPort: cruise.arrivalPort || null,
        arrivalDate: cruise.arrivalDate || null,
        cabinCategory: cruise.cabinCategory || null,
        cabinNumber: cruise.cabinNumber || null,
        nights: cruise.nights || null,
        bookingNumber: cruise.confirmationNumber || null,
      },
    })

    const { travelersCreated, travelersMatched } = await this.createAndLinkTravelers(
      extraction.travelers,
      contactMatches,
      dto.contactOverrides || {},
      tripId,
      activity.id,
      auth,
    )

    // Store extracted policies at activity level
    await this.storeActivityPolicies(activity.id, extractedTC, extractedCP)

    await this.linkDocumentToActivity(dto.jobId, activity.id)
    await this.updateJobConfirmed(dto.jobId, tripId, null, activity.id, 'cruise_confirmation')

    return {
      tripId,
      activityId: activity.id,
      contactId: null,
      documentType: 'cruise_confirmation',
      travelersCreated,
      travelersMatched,
      supplierId: supplier?.id || null,
      policyDiff,
    }
  }

  private async confirmPassport(
    extraction: OcrExtractionResult,
    dto: OcrConfirmDto,
    auth: AuthContext,
  ): Promise<OcrConfirmResponse> {
    const passport = extraction.passport
    if (!passport) {
      throw new BadRequestException('No passport data in extraction')
    }

    let contactId = dto.contactId || undefined
    let isNewContact = false

    if (contactId) {
      // Update existing contact with passport data
      try {
        const updates: Record<string, unknown> = {}
        if (passport.passportNumber) updates.passportNumber = passport.passportNumber
        if (passport.nationality) updates.nationality = passport.nationality
        if (passport.dateOfBirth) updates.dateOfBirth = passport.dateOfBirth
        if (passport.gender) updates.gender = passport.gender
        if (passport.expiryDate) updates.passportExpiry = passport.expiryDate
        if (passport.issuingCountry) updates.passportIssuingCountry = passport.issuingCountry

        if (Object.keys(updates).length > 0) {
          await this.contactsService.update(contactId, updates, auth.agencyId, auth.userId)
        }
      } catch (error) {
        this.logger.warn({
          message: 'Failed to update contact with passport data',
          contactId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    } else {
      // Match or create contact
      const firstName = passport.firstName || 'Unknown'
      const lastName = passport.lastName || 'Unknown'

      const existing = await this.db.client
        .select({ id: this.db.schema.contacts.id })
        .from(this.db.schema.contacts)
        .where(
          and(
            eq(this.db.schema.contacts.agencyId, auth.agencyId),
            eq(this.db.schema.contacts.firstName, firstName),
            eq(this.db.schema.contacts.lastName, lastName),
          ),
        )
        .limit(1)

      if (existing[0]) {
        contactId = existing[0].id
      } else {
        const contact = await this.contactsService.create(
          {
            firstName,
            lastName,
            middleName: passport.middleName || undefined,
            dateOfBirth: passport.dateOfBirth || undefined,
            gender: passport.gender || undefined,
            nationality: passport.nationality || undefined,
            contactType: 'client',
          },
          auth.agencyId,
          auth.userId,
        )
        contactId = contact.id
        isNewContact = true
      }
    }

    await this.updateJobConfirmed(dto.jobId, null, contactId, null, 'passport')

    return {
      tripId: null,
      activityId: null,
      contactId,
      documentType: 'passport',
      travelersCreated: isNewContact ? 1 : 0,
      travelersMatched: isNewContact ? 0 : 1,
    }
  }

  private async confirmTransportation(
    extraction: OcrExtractionResult,
    contactMatches: ContactMatchResult[],
    dto: OcrConfirmDto,
    auth: AuthContext,
  ): Promise<OcrConfirmResponse> {
    const transport = extraction.transportation
    if (!transport) {
      throw new BadRequestException('No transportation data in extraction')
    }

    // Resolve supplier and policies
    const { supplier, policyDiff, extractedTC, extractedCP } = await this.resolveSupplierAndPolicies(extraction)

    const { tripId } = await this.resolveTrip(dto, auth, {
      name: dto.tripName || transport.companyName || 'Transportation',
      startDate: transport.pickupDate || undefined,
      endDate: transport.dropoffDate || transport.pickupDate || undefined,
    })

    const itinerary = await this.itinerariesService.create(tripId, {
      name: 'Transportation',
      startDate: transport.pickupDate || undefined,
      endDate: transport.dropoffDate || undefined,
      status: 'approved',
    })

    const pickupDay = await this.itineraryDaysService.findOrCreateByDate(
      itinerary.id,
      transport.pickupDate || new Date().toISOString().split('T')[0]!,
    )

    const activity = await this.componentOrchestrationService.createTransportation({
      itineraryDayId: pickupDay.id,
      componentType: 'transportation',
      name: transport.companyName || 'Transportation',
      startDatetime: transport.pickupDate
        ? `${transport.pickupDate}T${transport.pickupTime || '00:00'}`
        : undefined,
      endDatetime: transport.dropoffDate
        ? `${transport.dropoffDate}T${transport.dropoffTime || '23:59'}`
        : undefined,
      confirmationNumber: transport.confirmationNumber || undefined,
      status: 'confirmed',
      currency: transport.currency || 'CAD',
      totalPriceCents: transport.totalPriceCents || undefined,
      transportationDetails: {
        subtype: this.mapTransportationType(transport.transportationType) as 'transfer' | 'car_rental' | 'private_car' | 'taxi' | 'shuttle' | 'train' | 'ferry' | 'bus' | 'limousine',
        providerName: transport.companyName || undefined,
        pickupAddress: transport.pickupLocation || undefined,
        pickupDate: transport.pickupDate || undefined,
        pickupTime: transport.pickupTime || undefined,
        dropoffAddress: transport.dropoffLocation || undefined,
        dropoffDate: transport.dropoffDate || undefined,
        dropoffTime: transport.dropoffTime || undefined,
        vehicleType: transport.vehicleType || undefined,
      },
    })

    const { travelersCreated, travelersMatched } = await this.createAndLinkTravelers(
      extraction.travelers,
      contactMatches,
      dto.contactOverrides || {},
      tripId,
      activity.id,
      auth,
    )

    // Store extracted policies at activity level
    await this.storeActivityPolicies(activity.id, extractedTC, extractedCP)

    await this.linkDocumentToActivity(dto.jobId, activity.id)
    await this.updateJobConfirmed(dto.jobId, tripId, null, activity.id, 'transportation_confirmation')

    return {
      tripId,
      activityId: activity.id,
      contactId: null,
      documentType: 'transportation_confirmation',
      travelersCreated,
      travelersMatched,
      supplierId: supplier?.id || null,
      policyDiff,
    }
  }

  private async confirmDining(
    extraction: OcrExtractionResult,
    contactMatches: ContactMatchResult[],
    dto: OcrConfirmDto,
    auth: AuthContext,
  ): Promise<OcrConfirmResponse> {
    const dining = extraction.dining
    if (!dining) {
      throw new BadRequestException('No dining data in extraction')
    }

    // Resolve supplier and policies
    const { supplier, policyDiff, extractedTC, extractedCP } = await this.resolveSupplierAndPolicies(extraction)

    const { tripId } = await this.resolveTrip(dto, auth, {
      name: dto.tripName || dining.restaurantName || 'Dining Reservation',
      startDate: dining.reservationDate || undefined,
      endDate: dining.reservationDate || undefined,
    })

    const itinerary = await this.itinerariesService.create(tripId, {
      name: dining.restaurantName || 'Dining',
      startDate: dining.reservationDate || undefined,
      endDate: dining.reservationDate || undefined,
      status: 'approved',
    })

    const diningDay = await this.itineraryDaysService.findOrCreateByDate(
      itinerary.id,
      dining.reservationDate || new Date().toISOString().split('T')[0]!,
    )

    const activity = await this.componentOrchestrationService.createDining({
      itineraryDayId: diningDay.id,
      componentType: 'dining',
      name: dining.restaurantName || 'Dining',
      startDatetime: dining.reservationDate
        ? `${dining.reservationDate}T${dining.reservationTime || '19:00'}`
        : undefined,
      confirmationNumber: dining.confirmationNumber || undefined,
      status: 'confirmed',
      currency: dining.currency || 'CAD',
      totalPriceCents: dining.totalPriceCents || undefined,
      address: dining.address || undefined,
      diningDetails: {
        restaurantName: dining.restaurantName || undefined,
        address: dining.address || undefined,
        phone: dining.phone || undefined,
        reservationDate: dining.reservationDate || undefined,
        reservationTime: dining.reservationTime || undefined,
        partySize: dining.partySize || undefined,
      },
    })

    const { travelersCreated, travelersMatched } = await this.createAndLinkTravelers(
      extraction.travelers,
      contactMatches,
      dto.contactOverrides || {},
      tripId,
      activity.id,
      auth,
    )

    // Store extracted policies at activity level
    await this.storeActivityPolicies(activity.id, extractedTC, extractedCP)

    await this.linkDocumentToActivity(dto.jobId, activity.id)
    await this.updateJobConfirmed(dto.jobId, tripId, null, activity.id, 'dining_confirmation')

    return {
      tripId,
      activityId: activity.id,
      contactId: null,
      documentType: 'dining_confirmation',
      travelersCreated,
      travelersMatched,
      supplierId: supplier?.id || null,
      policyDiff,
    }
  }

  private async confirmPackage(
    extraction: OcrExtractionResult,
    contactMatches: ContactMatchResult[],
    dto: OcrConfirmDto,
    auth: AuthContext,
  ): Promise<OcrConfirmResponse> {
    const pkg = extraction.package
    if (!pkg || !pkg.components?.length) {
      throw new BadRequestException('No package data or components in extraction')
    }

    // 1. Resolve supplier and policies (replaces old findOrCreateByName)
    const { supplier, policyDiff, extractedTC, extractedCP } = await this.resolveSupplierAndPolicies(extraction)

    // 2. Compute package date range from components
    const allDates = this.extractPackageDateRange(pkg)
    const startDate = allDates.startDate || undefined
    const endDate = allDates.endDate || startDate

    // 3. Create or use existing trip
    const { tripId } = await this.resolveTrip(dto, auth, {
      name: dto.tripName || (pkg.supplierName
        ? `${pkg.supplierName} Package ${pkg.bookingReference || ''}`.trim()
        : `Package ${pkg.bookingReference || ''}`.trim()),
      startDate,
      endDate,
    })

    // 4. Create itinerary
    const itinerary = await this.itinerariesService.create(tripId, {
      name: pkg.supplierName
        ? `${pkg.supplierName} Package`
        : 'Package Itinerary',
      startDate,
      endDate,
      status: 'approved',
    })

    // 5. Normalize components — split multi-day transfers into arrival + departure
    const components = this.normalizePackageComponents(pkg.components)

    // 5b. Build itinerary days for each unique component date
    const dayMap = new Map<string, string>() // date → dayId
    for (const component of components) {
      const date = this.getComponentPrimaryDate(component)
      if (date && !dayMap.has(date)) {
        const day = await this.itineraryDaysService.findOrCreateByDate(itinerary.id, date)
        dayMap.set(date, day.id)
      }
    }
    // Ensure we have at least one day
    if (dayMap.size === 0) {
      const fallbackDate = startDate || new Date().toISOString().split('T')[0]!
      const day = await this.itineraryDaysService.findOrCreateByDate(itinerary.id, fallbackDate)
      dayMap.set(fallbackDate, day.id)
    }

    // 6. Create parent package activity
    const totalPriceCents = pkg.totalPrice ? Math.round(pkg.totalPrice * 100) : undefined
    const packageActivity = await this.activitiesService.create(
      {
        tripId,
        itineraryDayId: null, // floating package
        activityType: 'package',
        name: pkg.supplierName
          ? `${pkg.supplierName} — ${pkg.bookingReference || 'Package'}`.trim()
          : `Package ${pkg.bookingReference || ''}`.trim(),
        confirmationNumber: pkg.bookingReference || undefined,
        status: 'confirmed',
        currency: pkg.currency || 'CAD',
        totalPriceCents,
        taxesCents: pkg.taxesAndFees ? Math.round(pkg.taxesAndFees * 100) : undefined,
        commissionTotalCents: pkg.commissionAmount ? Math.round(pkg.commissionAmount * 100) : undefined,
        pricingType: pkg.perPersonPricing?.length ? 'per_person' as const : 'flat_rate' as const,
        pricingBreakdownJson: pkg.perPersonPricing?.length
          ? pkg.perPersonPricing.map((p) => ({
              label: p.label,
              priceCents: p.totalPriceCents,
            }))
          : undefined,
        startDatetime: startDate || undefined,
        endDatetime: endDate || undefined,
        notes: [
          pkg.remarks,
          pkg.addOns ? `Add-on options: $${pkg.addOns.toFixed(2)} ${pkg.currency || 'CAD'}` : null,
        ].filter(Boolean).join('\n') || undefined,
      },
      auth.userId,
      tripId,
      {
        supplierId: supplier?.id || null,
        supplierName: pkg.supplierName || null,
        groupBookingNumber: pkg.bookingReference || null,
      },
    )

    // 7. Create child activities for each component (using normalized components)
    const childIds: string[] = []
    for (const component of components) {
      const date = this.getComponentPrimaryDate(component)
      const fallbackDate = startDate || new Date().toISOString().split('T')[0]!
      const dayId = dayMap.get(date || fallbackDate) || dayMap.values().next().value!

      try {
        const childActivity = await this.createChildActivity(
          component,
          dayId,
          pkg.bookingReference || undefined,
          pkg.currency || 'CAD',
        )
        if (childActivity) {
          childIds.push(childActivity.id)

          // Enqueue photo enrichment for lodging components
          if (component.componentType === 'lodging' && component.lodging?.propertyName) {
            try {
              await this.automationService.schedule(
                QUEUES.ENRICHMENT,
                JOB_TYPES.HOTEL_PHOTO_ENRICHMENT,
                {
                  type: JOB_TYPES.HOTEL_PHOTO_ENRICHMENT,
                  activityId: childActivity.id,
                  hotelName: component.lodging.propertyName,
                  address: component.lodging.address || null,
                  agencyId: auth.agencyId,
                  userId: auth.userId,
                  maxPhotos: 3,
                },
                { jobId: `hotel-photo-${childActivity.id}`, attempts: 2 },
              )
            } catch (err) {
              this.logger.warn({ message: 'Failed to enqueue photo enrichment for package lodging — non-blocking', error: err instanceof Error ? err.message : String(err) })
            }
          }
        }
      } catch (error) {
        this.logger.warn({
          message: 'Failed to create child activity for package component',
          componentType: component.componentType,
          componentName: component.name,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // 8. Set tripId on children (componentOrchestration doesn't set it) then link to package
    if (childIds.length > 0) {
      await this.db.client
        .update(schema.itineraryActivities)
        .set({ tripId, updatedAt: new Date() })
        .where(inArray(schema.itineraryActivities.id, childIds))

      await this.activitiesService.linkChildrenToPackage(
        packageActivity.id,
        childIds,
        auth.userId,
      )
    }

    // 9. Update pricing with per-person breakdown if available
    if (pkg.perPersonPricing?.length > 0 || pkg.commissionAmount != null || pkg.taxesAndFees != null) {
      try {
        const updateData: Partial<typeof schema.activityPricing.$inferInsert> = {}
        if (pkg.perPersonPricing?.length > 0) {
          updateData.pricingType = 'per_person'
          updateData.pricingBreakdownJson = pkg.perPersonPricing.map((p) => ({
            label: p.label,
            priceCents: p.totalPriceCents,
          }))
        }
        if (pkg.commissionAmount != null) {
          updateData.commissionTotalCents = Math.round(pkg.commissionAmount * 100)
        }
        if (pkg.taxesAndFees != null) {
          updateData.taxesAndFeesCents = Math.round(pkg.taxesAndFees * 100)
        }

        await this.db.client
          .update(this.db.schema.activityPricing)
          .set(updateData)
          .where(eq(this.db.schema.activityPricing.activityId, packageActivity.id))

        // Validate breakdown sum matches total (accounting for add-ons like seat selections)
        if (totalPriceCents && pkg.perPersonPricing?.length > 0) {
          const breakdownSum = pkg.perPersonPricing.reduce((sum, p) => sum + p.totalPriceCents, 0)
          const addOnsCents = pkg.addOns ? Math.round(pkg.addOns * 100) : 0
          const expectedTotal = breakdownSum + addOnsCents
          if (Math.abs(expectedTotal - totalPriceCents) > 100) { // allow $1 tolerance
            this.logger.warn({
              message: 'Per-person pricing sum does not match total',
              breakdownSum,
              addOnsCents,
              expectedTotal,
              totalPriceCents,
              diff: expectedTotal - totalPriceCents,
            })
          }
        }
      } catch (error) {
        this.logger.warn({
          message: 'Failed to update package pricing breakdown',
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // 10. Create travelers and link to parent package
    const { travelersCreated, travelersMatched } = await this.createAndLinkTravelers(
      extraction.travelers,
      contactMatches,
      dto.contactOverrides || {},
      tripId,
      packageActivity.id,
      auth,
    )

    // 11. Store extracted policies in package_details (NOT activity_pricing)
    if (extractedTC || extractedCP) {
      try {
        await this.activitiesService.updatePackageDetails(packageActivity.id, {
          ...(extractedTC && { termsAndConditions: extractedTC }),
          ...(extractedCP && { cancellationPolicy: extractedCP }),
        })
      } catch (error) {
        this.logger.warn({
          message: 'Failed to store package-level policies — non-blocking',
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // 12. Link document to parent package
    await this.linkDocumentToActivity(dto.jobId, packageActivity.id)

    // 13. Update job
    await this.updateJobConfirmed(dto.jobId, tripId, null, packageActivity.id, 'package_confirmation')

    return {
      tripId,
      activityId: packageActivity.id,
      contactId: null,
      documentType: 'package_confirmation',
      travelersCreated,
      travelersMatched,
      supplierId: supplier?.id || null,
      policyDiff,
    }
  }

  private createChildActivity(
    component: OcrPackageExtraction['components'][number],
    itineraryDayId: string,
    confirmationNumber?: string,
    currency: string = 'CAD',
  ) {
    switch (component.componentType) {
      case 'flight': {
        const f = component.flight
        // Build segments array if merged flight has _segments
        const segments = (component as unknown as Record<string, unknown>)._segments as Array<{
          segmentOrder: number
          flightNumber: string | null
          departureAirportCode: string | null
          departureDate: string | null
          departureTime: string | null
          arrivalAirportCode: string | null
          arrivalDate: string | null
          arrivalTime: string | null
        }> | undefined

        return this.componentOrchestrationService.createFlight({
          itineraryDayId,
          componentType: 'flight',
          name: component.name || `Flight ${f?.flightNumber || ''}`.trim(),
          description: component.description || undefined,
          startDatetime: f?.departureDate
            ? `${f.departureDate}T${f.departureTime || '00:00'}`
            : undefined,
          endDatetime: f?.arrivalDate
            ? `${f.arrivalDate}T${f.arrivalTime || '23:59'}`
            : undefined,
          confirmationNumber: f?.confirmationNumber || confirmationNumber,
          status: 'confirmed',
          currency,
          totalPriceCents: 0, // child pricing = zero (parent has total)
          flightDetails: {
            airline: undefined,
            flightNumber: f?.flightNumber || undefined,
            departureAirportCode: f?.departureAirportCode || undefined,
            departureDate: f?.departureDate || undefined,
            departureTime: f?.departureTime || undefined,
            arrivalAirportCode: f?.arrivalAirportCode || undefined,
            arrivalDate: f?.arrivalDate || undefined,
            arrivalTime: f?.arrivalTime || undefined,
            segments: segments?.map((s) => ({
              segmentOrder: s.segmentOrder,
              flightNumber: s.flightNumber || undefined,
              departureAirportCode: s.departureAirportCode || undefined,
              departureDate: s.departureDate || undefined,
              departureTime: s.departureTime || undefined,
              arrivalAirportCode: s.arrivalAirportCode || undefined,
              arrivalDate: s.arrivalDate || undefined,
              arrivalTime: s.arrivalTime || undefined,
            })),
          },
        })
      }
      case 'lodging': {
        const l = component.lodging
        return this.componentOrchestrationService.createLodging({
          itineraryDayId,
          componentType: 'lodging',
          name: component.name || l?.propertyName || 'Hotel',
          startDatetime: l?.checkInDate ? `${l.checkInDate}T15:00` : undefined,
          endDatetime: l?.checkOutDate ? `${l.checkOutDate}T11:00` : undefined,
          confirmationNumber,
          status: 'confirmed',
          currency,
          totalPriceCents: 0, // child pricing = zero
          address: l?.address || undefined,
          lodgingDetails: {
            propertyName: l?.propertyName || undefined,
            address: l?.address || undefined,
            checkInDate: l?.checkInDate || undefined,
            checkOutDate: l?.checkOutDate || undefined,
            roomType: l?.roomType || undefined,
          },
        })
      }
      case 'transportation': {
        const t = component.transportation
        return this.componentOrchestrationService.createTransportation({
          itineraryDayId,
          componentType: 'transportation',
          name: component.name || 'Transfer',
          startDatetime: t?.pickupDate ? `${t.pickupDate}T00:00` : undefined,
          endDatetime: t?.dropoffDate ? `${t.dropoffDate}T23:59` : undefined,
          confirmationNumber,
          status: 'confirmed',
          currency,
          totalPriceCents: 0, // child pricing = zero
          transportationDetails: {
            subtype: this.mapTransportationType(t?.transportationType) as 'transfer' | 'car_rental' | 'private_car' | 'taxi' | 'shuttle' | 'train' | 'ferry' | 'bus' | 'limousine',
            pickupAddress: t?.pickupLocation || undefined,
            dropoffAddress: t?.dropoffLocation || undefined,
            pickupDate: t?.pickupDate || undefined,
            dropoffDate: t?.dropoffDate || undefined,
          },
        })
      }
      default:
        this.logger.warn(`Unsupported component type in package: ${component.componentType}`)
        return null
    }
  }

  private extractPackageDateRange(pkg: OcrPackageExtraction): { startDate: string | null; endDate: string | null } {
    const dates: string[] = []
    for (const comp of pkg.components) {
      const date = this.getComponentPrimaryDate(comp)
      if (date) dates.push(date)
      // Also check end dates
      if (comp.componentType === 'flight' && comp.flight?.arrivalDate) dates.push(comp.flight.arrivalDate)
      if (comp.componentType === 'lodging' && comp.lodging?.checkOutDate) dates.push(comp.lodging.checkOutDate)
      if (comp.componentType === 'transportation' && comp.transportation?.dropoffDate) dates.push(comp.transportation.dropoffDate)
    }
    if (dates.length === 0) return { startDate: null, endDate: null }
    dates.sort()
    return { startDate: dates[0]!, endDate: dates[dates.length - 1]! }
  }

  private getComponentPrimaryDate(component: OcrPackageExtraction['components'][number]): string | null {
    switch (component.componentType) {
      case 'flight': return component.flight?.departureDate || null
      case 'lodging': return component.lodging?.checkInDate || null
      case 'transportation': return component.transportation?.pickupDate || null
      default: return null
    }
  }

  /**
   * Normalize package components:
   * 1. Combine consecutive same-direction flight segments into single flights with segments
   * 2. Split multi-day transfers into separate arrival + departure transfers
   */
  private normalizePackageComponents(
    components: OcrPackageExtraction['components'],
  ): OcrPackageExtraction['components'] {
    // Pass 1: Combine consecutive flights into multi-segment flights
    const afterFlightMerge = this.mergeConsecutiveFlights(components)

    // Pass 2: Split multi-day transfers
    const result: OcrPackageExtraction['components'] = []
    for (const comp of afterFlightMerge) {
      if (
        comp.componentType === 'transportation' &&
        comp.transportation?.pickupDate &&
        comp.transportation?.dropoffDate &&
        comp.transportation.pickupDate !== comp.transportation.dropoffDate
      ) {
        const t = comp.transportation
        const providerName = comp.name || 'Transfer'

        result.push({
          ...comp,
          name: `Airport Transfer (Arrival) — ${providerName}`,
          transportation: { ...t, dropoffDate: t.pickupDate },
        })
        result.push({
          ...comp,
          name: `Airport Transfer (Departure) — ${providerName}`,
          transportation: {
            ...t,
            pickupDate: t.dropoffDate,
            pickupLocation: t.dropoffLocation || t.pickupLocation,
            dropoffLocation: t.pickupLocation || t.dropoffLocation,
          },
        })
        this.logger.log(
          `Split round-trip transfer "${comp.name}" into arrival (${t.pickupDate}) + departure (${t.dropoffDate})`,
        )
      } else {
        result.push(comp)
      }
    }

    return result
  }

  /**
   * Merge consecutive flight components that form a connecting itinerary.
   * E.g., YTS→YYZ + YYZ→CUN becomes one "YTS→CUN" flight with 2 segments.
   *
   * Two flights are "consecutive" if:
   * - The first flight's arrival airport matches the second flight's departure airport
   * - They depart on the same date (or arrival date = next departure date for overnight layovers)
   */
  private mergeConsecutiveFlights(
    components: OcrPackageExtraction['components'],
  ): OcrPackageExtraction['components'] {
    const result: OcrPackageExtraction['components'] = []
    const flights: OcrPackageExtraction['components'] = []
    const nonFlights: Array<{ index: number; comp: OcrPackageExtraction['components'][number] }> = []

    // Separate flights from non-flights while preserving order
    components.forEach((comp, i) => {
      if (comp.componentType === 'flight' && comp.flight) {
        flights.push(comp)
      } else {
        nonFlights.push({ index: i, comp })
      }
    })

    // Group consecutive flights into connected itineraries
    const flightGroups: OcrPackageExtraction['components'][] = []
    let currentGroup: OcrPackageExtraction['components'] = []

    for (const flight of flights) {
      if (currentGroup.length === 0) {
        currentGroup.push(flight)
        continue
      }

      const prevFlight = currentGroup[currentGroup.length - 1]!
      const prevArrival = prevFlight.flight!.arrivalAirportCode
      const curDeparture = flight.flight!.departureAirportCode
      const prevArrivalDate = prevFlight.flight!.arrivalDate
      const curDepartureDate = flight.flight!.departureDate

      // Connected if arrival airport matches departure airport
      // and they're on the same day or next day (overnight layover)
      const isConnecting =
        prevArrival &&
        curDeparture &&
        prevArrival === curDeparture &&
        prevArrivalDate &&
        curDepartureDate &&
        (prevArrivalDate === curDepartureDate || this.isNextDay(prevArrivalDate, curDepartureDate))

      if (isConnecting) {
        currentGroup.push(flight)
      } else {
        flightGroups.push(currentGroup)
        currentGroup = [flight]
      }
    }
    if (currentGroup.length > 0) {
      flightGroups.push(currentGroup)
    }

    // Convert each group to a single merged component
    for (const group of flightGroups) {
      if (group.length === 1) {
        result.push(group[0]!)
      } else {
        // Merge: first segment's departure → last segment's arrival
        const first = group[0]!
        const last = group[group.length - 1]!
        const originCode = first.flight!.departureAirportCode || '???'
        const destCode = last.flight!.arrivalAirportCode || '???'
        const direction = first.name?.toLowerCase().includes('inbound') ? 'Inbound' : 'Outbound'
        const flightNumbers = group.map(g => g.flight!.flightNumber).filter(Boolean).join('/')

        const merged = {
          componentType: 'flight' as const,
          name: `${direction} Flight ${flightNumbers} ${originCode}→${destCode}`,
          description: `${group.length} segments via ${group.slice(0, -1).map(g => g.flight!.arrivalAirportCode).join(', ')}`,
          flight: {
            ...first.flight!,
            arrivalAirportCode: last.flight!.arrivalAirportCode,
            arrivalDate: last.flight!.arrivalDate,
            arrivalTime: last.flight!.arrivalTime,
          },
          lodging: null,
          transportation: null,
          // Store segments for createChildActivity to use
          _segments: group.map((g, i) => ({
            segmentOrder: i,
            flightNumber: g.flight!.flightNumber || null,
            departureAirportCode: g.flight!.departureAirportCode || null,
            departureDate: g.flight!.departureDate || null,
            departureTime: g.flight!.departureTime || null,
            arrivalAirportCode: g.flight!.arrivalAirportCode || null,
            arrivalDate: g.flight!.arrivalDate || null,
            arrivalTime: g.flight!.arrivalTime || null,
            cabinClass: g.flight!.cabinClass || null,
            confirmationNumber: g.flight!.confirmationNumber || null,
          })),
        }

        result.push(merged)
        this.logger.log(
          `Merged ${group.length} flight segments into ${direction}: ${originCode}→${destCode} (via ${group.slice(0, -1).map(g => g.flight!.arrivalAirportCode).join('→')})`,
        )
      }
    }

    // Re-add non-flights
    for (const { comp } of nonFlights) {
      result.push(comp)
    }

    return result
  }

  private isNextDay(date1: string, date2: string): boolean {
    const d1 = new Date(date1 + 'T00:00:00Z')
    const d2 = new Date(date2 + 'T00:00:00Z')
    const diffMs = d2.getTime() - d1.getTime()
    return diffMs > 0 && diffMs <= 86400000 // exactly 1 day
  }

  // ============================================================================
  // Supplier & Policy Resolution
  // ============================================================================

  private getSupplierInfo(extraction: OcrExtractionResult): {
    supplierName: string | null
    supplierType: string
    extractedTC: string | null
    extractedCP: string | null
  } | null {
    const docType = extraction.documentType

    if (docType === 'flight_confirmation' && extraction.flight) {
      return {
        supplierName: extraction.flight.airline || null,
        supplierType: 'airline',
        extractedTC: extraction.flight.termsAndConditions || null,
        extractedCP: extraction.flight.cancellationPolicy || null,
      }
    }
    if (docType === 'hotel_confirmation' && extraction.lodging) {
      return {
        supplierName: extraction.lodging.propertyName || null,
        supplierType: 'hotel',
        extractedTC: extraction.lodging.termsAndConditions || null,
        extractedCP: extraction.lodging.cancellationPolicy || null,
      }
    }
    if (docType === 'cruise_confirmation' && extraction.cruise) {
      return {
        supplierName: extraction.cruise.cruiseLineName || null,
        supplierType: 'cruise_line',
        extractedTC: extraction.cruise.termsAndConditions || null,
        extractedCP: extraction.cruise.cancellationPolicy || null,
      }
    }
    if (docType === 'transportation_confirmation' && extraction.transportation) {
      return {
        supplierName: extraction.transportation.companyName || null,
        supplierType: 'transfer',
        extractedTC: extraction.transportation.termsAndConditions || null,
        extractedCP: extraction.transportation.cancellationPolicy || null,
      }
    }
    if (docType === 'dining_confirmation' && extraction.dining) {
      return {
        supplierName: extraction.dining.restaurantName || null,
        supplierType: 'restaurant',
        extractedTC: extraction.dining.termsAndConditions || null,
        extractedCP: extraction.dining.cancellationPolicy || null,
      }
    }
    if (docType === 'package_confirmation' && extraction.package) {
      return {
        supplierName: extraction.package.supplierName || null,
        supplierType: 'tour_operator',
        extractedTC: extraction.package.termsAndConditions || null,
        extractedCP: extraction.package.cancellationPolicy || null,
      }
    }
    return null
  }

  /**
   * Normalize text for comparison: trim + collapse whitespace
   */
  private normalizeText(text: string): string {
    return text.trim().replace(/\s+/g, ' ')
  }

  /**
   * Find or create supplier, compare policies, auto-populate blank defaults.
   * Returns supplier and policy diff (if any).
   */
  private async resolveSupplierAndPolicies(
    extraction: OcrExtractionResult,
  ): Promise<{
    supplier: { id: string; name: string } | null
    policyDiff: PolicyDiff | null
    extractedTC: string | null
    extractedCP: string | null
  }> {
    const info = this.getSupplierInfo(extraction)
    if (!info || !info.supplierName) {
      return { supplier: null, policyDiff: null, extractedTC: info?.extractedTC || null, extractedCP: info?.extractedCP || null }
    }

    // Trim extracted text; treat empty strings as null
    const extractedTC = info.extractedTC?.trim() || null
    const extractedCP = info.extractedCP?.trim() || null

    let supplier: { id: string; name: string; defaultTermsAndConditions?: string | null; defaultCancellationPolicy?: string | null }

    try {
      supplier = await this.suppliersService.findOrCreateByName(info.supplierName, {
        supplierType: info.supplierType,
        legalName: info.supplierName,
      })
    } catch (error) {
      this.logger.warn({
        message: 'Failed to find/create supplier for policy comparison',
        supplierName: info.supplierName,
        error: error instanceof Error ? error.message : String(error),
      })
      return { supplier: null, policyDiff: null, extractedTC, extractedCP }
    }

    // Auto-populate blank defaults (only if extracted text is >= 20 chars — likely a real policy)
    const MIN_POLICY_LENGTH = 20
    try {
      const updates: Record<string, string> = {}
      if (!supplier.defaultTermsAndConditions && extractedTC && extractedTC.length >= MIN_POLICY_LENGTH) {
        updates.defaultTermsAndConditions = extractedTC
      }
      if (!supplier.defaultCancellationPolicy && extractedCP && extractedCP.length >= MIN_POLICY_LENGTH) {
        updates.defaultCancellationPolicy = extractedCP
      }
      if (Object.keys(updates).length > 0) {
        await this.suppliersService.update(supplier.id, updates)
        this.logger.log(`Auto-populated supplier defaults for ${supplier.name}: ${Object.keys(updates).join(', ')}`)
        // Refresh supplier data after update
        supplier = { ...supplier, ...updates }
      }
    } catch (error) {
      this.logger.warn({
        message: 'Failed to auto-populate supplier defaults — non-blocking',
        error: error instanceof Error ? error.message : String(error),
      })
    }

    // Build diff: only when both exist and differ (after normalization)
    let policyDiff: PolicyDiff | null = null
    let tcDiff: PolicyFieldDiff | null = null
    let cpDiff: PolicyFieldDiff | null = null

    if (
      supplier.defaultTermsAndConditions &&
      extractedTC &&
      extractedTC.length >= MIN_POLICY_LENGTH &&
      this.normalizeText(supplier.defaultTermsAndConditions) !== this.normalizeText(extractedTC)
    ) {
      tcDiff = { supplierDefault: supplier.defaultTermsAndConditions, extracted: extractedTC }
    }

    if (
      supplier.defaultCancellationPolicy &&
      extractedCP &&
      extractedCP.length >= MIN_POLICY_LENGTH &&
      this.normalizeText(supplier.defaultCancellationPolicy) !== this.normalizeText(extractedCP)
    ) {
      cpDiff = { supplierDefault: supplier.defaultCancellationPolicy, extracted: extractedCP }
    }

    if (tcDiff || cpDiff) {
      policyDiff = {
        supplierId: supplier.id,
        supplierName: supplier.name,
        termsAndConditions: tcDiff,
        cancellationPolicy: cpDiff,
      }
    }

    return {
      supplier: { id: supplier.id, name: supplier.name },
      policyDiff,
      extractedTC,
      extractedCP,
    }
  }

  /**
   * Store extracted policies at activity level (activity_pricing table)
   */
  private async storeActivityPolicies(
    activityId: string,
    extractedTC: string | null,
    extractedCP: string | null,
  ): Promise<void> {
    if (!extractedTC && !extractedCP) return
    try {
      await this.db.client
        .update(schema.activityPricing)
        .set({
          ...(extractedTC && { termsAndConditions: extractedTC }),
          ...(extractedCP && { cancellationPolicy: extractedCP }),
        })
        .where(eq(schema.activityPricing.activityId, activityId))
    } catch (error) {
      this.logger.warn({
        message: 'Failed to store activity-level policies — non-blocking',
        activityId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  // ============================================================================
  // Shared Helpers
  // ============================================================================

  private async resolveTrip(
    dto: OcrConfirmDto,
    auth: AuthContext,
    defaults: { name: string; startDate?: string; endDate?: string },
  ): Promise<{ tripId: string; isNew: boolean }> {
    if (dto.tripId) {
      return { tripId: dto.tripId, isNew: false }
    }

    const trip = await this.tripsService.create(
      {
        name: defaults.name,
        status: 'booked',
        startDate: defaults.startDate,
        endDate: defaults.endDate,
        tripType: 'leisure',
      },
      auth.userId,
    )

    return { tripId: trip.id, isNew: true }
  }

  private async matchTravelersToContacts(
    travelers: OcrTraveler[],
    auth: AuthContext,
  ): Promise<ContactMatchResult[]> {
    const results: ContactMatchResult[] = []

    for (let i = 0; i < travelers.length; i++) {
      const traveler = travelers[i]!
      const firstName = this.titleCase(traveler.firstName)
      const lastName = this.titleCase(traveler.lastName)

      // Normalize DOB
      const dob = traveler.dateOfBirth && /^\d{4}-\d{2}-\d{2}$/.test(traveler.dateOfBirth)
        ? traveler.dateOfBirth
        : null

      // Query for existing contact
      const existing = await this.db.client
        .select({
          id: this.db.schema.contacts.id,
          firstName: this.db.schema.contacts.firstName,
          lastName: this.db.schema.contacts.lastName,
        })
        .from(this.db.schema.contacts)
        .where(
          and(
            eq(this.db.schema.contacts.agencyId, auth.agencyId),
            eq(this.db.schema.contacts.firstName, firstName),
            eq(this.db.schema.contacts.lastName, lastName),
            ...(dob ? [eq(this.db.schema.contacts.dateOfBirth, dob)] : []),
          ),
        )
        .limit(1)

      if (existing[0]) {
        results.push({
          travelerIndex: i,
          firstName,
          lastName,
          matchedContactId: existing[0].id,
          matchedContactName: `${existing[0].firstName} ${existing[0].lastName}`,
          isNewContact: false,
          confidence: dob ? 0.95 : 0.7,
        })
      } else {
        results.push({
          travelerIndex: i,
          firstName,
          lastName,
          matchedContactId: null,
          matchedContactName: null,
          isNewContact: true,
          confidence: 0,
        })
      }
    }

    return results
  }

  private async createAndLinkTravelers(
    travelers: OcrTraveler[],
    contactMatches: ContactMatchResult[],
    contactOverrides: Record<number, string | null>,
    tripId: string,
    activityId: string,
    auth: AuthContext,
  ): Promise<{ travelersCreated: number; travelersMatched: number }> {
    let travelersCreated = 0
    let travelersMatched = 0
    const travelerIds: string[] = []

    for (let i = 0; i < travelers.length; i++) {
      const traveler = travelers[i]!
      const match = contactMatches.find((m) => m.travelerIndex === i)

      // Check for user override
      let contactId = contactOverrides[i] !== undefined ? contactOverrides[i] : match?.matchedContactId

      if (!contactId) {
        // Create new contact
        const contact = await this.contactsService.create(
          {
            firstName: this.titleCase(traveler.firstName),
            lastName: this.titleCase(traveler.lastName),
            middleName: traveler.middleName || undefined,
            prefix: traveler.prefix || undefined,
            dateOfBirth: traveler.dateOfBirth || undefined,
            gender: traveler.gender || undefined,
            nationality: traveler.nationality || undefined,
            email: traveler.email || undefined,
            phone: traveler.phone || undefined,
            contactType: 'client',
            becameClientAt: new Date().toISOString(),
          },
          auth.agencyId,
          auth.userId,
        )
        contactId = contact.id
        // Assign the importing user as the contact owner
        await this.contactsService.updateOwner(contactId, auth.userId, auth.agencyId)
        travelersCreated++
      } else {
        travelersMatched++
      }

      // Create trip traveler
      const tripTraveler = await this.tripTravelersService.create(
        tripId,
        {
          contactId: contactId!,
          role: i === 0 ? 'primary_contact' : 'limited_access',
          travelerType: 'adult',
        } as CreateTripTravelerDto,
        auth,
      )
      travelerIds.push(tripTraveler.id)
    }

    // Link travelers to activity
    if (travelerIds.length > 0) {
      await this.activityTravelersService.linkTravelers(activityId, {
        tripTravelerIds: travelerIds,
      })
    }

    return { travelersCreated, travelersMatched }
  }

  private async linkDocumentToActivity(jobId: string, activityId: string): Promise<void> {
    try {
      const [job] = await this.db.client
        .select({ fileStoragePath: ocrImportJobs.fileStoragePath, fileName: ocrImportJobs.fileName })
        .from(ocrImportJobs)
        .where(eq(ocrImportJobs.id, jobId))
        .limit(1)

      if (job?.fileStoragePath) {
        await this.db.client
          .insert(this.db.schema.activityDocuments)
          .values({
            activityId,
            documentType: 'confirmation',
            fileUrl: job.fileStoragePath,
            fileName: job.fileName || 'document.pdf',
          })
      }
    } catch (error) {
      this.logger.warn({
        message: 'Failed to link document to activity',
        jobId,
        activityId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private async updateJobConfirmed(
    jobId: string,
    tripId: string | null,
    contactId: string | null,
    activityId: string | null,
    documentType: OcrDocumentType,
  ): Promise<void> {
    await this.db.client
      .update(ocrImportJobs)
      .set({
        status: 'confirmed',
        confirmedDocumentType: documentType,
        tripId,
        contactId,
        activityId,
        completedAt: new Date(),
      })
      .where(eq(ocrImportJobs.id, jobId))

    // Increment runbook success count
    await this.incrementRunbookSuccess(jobId)
  }

  private buildPreviewResponse(
    jobId: string,
    extraction: OcrExtractionResult,
    contactMatches: ContactMatchResult[],
  ): OcrPreviewResponse {
    return {
      status: 'preview_ready',
      jobId,
      documentType: extraction.documentType,
      confidence: extraction.confidence,
      extraction: {
        flight: extraction.flight || null,
        lodging: extraction.lodging || null,
        cruise: extraction.cruise || null,
        passport: extraction.passport || null,
        transportation: extraction.transportation || null,
        dining: extraction.dining || null,
        package: extraction.package ? {
          supplierName: extraction.package.supplierName || null,
          bookingReference: extraction.package.bookingReference || null,
          bookingDate: extraction.package.bookingDate || null,
          currency: extraction.package.currency || null,
          totalPriceCents: extraction.package.totalPrice ? Math.round(extraction.package.totalPrice * 100) : null,
          commissionRate: extraction.package.commissionRate || null,
          commissionAmountCents: extraction.package.commissionAmount ? Math.round(extraction.package.commissionAmount * 100) : null,
          taxesAndFeesCents: extraction.package.taxesAndFees ? Math.round(extraction.package.taxesAndFees * 100) : null,
          components: extraction.package.components,
          perPersonPricing: extraction.package.perPersonPricing,
        } : null,
        travelers: extraction.travelers,
        booking: extraction.booking || null,
      },
      contactMatches: contactMatches.map((m) => ({
        travelerIndex: m.travelerIndex,
        firstName: m.firstName,
        lastName: m.lastName,
        matchedContactId: m.matchedContactId,
        matchedContactName: m.matchedContactName,
        isNewContact: m.isNewContact,
        confidence: m.confidence,
      })),
      tokensUsed: (extraction.usage?.promptTokens ?? 0) + (extraction.usage?.completionTokens ?? 0),
    }
  }

  private titleCase(name: string): string {
    return name
      .toLowerCase()
      .split(/[\s-]+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  private async findRunbookHints(
    documentType: string,
  ): Promise<{ id: string; extractionHints: string } | null> {
    try {
      const [runbook] = await this.db.client
        .select({
          id: ocrSupplierRunbooks.id,
          extractionHints: ocrSupplierRunbooks.extractionHints,
        })
        .from(ocrSupplierRunbooks)
        .where(eq(ocrSupplierRunbooks.documentType, documentType))
        .limit(1)

      return runbook || null
    } catch {
      return null
    }
  }

  /**
   * Increment runbook success count after a successful confirm
   */
  private async incrementRunbookSuccess(jobId: string): Promise<void> {
    try {
      const [job] = await this.db.client
        .select({ runbookId: ocrImportJobs.runbookId })
        .from(ocrImportJobs)
        .where(eq(ocrImportJobs.id, jobId))
        .limit(1)

      if (job?.runbookId) {
        await this.db.client
          .update(ocrSupplierRunbooks)
          .set({
            successCount: sql`${ocrSupplierRunbooks.successCount} + 1`,
            lastUsedAt: new Date(),
          })
          .where(eq(ocrSupplierRunbooks.id, job.runbookId))
      }
    } catch {
      // Non-critical — don't fail the confirm
    }
  }

  private mapTransportationType(type: string | null | undefined): string {
    if (!type) return 'transfer'
    const map: Record<string, string> = {
      car_rental: 'car_rental',
      train: 'train',
      bus: 'bus',
      transfer: 'transfer',
      limo: 'limousine',
      limousine: 'limousine',
      taxi: 'taxi',
      shuttle: 'shuttle',
      ferry: 'ferry',
      private_car: 'private_car',
      car_service: 'private_car',
    }
    return map[type.toLowerCase()] || 'transfer'
  }
}
