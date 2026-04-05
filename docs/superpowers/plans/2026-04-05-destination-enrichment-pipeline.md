# AI-Curated Destination Enrichment Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a batch enrichment pipeline that pulls raw data (Wikipedia, country info, climate, timezone), curates it through an AI travel editor, and stores polished travel content in destination metadata for entity pages and AI concierge context.

**Architecture:** A `DestinationDataEnrichmentService` orchestrates raw data gathering from multiple sources, feeds it to an AI curation prompt (GPT-4o-mini), and writes the curated output to the `metadata` JSONB column. A BullMQ job type enables batch processing. The OTA frontend reads the enriched metadata in adapters and AI context.

**Tech Stack:** NestJS (API), BullMQ (jobs), OpenAI GPT-4o-mini (AI curation), Wikipedia REST API (raw content), `geo-tz` (timezone), PostgreSQL JSONB (storage), Next.js App Router (frontend consumption)

**Spec:** `docs/superpowers/specs/2026-04-05-destination-enrichment-pipeline-design.md`

---

## File Structure

### New Files (API)

| File | Responsibility |
|------|---------------|
| `apps/api/src/destinations/destination-data-enrichment.service.ts` | Orchestrates raw data gathering + AI curation + storage |
| `apps/api/src/destinations/country-data.ts` | Static country lookup table (currency, language, visa) |
| `apps/api/src/destinations/ai-travel-editor.ts` | AI curation prompt + structured output parsing |
| `apps/api/src/destinations/wikipedia.service.ts` | Wikipedia API client |

### New Files (OTA)

| File | Responsibility |
|------|---------------|
| `apps/ota/src/components/hub/sections/destination-info-section.tsx` | Practical travel info card (currency, climate, tips) |

### Modified Files

| File | Change |
|------|--------|
| `apps/api/src/automation/automation.types.ts` | Add `DESTINATION_DATA_ENRICHMENT` job type |
| `apps/api/src/automation/processors/enrichment.processor.ts` | Handle new job type |
| `apps/api/src/destinations/destinations.controller.ts` | Add batch enrichment endpoint |
| `apps/api/src/destinations/destinations.module.ts` | Register new services |
| `apps/ota/src/lib/entity-hubs/adapters/destination.adapter.ts` | Use enriched metadata for hero, pills, sections |
| `apps/ota/src/lib/entity-hubs/section-registry.ts` | Register destinationInfo section |
| `apps/ota/src/app/api/chat/route.ts` | Enrich AI context with destination metadata |

---

### Task 1: Country Data Lookup Table

**Files:**
- Create: `apps/api/src/destinations/country-data.ts`

- [ ] **Step 1: Create the static country data module**

