# Client Portal API Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the `/client-portal/*` API controller so authenticated portal clients can view trips, itineraries, approve/reject proposals, and manage profiles.

**Architecture:** New `ClientPortalModule` in `apps/api/src/client-portal/` with its own controller and service. Reuses existing `PortalAuthGuard` for auth and `TripsService.buildItinerarySnapshot()` for itinerary data. The `itinerary_feedback` table (already migrated) stores approval/change-request feedback.

**Tech Stack:** NestJS, Drizzle ORM, Supabase JWT (portal-jwt strategy), Vitest (admin tests)

---

## Task 1: Create ClientPortalModule scaffold

**Files:**
- Create: `apps/api/src/client-portal/client-portal.module.ts`
- Create: `apps/api/src/client-portal/client-portal.controller.ts`
- Create: `apps/api/src/client-portal/client-portal.service.ts`
- Modify: `apps/api/src/app.module.ts`

**Step 1: Create the module**

```typescript
// apps/api/src/client-portal/client-portal.module.ts
import { Module } from '@nestjs/common'
import { ClientPortalController } from './client-portal.controller'
import { ClientPortalService } from './client-portal.service'
import { AuthModule } from '../auth/auth.module'
import { TripsModule } from '../trips/trips.module'
import { DatabaseModule } from '../db/database.module'

@Module({
  imports: [AuthModule, TripsModule, DatabaseModule],
  controllers: [ClientPortalController],
  providers: [ClientPortalService],
})
export class ClientPortalModule {}
```

**Step 2: Create empty controller**

```typescript
// apps/api/src/client-portal/client-portal.controller.ts
import { Controller, UseGuards } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Public } from '../auth/decorators/public.decorator'
import { PortalAuthGuard } from '../auth/guards/portal-auth.guard'
import { ClientPortalService } from './client-portal.service'

@ApiTags('Client Portal')
@Controller('client-portal')
@Public()
@UseGuards(PortalAuthGuard)
export class ClientPortalController {
  constructor(private readonly clientPortalService: ClientPortalService) {}
}
```

**Step 3: Create empty service**

```typescript
// apps/api/src/client-portal/client-portal.service.ts
import { Injectable, Logger } from '@nestjs/common'
import { DatabaseService } from '../db/database.service'

@Injectable()
export class ClientPortalService {
  private readonly logger = new Logger(ClientPortalService.name)

  constructor(private readonly db: DatabaseService) {}
}
```

**Step 4: Register in app.module.ts**

Add `ClientPortalModule` to the imports array in `apps/api/src/app.module.ts`.

**Step 5: Verify**

Run: `cd apps/api && npx nest build --dry-run 2>&1 | head -5` or check that `turbo dev` restarts without errors.

**Step 6: Commit**

```bash
git add apps/api/src/client-portal/ apps/api/src/app.module.ts
git commit -m "feat(client-portal): scaffold ClientPortalModule with empty controller and service"
```

---

## Task 2: GET /client-portal/trips — List client's trips

**Files:**
- Modify: `apps/api/src/client-portal/client-portal.controller.ts`
- Modify: `apps/api/src/client-portal/client-portal.service.ts`

**Step 1: Add service method**

The service needs to:
1. Find the contact by `portalUserId` (from `PortalAuthContext.userId` which is the Supabase user ID)
2. Look up that user in `client_portal_users` to get `contactId`
3. Query `trip_travelers` for trips where this contact is a traveler
4. Also include trips where contact is `primaryContactId`
5. Return trip list with `travelerRole`

