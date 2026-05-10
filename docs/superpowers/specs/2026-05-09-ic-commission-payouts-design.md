# IC Commission Payouts — CRA-Conformant Self-Serve Disbursement

**Status:** Design — pending tax/legal review on items flagged C1, C2, RCTI text
**Author:** Brainstormed with Claude (Opus 4.7), validated by Codex (gpt-5.4 high)
**Date:** 2026-05-09
**Phase 1 ships:** Mechanics + manual disbursement (admin sends e-Transfer/Wise/wire by hand, records proof)
**Phase 2 ships:** Provider integration (VoPay or Dream Payments) behind same `PayoutProvider` interface

---

## 1. Problem & goal

Tailfire's current commission flow tracks supplier-received checks, agent payouts, and settlements. The "agent payout" side is record-only — admins cut real Interac e-Transfers / wires / cheques outside Tailfire and manually mark `commission_checks` rows as paid. There is no IC self-serve, no CRA-conformant invoicing, no tax handling, no T4A pipeline, no audit trail, and no provider-ready abstraction.

**Goal:** Build a CRA-conformant Independent Contractor commission disbursement system where:

- ICs claim eligible commissions self-serve from the portal
- Tailfire generates a Recipient-Created Tax Invoice (RCTI) PDF on the IC's behalf, with GST/HST gross-up
- An admin (or auto-disburse rule) approves; money is reserved at submission, not approval, to prevent double-claims
- Disbursement is queue-orchestrated; v1 = manual record-proof, v2 = provider API
- Year-end T4A slips + CRA XML XFile filings are produced from the disbursement ledger
- Existing `commission_checks` becomes a single internal write-through ledger; legacy `payAgents()` and `claims/me` endpoints are deprecated and routed through the new module

---

## 2. Locked decisions (from brainstorming, 2026-05-08)

| Decision | Choice |
|---|---|
| Tenant scope (v1) | Single-tenant: Phoenix Voyages only; Doppler-stored config |
| Provider in v1 | `ManualProvider` (admin sends out-of-band, records proof in Tailfire) |
| Provider seam | `PayoutProvider` strategy interface, queue-orchestrated from day one |
| Probationary trust | Per-IC `auto_disburse` flag (admin-set only; no auto-graduation); hard `approvalCeilingCents` cap even for auto-disburse |
| Invoice scope | Aggregate — IC selects multiple eligible commissions per claim |
| Mixed currencies | Auto-split into one invoice + one disbursement per currency |
| GST/HST handling | Auto gross-up at submission via `PlaceOfSupplyService` (recipient-based per CRA general rule) |
| T4A scope | Full: PDF + CRA XML XFile generation; default Box 020 (Self-employed commissions); Box 048 fallback if legal review reclassifies |
| Currency for payout | Match original commission's currency (CAD or USD); per-IC multiple accounts, one default per currency |
| Failure handling | Unsettle reservation, reopen commission lines as eligible, notify IC + admin |
| IC residency in v1 | Canadian residents only (US/intl ICs deferred — separate spec) |
| Cheques | Never |
| Settlement holdback | None beyond existing trip-status filter (`travelling`/`travelled` AND supplier check accepted) |
| Adjustments | All pending IC-targeted `commission_adjustments` auto-roll into next claim, currency-grouped |
| FX for T4A | Snapshot Bank of Canada daily rate on disbursement completion date |
| IC payout details | Stored in IC profile (encrypted, mask-only on read); admin uses for manual send |

---

## 3. Architecture

