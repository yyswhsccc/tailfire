/**
 * Shared Extraction Guardrails
 *
 * Appended to every document-type extraction prompt to enforce
 * self-validation before returning the JSON response.
 *
 * These rules catch mistakes that LLMs routinely make when
 * extracting structured data from travel documents.
 */

export const EXTRACTION_GUARDRAILS = `

SELF-CHECK — Before returning your JSON, verify ALL of the following. If any check fails, fix the output before returning.

Pricing:
- Gross/Total price must be GREATER THAN OR EQUAL TO Net/Sub-total price. If you extracted both and net > gross, you have them swapped — fix it
- If commission, net, and gross are all present: gross ≈ net + commission (allow rounding tolerance). Commission CAN be negative (chargebacks/recalls), but |commission| must be less than gross
- Per-person prices × number of travelers should approximately equal the total price. If they don't, re-check which figure is per-person vs total
- Taxes and fees must be LESS THAN the total price
- Deposit amount must be LESS THAN OR EQUAL TO total price
- If multiple payments are listed, their sum should approximately equal the total price
- Gross price, net price, and total price must be positive numbers (> 0). Do NOT return negative prices
- Currency must be a valid ISO 4217 code (e.g. "CAD", "USD", "EUR", "GBP"). Do NOT return full names like "Canadian Dollars"

Dates:
- Departure/start date must be BEFORE arrival/end/return date
- Check-in date must be BEFORE check-out date
- Booking date must be ON OR BEFORE the departure date — you book before you travel
- If both "nights" and start/end dates are present, verify: nights = end_date - start_date. If they disagree, trust the dates and recalculate nights
- Dates of birth must be in the PAST and produce a realistic age (0-120 years)
- Passport expiry dates should be in the FUTURE relative to the departure date

Flights:
- Flight segments must be in chronological order (segment 1 departs before segment 2)
- For connections: arrival time of leg N must be before departure time of leg N+1
- Airport codes must be exactly 3 uppercase letters (IATA format). Do NOT use city names or 4-letter ICAO codes

Travelers:
- The number of extracted travelers must match the passenger count stated in the document. If the document says "2 guests" or "2 pax", extract exactly 2 travelers
- firstName should contain the given/first name ONLY, lastName should contain the family/surname ONLY. Watch for Asian name ordering (family name first) — check the document context to determine which is which
- Adult travelers must have a date of birth making them ≥ 18 at departure. Child travelers must be < 18 at departure. Infant travelers must be < 2 at departure

General:
- Confirmation/booking reference numbers are typically short alphanumeric strings (4-10 characters). Do NOT put descriptions, sentences, or long strings in this field
- If a field is genuinely not visible in the document, return null — do NOT guess or fabricate values
- Do NOT confuse document metadata (header/footer boilerplate, page numbers, print dates) with booking data`