```typescript
// In client-portal.service.ts

import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common'
import { eq, and, or, desc, inArray } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'

// Add helper method:
private async resolveContact(portalUserId: string) {
  // Find the client_portal_users row by supabaseUserId
  const [portalUser] = await this.db.client
    .select({
      id: this.db.schema.clientPortalUsers.id,
      contactId: this.db.schema.clientPortalUsers.contactId,
      agencyId: this.db.schema.clientPortalUsers.agencyId,
    })
    .from(this.db.schema.clientPortalUsers)
    .where(eq(this.db.schema.clientPortalUsers.supabaseUserId, portalUserId))
    .limit(1)

  if (!portalUser) {
    throw new NotFoundException('Portal user not found')
  }

  return portalUser
}

// Add trips list method:
async getTrips(portalUserId: string) {
  const portalUser = await this.resolveContact(portalUserId)

  // Find trip IDs where contact is a traveler
  const travelerRows = await this.db.client
    .select({
      tripId: this.db.schema.tripTravelers.tripId,
      role: this.db.schema.tripTravelers.role,
    })
    .from(this.db.schema.tripTravelers)
    .where(eq(this.db.schema.tripTravelers.contactId, portalUser.contactId))

  const travelerTripIds = travelerRows.map((t) => t.tripId)
  const roleByTripId = new Map(travelerRows.map((t) => [t.tripId, t.role]))

  // Build OR condition: primary contact OR traveler
  const conditions = [
    eq(this.db.schema.trips.primaryContactId, portalUser.contactId),
  ]
  if (travelerTripIds.length > 0) {
    conditions.push(inArray(this.db.schema.trips.id, travelerTripIds))
  }

  const trips = await this.db.client
    .select({
      id: this.db.schema.trips.id,
      name: this.db.schema.trips.name,
      description: this.db.schema.trips.description,
      status: this.db.schema.trips.status,
      tripType: this.db.schema.trips.tripType,
      startDate: this.db.schema.trips.startDate,
      endDate: this.db.schema.trips.endDate,
      coverPhotoUrl: this.db.schema.trips.coverPhotoUrl,
    })
    .from(this.db.schema.trips)
    .where(
      and(
        or(...conditions),
        eq(this.db.schema.trips.agencyId, portalUser.agencyId),
      ),
    )
    .orderBy(desc(this.db.schema.trips.createdAt))

  return trips.map((t) => ({
    tripId: t.id,
    name: t.name,
    description: t.description,
    startDate: t.startDate,
    endDate: t.endDate,
    status: t.status,
    coverPhotoUrl: t.coverPhotoUrl,
    tripType: t.tripType,
    travelerRole: roleByTripId.get(t.id) ?? 'primary_contact',
  }))
}
```

**Step 2: Add controller endpoint**

```typescript
// In client-portal.controller.ts
import { Get } from '@nestjs/common'
import { GetPortalAuth } from '../auth/decorators/portal-auth-context.decorator'
import type { PortalAuthContext } from '../auth/auth.types'

@Get('trips')
async getTrips(@GetPortalAuth() auth: PortalAuthContext) {
  return this.clientPortalService.getTrips(auth.userId)
}
```

**Step 3: Verify**

Check dev server restarts cleanly. If possible, test with a portal user JWT.

**Step 4: Commit**

```bash
git add apps/api/src/client-portal/
git commit -m "feat(client-portal): add GET /client-portal/trips endpoint"
```

---

## Task 3: GET /client-portal/trips/:tripId — Trip detail

**Files:**
- Modify: `apps/api/src/client-portal/client-portal.service.ts`
- Modify: `apps/api/src/client-portal/client-portal.controller.ts`

**Step 1: Add authorization helper**

```typescript
// In client-portal.service.ts
private async verifyTripAccess(contactId: string, agencyId: string, tripId: string) {
  // Check traveler link OR primary contact
  const [traveler] = await this.db.client
    .select({ role: this.db.schema.tripTravelers.role })
    .from(this.db.schema.tripTravelers)
    .where(
      and(
        eq(this.db.schema.tripTravelers.tripId, tripId),
        eq(this.db.schema.tripTravelers.contactId, contactId),
      ),
    )
    .limit(1)

  if (!traveler) {
    // Check if primary contact
    const [trip] = await this.db.client
      .select({ id: this.db.schema.trips.id })
      .from(this.db.schema.trips)
      .where(
        and(
          eq(this.db.schema.trips.id, tripId),
          eq(this.db.schema.trips.primaryContactId, contactId),
          eq(this.db.schema.trips.agencyId, agencyId),
        ),
      )
      .limit(1)

    if (!trip) {
      throw new ForbiddenException('You do not have access to this trip')
    }
  }
}
```