```
apps/admin (Next.js)
  IC routes:
    /portal/payouts/accounts        — multi-account per currency, mask-only
    /portal/payouts/authorization   — RCTI e-sign
    /commission                     — existing; CTA → claim builder
    /portal/t4a                     — year-end download once filed
  Admin routes:
    /commission                     — existing tabs reroute through new module
    /commission/disbursements       — queue + manual record-proof
    /commission/t4a/[year]          — slip review, lock, XFile export
    /settings/tax-filing            — payer BN, transmitter, filing address

apps/api (NestJS) — IcPayoutModule (new), extends financials/commission
  Services:
    IcTaxProfilesService          — single source of truth for IC identity
    IcPayoutAccountsService       — multi-account CRUD, encrypted at rest
    PlaceOfSupplyService          — agency filing province → tax_rates lookup
    IcInvoiceNumberAllocator      — Postgres SELECT FOR UPDATE per-IC-per-year
    IcInvoiceService              — builds, reserves at submission, approves/rejects
    IcInvoicePdfService           — Puppeteer → R2 storagePath
    DisbursementService           — enqueues; never sends inline
    PayoutProvider (strategy)
      └─ ManualProvider           (v1)
      └─ VoPayProvider            (v2)
      └─ DreamPayProvider         (v2 alt)
    TaxYearService                — year-end aggregation
    T4ASlipService                — Box 020 base/tax/disbursed split
    FxRateService                 — BoC daily, cached via fx_rate_snapshots

  BullMQ queues (new):
    ic-payout-disburse            — enqueues an attempt per disbursement
    ic-payout-webhook             — providers' inbound webhooks (v2)
    ic-payout-reconcile           — sweeps stuck/failed/returned hourly
    ic-t4a-fetch-fx               — daily BoC FX snapshot ingester

  Existing (status changes):
    commission.service.ts         — payAgents() & claims/me DEPRECATED at cutover
    commission_checks (paid type) — becomes private internal ledger written
                                    exclusively by IcInvoiceService at submission

Postgres (Drizzle) + BullMQ (Redis) + R2 (encrypted blobs)
```

**Provider seam:** synchronous strategy interface (`PayoutProvider.send(ctx)`) but invocation is always queue-mediated. Manual and provider flows share the same state machine.

**Single write path:** `commission_checks` (paid type), `commission_item_settlements`, `commission_adjustments` are written exclusively by `IcInvoiceService` at submission/rejection. Legacy `payAgents()` becomes a thin shim that constructs a fake "claim → approve → disburse" round-trip during the cutover migration, then is removed.

---

## 4. Data model

All tables carry `agencyId` (uuid fk), `createdAt`, `updatedAt`, audit FKs (`createdBy`, `updatedBy`). All `*StoragePath` fields are R2 paths; signed URLs generated on read. All 12 new tables registered in `apps/api/src/activity-logs/events/audit.event.ts` and `audit-sanitizer.ts` at migration time. Sensitive fields (`sinOrBnEncrypted`, `detailsEncrypted`, `signaturePngStoragePath`) added to sanitizer denylist.

### 4.1 Schema migrations to existing tables

```sql
-- Currency on adjustments (Codex H2)
ALTER TABLE commission_adjustments
  ADD COLUMN currency varchar(3) NOT NULL DEFAULT 'CAD';

-- Backfill: every existing adjustment is CAD by default; verify via report
-- before migration runs in production.
```

### 4.2 New tables

#### `agency_tax_filing_config`
Payer identity for CRA filings (Codex M3).
```ts
{
  agencyId            uuid pk fk → agencies
  legalName           varchar(255)         // payer legal name on T4A
  payerAccountNumber  varchar(20)          // CRA payroll account (e.g. 123456789RP0001)
  transmitterNumber   varchar(20)          // CRA transmitter ID (MM######)
  filingAddress       jsonb                // street/city/province/postal
  filingProvince      varchar(2)           // canonical place-of-supply province
  filingContactName   varchar(255)
  filingContactEmail  varchar(255)
  filingContactPhone  varchar(40)
  effectiveFrom       date
  effectiveTo         date                 // null = current
}
```

#### `ic_tax_profiles`
Canonical IC identity record (Codex H3).
```ts
{
  id                       uuid pk
  userId                   uuid fk → user_profiles  // UNIQUE (agencyId, userId)
  legalName                varchar(255)
  domicileAddress          jsonb
  domicileProvince         varchar(2)
  isCorporation            boolean
  sinOrBnEncrypted         bytea               // app-layer AES-256-GCM
  encryptionKeyVersion     smallint            // for future rotation
  sinOrBnMask              varchar(20)         // "***-***-789"
  gstHstRegistered         boolean
  gstHstNumber             varchar(40)
  gstHstEffectiveFrom      date
  gstHstEffectiveTo        date
  autoDisburse             boolean DEFAULT false
  approvalCeilingCents     bigint              // hard cap even for auto-disburse
  rctiAuthorizationId      uuid fk → ic_payout_authorizations
}
```

