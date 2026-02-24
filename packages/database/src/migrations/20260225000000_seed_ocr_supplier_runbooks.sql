-- Add hints_applied tracking to ocr_import_jobs
-- and seed initial supplier runbooks for OCR extraction.

-- 1. Add hints_applied column (tracks whether runbook hints were actually used during extraction)
ALTER TABLE ocr_import_jobs ADD COLUMN IF NOT EXISTS hints_applied BOOLEAN NOT NULL DEFAULT false;

-- 2. Seed supplier runbooks (idempotent — updates extraction_hints on conflict)

-- ============================================================================
-- Tour Operators (package_confirmation)
-- ============================================================================

INSERT INTO ocr_supplier_runbooks (supplier_name, document_type, extraction_hints)
VALUES (
  'Transat',
  'package_confirmation',
  'Transat / Air Transat Holidays invoice format:
- Booking reference is called "Dossier" number (e.g. "Dossier: 78920234")
- Flight codes use TS prefix (e.g. TS598, TS599)
- "Option" line items are add-ons (seat selections, excursions, insurance) — sum these into addOns
- Per-person pricing is often shown as "Prix par personne" in French invoices
- Commission may appear as "Commission agence" with both rate and amount
- Transfers are labeled "ITC" (Inclusive Transfer Charter)
- Payment section shows "Historique des paiements" or "Payments received"
- Currency is almost always CAD
- Look for "Remarques" section for remarks/special requests'
)
ON CONFLICT (supplier_name, document_type) DO UPDATE SET
  extraction_hints = EXCLUDED.extraction_hints,
  updated_at = now();

INSERT INTO ocr_supplier_runbooks (supplier_name, document_type, extraction_hints)
VALUES (
  'Sunwing',
  'package_confirmation',
  'Sunwing Vacations invoice format:
- Flight codes use WG prefix (e.g. WG123, WG456)
- Booking reference is called "Booking Number" or "Reservation Number"
- French-language variants: "Numéro de réservation", "Prix total"
- Transfers often included as "Round-trip transfers" component
- "Protection Plan" or "Travel Protection" items are add-ons
- Per-person breakdown shows base + taxes separately
- Commission shown as percentage and dollar amount
- Currency is CAD
- Look for "Important Information" section for terms'
)
ON CONFLICT (supplier_name, document_type) DO UPDATE SET
  extraction_hints = EXCLUDED.extraction_hints,
  updated_at = now();

INSERT INTO ocr_supplier_runbooks (supplier_name, document_type, extraction_hints)
VALUES (
  'WestJet Vacations',
  'package_confirmation',
  'WestJet Vacations package invoice format:
- Flight codes use WS prefix (e.g. WS254, WS255)
- Booking reference is called "Booking ID" or "Confirmation Number"
- Package bundles WestJet flights + hotel + transfers
- Per-person pricing shown with base fare + taxes + fees
- Add-ons include seat selection, luggage upgrades
- Commission may be shown separately for agent bookings
- Currency is CAD
- Check for "Cancellation Policy" section with penalty schedule'
)
ON CONFLICT (supplier_name, document_type) DO UPDATE SET
  extraction_hints = EXCLUDED.extraction_hints,
  updated_at = now();

INSERT INTO ocr_supplier_runbooks (supplier_name, document_type, extraction_hints)
VALUES (
  'Air Canada Vacations',
  'package_confirmation',
  'Air Canada Vacations (ACV) invoice format:
- Flight codes use AC prefix (e.g. AC890, AC891)
- Bilingual invoices (English/French) — extract from whichever language has more detail
- Booking reference may appear as "Booking Reference" or "Référence de réservation"
- Package includes Air Canada flights + hotel + transfers
- Per-person pricing with detailed tax breakdown
- "Options" or "Extras" section for add-ons
- Commission displayed for travel agent bookings
- Currency is CAD
- Look for "Conditions" section for T&C'
)
ON CONFLICT (supplier_name, document_type) DO UPDATE SET
  extraction_hints = EXCLUDED.extraction_hints,
  updated_at = now();