**Step 2: Add trip detail method**

```typescript
// In client-portal.service.ts — inject TripsService
import { TripsService } from '../trips/trips.service'

constructor(
  private readonly db: DatabaseService,
  private readonly tripsService: TripsService,
) {}

async getTripDetail(portalUserId: string, tripId: string) {
  const portalUser = await this.resolveContact(portalUserId)
  await this.verifyTripAccess(portalUser.contactId, portalUser.agencyId, tripId)

  const trip = await this.tripsService.findOne(tripId)
  if (!trip) {
    throw new NotFoundException('Trip not found')
  }

  // Get itineraries (proposing + approved only for client view)
  const itineraries = await this.db.client
    .select()
    .from(this.db.schema.itineraries)
    .where(eq(this.db.schema.itineraries.tripId, tripId))
    .orderBy(this.db.schema.itineraries.sequenceOrder)

  const clientItineraries = itineraries
    .filter((it) => ['proposing', 'approved'].includes(it.status))
    .map((it) => ({
      id: it.id,
      name: it.name,
      description: it.description,
      status: it.status,
      startDate: it.startDate,
      endDate: it.endDate,
      coverPhoto: it.coverPhoto,
      overview: it.overview,
      primaryDestinationName: it.primaryDestinationName,
      sequenceOrder: it.sequenceOrder,
    }))

  // Get travelers on this trip
  const travelers = await this.db.client
    .select({
      id: this.db.schema.tripTravelers.id,
      role: this.db.schema.tripTravelers.role,
      travelerType: this.db.schema.tripTravelers.travelerType,
      firstName: this.db.schema.contacts.firstName,
      lastName: this.db.schema.contacts.lastName,
      preferredName: this.db.schema.contacts.preferredName,
    })
    .from(this.db.schema.tripTravelers)
    .innerJoin(
      this.db.schema.contacts,
      eq(this.db.schema.tripTravelers.contactId, this.db.schema.contacts.id),
    )
    .where(eq(this.db.schema.tripTravelers.tripId, tripId))

  return {
    id: trip.id,
    name: trip.name,
    description: trip.description,
    startDate: trip.startDate,
    endDate: trip.endDate,
    status: trip.status,
    coverPhotoUrl: trip.coverPhotoUrl,
    tripType: trip.tripType,
    pricingVisibility: trip.pricingVisibility,
    itineraries: clientItineraries,
    travelers,
  }
}
```

**Step 3: Add controller endpoint**

```typescript
@Get('trips/:tripId')
async getTripDetail(
  @GetPortalAuth() auth: PortalAuthContext,
  @Param('tripId') tripId: string,
) {
  return this.clientPortalService.getTripDetail(auth.userId, tripId)
}
```

**Step 4: Commit**

```bash
git add apps/api/src/client-portal/
git commit -m "feat(client-portal): add GET /client-portal/trips/:tripId with access control"
```

---

## Task 4: GET /client-portal/trips/:tripId/itineraries/:itineraryId — Full itinerary

**Files:**
- Modify: `apps/api/src/client-portal/client-portal.service.ts`
- Modify: `apps/api/src/client-portal/client-portal.controller.ts`

**Step 1: Add itinerary detail method**

This reuses `TripsService.buildItinerarySnapshot()` which already produces the full `SharedItineraryDto` with days, activities, pricing, and media.