#### `ic_payout_authorizations`
RCTI agreement acceptance per CRA RCTI requirements (Codex Q3).
```ts
{
  id                                uuid pk
  userId                            uuid fk
  agreementVersion                  varchar(20)
  agreementTextHash                 varchar(64)   // sha256 of agreement text rendered
  agreementPdfStoragePath           text          // rendered agreement at acceptance
  acceptedAt                        timestamptz
  acceptedIp                        inet
  signaturePngStoragePath           text
  payerTaxRegistrationAttested      boolean
  recipientTaxRegistrationAttested  boolean
  status                            enum          // 'active' | 'superseded' | 'revoked'
}
```

#### `ic_payout_accounts`
Multi-account per IC (currency-keyed). No cheques.
```ts
{
  id                       uuid pk
  userId                   uuid fk
  label                    varchar(80)
  currency                 varchar(3)
  rail                     enum                  // 'interac_etransfer' | 'eft' | 'wise' | 'wire' | 'visa_direct'
  isDefaultForCurrency     boolean               // exactly one default per (userId, currency)
  status                   enum                  // 'active' | 'archived' | 'unverified'
  detailsEncrypted         bytea                 // app-layer AES-256-GCM
  encryptionKeyVersion     smallint
  detailsMask              varchar(80)
  providerName             varchar(40)           // null in v1
  providerToken            varchar(255)          // null in v1
  padAgreementVersion      varchar(20)           // EFT only
  padAcceptedAt            timestamptz
  padAcceptedIp            inet
}
```

#### `tax_rates`
Effective-dated provincial rate table (Codex C2).
```ts
{
  jurisdiction      varchar(2) pk    // 'ON' | 'AB' | 'QC' | ...
  taxType           varchar(10) pk   // 'HST' | 'GST' | 'GST+QST' | 'GST+PST'
  rateBp            integer          // basis points (1300 = 13.00%)
  effectiveFrom     date pk
  effectiveTo       date             // null = current
  source            varchar(80)      // 'CRA-2024-rates'
}
```

#### `ic_invoice_number_sequences`
Concurrency-safe per-IC-per-year allocator (Codex M4).
```ts
{
  agencyId    uuid
  userId      uuid
  taxYear     smallint
  nextSeq     integer NOT NULL DEFAULT 1
  PRIMARY KEY (agencyId, userId, taxYear)
}
-- Allocated via SELECT ... FOR UPDATE then UPDATE nextSeq = nextSeq + 1 in same txn
-- Format: INV-{taxYear}-{userIdShort8}-{seq:000000}
```

#### `ic_invoices`
Per claim per currency (Codex C1, H4).
```ts
{
  id                          uuid pk
  userId                      uuid fk
  invoiceNumber               varchar(40)
  invoiceDate                 date
  currency                    varchar(3)

  // Snapshotted IC identity (mask only; full SIN stays in ic_tax_profiles)
  icLegalName                 varchar(255)
  icAddress                   jsonb
  icDomicileProvince          varchar(2)
  icGstHstNumber              varchar(40)
  icSinOrBnMask               varchar(20)         // mask only
  icTaxProfileId              uuid fk             // for full identifier lookup at T4A
  rctiAuthorizationId         uuid fk             // which agreement version applied

  // C1: separate fields — Box 020 reports reportableBaseCents only
  reportableBaseCents         bigint              // pre-tax commission
  taxCents                    bigint              // GST/HST
  totalCents                  bigint              // = reportableBase + tax

  // C2: place-of-supply outcome stored for audit
  placeOfSupplyJurisdiction   varchar(2)          // resolved at submission
  placeOfSupplyRule           varchar(40)         // 'general-recipient-address' | ...
  taxType                     varchar(10)
  taxRateBp                   integer

  pdfStoragePath              text
  pdfHash                     varchar(64)         // sha256 — tamper detection

  status                      enum                // 'draft' | 'submitted' | 'approved' | 'rejected' | 'cancelled'
  submittedAt                 timestamptz
  approvedAt                  timestamptz
  approvedBy                  uuid
  rejectedAt                  timestamptz
  rejectedReason              text

  // C3: reservation — at submission, atomically write legacy paid check + settlements
  reservationCheckId          uuid fk → commission_checks  // internal write-through ledger
}
```