```typescript
// apps/api/src/destinations/country-data.ts

export interface CountryInfo {
  name: string
  currency: string
  currencyName: string
  languages: string[]
  visaForCA: string
  drivingSide: 'left' | 'right'
  electricPlug: string
  emergencyNumber: string
  dialCode: string
}

export const COUNTRY_DATA: Record<string, CountryInfo> = {
  // Americas
  US: { name: 'United States', currency: 'USD', currencyName: 'US Dollar', languages: ['English'], visaForCA: 'Not required (6 months)', drivingSide: 'right', electricPlug: 'A/B', emergencyNumber: '911', dialCode: '+1' },
  MX: { name: 'Mexico', currency: 'MXN', currencyName: 'Mexican Peso', languages: ['Spanish'], visaForCA: 'Not required (180 days)', drivingSide: 'right', electricPlug: 'A/B', emergencyNumber: '911', dialCode: '+52' },
  CA: { name: 'Canada', currency: 'CAD', currencyName: 'Canadian Dollar', languages: ['English', 'French'], visaForCA: 'N/A (home)', drivingSide: 'right', electricPlug: 'A/B', emergencyNumber: '911', dialCode: '+1' },
  BS: { name: 'Bahamas', currency: 'BSD', currencyName: 'Bahamian Dollar', languages: ['English'], visaForCA: 'Not required (8 months)', drivingSide: 'left', electricPlug: 'A/B', emergencyNumber: '911/919', dialCode: '+1-242' },
  JM: { name: 'Jamaica', currency: 'JMD', currencyName: 'Jamaican Dollar', languages: ['English'], visaForCA: 'Not required (6 months)', drivingSide: 'left', electricPlug: 'A/B', emergencyNumber: '119', dialCode: '+1-876' },
  BB: { name: 'Barbados', currency: 'BBD', currencyName: 'Barbadian Dollar', languages: ['English'], visaForCA: 'Not required (6 months)', drivingSide: 'left', electricPlug: 'A/B', emergencyNumber: '211', dialCode: '+1-246' },
  BM: { name: 'Bermuda', currency: 'BMD', currencyName: 'Bermudian Dollar', languages: ['English'], visaForCA: 'Not required (6 months)', drivingSide: 'left', electricPlug: 'A/B', emergencyNumber: '911', dialCode: '+1-441' },
  AW: { name: 'Aruba', currency: 'AWG', currencyName: 'Aruban Florin', languages: ['Dutch', 'Papiamento'], visaForCA: 'Not required (30 days)', drivingSide: 'right', electricPlug: 'A/B/F', emergencyNumber: '911', dialCode: '+297' },
  KY: { name: 'Cayman Islands', currency: 'KYD', currencyName: 'Cayman Dollar', languages: ['English'], visaForCA: 'Not required (6 months)', drivingSide: 'left', electricPlug: 'A/B', emergencyNumber: '911', dialCode: '+1-345' },
  CR: { name: 'Costa Rica', currency: 'CRC', currencyName: 'Costa Rican Colón', languages: ['Spanish'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'A/B', emergencyNumber: '911', dialCode: '+506' },
  PA: { name: 'Panama', currency: 'USD', currencyName: 'US Dollar / Balboa', languages: ['Spanish'], visaForCA: 'Not required (180 days)', drivingSide: 'right', electricPlug: 'A/B', emergencyNumber: '911', dialCode: '+507' },
  CO: { name: 'Colombia', currency: 'COP', currencyName: 'Colombian Peso', languages: ['Spanish'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'A/B', emergencyNumber: '123', dialCode: '+57' },
  CL: { name: 'Chile', currency: 'CLP', currencyName: 'Chilean Peso', languages: ['Spanish'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/L', emergencyNumber: '131', dialCode: '+56' },
  BR: { name: 'Brazil', currency: 'BRL', currencyName: 'Brazilian Real', languages: ['Portuguese'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/N', emergencyNumber: '190', dialCode: '+55' },
  AR: { name: 'Argentina', currency: 'ARS', currencyName: 'Argentine Peso', languages: ['Spanish'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/I', emergencyNumber: '911', dialCode: '+54' },
  BZ: { name: 'Belize', currency: 'BZD', currencyName: 'Belize Dollar', languages: ['English'], visaForCA: 'Not required (30 days)', drivingSide: 'right', electricPlug: 'A/B/G', emergencyNumber: '911', dialCode: '+501' },
  HN: { name: 'Honduras', currency: 'HNL', currencyName: 'Honduran Lempira', languages: ['Spanish'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'A/B', emergencyNumber: '199', dialCode: '+504' },
  CU: { name: 'Cuba', currency: 'CUP', currencyName: 'Cuban Peso', languages: ['Spanish'], visaForCA: 'Tourist card required', drivingSide: 'right', electricPlug: 'A/B/C', emergencyNumber: '106', dialCode: '+53' },
  DO: { name: 'Dominican Republic', currency: 'DOP', currencyName: 'Dominican Peso', languages: ['Spanish'], visaForCA: 'Tourist card on arrival', drivingSide: 'right', electricPlug: 'A/B', emergencyNumber: '911', dialCode: '+1-809' },
  PR: { name: 'Puerto Rico', currency: 'USD', currencyName: 'US Dollar', languages: ['Spanish', 'English'], visaForCA: 'Not required (US territory)', drivingSide: 'right', electricPlug: 'A/B', emergencyNumber: '911', dialCode: '+1-787' },
  EC: { name: 'Ecuador', currency: 'USD', currencyName: 'US Dollar', languages: ['Spanish'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'A/B', emergencyNumber: '911', dialCode: '+593' },
  PE: { name: 'Peru', currency: 'PEN', currencyName: 'Peruvian Sol', languages: ['Spanish'], visaForCA: 'Not required (183 days)', drivingSide: 'right', electricPlug: 'A/B/C', emergencyNumber: '105', dialCode: '+51' },

  // Europe
  GB: { name: 'United Kingdom', currency: 'GBP', currencyName: 'British Pound', languages: ['English'], visaForCA: 'Not required (6 months)', drivingSide: 'left', electricPlug: 'G', emergencyNumber: '999', dialCode: '+44' },
  FR: { name: 'France', currency: 'EUR', currencyName: 'Euro', languages: ['French'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/E', emergencyNumber: '112', dialCode: '+33' },
  ES: { name: 'Spain', currency: 'EUR', currencyName: 'Euro', languages: ['Spanish'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/F', emergencyNumber: '112', dialCode: '+34' },
  IT: { name: 'Italy', currency: 'EUR', currencyName: 'Euro', languages: ['Italian'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/F/L', emergencyNumber: '112', dialCode: '+39' },
  GR: { name: 'Greece', currency: 'EUR', currencyName: 'Euro', languages: ['Greek'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/F', emergencyNumber: '112', dialCode: '+30' },
  TR: { name: 'Turkey', currency: 'TRY', currencyName: 'Turkish Lira', languages: ['Turkish'], visaForCA: 'e-Visa required', drivingSide: 'right', electricPlug: 'C/F', emergencyNumber: '112', dialCode: '+90' },
  DE: { name: 'Germany', currency: 'EUR', currencyName: 'Euro', languages: ['German'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/F', emergencyNumber: '112', dialCode: '+49' },
  NO: { name: 'Norway', currency: 'NOK', currencyName: 'Norwegian Krone', languages: ['Norwegian'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/F', emergencyNumber: '112', dialCode: '+47' },
  DK: { name: 'Denmark', currency: 'DKK', currencyName: 'Danish Krone', languages: ['Danish'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/E/F/K', emergencyNumber: '112', dialCode: '+45' },
  SE: { name: 'Sweden', currency: 'SEK', currencyName: 'Swedish Krona', languages: ['Swedish'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/F', emergencyNumber: '112', dialCode: '+46' },
  NL: { name: 'Netherlands', currency: 'EUR', currencyName: 'Euro', languages: ['Dutch'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/F', emergencyNumber: '112', dialCode: '+31' },
  PT: { name: 'Portugal', currency: 'EUR', currencyName: 'Euro', languages: ['Portuguese'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/F', emergencyNumber: '112', dialCode: '+351' },
  HR: { name: 'Croatia', currency: 'EUR', currencyName: 'Euro', languages: ['Croatian'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/F', emergencyNumber: '112', dialCode: '+385' },
  ME: { name: 'Montenegro', currency: 'EUR', currencyName: 'Euro', languages: ['Montenegrin'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/F', emergencyNumber: '112', dialCode: '+382' },
  IE: { name: 'Ireland', currency: 'EUR', currencyName: 'Euro', languages: ['English', 'Irish'], visaForCA: 'Not required (90 days)', drivingSide: 'left', electricPlug: 'G', emergencyNumber: '112/999', dialCode: '+353' },
  IS: { name: 'Iceland', currency: 'ISK', currencyName: 'Icelandic Króna', languages: ['Icelandic'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/F', emergencyNumber: '112', dialCode: '+354' },
  MT: { name: 'Malta', currency: 'EUR', currencyName: 'Euro', languages: ['Maltese', 'English'], visaForCA: 'Not required (90 days)', drivingSide: 'left', electricPlug: 'G', emergencyNumber: '112', dialCode: '+356' },
  CY: { name: 'Cyprus', currency: 'EUR', currencyName: 'Euro', languages: ['Greek', 'Turkish'], visaForCA: 'Not required (90 days)', drivingSide: 'left', electricPlug: 'G', emergencyNumber: '112', dialCode: '+357' },

  // Asia & Middle East
  JP: { name: 'Japan', currency: 'JPY', currencyName: 'Japanese Yen', languages: ['Japanese'], visaForCA: 'Not required (6 months)', drivingSide: 'left', electricPlug: 'A/B', emergencyNumber: '110', dialCode: '+81' },
  SG: { name: 'Singapore', currency: 'SGD', currencyName: 'Singapore Dollar', languages: ['English', 'Mandarin', 'Malay', 'Tamil'], visaForCA: 'Not required (30 days)', drivingSide: 'left', electricPlug: 'G', emergencyNumber: '999', dialCode: '+65' },
  TH: { name: 'Thailand', currency: 'THB', currencyName: 'Thai Baht', languages: ['Thai'], visaForCA: 'Not required (30 days)', drivingSide: 'left', electricPlug: 'A/B/C', emergencyNumber: '191', dialCode: '+66' },
  AE: { name: 'United Arab Emirates', currency: 'AED', currencyName: 'UAE Dirham', languages: ['Arabic', 'English'], visaForCA: 'Not required (30 days)', drivingSide: 'right', electricPlug: 'G', emergencyNumber: '999', dialCode: '+971' },
  IL: { name: 'Israel', currency: 'ILS', currencyName: 'Israeli Shekel', languages: ['Hebrew', 'Arabic'], visaForCA: 'Not required (3 months)', drivingSide: 'right', electricPlug: 'C/H', emergencyNumber: '100', dialCode: '+972' },
  IN: { name: 'India', currency: 'INR', currencyName: 'Indian Rupee', languages: ['Hindi', 'English'], visaForCA: 'e-Visa required', drivingSide: 'left', electricPlug: 'C/D/M', emergencyNumber: '112', dialCode: '+91' },
  VN: { name: 'Vietnam', currency: 'VND', currencyName: 'Vietnamese Dong', languages: ['Vietnamese'], visaForCA: 'e-Visa required', drivingSide: 'right', electricPlug: 'A/B/C', emergencyNumber: '113', dialCode: '+84' },
  MY: { name: 'Malaysia', currency: 'MYR', currencyName: 'Malaysian Ringgit', languages: ['Malay', 'English'], visaForCA: 'Not required (90 days)', drivingSide: 'left', electricPlug: 'G', emergencyNumber: '999', dialCode: '+60' },
  ID: { name: 'Indonesia', currency: 'IDR', currencyName: 'Indonesian Rupiah', languages: ['Indonesian'], visaForCA: 'Visa on arrival (30 days)', drivingSide: 'left', electricPlug: 'C/F', emergencyNumber: '112', dialCode: '+62' },
  PH: { name: 'Philippines', currency: 'PHP', currencyName: 'Philippine Peso', languages: ['Filipino', 'English'], visaForCA: 'Not required (30 days)', drivingSide: 'right', electricPlug: 'A/B/C', emergencyNumber: '911', dialCode: '+63' },
  CN: { name: 'China', currency: 'CNY', currencyName: 'Chinese Yuan', languages: ['Mandarin'], visaForCA: 'Visa required', drivingSide: 'right', electricPlug: 'A/C/I', emergencyNumber: '110', dialCode: '+86' },
  KR: { name: 'South Korea', currency: 'KRW', currencyName: 'South Korean Won', languages: ['Korean'], visaForCA: 'Not required (6 months)', drivingSide: 'right', electricPlug: 'C/F', emergencyNumber: '112', dialCode: '+82' },
  OM: { name: 'Oman', currency: 'OMR', currencyName: 'Omani Rial', languages: ['Arabic'], visaForCA: 'Visa on arrival (30 days)', drivingSide: 'right', electricPlug: 'G', emergencyNumber: '9999', dialCode: '+968' },
  QA: { name: 'Qatar', currency: 'QAR', currencyName: 'Qatari Riyal', languages: ['Arabic', 'English'], visaForCA: 'Visa on arrival (30 days)', drivingSide: 'right', electricPlug: 'G', emergencyNumber: '999', dialCode: '+974' },
  BH: { name: 'Bahrain', currency: 'BHD', currencyName: 'Bahraini Dinar', languages: ['Arabic'], visaForCA: 'Visa on arrival (14 days)', drivingSide: 'right', electricPlug: 'G', emergencyNumber: '999', dialCode: '+973' },
  JO: { name: 'Jordan', currency: 'JOD', currencyName: 'Jordanian Dinar', languages: ['Arabic'], visaForCA: 'Visa on arrival', drivingSide: 'right', electricPlug: 'B/C/D/F/G/J', emergencyNumber: '911', dialCode: '+962' },
  LK: { name: 'Sri Lanka', currency: 'LKR', currencyName: 'Sri Lankan Rupee', languages: ['Sinhala', 'Tamil'], visaForCA: 'ETA required', drivingSide: 'left', electricPlug: 'D/G', emergencyNumber: '119', dialCode: '+94' },

  // Oceania
  AU: { name: 'Australia', currency: 'AUD', currencyName: 'Australian Dollar', languages: ['English'], visaForCA: 'eTA required', drivingSide: 'left', electricPlug: 'I', emergencyNumber: '000', dialCode: '+61' },
  NZ: { name: 'New Zealand', currency: 'NZD', currencyName: 'New Zealand Dollar', languages: ['English', 'Māori'], visaForCA: 'NZeTA required', drivingSide: 'left', electricPlug: 'I', emergencyNumber: '111', dialCode: '+64' },
  FJ: { name: 'Fiji', currency: 'FJD', currencyName: 'Fijian Dollar', languages: ['English', 'Fijian'], visaForCA: 'Not required (4 months)', drivingSide: 'left', electricPlug: 'I', emergencyNumber: '917', dialCode: '+679' },
  PF: { name: 'French Polynesia', currency: 'XPF', currencyName: 'CFP Franc', languages: ['French', 'Tahitian'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'A/B/C/E', emergencyNumber: '17', dialCode: '+689' },

  // Africa
  EG: { name: 'Egypt', currency: 'EGP', currencyName: 'Egyptian Pound', languages: ['Arabic'], visaForCA: 'Visa on arrival', drivingSide: 'right', electricPlug: 'C/F', emergencyNumber: '122', dialCode: '+20' },
  MA: { name: 'Morocco', currency: 'MAD', currencyName: 'Moroccan Dirham', languages: ['Arabic', 'French'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/E', emergencyNumber: '19', dialCode: '+212' },
  ZA: { name: 'South Africa', currency: 'ZAR', currencyName: 'South African Rand', languages: ['English', 'Afrikaans', 'Zulu'], visaForCA: 'Not required (90 days)', drivingSide: 'left', electricPlug: 'C/M/N', emergencyNumber: '10111', dialCode: '+27' },
  KE: { name: 'Kenya', currency: 'KES', currencyName: 'Kenyan Shilling', languages: ['Swahili', 'English'], visaForCA: 'eVisa required', drivingSide: 'left', electricPlug: 'G', emergencyNumber: '999', dialCode: '+254' },
  TZ: { name: 'Tanzania', currency: 'TZS', currencyName: 'Tanzanian Shilling', languages: ['Swahili', 'English'], visaForCA: 'Visa on arrival', drivingSide: 'left', electricPlug: 'D/G', emergencyNumber: '112', dialCode: '+255' },
  SC: { name: 'Seychelles', currency: 'SCR', currencyName: 'Seychellois Rupee', languages: ['English', 'French', 'Creole'], visaForCA: 'Not required (3 months)', drivingSide: 'left', electricPlug: 'G', emergencyNumber: '999', dialCode: '+248' },
  MU: { name: 'Mauritius', currency: 'MUR', currencyName: 'Mauritian Rupee', languages: ['English', 'French', 'Creole'], visaForCA: 'Not required (90 days)', drivingSide: 'left', electricPlug: 'C/G', emergencyNumber: '999', dialCode: '+230' },
  MV: { name: 'Maldives', currency: 'MVR', currencyName: 'Maldivian Rufiyaa', languages: ['Dhivehi'], visaForCA: 'Visa on arrival (30 days)', drivingSide: 'left', electricPlug: 'A/D/G/J/K/L', emergencyNumber: '119', dialCode: '+960' },
  CI: { name: 'Ivory Coast', currency: 'XOF', currencyName: 'West African CFA Franc', languages: ['French'], visaForCA: 'Visa required', drivingSide: 'right', electricPlug: 'C/E', emergencyNumber: '110', dialCode: '+225' },
  SL: { name: 'Sierra Leone', currency: 'SLL', currencyName: 'Sierra Leonean Leone', languages: ['English'], visaForCA: 'Visa required', drivingSide: 'right', electricPlug: 'D/G', emergencyNumber: '999', dialCode: '+232' },
  SN: { name: 'Senegal', currency: 'XOF', currencyName: 'West African CFA Franc', languages: ['French'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/D/E/K', emergencyNumber: '17', dialCode: '+221' },
  NA: { name: 'Namibia', currency: 'NAD', currencyName: 'Namibian Dollar', languages: ['English'], visaForCA: 'Not required (90 days)', drivingSide: 'left', electricPlug: 'D/M', emergencyNumber: '10111', dialCode: '+264' },
  MG: { name: 'Madagascar', currency: 'MGA', currencyName: 'Malagasy Ariary', languages: ['Malagasy', 'French'], visaForCA: 'Visa on arrival', drivingSide: 'right', electricPlug: 'C/D/E/J/K', emergencyNumber: '117', dialCode: '+261' },

  // Caribbean islands
  GD: { name: 'Grenada', currency: 'XCD', currencyName: 'East Caribbean Dollar', languages: ['English'], visaForCA: 'Not required (6 months)', drivingSide: 'left', electricPlug: 'G', emergencyNumber: '911', dialCode: '+1-473' },
  AG: { name: 'Antigua and Barbuda', currency: 'XCD', currencyName: 'East Caribbean Dollar', languages: ['English'], visaForCA: 'Not required (6 months)', drivingSide: 'left', electricPlug: 'A/B', emergencyNumber: '911', dialCode: '+1-268' },
  LC: { name: 'Saint Lucia', currency: 'XCD', currencyName: 'East Caribbean Dollar', languages: ['English'], visaForCA: 'Not required (6 weeks)', drivingSide: 'left', electricPlug: 'G', emergencyNumber: '999', dialCode: '+1-758' },
  TT: { name: 'Trinidad and Tobago', currency: 'TTD', currencyName: 'Trinidad Dollar', languages: ['English'], visaForCA: 'Not required (6 months)', drivingSide: 'left', electricPlug: 'A/B', emergencyNumber: '999', dialCode: '+1-868' },
  DM: { name: 'Dominica', currency: 'XCD', currencyName: 'East Caribbean Dollar', languages: ['English'], visaForCA: 'Not required (6 months)', drivingSide: 'left', electricPlug: 'D/G', emergencyNumber: '999', dialCode: '+1-767' },
  VC: { name: 'Saint Vincent', currency: 'XCD', currencyName: 'East Caribbean Dollar', languages: ['English'], visaForCA: 'Not required (1 month)', drivingSide: 'left', electricPlug: 'A/C/E/G/I/K', emergencyNumber: '999', dialCode: '+1-784' },
  KN: { name: 'Saint Kitts and Nevis', currency: 'XCD', currencyName: 'East Caribbean Dollar', languages: ['English'], visaForCA: 'Not required (6 months)', drivingSide: 'left', electricPlug: 'A/B/D/G', emergencyNumber: '911', dialCode: '+1-869' },
  CW: { name: 'Curaçao', currency: 'ANG', currencyName: 'Netherlands Antillean Guilder', languages: ['Dutch', 'Papiamentu'], visaForCA: 'Not required (3 months)', drivingSide: 'right', electricPlug: 'A/B', emergencyNumber: '911', dialCode: '+599' },
  SX: { name: 'Sint Maarten', currency: 'ANG', currencyName: 'Netherlands Antillean Guilder', languages: ['Dutch', 'English'], visaForCA: 'Not required (3 months)', drivingSide: 'right', electricPlug: 'A/B', emergencyNumber: '911', dialCode: '+1-721' },
  MQ: { name: 'Martinique', currency: 'EUR', currencyName: 'Euro', languages: ['French'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/D/E', emergencyNumber: '112', dialCode: '+596' },
  GP: { name: 'Guadeloupe', currency: 'EUR', currencyName: 'Euro', languages: ['French'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/D/E', emergencyNumber: '112', dialCode: '+590' },
  VI: { name: 'US Virgin Islands', currency: 'USD', currencyName: 'US Dollar', languages: ['English'], visaForCA: 'Not required (US territory)', drivingSide: 'left', electricPlug: 'A/B', emergencyNumber: '911', dialCode: '+1-340' },
  VG: { name: 'British Virgin Islands', currency: 'USD', currencyName: 'US Dollar', languages: ['English'], visaForCA: 'Not required (6 months)', drivingSide: 'left', electricPlug: 'A/B', emergencyNumber: '911/999', dialCode: '+1-284' },

  // Additional
  RU: { name: 'Russia', currency: 'RUB', currencyName: 'Russian Ruble', languages: ['Russian'], visaForCA: 'Visa required', drivingSide: 'right', electricPlug: 'C/F', emergencyNumber: '112', dialCode: '+7' },
  FI: { name: 'Finland', currency: 'EUR', currencyName: 'Euro', languages: ['Finnish', 'Swedish'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/F', emergencyNumber: '112', dialCode: '+358' },
  EE: { name: 'Estonia', currency: 'EUR', currencyName: 'Euro', languages: ['Estonian'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/F', emergencyNumber: '112', dialCode: '+372' },
  LV: { name: 'Latvia', currency: 'EUR', currencyName: 'Euro', languages: ['Latvian'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/F', emergencyNumber: '112', dialCode: '+371' },
  LT: { name: 'Lithuania', currency: 'EUR', currencyName: 'Euro', languages: ['Lithuanian'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/F', emergencyNumber: '112', dialCode: '+370' },
  PL: { name: 'Poland', currency: 'PLN', currencyName: 'Polish Złoty', languages: ['Polish'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/E', emergencyNumber: '112', dialCode: '+48' },
  BE: { name: 'Belgium', currency: 'EUR', currencyName: 'Euro', languages: ['Dutch', 'French', 'German'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/E', emergencyNumber: '112', dialCode: '+32' },
  SI: { name: 'Slovenia', currency: 'EUR', currencyName: 'Euro', languages: ['Slovenian'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/F', emergencyNumber: '112', dialCode: '+386' },
  AT: { name: 'Austria', currency: 'EUR', currencyName: 'Euro', languages: ['German'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/F', emergencyNumber: '112', dialCode: '+43' },
  CH: { name: 'Switzerland', currency: 'CHF', currencyName: 'Swiss Franc', languages: ['German', 'French', 'Italian'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/J', emergencyNumber: '112', dialCode: '+41' },
}

/**
 * Look up country info by 2-letter ISO code.
 * Returns undefined for unknown country codes.
 */
export function getCountryInfo(countryCode: string): CountryInfo | undefined {
  return COUNTRY_DATA[countryCode.toUpperCase()]
}
```