```typescript
// In client-portal.service.ts
async getItineraryDetail(portalUserId: string, tripId: string, itineraryId: string) {
  const portalUser = await this.resolveContact(portalUserId)
  await this.verifyTripAccess(portalUser.contactId, portalUser.agencyId, tripId)

  // Verify itinerary belongs to this trip
  const [itinerary] = await this.db.client
    .select()
    .from(this.db.schema.itineraries)
    .where(
      and(
        eq(this.db.schema.itineraries.id, itineraryId),
        eq(this.db.schema.itineraries.tripId, tripId),
      ),
    )
    .limit(1)

  if (!itinerary) {
    throw new NotFoundException('Itinerary not found')
  }

  // Only allow viewing proposing/approved itineraries
  if (!['proposing', 'approved'].includes(itinerary.status)) {
    throw new NotFoundException('Itinerary not found')
  }

  // Get trip for pricing visibility
  const trip = await this.tripsService.findOne(tripId)
  const pricingVisible = trip?.pricingVisibility === 'show_all'

  // Reuse the existing buildItinerarySnapshot which produces SharedItineraryDto
  const snapshot = await this.tripsService.buildItinerarySnapshot(itinerary, pricingVisible)

  return {
    ...snapshot,
    pricingVisibility: trip?.pricingVisibility ?? 'hide_all',
  }
}
```

**Step 2: Add controller endpoint**

```typescript
@Get('trips/:tripId/itineraries/:itineraryId')
async getItineraryDetail(
  @GetPortalAuth() auth: PortalAuthContext,
  @Param('tripId') tripId: string,
  @Param('itineraryId') itineraryId: string,
) {
  return this.clientPortalService.getItineraryDetail(auth.userId, tripId, itineraryId)
}
```

**Step 3: Commit**

```bash
git add apps/api/src/client-portal/
git commit -m "feat(client-portal): add GET itinerary detail with full activity data"
```

---

## Task 5: POST approve + POST request-changes + GET feedback

**Files:**
- Create: `apps/api/src/client-portal/dto/submit-feedback.dto.ts`
- Modify: `apps/api/src/client-portal/client-portal.service.ts`
- Modify: `apps/api/src/client-portal/client-portal.controller.ts`

**Step 1: Create DTO**

```typescript
// apps/api/src/client-portal/dto/submit-feedback.dto.ts
import { IsString, IsOptional, IsArray, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'

class ActivityNoteDto {
  @IsString()
  activityId: string

  @IsString()
  activityName: string

  @IsString()
  note: string
}

export class SubmitFeedbackDto {
  @IsOptional()
  @IsString()
  message?: string

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActivityNoteDto)
  activityNotes?: ActivityNoteDto[]
}
```

**Step 2: Add feedback service methods**

The `itinerary_feedback` table is already migrated with columns: `itinerary_id`, `client_portal_user_id`, `agency_id`, `feedback_type` (approval/change_request), `message`, `activity_notes` (JSONB), `status` (pending/reviewed/resolved).