#### `ic_invoice_lines`
```ts
{
  id              uuid pk
  invoiceId       uuid fk
  lineType        enum            // 'commission' | 'adjustment'
  checkItemId     uuid fk → commission_check_items   // null for adjustment lines
  adjustmentId    uuid fk → commission_adjustments    // null for commission lines
  description     varchar(500)
  tripRef         varchar(100)
  amountCents     bigint          // can be negative for adjustments
  currency        varchar(3)
}
```

#### `ic_disbursements`
1:1 with invoice. Provider-agnostic (Codex M1, M2).
```ts
{
  id                          uuid pk
  invoiceId                   uuid fk UNIQUE
  userId                      uuid fk
  payoutAccountId             uuid fk → ic_payout_accounts  // snapshot
  amountCents                 bigint
  currency                    varchar(3)
  provider                    varchar(40)        // 'manual' | 'vopay' | 'dreampay'
  rail                        enum
  idempotencyKey              uuid UNIQUE
  status                      enum               // 'queued' | 'sending' | 'sent' | 'failed' | 'returned' | 'cancelled'

  // FX snapshot for T4A (always populated; rate=1.0 for CAD)
  fxRateToCad                 numeric(18,8)
  cadEquivalentBaseCents      bigint             // = invoice.reportableBase × fxRate (feeds Box 020)
  cadEquivalentTaxCents       bigint             // = invoice.tax × fxRate (informational)
  cadEquivalentTotalCents     bigint
  fxRateSource                varchar(40)        // 'bank_of_canada' | 'manual'
  fxRateDate                  date

  completedAt                 timestamptz        // when status flipped to 'sent'
}
```

#### `ic_disbursement_attempts`
Append-only attempt log (Codex M1).
```ts
{
  id                       uuid pk
  disbursementId           uuid fk
  attemptNumber            integer
  provider                 varchar(40)
  rail                     enum
  outcome                  enum               // 'sent' | 'failed' | 'returned' | 'cancelled'
  reason                   text

  // v1 manual fields
  manualReference          varchar(255)        // e-Transfer #, Wise tx id, wire ref
  manualProofStoragePath   text
  manualSentBy             uuid

  // v2 provider fields
  providerTxnId            varchar(255)
  providerWebhookPayload   jsonb
  providerFeeCents         bigint

  startedAt                timestamptz
  completedAt              timestamptz
}
```

#### `ic_t4a_slips`
One per IC per year (Codex C1).
```ts
{
  id                       uuid pk
  userId                   uuid fk
  taxYear                  smallint
  agencyTaxFilingConfigId  uuid fk          // payer identity at filing
  icTaxProfileId           uuid fk          // recipient identity at filing

  box020Cents              bigint           // SUM(disbursement.cadEquivalentBaseCents WHERE completedAt in year)
  box048Cents              bigint           // alternate; populated only if legal review reclassifies
  taxRemittedCents         bigint           // informational; NOT on T4A
  totalDisbursedCents      bigint           // informational

  status                   enum             // 'draft' | 'finalized' | 'amended' | 'cancelled'
  amendedFromSlipId        uuid fk → ic_t4a_slips   // CRA amendment chain
  finalizedAt              timestamptz
  finalizedBy              uuid
  pdfStoragePath           text
  pdfHash                  varchar(64)
  lockedAt                 timestamptz
}
```

#### `ic_t4a_filings`
Per-year XFile batch.
```ts
{
  id                  uuid pk
  agencyId            uuid fk
  taxYear             smallint
  filingType          enum                  // 'original' | 'amendment'
  amendsFilingId      uuid fk → ic_t4a_filings
  xmlFileStoragePath  text
  xmlHash             varchar(64)
  totalSlips          integer
  totalBox020Cents    bigint
  submittedToCraAt    timestamptz
  craConfirmation     varchar(80)
  status              enum                  // 'draft' | 'ready' | 'submitted'
}
```

#### `fx_rate_snapshots`
Daily BoC rates.
```ts
{
  rateDate        date pk
  fromCurrency    varchar(3) pk
  toCurrency      varchar(3) pk
  rate            numeric(18,8)
  source          varchar(40)         // 'bank_of_canada'
  fetchedAt       timestamptz
}
```

