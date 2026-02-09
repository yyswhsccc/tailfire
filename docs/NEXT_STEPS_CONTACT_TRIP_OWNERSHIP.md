# Next Steps: Contact & Trip Ownership Management

## Implementation Status: Phase 1 & 2 Complete ✅

### Phase 1 - Completed Features:
- ✅ Database migration with `inbound` status, nullable `owner_id`, `contact_shares` and `trip_shares` tables
- ✅ Drizzle schemas for new tables
- ✅ `ContactAccessService` with full access control logic
- ✅ Contact sharing CRUD endpoints (`/contacts/:id/shares`)
- ✅ Trip sharing CRUD endpoints (`/trips/:id/shares`)
- ✅ `contacts.controller.ts` now uses `ContactAccessService` (shares affect visibility)
- ✅ `trip-travelers.service.ts` validates contact access and filters snapshots
- ✅ `inbound` status in all DTOs and filter options
- ✅ Admin re-assignment endpoints for trips and contacts

### Phase 2 - Trip Share Enforcement (Complete ✅):
- ✅ Created `TripAccessService` with `canAccessTrip()`, `verifyReadAccess()`, `verifyWriteAccess()`
- ✅ `trips.controller.ts` enforces read/write access on all trip endpoints
- ✅ `trip-travelers.controller.ts` enforces trip access on all traveler endpoints
- ✅ `itineraries.controller.ts` enforces trip access on all itinerary endpoints
- ✅ `trip-media.controller.ts` enforces trip access on all media endpoints
- ✅ Bulk operations now use proper auth context and access checks
- ✅ Inbound trips (no owner) are read-only for agency users

### Phase 3 - Owner/Share Validation (Complete ✅):
- ✅ Created `UserValidationService` in `apps/api/src/common/` with `validateUserInAgency()` method
- ✅ Updated `trips.service.ts` `updateOwner()` to validate new owner exists in same agency
- ✅ Updated `contacts.service.ts` `updateOwner()` to validate new owner exists in same agency
- ✅ Updated `contact-shares.service.ts` `create()` to validate target user exists in same agency
- ✅ Updated `trip-shares.service.ts` `create()` to validate target user exists in same agency

---

## Phase 4: Share Endpoint Validation (Medium Priority)

### Issue
Share endpoints use shared-types DTOs without class-validator, causing 500 errors instead of 400s for invalid input.

### Tasks
1. **Create `CreateContactShareDto`** with class-validator
   ```typescript
   export class CreateContactShareDto {
     @IsUUID()
     sharedWithUserId: string

     @IsIn(['basic', 'full'])
     accessLevel: 'basic' | 'full'

     @IsOptional()
     @IsString()
     notes?: string
   }
   ```

2. **Create `CreateTripShareDto`** with class-validator
   ```typescript
   export class CreateTripShareDto {
     @IsUUID()
     sharedWithUserId: string

     @IsIn(['read', 'write'])
     accessLevel: 'read' | 'write'

     @IsOptional()
     @IsString()
     notes?: string
   }
   ```

3. **Update controllers to use new DTOs**

### Files to Create/Modify
- `apps/api/src/contacts/dto/create-contact-share.dto.ts` (CREATE)
- `apps/api/src/trips/dto/create-trip-share.dto.ts` (CREATE)
- `apps/api/src/contacts/contact-shares.controller.ts`
- `apps/api/src/trips/trip-shares.controller.ts`

---

## Phase 5: Frontend Updates (Lower Priority)

### Tasks
1. **Contact sharing UI**
   - Share dialog in contact detail view
   - Share badge showing access level

2. **Trip sharing UI**
   - Share dialog in trip sidebar
   - Collaborator list with access levels

3. **Admin re-assignment UI**
   - Re-assign owner dialog for admins
   - Bulk ownership management view

4. **Update status dropdowns**
   - Add `inbound` to trip status selectors
   - Handle inbound-specific UI (no owner badge)

### Files to Create
- `apps/admin/src/components/contacts/contact-sharing-dialog.tsx`
- `apps/admin/src/components/trips/trip-sharing-dialog.tsx`
- `apps/admin/src/components/admin/reassign-owner-dialog.tsx`
- `apps/admin/src/hooks/use-contact-shares.ts`
- `apps/admin/src/hooks/use-trip-shares.ts`

---

## Phase 6: Testing (Required Before Production)

### Unit Tests
- [ ] `ContactAccessService` - all access level scenarios
- [ ] `contact-shares.service.ts` - CRUD operations
- [ ] `trip-shares.service.ts` - CRUD operations
- [ ] Snapshot filtering in `trip-travelers.service.ts`

### Integration Tests
- [ ] Contact visibility with shares
- [ ] Trip access with shares (after Phase 2)
- [ ] Owner reassignment validation (after Phase 3)
- [ ] Cross-agency share prevention

### E2E Tests
- [ ] Agent A creates contact, Agent B sees basic fields only
- [ ] Agent A shares with full access, Agent B sees all fields
- [ ] Admin creates inbound trip with no owner
- [ ] Admin re-assigns trip to different user

---

## Priority Order

1. **Commit Current Implementation** - Phase 1 complete
2. **Phase 2: Trip Share Enforcement** - Security critical
3. **Phase 3: Owner/Share Validation** - Security critical
4. **Phase 4: Share Endpoint Validation** - Reliability
5. **Phase 6: Testing** - Before production
6. **Phase 5: Frontend Updates** - User-facing features

---

## Technical Notes

### RLS Bypass
The API uses a service role that bypasses RLS. All access control must be enforced in the application layer.

### Circular Dependencies
`TripsModule` imports `ContactsModule` via `forwardRef`. No circular dependency issues.

### Backwards Compatibility
- Auth context is optional in `trip-travelers.service.ts` for backwards compatibility
- Will be made required in future version