```typescript
// In client-portal.service.ts

async submitApproval(portalUserId: string, tripId: string, itineraryId: string, dto: SubmitFeedbackDto) {
  const portalUser = await this.resolveContact(portalUserId)
  await this.verifyTripAccess(portalUser.contactId, portalUser.agencyId, tripId)

  // Verify itinerary is proposing
  const [itinerary] = await this.db.client
    .select()
    .from(this.db.schema.itineraries)
    .where(
      and(
        eq(this.db.schema.itineraries.id, itineraryId),
        eq(this.db.schema.itineraries.tripId, tripId),
      ),
    )
    .limit(1)

  if (!itinerary || itinerary.status !== 'proposing') {
    throw new NotFoundException('Itinerary not available for approval')
  }

  // Record feedback
  await this.db.client
    .insert(this.db.schema.itineraryFeedback)
    .values({
      itineraryId,
      clientPortalUserId: portalUser.id,
      agencyId: portalUser.agencyId,
      feedbackType: 'approval',
      message: dto.message || null,
      activityNotes: dto.activityNotes || null,
    })

  // Transition itinerary to approved
  await this.db.client
    .update(this.db.schema.itineraries)
    .set({ status: 'approved', isSelected: true })
    .where(eq(this.db.schema.itineraries.id, itineraryId))

  // Set clientSelectedItineraryId on the trip
  await this.db.client
    .update(this.db.schema.trips)
    .set({ clientSelectedItineraryId: itineraryId })
    .where(eq(this.db.schema.trips.id, tripId))

  return { success: true }
}

async submitChangeRequest(portalUserId: string, tripId: string, itineraryId: string, dto: SubmitFeedbackDto) {
  const portalUser = await this.resolveContact(portalUserId)
  await this.verifyTripAccess(portalUser.contactId, portalUser.agencyId, tripId)

  // Verify itinerary exists and belongs to trip
  const [itinerary] = await this.db.client
    .select()
    .from(this.db.schema.itineraries)
    .where(
      and(
        eq(this.db.schema.itineraries.id, itineraryId),
        eq(this.db.schema.itineraries.tripId, tripId),
      ),
    )
    .limit(1)

  if (!itinerary) {
    throw new NotFoundException('Itinerary not found')
  }

  // Record feedback
  await this.db.client
    .insert(this.db.schema.itineraryFeedback)
    .values({
      itineraryId,
      clientPortalUserId: portalUser.id,
      agencyId: portalUser.agencyId,
      feedbackType: 'change_request',
      message: dto.message || null,
      activityNotes: dto.activityNotes || null,
    })

  return { success: true }
}

async getFeedbackHistory(portalUserId: string, tripId: string, itineraryId: string) {
  const portalUser = await this.resolveContact(portalUserId)
  await this.verifyTripAccess(portalUser.contactId, portalUser.agencyId, tripId)

  const feedback = await this.db.client
    .select({
      id: this.db.schema.itineraryFeedback.id,
      feedbackType: this.db.schema.itineraryFeedback.feedbackType,
      message: this.db.schema.itineraryFeedback.message,
      activityNotes: this.db.schema.itineraryFeedback.activityNotes,
      status: this.db.schema.itineraryFeedback.status,
      reviewedAt: this.db.schema.itineraryFeedback.reviewedAt,
      createdAt: this.db.schema.itineraryFeedback.createdAt,
      // Join to get submitter name
      firstName: this.db.schema.clientPortalUsers.firstName,
      lastName: this.db.schema.clientPortalUsers.lastName,
    })
    .from(this.db.schema.itineraryFeedback)
    .innerJoin(
      this.db.schema.clientPortalUsers,
      eq(this.db.schema.itineraryFeedback.clientPortalUserId, this.db.schema.clientPortalUsers.id),
    )
    .where(
      and(
        eq(this.db.schema.itineraryFeedback.itineraryId, itineraryId),
        eq(this.db.schema.itineraryFeedback.agencyId, portalUser.agencyId),
      ),
    )
    .orderBy(desc(this.db.schema.itineraryFeedback.createdAt))

  return feedback.map((f) => ({
    id: f.id,
    feedbackType: f.feedbackType,
    message: f.message,
    activityNotes: f.activityNotes,
    status: f.status,
    reviewedAt: f.reviewedAt?.toISOString() ?? null,
    createdAt: f.createdAt.toISOString(),
    submittedBy: {
      firstName: f.firstName,
      lastName: f.lastName,
    },
  }))
}
```

**Step 3: Add controller endpoints**

```typescript
import { Post, Body, Param } from '@nestjs/common'
import { SubmitFeedbackDto } from './dto/submit-feedback.dto'

@Post('trips/:tripId/itineraries/:itineraryId/approve')
async submitApproval(
  @GetPortalAuth() auth: PortalAuthContext,
  @Param('tripId') tripId: string,
  @Param('itineraryId') itineraryId: string,
  @Body() dto: SubmitFeedbackDto,
) {
  return this.clientPortalService.submitApproval(auth.userId, tripId, itineraryId, dto)
}

@Post('trips/:tripId/itineraries/:itineraryId/request-changes')
async submitChangeRequest(
  @GetPortalAuth() auth: PortalAuthContext,
  @Param('tripId') tripId: string,
  @Param('itineraryId') itineraryId: string,
  @Body() dto: SubmitFeedbackDto,
) {
  return this.clientPortalService.submitChangeRequest(auth.userId, tripId, itineraryId, dto)
}

@Get('trips/:tripId/itineraries/:itineraryId/feedback')
async getFeedbackHistory(
  @GetPortalAuth() auth: PortalAuthContext,
  @Param('tripId') tripId: string,
  @Param('itineraryId') itineraryId: string,
) {
  return this.clientPortalService.getFeedbackHistory(auth.userId, tripId, itineraryId)
}
```