INSERT INTO ocr_supplier_runbooks (supplier_name, document_type, extraction_hints)
VALUES (
  'Nolitours',
  'package_confirmation',
  'Nolitours invoice format (Sunwing subsidiary):
- Often French-language invoices ("Facture", "Confirmation de réservation")
- Flight codes may use WG prefix (shared with Sunwing)
- Booking reference: "Numéro de dossier" or "No. de réservation"
- Per-person pricing: "Prix par personne", "Taxes", "Total"
- Add-ons: "Options", "Assurance voyage" (travel insurance)
- Commission: "Commission" with percentage
- Currency is CAD
- Transfers labeled as "Transferts" or "Transport terrestre"'
)
ON CONFLICT (supplier_name, document_type) DO UPDATE SET
  extraction_hints = EXCLUDED.extraction_hints,
  updated_at = now();

-- ============================================================================
-- Cruise Lines (cruise_confirmation)
-- ============================================================================

INSERT INTO ocr_supplier_runbooks (supplier_name, document_type, extraction_hints)
VALUES (
  'Royal Caribbean',
  'cruise_confirmation',
  'Royal Caribbean International (RCI) booking confirmation:
- Reservation number is 7+ digit numeric
- Cabin categories use letter+number codes: IS=Inside, OS=Ocean View, D6=Balcony, JS=Junior Suite, GS=Grand Suite, 1A/2A=Crown Loft Suite
- Ship names: Oasis, Allure, Harmony, Symphony, Wonder, Icon, Utopia, etc.
- Pricing often shows per-person with government taxes/fees separate
- "Cruise Fare" + "Taxes, Fees and Port Expenses" = total
- Gratuities may be pre-paid or noted separately
- Look for "Cancellation Penalties" schedule with dates and percentages
- Loyalty program: "Crown & Anchor Society" tier may be listed'
)
ON CONFLICT (supplier_name, document_type) DO UPDATE SET
  extraction_hints = EXCLUDED.extraction_hints,
  updated_at = now();

INSERT INTO ocr_supplier_runbooks (supplier_name, document_type, extraction_hints)
VALUES (
  'Norwegian Cruise Line',
  'cruise_confirmation',
  'Norwegian Cruise Line (NCL) booking confirmation:
- Reservation number is typically alphanumeric
- "Free at Sea" perks may be listed (beverage, dining, WiFi, excursions, shore excursion credit)
- NCF (Norwegian Cruise Fee) is a separate line item — include in taxes/fees
- Cabin categories: IA/IB=Inside, OA/OB=Ocean View, BA/BB=Balcony, MA/MB=Mini Suite, SA=Suite
- Ship names: Breakaway, Getaway, Escape, Bliss, Encore, Joy, Prima, Viva, etc.
- Per-person pricing with government taxes separate
- "Cancellation Protection Plan" may be an add-on
- Look for penalty schedule under "Cancellation Policy"'
)
ON CONFLICT (supplier_name, document_type) DO UPDATE SET
  extraction_hints = EXCLUDED.extraction_hints,
  updated_at = now();

INSERT INTO ocr_supplier_runbooks (supplier_name, document_type, extraction_hints)
VALUES (
  'Celebrity Cruises',
  'cruise_confirmation',
  'Celebrity Cruises booking confirmation:
- "Always Included" pricing bundles drinks, WiFi, tips into fare
- AquaClass and Retreat (suite) categories are premium tiers
- Cabin categories: Interior (1-12), Ocean View (3-8), Balcony (1A-2D), Concierge (C1-C3), AquaClass (A1-A2), Suite (S1-S2, RS, PS)
- Ship names: Edge, Apex, Beyond, Ascent, Equinox, Solstice, etc.
- Pricing shows per-person with port charges/taxes separate
- "Captain''s Club" loyalty tier may be listed
- Look for "Cruise Contract" section for cancellation terms'
)
ON CONFLICT (supplier_name, document_type) DO UPDATE SET
  extraction_hints = EXCLUDED.extraction_hints,
  updated_at = now();