---

## 5. End-to-end flows

### 5.1 IC onboarding (one-time)

1. IC clicks "Set up commission payouts" CTA on `/portal`
2. **Step 1 — Tax profile** (`ic_tax_profiles`):
   - Legal name (prefilled), domicile address + province
   - Sole prop / Incorporated toggle
   - SIN or BN — encrypted on submit; mask returned to UI
   - GST/HST registered? → number + effective-from date
3. **Step 2 — RCTI authorization** (`ic_payout_authorizations`):
   - Renders versioned agreement PDF; stores text hash
   - IC types name + draws/types signature → `signaturePngStoragePath`
   - Records IP, timestamp, version
   - **Without active authorization, IC cannot submit a claim.**
4. **Step 3 — First payout account** (`ic_payout_accounts`):
   - Pick currency (CAD / USD)
   - Pick rail (Interac e-Transfer / EFT / Wise / Wire / Visa Direct)
   - Enter rail-specific destination (encrypted server-side)
   - For EFT: PAD agreement consent captured (`padAgreementVersion`)
   - Marked `isDefaultForCurrency`

ICs return to `/portal/payouts/accounts` to add more accounts (one default per currency), revoke, or update. Bank-info changes require re-PAD acceptance.

### 5.2 IC submits a claim — money is reserved here (Codex C3)

1. IC opens claim builder under `/commission`
2. System shows eligible commission rows **grouped by currency**:
   ```
   eligibility =
     commission_check_items WHERE
       cc.check_type='received' AND cc.status='accepted'
       AND t.status IN ('travelling', 'travelled')
       AND no commission_item_settlements row for (item, IC) yet
     UNION
     commission_adjustments WHERE
       agent_user_id=IC AND status='pending'
   ```
3. IC selects rows. Multi-currency selection auto-splits into one invoice per currency.
4. **For each currency invoice** (transactional):
   - `IcInvoiceNumberAllocator` issues `INV-{year}-{userIdShort}-{seq}`
   - `PlaceOfSupplyService` resolves jurisdiction:
     ```
     jurisdiction = agency_tax_filing_config.filingProvince  // default per CRA general rule
     rate = lookup(tax_rates, jurisdiction, taxType, invoiceDate)
     IF !ic.gstHstRegistered (effective at invoiceDate): rate = 0
     ```
   - Compute `reportableBaseCents = sum(line amounts)`, `taxCents = base × rate`, `totalCents = base + tax`
   - INSERT `ic_invoices` (status=`submitted`), all `ic_invoice_lines`
   - **Reservation (atomic within same txn — Codex C3):**
     - INSERT internal `commission_checks` (paid, currency=invoice.currency, checkAmountCents=`reportableBaseCents`) → `reservationCheckId`
     - INSERT `commission_item_settlements` for each commission line via `INSERT ... ON CONFLICT DO NOTHING RETURNING` (existing `payAgents` pattern)
     - UPDATE `commission_adjustments` SET status='reconciled', check_id=reservation WHERE agent_user_id=IC AND status='pending' AND currency=invoice.currency
     - If any row already settled by a concurrent claim: ROLLBACK; UI shows "Some items were claimed by another in-flight invoice — refresh"
   - Render invoice PDF via Puppeteer → R2; `pdfHash = sha256`
5. UI shows:
   - "Submitted — pending review" if `!ic.autoDisburse OR totalCents > approvalCeilingCents`
   - "Submitted — disbursing" if `autoDisburse AND totalCents <= approvalCeilingCents`

### 5.3 Approval (admin or auto)

1. **Admin path:** `/commission/disbursements` queue → review invoice PDF + lines + tax profile → Approve/Reject
   - Approve: status=`approved`, enqueue `ic-payout-disburse` job
   - Reject: status=`rejected` with reason, atomically reverse reservation (delete settlements, flip adjustments back to `pending`)
2. **Auto path:** `IcInvoiceService` skips approval if `autoDisburse=true AND totalCents <= approvalCeilingCents`. Same enqueue.

### 5.4 Disbursement (Phase 1 manual / Phase 2 provider)