**Step 4: Commit**

```bash
git add apps/api/src/client-portal/
git commit -m "feat(client-portal): add approve, request-changes, and feedback history endpoints"
```

---

## Task 6: GET + PATCH /client-portal/profile

**Files:**
- Create: `apps/api/src/client-portal/dto/update-client-profile.dto.ts`
- Modify: `apps/api/src/client-portal/client-portal.service.ts`
- Modify: `apps/api/src/client-portal/client-portal.controller.ts`

**Step 1: Create DTO**

```typescript
// apps/api/src/client-portal/dto/update-client-profile.dto.ts
import { IsString, IsOptional } from 'class-validator'

export class UpdateClientProfileDto {
  @IsOptional() @IsString() firstName?: string
  @IsOptional() @IsString() lastName?: string
  @IsOptional() @IsString() legalFirstName?: string
  @IsOptional() @IsString() legalLastName?: string
  @IsOptional() @IsString() middleName?: string
  @IsOptional() @IsString() preferredName?: string
  @IsOptional() @IsString() prefix?: string
  @IsOptional() @IsString() suffix?: string
  @IsOptional() @IsString() phone?: string
  @IsOptional() @IsString() gender?: string
  @IsOptional() @IsString() pronouns?: string
  @IsOptional() @IsString() dateOfBirth?: string
  @IsOptional() @IsString() passportNumber?: string
  @IsOptional() @IsString() passportExpiry?: string
  @IsOptional() @IsString() passportCountry?: string
  @IsOptional() @IsString() passportIssueDate?: string
  @IsOptional() @IsString() nationality?: string
  @IsOptional() @IsString() redressNumber?: string
  @IsOptional() @IsString() knownTravelerNumber?: string
  // Frontend sends address1/address2/state — map to DB fields
  @IsOptional() @IsString() address1?: string
  @IsOptional() @IsString() address2?: string
  @IsOptional() @IsString() city?: string
  @IsOptional() @IsString() state?: string
  @IsOptional() @IsString() postalCode?: string
  @IsOptional() @IsString() country?: string
  @IsOptional() @IsString() dietaryRequirements?: string
  @IsOptional() @IsString() mobilityRequirements?: string
  @IsOptional() @IsString() seatPreference?: string
  @IsOptional() @IsString() cabinPreference?: string
  @IsOptional() @IsString() floorPreference?: string
}
```

**Step 2: Add profile service methods**

The frontend sends `address1`/`address2`/`state` but the DB uses `addressLine1`/`addressLine2`/`province`. Map both directions.