INSERT INTO ocr_supplier_runbooks (supplier_name, document_type, extraction_hints)
VALUES (
  'MSC Cruises',
  'cruise_confirmation',
  'MSC Cruises booking confirmation:
- Cabin categories by experience tier: Bella (standard), Fantastica (premium location), Aurea (all-inclusive), Yacht Club (luxury suite)
- Booking reference is typically numeric
- Ship names: Meraviglia, Seaside, Seashore, Virtuosa, Euribia, World Europa, etc.
- Pricing may show per-person with port charges/taxes/service charge separate
- "MSC Voyagers Club" loyalty tier may be listed
- Currency varies by market (USD, EUR, CAD, GBP)
- Drink packages and excursions may be pre-booked add-ons
- Look for "General Conditions" for cancellation policy'
)
ON CONFLICT (supplier_name, document_type) DO UPDATE SET
  extraction_hints = EXCLUDED.extraction_hints,
  updated_at = now();

INSERT INTO ocr_supplier_runbooks (supplier_name, document_type, extraction_hints)
VALUES (
  'Princess Cruises',
  'cruise_confirmation',
  'Princess Cruises booking confirmation:
- "Princess Plus" or "Princess Premier" packages bundle WiFi, drinks, tips, desserts
- TFPE = Taxes, Fees, and Port Expenses (separate line item)
- Cabin categories use letter codes: Interior (IA-IF), Ocean View (OA-OF), Balcony (BA-BF), Mini-Suite (MA-ME), Suite (S1-S7)
- Ship names: Royal, Regal, Majestic, Enchanted, Discovery, Sun, etc.
- Booking number format: alphanumeric
- Per-person pricing with TFPE separate
- "Captain''s Circle" loyalty program tier may be shown
- Look for "Cancellation Charges" schedule'
)
ON CONFLICT (supplier_name, document_type) DO UPDATE SET
  extraction_hints = EXCLUDED.extraction_hints,
  updated_at = now();

INSERT INTO ocr_supplier_runbooks (supplier_name, document_type, extraction_hints)
VALUES (
  'Holland America Line',
  'cruise_confirmation',
  'Holland America Line (HAL) booking confirmation:
- "Have It All" premium package bundles shore excursions, beverage package, WiFi, specialty dining
- Cabin categories use letter codes: Interior (I, IA-IQ), Ocean View (C-F), Verandah (VA-VF), Signature Suite (SA-SF), Neptune Suite (SA-SF)
- Ship names: Nieuw Amsterdam, Rotterdam, Koningsdam, Noordam, Zuiderdam, etc.
- Booking number: typically numeric
- Per-person pricing with port charges/taxes separate
- "Mariner Society" loyalty tier may be listed
- Look for "Cancellation Schedule" with tiered penalties
- Currency often USD or CAD'
)
ON CONFLICT (supplier_name, document_type) DO UPDATE SET
  extraction_hints = EXCLUDED.extraction_hints,
  updated_at = now();

-- ============================================================================
-- Airlines (flight_confirmation)
-- ============================================================================

INSERT INTO ocr_supplier_runbooks (supplier_name, document_type, extraction_hints)
VALUES (
  'Air Canada',
  'flight_confirmation',
  'Air Canada e-ticket / booking confirmation:
- Flight codes use AC prefix (e.g. AC123)
- PNR (Passenger Name Record) is a 6-character alphanumeric code
- E-ticket numbers start with 014 (e.g. 014-1234567890)
- Bilingual format (English/French)
- Fare classes: Tango (basic economy), Flex (economy flex), Comfort (premium economy), Latitude (full-fare economy), Business Class, Signature Class
- Codeshare flights may show "Operated by" with a different carrier (e.g. Jazz, Sky Regional)
- Baggage allowance varies by fare class
- For connections, each segment has its own flight number
- Look for "Fare Rules" section for cancellation/change terms'
)
ON CONFLICT (supplier_name, document_type) DO UPDATE SET
  extraction_hints = EXCLUDED.extraction_hints,
  updated_at = now();

INSERT INTO ocr_supplier_runbooks (supplier_name, document_type, extraction_hints)
VALUES (
  'WestJet',
  'flight_confirmation',
  'WestJet e-ticket / booking confirmation (standalone flight, NOT WestJet Vacations package):
- Flight codes use WS prefix (e.g. WS254)
- Confirmation number is a 6-character alphanumeric PNR
- Fare types: Basic, Econo, Premium, Business
- "WestJet Link" flights operated by Pacific Coastal may use different equipment
- Baggage fees vary by fare class (Basic has no free checked bag)
- Seat selection may be pre-assigned or purchasable add-on
- Look for "Fare Rules" or "Conditions" for change/cancel terms
- Currency is CAD'
)
ON CONFLICT (supplier_name, document_type) DO UPDATE SET
  extraction_hints = EXCLUDED.extraction_hints,
  updated_at = now();