1. `ic-payout-disburse` worker picks up job
2. INSERT `ic_disbursement_attempts` (attemptNumber=1)
3. Branches on `provider`:
   - **`ManualProvider` (v1):**
     - Status → `sending`
     - Notification to admins: "Disbursement #X ready — send via {rail} to {mask}"
     - Worker exits, awaits admin action
     - Admin opens disbursement detail, copies destination from masked card (full value decrypted server-side at copy-click + audit-log entry), sends from agency bank, enters reference + optional proof attachment (uploaded to R2)
     - Click "Mark Sent" → `DisbursementService.markSent(id, ref, proofPath?)`:
       - `attempt.outcome='sent'`, `completedAt=now`
       - Snapshots BoC FX rate (1.0 for CAD), populates `cadEquivalent*` fields
       - `disbursement.status='sent'`
       - IC notification "Payout sent — reference {ref}"
   - **`VoPayProvider` / `DreamPayProvider` (v2):**
     - Status → `sending`
     - Calls provider with `idempotencyKey`, stores `providerTxnId`
     - Worker exits; webhook handler (`ic-payout-webhook` queue) updates state asynchronously
4. **Failure / return path:**
   - Manual: admin clicks "Mark Failed" with reason
   - Provider: webhook with status=`failed` or `returned`
   - `DisbursementService.fail(id, reason)` atomically:
     - `attempt.outcome=failed/returned`, populates reason
     - Reverses reservation (deletes settlements, flips adjustments to `pending`)
     - `invoice.status='cancelled'` (terminal — IC can build a fresh claim)
     - Notify IC + admin
5. `ic-payout-reconcile` cron sweeps `sending` rows older than 48h, auto-fails with manual escalation flag.

### 5.5 T4A pipeline (year-end, January)

1. `ic-t4a-fetch-fx` daily cron populates `fx_rate_snapshots` from BoC (also a backfill safety net — disbursements snapshot at completion time).
2. Admin opens `/commission/t4a/{year}`
3. `T4ASlipService.generateDrafts(year)`:
   ```
   FOR each user with ≥1 disbursement.completedAt in year:
     box020Cents = SUM(disbursement.cadEquivalentBaseCents WHERE completedAt in year)
     taxRemittedCents = SUM(disbursement.cadEquivalentTaxCents WHERE completedAt in year)
     totalDisbursedCents = SUM(disbursement.cadEquivalentTotalCents WHERE completedAt in year)
     Snapshot ic_tax_profile (full SIN decrypted ONLY HERE), agency_tax_filing_config
     INSERT ic_t4a_slips (status='draft')
   ```
4. Admin reviews each slip; can edit recipient address corrections in-place
5. Admin "Finalize Year" → all draft slips → `finalized`, `lockedAt=now`
6. `T4ASlipService.generatePdfs()` — renders slip PDFs to R2 `pdfStoragePath`
7. `T4ASlipService.exportXFile()` → `ic_t4a_filings` row with CRA XML
8. Admin downloads XML, uploads to CRA Internet File Transfer (XFile) portal
9. Admin pastes CRA confirmation # back into Tailfire → `status='submitted'`
10. Year is permanently locked. **Amendments** (Codex Q10):
    - Create new `ic_t4a_slips` row with `amendedFromSlipId` set; original row preserved
    - Create new `ic_t4a_filings` row with `filingType='amendment'`, `amendsFilingId` set
    - CRA amendment chain rules followed (CRA XML amendment spec)

ICs see `/portal/t4a` with their finalized PDF download once year is submitted.

---

## 6. CRA / PIPEDA compliance mapping

