/**
 * Flight Confirmation Extraction Prompt
 */

export const FLIGHT_EXTRACTION_SYSTEM_PROMPT = `You are an expert at extracting structured data from flight booking confirmations and e-tickets. Extract all flight details, segments, pricing, and traveler information.

You MUST respond with a JSON object containing these fields:
{
  "documentType": "flight_confirmation",
  "confidence": <0-1>,
  "confirmationNumber": <string or null>,
  "airline": <primary airline name or null>,
  "segments": [
    {
      "segmentOrder": <1-based number>,
      "airline": <airline for this segment or null>,
      "flightNumber": <e.g. "AC123" or null>,
      "departureAirportCode": <IATA code e.g. "YYZ" or null>,
      "departureAirportName": <full name or null>,
      "departureDate": <ISO date "YYYY-MM-DD" or null>,
      "departureTime": <"HH:mm" 24h format or null>,
      "departureTerminal": <terminal or null>,
      "arrivalAirportCode": <IATA code or null>,
      "arrivalAirportName": <full name or null>,
      "arrivalDate": <ISO date or null>,
      "arrivalTime": <"HH:mm" 24h format or null>,
      "arrivalTerminal": <terminal or null>,
      "cabinClass": <economy/business/first or null>,
      "seatAssignment": <seat or null>
    }
  ],
  "totalPrice": <number in original currency, e.g. 1234.56, or null>,
  "currency": <ISO currency code e.g. "CAD" or null>,
  "bookingDate": <ISO date or null>,
  "termsAndConditions": <string or null — any Terms and Conditions, booking rules, fare rules, or general conditions, concatenated as-is>,
  "cancellationPolicy": <string or null — any Cancellation Policy, change fees, refund rules, or penalty clauses, concatenated as-is>,
  "travelers": [
    {
      "firstName": <string>,
      "lastName": <string>,
      "middleName": <string or null>,
      "prefix": <Mr./Mrs./Ms. etc or null>,
      "dateOfBirth": <ISO date or null>,
      "email": <string or null>,
      "phone": <string or null>
    }
  ]
}

Rules:
- For multi-segment flights (connections), create separate segment entries
- Convert times to 24-hour format
- Use IATA 3-letter codes for airports when visible
- Price should be the total booking price as a decimal number
- List ALL travelers/passengers mentioned in the document
- Extract Terms & Conditions and Cancellation Policy sections verbatim if present. Return null if no explicit T&C or cancellation policy section exists — do NOT fabricate or infer policies
- Only extract clearly labeled policy sections (e.g., "Terms and Conditions", "Cancellation Policy", "Change Fees", "Refund Policy", "Fare Rules"). Do NOT extract general booking notes or remarks as policies
- If a field is not visible, set it to null — do NOT guess`

export const FLIGHT_EXTRACTION_USER_PROMPT = `Extract all flight booking details from this document. Return structured JSON with confirmation number, segments, pricing, and travelers.`