INSERT INTO ocr_supplier_runbooks (supplier_name, document_type, extraction_hints)
VALUES (
  'Porter Airlines',
  'flight_confirmation',
  'Porter Airlines booking confirmation:
- Flight codes use PD prefix (e.g. PD456)
- Primary hubs: Billy Bishop Toronto City Airport (YTZ) and Toronto Pearson (YYZ)
- Confirmation number is alphanumeric
- Fare bundles: Basic, Economy, Economy Flexible, and PorterReserve (premium)
- Complimentary beer/wine on all flights (no need to extract as add-on)
- E400 aircraft for longer routes vs. Q400 for shorter
- Look for "Fare Conditions" for change/cancel terms
- Currency is CAD'
)
ON CONFLICT (supplier_name, document_type) DO UPDATE SET
  extraction_hints = EXCLUDED.extraction_hints,
  updated_at = now();

-- ============================================================================
-- Hotels (hotel_confirmation)
-- ============================================================================

INSERT INTO ocr_supplier_runbooks (supplier_name, document_type, extraction_hints)
VALUES (
  'Marriott',
  'hotel_confirmation',
  'Marriott family hotel confirmation (Marriott, Sheraton, Westin, Ritz-Carlton, W Hotels, Courtyard, Fairfield Inn, Residence Inn, SpringHill Suites, JW Marriott, St. Regis, Le Meridien, Aloft, Element):
- Confirmation number is typically numeric (8-10 digits)
- Use the specific brand name as propertyName (e.g. "Sheraton Centre Toronto" not just "Marriott")
- Room types vary by brand but include Standard, Deluxe, Suite, Club Level
- Check-in/check-out times shown in local timezone
- Rate may show "Member Rate" for Marriott Bonvoy members
- Look for "Cancellation Policy" with specific date/time deadline
- Taxes shown separately (resort fees, destination fees may apply)
- Currency depends on property location'
)
ON CONFLICT (supplier_name, document_type) DO UPDATE SET
  extraction_hints = EXCLUDED.extraction_hints,
  updated_at = now();

INSERT INTO ocr_supplier_runbooks (supplier_name, document_type, extraction_hints)
VALUES (
  'Hilton',
  'hotel_confirmation',
  'Hilton family hotel confirmation (Hilton, DoubleTree, Embassy Suites, Hampton Inn, Homewood Suites, Conrad, Waldorf Astoria, Curio Collection, Tapestry Collection, Tru by Hilton):
- Confirmation number is alphanumeric
- Use the specific brand name as propertyName (e.g. "DoubleTree by Hilton Toronto" not just "Hilton")
- Room types include Standard, Deluxe, Executive, Suite
- Embassy Suites always includes complimentary breakfast
- Look for "Rate Details" showing nightly rate vs total
- "Cancellation Policy" typically allows free cancellation until a deadline
- Hilton Honors points may be shown
- Taxes/fees shown separately'
)
ON CONFLICT (supplier_name, document_type) DO UPDATE SET
  extraction_hints = EXCLUDED.extraction_hints,
  updated_at = now();

INSERT INTO ocr_supplier_runbooks (supplier_name, document_type, extraction_hints)
VALUES (
  'Fairmont',
  'hotel_confirmation',
  'Accor/Fairmont family hotel confirmation (Fairmont, Sofitel, Novotel, ibis, Pullman, Swissotel, Raffles, Movenpick):
- Use the specific brand name as propertyName (e.g. "Fairmont Royal York" not "Accor")
- Fairmont confirmation numbers are typically numeric
- Room categories: Fairmont Room, Deluxe Room, Signature Room, Suite, Gold Floor
- "Fairmont Gold" is a premium floor with lounge access
- ALL (Accor Live Limitless) loyalty program tier may be shown
- Check-in/check-out times in local timezone
- Look for rate breakdown showing room rate + taxes + service charges
- Cancellation terms with specific deadline date/time'
)
ON CONFLICT (supplier_name, document_type) DO UPDATE SET
  extraction_hints = EXCLUDED.extraction_hints,
  updated_at = now();