- [ ] **Step 2: Verify API compiles**

Run: `cd apps/api && pnpm exec tsc --noEmit 2>&1 | head -10`

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/destinations/country-data.ts
git commit -m "feat(api): add country data lookup table — currency, language, visa for 80+ countries"
```

---

### Task 2: Wikipedia Service

**Files:**
- Create: `apps/api/src/destinations/wikipedia.service.ts`

- [ ] **Step 1: Create the Wikipedia API client**

```typescript
// apps/api/src/destinations/wikipedia.service.ts

import { Injectable, Logger } from '@nestjs/common'

export interface WikipediaSummary {
  title: string
  extract: string         // Plain text summary (2-3 paragraphs)
  description?: string    // Short tagline
  thumbnail?: { source: string; width: number; height: number }
  coordinates?: { lat: number; lon: number }
}

@Injectable()
export class WikipediaService {
  private readonly logger = new Logger(WikipediaService.name)

  /**
   * Fetch a Wikipedia summary for a destination.
   * Uses the REST API which is free and has generous rate limits (200/sec).
   */
  async fetchSummary(query: string): Promise<WikipediaSummary | null> {
    try {
      // First search for the page title
      const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=1`
      const searchRes = await fetch(searchUrl, {
        headers: { 'User-Agent': 'PhoenixVoyages/1.0 (travel agency enrichment)' },
      })
      if (!searchRes.ok) return null

      const searchData = await searchRes.json()
      const pageTitle = searchData?.query?.search?.[0]?.title
      if (!pageTitle) return null

      // Then fetch the summary
      const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`
      const summaryRes = await fetch(summaryUrl, {
        headers: { 'User-Agent': 'PhoenixVoyages/1.0 (travel agency enrichment)' },
      })
      if (!summaryRes.ok) return null

      const data = await summaryRes.json()

      return {
        title: data.title,
        extract: data.extract || '',
        description: data.description,
        thumbnail: data.thumbnail,
        coordinates: data.coordinates,
      }
    } catch (err) {
      this.logger.warn(`Wikipedia fetch failed for "${query}": ${err.message}`)
      return null
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/destinations/wikipedia.service.ts
git commit -m "feat(api): add WikipediaService for destination content fetching"
```

---

### Task 3: AI Travel Editor

**Files:**
- Create: `apps/api/src/destinations/ai-travel-editor.ts`

- [ ] **Step 1: Create the AI curation module**

```typescript
// apps/api/src/destinations/ai-travel-editor.ts

import { Injectable, Logger } from '@nestjs/common'
import OpenAI from 'openai'

export interface RawDestinationData {
  name: string
  type: string
  country?: string
  countryCode?: string
  coordinates?: { lat: number; lng: number }
  wikipedia?: string            // Raw extract
  tripAdvisorRating?: number
  tripAdvisorAttractions?: string[]
  climateZone?: string
  currency?: string
  language?: string
  isCruisePort?: boolean
  sailingsCount?: number
}

export interface CuratedContent {
  travelDescription: string
  oneLiner: string
  highlights: string[]
  bestMonths: string[]
  typicalStay: string
  budgetTier: 'budget' | 'mid-range' | 'luxury'
  travelTips: string[]
  tags: string[]
  vibeWords: string[]
}

const EDITOR_SYSTEM_PROMPT = `You are a travel content editor for Phoenix Voyages, a premium Canadian travel agency.

Your job: Transform raw data about a destination into warm, helpful travel content that inspires and informs travelers.

Tone: Like a well-traveled friend sharing insider knowledge. Enthusiastic but honest. Specific over generic.

Rules:
- Lead with what makes this place special — what would make someone say "I NEED to go there"
- Include practical tips a traveler actually needs (not Wikipedia facts about history or population)
- Mention seasons/weather naturally: "Visit in December for perfect beach weather"
- If it's a cruise port, mention what you can do in a port day
- Keep the travelDescription to 2-3 short paragraphs max
- Use sensory language: "turquoise waters", "cobblestone streets", "the smell of fresh seafood"
- Never sound like an encyclopedia or a marketing brochure
- If you don't have enough info, keep it short and genuine rather than padding with generic filler
- The oneLiner should be catchy and specific: "Caribbean diving paradise with Mayan history" not "Beautiful tropical destination"
- Tags should be specific activities/qualities: ["snorkeling", "diving", "cruise-port"] not vague ["travel", "vacation"]
- bestMonths should be actual month names based on climate
- budgetTier: "budget" (under $100/day), "mid-range" ($100-300/day), "luxury" ($300+/day)
- typicalStay: how long most travelers spend ("2-4 days", "1 week", "day trip from cruise")

ALWAYS respond with valid JSON matching this exact schema:
{
  "travelDescription": "string (2-3 paragraphs)",
  "oneLiner": "string (one catchy sentence)",
  "highlights": ["string array, 4-6 items"],
  "bestMonths": ["month names"],
  "typicalStay": "string",
  "budgetTier": "budget | mid-range | luxury",
  "travelTips": ["string array, 2-4 practical tips"],
  "tags": ["string array, 5-10 specific tags"],
  "vibeWords": ["string array, 3-5 mood words"]
}`

@Injectable()
export class AiTravelEditorService {
  private readonly logger = new Logger(AiTravelEditorService.name)
  private openai: OpenAI | null = null

  private getClient(): OpenAI | null {
    if (this.openai) return this.openai
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY not configured — AI curation disabled')
      return null
    }
    this.openai = new OpenAI({ apiKey })
    return this.openai
  }

  async curateDestination(raw: RawDestinationData): Promise<CuratedContent | null> {
    const client = this.getClient()
    if (!client) return null

    const userPrompt = this.buildUserPrompt(raw)

    try {
      const response = await client.chat.completions.create({
        model: process.env.AI_ENRICHMENT_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: EDITOR_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
      })

      const content = response.choices[0]?.message?.content
      if (!content) return null

      const parsed = JSON.parse(content) as CuratedContent

      // Validate required fields
      if (!parsed.travelDescription || !parsed.oneLiner || !parsed.tags) {
        this.logger.warn(`AI curation returned incomplete data for ${raw.name}`)
        return null
      }

      return parsed
    } catch (err) {
      this.logger.error(`AI curation failed for ${raw.name}: ${err.message}`)
      return null
    }
  }

  private buildUserPrompt(raw: RawDestinationData): string {
    const lines: string[] = [`Destination: ${raw.name}`]

    if (raw.type) lines.push(`Type: ${raw.type}`)
    if (raw.country) lines.push(`Country: ${raw.country}`)
    if (raw.coordinates) lines.push(`Coordinates: ${raw.coordinates.lat}, ${raw.coordinates.lng}`)
    if (raw.climateZone) lines.push(`Climate: ${raw.climateZone}`)
    if (raw.currency) lines.push(`Currency: ${raw.currency}`)
    if (raw.language) lines.push(`Language: ${raw.language}`)
    if (raw.isCruisePort) lines.push(`Cruise port: Yes (${raw.sailingsCount || 'unknown'} sailings stop here)`)

    if (raw.wikipedia) {
      lines.push(`\nWikipedia summary:\n${raw.wikipedia.slice(0, 2000)}`)
    }

    if (raw.tripAdvisorRating) {
      lines.push(`\nTripAdvisor rating: ${raw.tripAdvisorRating}/5`)
    }
    if (raw.tripAdvisorAttractions?.length) {
      lines.push(`Top attractions: ${raw.tripAdvisorAttractions.slice(0, 10).join(', ')}`)
    }

    lines.push('\nCreate curated travel content for this destination. Return valid JSON.')

    return lines.join('\n')
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/destinations/ai-travel-editor.ts
git commit -m "feat(api): add AiTravelEditorService — curates raw data into travel-focused content"
```

---

### Task 4: Destination Data Enrichment Service

**Files:**
- Create: `apps/api/src/destinations/destination-data-enrichment.service.ts`

- [ ] **Step 1: Create the orchestration service**

This is the main service that coordinates raw data gathering + AI curation + storage.

```typescript
// apps/api/src/destinations/destination-data-enrichment.service.ts

import { Injectable, Logger } from '@nestjs/common'
import { eq, sql, isNull, and, isNotNull } from 'drizzle-orm'
import { DatabaseService } from '../database/database.service'
import { WikipediaService } from './wikipedia.service'
import { AiTravelEditorService, type RawDestinationData, type CuratedContent } from './ai-travel-editor'
import { getCountryInfo } from './country-data'

@Injectable()
export class DestinationDataEnrichmentService {
  private readonly logger = new Logger(DestinationDataEnrichmentService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly wikipedia: WikipediaService,
    private readonly aiEditor: AiTravelEditorService,
  ) {}

  /**
   * Enrich a single destination with all available data + AI curation.
   */
  async enrichDestination(destinationId: string): Promise<{ success: boolean; error?: string }> {
    const { destinations } = this.db.schema

    // Fetch destination
    const [dest] = await this.db.client
      .select()
      .from(destinations)
      .where(eq(destinations.id, destinationId))
      .limit(1)

    if (!dest) return { success: false, error: 'Destination not found' }

    this.logger.log(`Enriching: ${dest.name}`)

    // 1. Gather raw data (parallel where possible)
    const [wikiData, countryInfo] = await Promise.all([
      this.wikipedia.fetchSummary(dest.name),
      Promise.resolve(dest.countryCode ? getCountryInfo(dest.countryCode) : undefined),
    ])

    // 2. Compute climate zone from latitude
    const climateZone = dest.latitude ? this.getClimateZone(parseFloat(String(dest.latitude))) : undefined

    // 3. Compute timezone (simple approximation from longitude)
    const utcOffset = dest.longitude ? this.estimateUtcOffset(parseFloat(String(dest.longitude))) : undefined

    // 4. Build raw data for AI editor
    const rawData: RawDestinationData = {
      name: dest.name,
      type: dest.destinationType,
      country: countryInfo?.name || undefined,
      countryCode: dest.countryCode || undefined,
      coordinates: dest.latitude && dest.longitude
        ? { lat: parseFloat(String(dest.latitude)), lng: parseFloat(String(dest.longitude)) }
        : undefined,
      wikipedia: wikiData?.extract || undefined,
      climateZone,
      currency: countryInfo?.currencyName || undefined,
      language: countryInfo?.languages?.[0] || undefined,
      isCruisePort: dest.destinationType === 'port_city',
    }

    // 5. AI Curation
    const curated = await this.aiEditor.curateDestination(rawData)

    // 6. Build metadata update
    const existingMetadata = (dest.metadata as Record<string, unknown>) || {}
    const newMetadata: Record<string, unknown> = {
      ...existingMetadata,

      // AI curated content
      ...(curated ? {
        travelDescription: curated.travelDescription,
        oneLiner: curated.oneLiner,
        highlights: curated.highlights,
        bestMonths: curated.bestMonths,
        typicalStay: curated.typicalStay,
        budgetTier: curated.budgetTier,
        travelTips: curated.travelTips,
        tags: curated.tags,
        vibeWords: curated.vibeWords,
      } : {}),

      // Country info
      ...(countryInfo ? {
        currency: countryInfo.currency,
        currencyName: countryInfo.currencyName,
        languages: countryInfo.languages,
        visaInfo: countryInfo.visaForCA,
        electricPlug: countryInfo.electricPlug,
        emergencyNumber: countryInfo.emergencyNumber,
      } : {}),

      // Climate
      ...(climateZone ? { climateZone } : {}),
      ...(utcOffset !== undefined ? { utcOffset: `UTC${utcOffset >= 0 ? '+' : ''}${utcOffset}` } : {}),

      // Tracking
      enrichedAt: new Date().toISOString(),
      enrichmentVersion: 2,
      aiModelUsed: process.env.AI_ENRICHMENT_MODEL || 'gpt-4o-mini',
      sources: [
        ...(wikiData ? ['wikipedia'] : []),
        ...(countryInfo ? ['country'] : []),
        ...(curated ? ['ai'] : []),
        'climate',
      ],
    }

    // 7. Update destination
    await this.db.client
      .update(destinations)
      .set({
        metadata: sql`${JSON.stringify(newMetadata)}::jsonb`,
        summary: curated?.travelDescription || dest.summary,
        updatedAt: sql`NOW()`,
      })
      .where(eq(destinations.id, destinationId))

    // Also backfill country code if missing
    if (!dest.countryCode && countryInfo) {
      // Country code might be derivable from the name pattern
    }

    this.logger.log(`Enriched: ${dest.name} (${curated ? 'AI curated' : 'data only'})`)
    return { success: true }
  }

  /**
   * Batch enrich destinations by priority.
   */
  async batchEnrich(options: { limit?: number; offset?: number } = {}): Promise<{ processed: number; succeeded: number; failed: number }> {
    const { destinations } = this.db.schema
    const limit = options.limit || 50
    const offset = options.offset || 0

    // Get destinations needing enrichment, prioritized
    const rows = await this.db.client
      .select({ id: destinations.id, name: destinations.name })
      .from(destinations)
      .where(
        and(
          isNotNull(destinations.latitude),
          // Not yet enriched (no travelDescription in metadata)
          sql`(metadata->>'travelDescription') IS NULL`,
        )
      )
      .orderBy(destinations.name)
      .limit(limit)
      .offset(offset)

    this.logger.log(`Batch enrichment: ${rows.length} destinations (offset ${offset}, limit ${limit})`)

    let succeeded = 0
    let failed = 0

    for (const row of rows) {
      const result = await this.enrichDestination(row.id)
      if (result.success) succeeded++
      else failed++

      // Rate limit: ~1 sec between AI calls
      await new Promise(r => setTimeout(r, 1200))
    }

    return { processed: rows.length, succeeded, failed }
  }

  private getClimateZone(latitude: number): string {
    const absLat = Math.abs(latitude)
    if (absLat < 10) return 'equatorial'
    if (absLat < 23.5) return 'tropical'
    if (absLat < 35) return 'subtropical'
    if (absLat < 55) return 'temperate'
    if (absLat < 66.5) return 'subarctic'
    return 'arctic'
  }

  private estimateUtcOffset(longitude: number): number {
    // Rough estimate: 15 degrees per hour
    return Math.round(longitude / 15)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/destinations/destination-data-enrichment.service.ts
git commit -m "feat(api): add DestinationDataEnrichmentService — orchestrates raw data + AI curation"
```

---

### Task 5: Register Services + Add Enrichment Endpoint

**Files:**
- Modify: `apps/api/src/destinations/destinations.module.ts`
- Modify: `apps/api/src/destinations/destinations.controller.ts`
- Modify: `apps/api/src/automation/automation.types.ts`

- [ ] **Step 1: Register services in module**

Read `apps/api/src/destinations/destinations.module.ts` and add:
- `WikipediaService` to providers
- `AiTravelEditorService` to providers
- `DestinationDataEnrichmentService` to providers

- [ ] **Step 2: Add enrichment endpoint to controller**

Add to `destinations.controller.ts`:

```typescript
@Post('batch-enrich-data')
@UseGuards(InternalApiKeyGuard)
@ApiOperation({ summary: 'Batch enrich destinations with AI-curated travel content (internal)' })
async batchEnrichData(
  @Query('limit') limit?: string,
  @Query('offset') offset?: string,
) {
  return this.dataEnrichmentService.batchEnrich({
    limit: limit ? parseInt(limit, 10) : 50,
    offset: offset ? parseInt(offset, 10) : 0,
  })
}

@Post(':id/enrich-data')
@UseGuards(InternalApiKeyGuard)
@ApiOperation({ summary: 'Enrich single destination with AI-curated travel content (internal)' })
async enrichDestinationData(@Param('id', ParseUUIDPipe) id: string) {
  return this.dataEnrichmentService.enrichDestination(id)
}
```

- [ ] **Step 3: Add job type**

Add to `automation.types.ts`:

```typescript
DESTINATION_DATA_ENRICHMENT = 'destination.data_enrichment'

export interface DestinationDataEnrichmentJobData {
  type: 'destination.data_enrichment'
  batchSize?: number
  offset?: number
}
```

- [ ] **Step 4: Verify API compiles**

Run: `cd apps/api && pnpm exec tsc --noEmit 2>&1 | head -20`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/destinations/destinations.module.ts apps/api/src/destinations/destinations.controller.ts apps/api/src/automation/automation.types.ts
git commit -m "feat(api): register enrichment services, add batch-enrich-data endpoint"
```

---

### Task 6: Update Destination Adapter for Enriched Metadata

**Files:**
- Modify: `apps/ota/src/lib/entity-hubs/adapters/destination.adapter.ts`

- [ ] **Step 1: Read current adapter and enhance with enriched fields**

Update the adapter to use enriched metadata for:
- Hero description: use `metadata.travelDescription` as primary, fallback to `enrichment.summary`
- Context pills: add tags from metadata as accent pills
- New section: `destinationInfo` with practical travel info

Key changes:
- `heroData.description` → `metadata.travelDescription || enrichment.summary || dest.summary`
- `heroData.subtitle` → include `metadata.oneLiner` when available
- Add `destinationInfo` section to sections list with metadata props
- AI context: pass enriched metadata

- [ ] **Step 2: Commit**

```bash
git add apps/ota/src/lib/entity-hubs/adapters/destination.adapter.ts
git commit -m "feat(ota): use AI-curated metadata in destination adapter (description, tags, tips)"
```

---

### Task 7: Destination Info Section Component

**Files:**
- Create: `apps/ota/src/components/hub/sections/destination-info-section.tsx`
- Modify: `apps/ota/src/lib/entity-hubs/section-registry.ts`

- [ ] **Step 1: Create the practical info section**

A card showing currency, language, visa, climate, budget, best months, and travel tips.

```typescript
// apps/ota/src/components/hub/sections/destination-info-section.tsx

import { FeedSection } from '@/components/hub/feed-section'
import type { SectionComponentProps } from '@/lib/entity-hubs/types'

export async function DestinationInfoSection({
  title,
  sectionProps,
}: SectionComponentProps) {
  const metadata = sectionProps.metadata as Record<string, unknown> | undefined
  if (!metadata) return null

  const currency = metadata.currencyName as string | undefined
  const languages = metadata.languages as string[] | undefined
  const visaInfo = metadata.visaInfo as string | undefined
  const climateZone = metadata.climateZone as string | undefined
  const bestMonths = metadata.bestMonths as string[] | undefined
  const typicalStay = metadata.typicalStay as string | undefined
  const budgetTier = metadata.budgetTier as string | undefined
  const travelTips = metadata.travelTips as string[] | undefined
  const highlights = metadata.highlights as string[] | undefined

  // Only render if we have meaningful data
  const hasInfo = currency || languages?.length || bestMonths?.length || travelTips?.length
  if (!hasInfo) return null

  return (
    <FeedSection title={title}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Quick Facts Card */}
        <div className="rounded-xl border border-[#E0E0E0] bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-bold text-[#1A1A1A]">Quick Facts</h3>
          <dl className="space-y-2 text-sm">
            {currency && (
              <div className="flex justify-between">
                <dt className="text-[#888]">Currency</dt>
                <dd className="font-medium text-[#1A1A1A]">{currency}</dd>
              </div>
            )}
            {languages && languages.length > 0 && (
              <div className="flex justify-between">
                <dt className="text-[#888]">Language</dt>
                <dd className="font-medium text-[#1A1A1A]">{languages.join(', ')}</dd>
              </div>
            )}
            {visaInfo && (
              <div className="flex justify-between">
                <dt className="text-[#888]">Visa (🇨🇦)</dt>
                <dd className="font-medium text-[#1A1A1A]">{visaInfo}</dd>
              </div>
            )}
            {budgetTier && (
              <div className="flex justify-between">
                <dt className="text-[#888]">Budget</dt>
                <dd className="font-medium text-[#C59746] capitalize">{budgetTier}</dd>
              </div>
            )}
            {typicalStay && (
              <div className="flex justify-between">
                <dt className="text-[#888]">Typical stay</dt>
                <dd className="font-medium text-[#1A1A1A]">{typicalStay}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Best Time to Visit */}
        {bestMonths && bestMonths.length > 0 && (
          <div className="rounded-xl border border-[#E0E0E0] bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-bold text-[#1A1A1A]">🌤 Best Time to Visit</h3>
            <div className="flex flex-wrap gap-1.5">
              {bestMonths.map((month) => (
                <span key={month} className="rounded-full bg-[#C59746]/10 px-2.5 py-1 text-xs font-medium text-[#C59746]">
                  {month}
                </span>
              ))}
            </div>
            {climateZone && (
              <p className="mt-3 text-xs text-[#888] capitalize">Climate: {climateZone}</p>
            )}
          </div>
        )}

        {/* Travel Tips */}
        {travelTips && travelTips.length > 0 && (
          <div className="rounded-xl border border-[#E0E0E0] bg-white p-5 shadow-sm sm:col-span-2 lg:col-span-1">
            <h3 className="mb-3 text-sm font-bold text-[#1A1A1A]">💡 Insider Tips</h3>
            <ul className="space-y-2">
              {travelTips.map((tip, i) => (
                <li key={i} className="flex gap-2 text-sm text-[#1A1A1A]">
                  <span className="mt-0.5 shrink-0 text-[#C59746]">•</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Highlights */}
      {highlights && highlights.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {highlights.map((h, i) => (
            <span key={i} className="rounded-full border border-[#E0E0E0] bg-[#faf6f0] px-3 py-1.5 text-xs font-medium text-[#1A1A1A]">
              ✨ {h}
            </span>
          ))}
        </div>
      )}
    </FeedSection>
  )
}
```

- [ ] **Step 2: Register in section registry**

Add to `section-registry.ts`:
```typescript
import { DestinationInfoSection } from '@/components/hub/sections/destination-info-section'

// In SECTION_REGISTRY:
destinationInfo: { component: DestinationInfoSection as any, skeleton: 'grid-3' },
```

- [ ] **Step 3: Commit**

```bash
git add apps/ota/src/components/hub/sections/destination-info-section.tsx apps/ota/src/lib/entity-hubs/section-registry.ts
git commit -m "feat(ota): add DestinationInfoSection — currency, climate, tips, highlights"
```

---

### Task 8: Enrich AI Concierge Context

**Files:**
- Modify: `apps/ota/src/app/api/chat/route.ts`

- [ ] **Step 1: Expand page context to include enriched metadata**

Currently the page context only includes `{ type, name, slug }`. Update the chat route to accept and use richer context from the client:

In the page context section builder, expand to include enriched data when available:

```typescript
let pageContextSection = ''
if (pageContext?.type && pageContext?.name) {
  const lines = [`The consumer is currently viewing: ${pageContext.name} (${pageContext.type} page)`]

  if (pageContext.oneLiner) lines.push(`Known for: ${pageContext.oneLiner}`)
  if (pageContext.bestMonths) lines.push(`Best months: ${pageContext.bestMonths}`)
  if (pageContext.budgetTier) lines.push(`Budget: ${pageContext.budgetTier}`)
  if (pageContext.typicalStay) lines.push(`Typical stay: ${pageContext.typicalStay}`)
  if (pageContext.tags) lines.push(`Tags: ${pageContext.tags}`)
  if (pageContext.highlights) lines.push(`Highlights: ${pageContext.highlights}`)
  if (pageContext.currency) lines.push(`Currency: ${pageContext.currency}`)
  if (pageContext.travelTip) lines.push(`Insider tip: ${pageContext.travelTip}`)

  lines.push('Use this context naturally — reference what they\'re looking at without being asked.')
  pageContextSection = '\n\n--- Current Page ---\n' + lines.join('\n')
}
```

- [ ] **Step 2: Update the client to send enriched context**

Update `apps/ota/src/components/chat/chat-widget.tsx` — the `currentPageContext` ref should include enriched fields. The `PageContextBridge` needs to be extended, OR the adapter can pass metadata to the chat widget via Zustand.

For now, the simplest approach: read enriched metadata directly from the destination adapter's aiContext output and pass it through the existing `pageContext` flow.

- [ ] **Step 3: Commit**

```bash
git add apps/ota/src/app/api/chat/route.ts apps/ota/src/components/chat/chat-widget.tsx
git commit -m "feat(ota): enrich AI concierge context with destination metadata (tips, budget, highlights)"
```

---

## What This Plan Produces

After all 8 tasks:

1. **Country data** for 80+ countries — currency, language, visa, emergency info
2. **Wikipedia service** — fetches factual content for any destination
3. **AI Travel Editor** — curates raw data into travel-focused descriptions, tips, tags
4. **Enrichment orchestrator** — coordinates all sources, stores in metadata JSONB
5. **Batch endpoint** — `POST /destinations/batch-enrich-data?limit=50` for admin/cron
6. **DestinationInfo section** — practical travel info card on entity pages
7. **Enriched AI context** — AI concierge knows budget, best months, highlights, tips

**To enrich the top 50 destinations:**
```bash
curl -X POST http://localhost:3101/api/v1/destinations/batch-enrich-data?limit=50 \
  -H "x-internal-api-key: $INTERNAL_API_KEY"
```

**Cost: ~$0.02 for 50 destinations** (GPT-4o-mini)

## What's Deferred

- BullMQ job handler for automated batch processing
- Nearby destinations computation (PostGIS-style SQL)
- Vector store for RAG-based destination discovery
- `findDestinationsByTag` AI tool
- Full 9,728 destination enrichment (run batches over time)