```typescript
// In client-portal.service.ts

async getProfile(portalUserId: string) {
  const portalUser = await this.resolveContact(portalUserId)

  const [contact] = await this.db.client
    .select()
    .from(this.db.schema.contacts)
    .where(eq(this.db.schema.contacts.id, portalUser.contactId))
    .limit(1)

  if (!contact) {
    throw new NotFoundException('Contact not found')
  }

  // Map DB field names to frontend field names
  return {
    id: contact.id,
    firstName: contact.firstName,
    lastName: contact.lastName,
    legalFirstName: contact.legalFirstName,
    legalLastName: contact.legalLastName,
    middleName: contact.middleName,
    preferredName: contact.preferredName,
    prefix: contact.prefix,
    suffix: contact.suffix,
    email: contact.email,
    phone: contact.phone,
    gender: contact.gender,
    pronouns: contact.pronouns,
    dateOfBirth: contact.dateOfBirth,
    passportNumber: contact.passportNumber,
    passportExpiry: contact.passportExpiry,
    passportCountry: contact.passportCountry,
    passportIssueDate: contact.passportIssueDate,
    nationality: contact.nationality,
    redressNumber: contact.redressNumber,
    knownTravelerNumber: contact.knownTravelerNumber,
    // Map DB → frontend field names
    address1: contact.addressLine1,
    address2: contact.addressLine2,
    city: contact.city,
    state: contact.province,
    postalCode: contact.postalCode,
    country: contact.country,
    dietaryRequirements: contact.dietaryRequirements,
    mobilityRequirements: contact.mobilityRequirements,
    seatPreference: contact.seatPreference,
    cabinPreference: contact.cabinPreference,
    floorPreference: contact.floorPreference,
    travelPreferences: null,
  }
}

async updateProfile(portalUserId: string, dto: UpdateClientProfileDto) {
  const portalUser = await this.resolveContact(portalUserId)

  // Map frontend field names → DB field names
  const fieldMap: Record<string, string> = {
    address1: 'addressLine1',
    address2: 'addressLine2',
    state: 'province',
  }

  const allowedFields = [
    'firstName', 'lastName', 'preferredName', 'prefix', 'suffix',
    'legalFirstName', 'legalLastName', 'middleName',
    'phone', 'dateOfBirth', 'gender', 'pronouns',
    'passportNumber', 'passportExpiry', 'passportCountry', 'passportIssueDate', 'nationality',
    'redressNumber', 'knownTravelerNumber',
    'address1', 'address2', 'city', 'state', 'postalCode', 'country',
    'dietaryRequirements', 'mobilityRequirements',
    'seatPreference', 'cabinPreference', 'floorPreference',
  ]

  const updateData: Record<string, any> = { updatedAt: new Date() }

  for (const field of allowedFields) {
    if ((dto as any)[field] !== undefined) {
      const dbField = fieldMap[field] || field
      const value = (dto as any)[field]
      updateData[dbField] = value === '' ? null : value
    }
  }

  await this.db.client
    .update(this.db.schema.contacts)
    .set(updateData)
    .where(eq(this.db.schema.contacts.id, portalUser.contactId))

  return this.getProfile(portalUserId)
}
```

**Step 3: Add controller endpoints**

```typescript
import { Patch, Body } from '@nestjs/common'
import { UpdateClientProfileDto } from './dto/update-client-profile.dto'

@Get('profile')
async getProfile(@GetPortalAuth() auth: PortalAuthContext) {
  return this.clientPortalService.getProfile(auth.userId)
}

@Patch('profile')
async updateProfile(
  @GetPortalAuth() auth: PortalAuthContext,
  @Body() dto: UpdateClientProfileDto,
) {
  return this.clientPortalService.updateProfile(auth.userId, dto)
}
```

**Step 4: Commit**

```bash
git add apps/api/src/client-portal/
git commit -m "feat(client-portal): add profile GET/PATCH with field name mapping"
```

---

## Task 7: Verify end-to-end + typecheck

**Step 1: Run API typecheck**

```bash
cd apps/api && pnpm typecheck
```

Fix any type errors. Common issues:
- Missing schema exports in `packages/database/src/schema/index.ts` for `itineraryFeedback` or `clientPortalUsers`
- `TripsService.buildItinerarySnapshot` visibility — ensure it's `public` (it should be already based on the code)

**Step 2: Run admin typecheck**

```bash
cd apps/admin && pnpm typecheck
```

**Step 3: Start dev server and verify endpoints respond**

```bash
# In tmux pane 2
turbo dev
```

Test with curl (will get 401 without portal JWT, but should not 404):
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3101/api/v1/client-portal/trips
# Expected: 401 (not 404)
```

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(client-portal): resolve type errors and ensure endpoints are registered"
```

---

## Summary

| Task | Endpoint(s) | Key Pattern |
|------|------------|-------------|
| 1 | Module scaffold | Same pattern as `PortalModule` |
| 2 | `GET /trips` | `trip_travelers` + `primaryContactId` join |
| 3 | `GET /trips/:tripId` | Access control via `verifyTripAccess` |
| 4 | `GET .../itineraries/:id` | Reuses `buildItinerarySnapshot` |
| 5 | `POST approve`, `POST request-changes`, `GET feedback` | `itinerary_feedback` table |
| 6 | `GET/PATCH profile` | Field name mapping (address1→addressLine1) |
| 7 | Verification | Typecheck + endpoint registration |