| Requirement | Where addressed |
|---|---|
| **T4A Box 020** (Self-employed commissions) — CAD, pre-tax | `ic_t4a_slips.box020Cents` from sum of `cadEquivalentBaseCents` |
| **Box does NOT include GST/HST/PST** | Tax stored separately in `cadEquivalentTaxCents` (informational only) |
| **GST/HST place-of-supply** | `PlaceOfSupplyService` resolves jurisdiction from `agency_tax_filing_config.filingProvince` + effective-dated `tax_rates`; rule + outcome stored on every invoice |
| **No tax withholding for ICs** | Disbursement amount = `totalCents` (gross); no deduction |
| **Recipient-Created Tax Invoice (RCTI)** | `ic_payout_authorizations` captures version + text hash + rendered PDF + signature + IP + tax-registration attestations; required active record before any submission |
| **Sequential, immutable invoice numbering** | Postgres `SELECT FOR UPDATE` allocator on `ic_invoice_number_sequences` |
| **CRA T4A XML filing** | `T4ASlipService.exportXFile` → CRA XFile-compatible XML in `ic_t4a_filings.xmlFileStoragePath` |
| **CRA amendment rules** | New `ic_t4a_slips` with `amendedFromSlipId`; original preserved; new `ic_t4a_filings` with `filingType='amendment'` + `amendsFilingId` |
| **6-year record retention** | Append-only at row level (status flips, no deletes); R2 lifecycle not auto-purging |
| **PIPEDA — minimization** | Full SIN/BN stored ONCE in `ic_tax_profiles`; invoices carry mask only; full identifier decrypted only at T4A export |
| **PIPEDA — encryption** | App-layer AES-256-GCM with `encryptionKeyVersion` for rotation; Doppler-stored master key |
| **PIPEDA — access control** | All read paths through service methods; sensitive-field decrypts emit audit-log entries |
| **CRA payer identity on T4A** | `agency_tax_filing_config` (BN15, transmitter #, filing address) snapshotted on each slip |
| **PAD/CCD agreement (EFT, v2)** | `ic_payout_accounts.padAgreementVersion` + `padAcceptedAt` + `padAcceptedIp` |

### External authoritative sources

- CRA T4A slip guidance — https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/completing-filing-information-returns/t4a-information-payers/t4a-slip.html
- CRA T4A summary guidance — https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/completing-filing-information-returns/t4a-information-payers/t4a-summary.html
- CRA place-of-supply (Memorandum 3-3-6) — https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/3-3-6/plc-spply-prvnc-gnrl-rls-fr-srvcs.html
- CRA GST/HST rates + place-of-supply overview — https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-place-supply.html
- CRA XML amendment rules — https://www.canada.ca/en/revenue-agency/services/e-services/filing-information-returns-electronically-t4-t5-other-types-returns-overview/filing-information-returns-electronically-t4-t5-other-types-returns-amend.html
- Bank of Canada daily exchange rates — https://www.bankofcanada.ca/rates/exchange/daily-exchange-rates/
- BoC FX background — https://www.bankofcanada.ca/rates/exchange/background-information-on-foreign-exchange-rates/
- OPC PIPEDA safeguards — https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/p_principle/principles/p_safeguards/
- OPC SIN protection — https://www.priv.gc.ca/en/privacy-topics/sins-and-drivers-licences/social-insurance-numbers/protecting-your-social-insurance-number/

---

## 7. Phase 1 vs Phase 2 split

| Capability | Phase 1 (this spec) | Phase 2 (later spec) |
|---|---|---|
| IC onboarding (tax profile + RCTI auth) | ✅ | ✅ |
| Multi-account per IC, currency-keyed | ✅ | ✅ |
| Embedded "link your bank" via iQ11/eLinx | ❌ — IC enters details manually | ✅ — provider iframe replaces text fields |
| Aggregate claim with reservation | ✅ | ✅ |
| Self-invoice PDF | ✅ | ✅ |
| GST/HST place-of-supply auto gross-up | ✅ | ✅ |
| Probationary `auto_disburse` + approval ceiling | ✅ | ✅ |
| Disbursement state machine + queue orchestration | ✅ (Manual provider) | ✅ (VoPay/DreamPay) |
| Manual disbursement record-proof | ✅ | Kept as fallback |
| Provider webhook ingestion | ❌ | ✅ |
| BoC FX snapshots on disbursement | ✅ | ✅ |
| T4A draft + finalize + lock | ✅ | ✅ |
| T4A XML XFile export | ✅ | ✅ |
| T4A amendment workflow | ⏸ — schema in place; UI in v1.1 | ✅ |
| Quebec RL-3 slips | ❌ — out of scope | Future (separate spec) |
| US-resident / non-resident ICs (NR4, W-8BEN) | ❌ | Future (separate spec) |

---

## 8. Cutover plan for legacy `payAgents` and `claims/me`

Codex flagged this as High (H1): two parallel write paths = guaranteed drift.

1. **Pre-cutover:** ship new IcPayoutModule alongside existing endpoints; new module reads-only initially, no routes wired.
2. **Drain:** all in-flight legacy `paid` `commission_checks` (status `pending` or `submitted`) must be reconciled before cutover — either marked `accepted` or `cancelled` manually by admin.
3. **Cutover migration:**
   - `commission.payAgents` and `claims/me` controllers redirect to new IcPayoutModule equivalents
   - Existing UI on `/commission` rerouted through new claim-builder for IC view, new disbursements queue for admin
   - Feature flag `IC_PAYOUTS_V2_ENABLED` gates the cutover, defaults to true after deploy
4. **Post-cutover:** legacy `payAgents` becomes a deprecated shim (logs a warning, no-ops). After 60 days of clean operation, deleted.
5. **Rollback path:** flag flip restores legacy endpoints. New invoices submitted during the cutover window stay valid (their underlying legacy `commission_checks` paid records continue to work).

---

## 9. Alternatives considered

- **VoPay** — Recommended Phase 2 provider. Public docs, sandbox self-serve, full Canadian rail coverage including embedded iQ11/eLinx for bank tokenization with PAD baked in. Travel/gig is in their stated use-case set.
- **Dream Payments (DreamPay)** — Legitimate alternative. No public dev docs (sales-led). Better fit for enterprise insurance/FI. Worth a parallel sales conversation for pricing leverage and for cheque/virtual-card capabilities (we don't need cheques; virtual card is interesting for FAM-trip funding).
- **Stripe Connect** — Already in repo for agency-collects-from-client. Not used for IC payouts: no Interac e-Transfer rail, weak T4A tooling, designed for business payouts not gig ICs.
- **Wise / Payoneer** — Strong international, weak Canadian-domestic e-Transfer; high CAD↔CAD per-txn fees.
- **Plooto / Nuvei / RBC PayEdge** — Either AP/AR-oriented, heavy compliance lift, or not API-first.
- **Manual Interac e-Transfer (status quo)** — What we're replacing; doesn't scale, no audit, no T4A.

---

## 10. Open risks / explicit caveats

1. **Tax/legal review required** for Box 020 vs Box 048 selection (Codex C1). Spec ships with Box 020 default; `ic_t4a_slips.box048Cents` exists as a fallback flip if reclassified.
2. **Place-of-supply edge cases** — Codex C2 noted the general rule (recipient address) covers most fact patterns, but CRA Memorandum 3-3-6 has exceptions (services related to real property, services performed in person, etc.). Spec defaults to agency filing province via `PlaceOfSupplyService`; tax counsel should confirm or add exception rules.
3. **RCTI agreement text** — drafted by tax counsel before launch. Spec defines storage shape; the actual agreement text is a content task.
4. **Encryption key rotation runbook** — `encryptionKeyVersion` field present, but the rotation procedure (re-encrypt across `ic_tax_profiles` + `ic_payout_accounts`) is not in scope of this spec.
5. **Approval ceiling default** — Codex Q9 said yes. Spec leaves `ic_tax_profiles.approvalCeilingCents` per-IC with a documented agency-wide default in admin settings.
6. **VoPay/DreamPay sales engagement (Phase 2)** — gated on entity setup, KYC/AML, IP whitelist, sandbox keys. Not engineering-blocking for Phase 1.
7. **Cutover plan** — see Section 8. Legacy in-flight `paid` checks must be drained or backfilled before flag flip.
8. **Agreement-text versioning** — bumping `ic_payout_authorizations.agreementVersion` requires re-prompting all active ICs; needs a graceful "your authorization needs updating" UX before claim submission is blocked.

---

## 11. Validation history

- **2026-05-08** — Brainstormed with user (Claude Opus 4.7); locked all decisions in Section 2.
- **2026-05-09** — Validated against Tailfire codebase by Codex (gpt-5.4 high). Findings: 3 Critical, 5 High, 3 Medium, 1 Low. Full transcript: `_codex-reviews/2026-05-09-vopay-ic-payouts-codex-review.txt`. All Critical, High, Medium incorporated into this spec.
