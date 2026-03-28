import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface VacationPackageOption {
  roomType: string;
  mealPlan: string;
  nights: number;
  tourOperator: string;
  departureDate: string;
  flightNumber: string;
  departureTime: string;
  arrivalTime: string;
  baggage: string;
  /** Per-person base price in cents */
  basePrice: number;
  /** Per-person taxes in cents */
  taxes: number;
  /** Per-person total (base + taxes) in cents */
  totalPrice: number;
  /** Grand total (all travelers) in cents */
  grandTotal: number;
}

export interface VacationSearchResult {
  hotelId: string;
  hotelName: string;
  destination: string;
  starRating: number;
  imageUrl: string;
  amenities: string[];
  monarcRating: string;
  monarcReviewCount: number;
  packages: VacationPackageOption[];
}

// ---------------------------------------------------------------------------
// Helper: parse a dollar string like "$1,215" into cents (integer)
// ---------------------------------------------------------------------------

function dollarsToCents(raw: string): number {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (!cleaned) return 0;
  return Math.round(parseFloat(cleaned) * 100);
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class SoftvoyageResultParserService {
  /**
   * Parse Softvoyage VCM HTML results page into structured data.
   * Expects the HTML to contain `table[id^="hotel-"]` elements.
   */
  parseResults(html: string): VacationSearchResult[] {
    const $ = cheerio.load(html);
    const results: VacationSearchResult[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $('table[id^="hotel-"]').each((_: number, hotelEl: any) => {
      const $hotel = $(hotelEl);
      const hotelId = $hotel.attr('id')?.replace('hotel-', '') ?? '';

      // ── Hotel name ──────────────────────────────────────────────
      let hotelName = '';
      let destination = '';
      const nameCell = $hotel
        .find('td[style*="color: #CC6633"], td[style*="font-size: 17px"]')
        .first();
      if (nameCell.length) {
        hotelName = nameCell
          .contents()
          .filter(function () {
            return (this as { type: string }).type === 'text';
          })
          .first()
          .text()
          .trim();
        // Destination in <nobr> or small span
        destination = nameCell.find('nobr').text().trim();
        if (!destination) {
          destination = nameCell
            .find('span[style*="font-size:12px"]')
            .first()
            .text()
            .trim();
        }
      }

      // ── Star rating (count star images) ─────────────────────────
      const starRating = $hotel.find('img[src*="star1"]').length;

      // ── Hotel image ─────────────────────────────────────────────
      const imageUrl =
        $hotel.find('img[src*="images.softvoyage.com"]').attr('src') ?? '';

      // ── Amenities from title attributes on spans / icons ────────
      const amenities: string[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      $hotel.find('span[title], i[title]').each((_: number, el: any) => {
        const title = $(el).attr('title');
        if (
          title &&
          title.length > 2 &&
          title.length < 50 &&
          !title.includes('Check-in')
        ) {
          amenities.push(title);
        }
      });

      // ── Monarc rating & review count ────────────────────────────
      const monarcLink = $hotel.find('a[onclick*="monarc"]');
      const monarcText = monarcLink.text();
      const monarcRating = monarcText.match(/\(([0-9.]+)\)/)?.[1] ?? '';
      const monarcReviewCount = parseInt(
        monarcText.match(/(\d+)\s*reviews?/)?.[1] ?? '0',
        10,
      );

      // ── Package pricing rows from moreres table ─────────────────
      const packages: VacationPackageOption[] = [];
      const $moreres = $(`#moreres-${hotelId}`);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      $moreres.find('tbody tr').each((_: number, rowEl: any) => {
        const $row = $(rowEl);

        // Room type is in a span with text-transform
        const roomTypeSpan = $row.find('span[style*="text-transform"]');
        if (!roomTypeSpan.length) return; // flight continuation row

        const roomType = roomTypeSpan.text().trim();

        // Meal plan (text near room type)
        const roomCell = roomTypeSpan.closest('td');
        const roomCellText = roomCell.text();
        const mealPlan = roomCellText.includes('All Inclusive')
          ? 'All Inclusive'
          : roomCellText.replace(roomType, '').trim() || 'All Inclusive';

        // Nights from cell with Check-in title
        const nightsCell = $row.find('td[title*="Check-in"]');
        const nights = parseInt(nightsCell.text().trim(), 10) || 0;

        // Tour operator (short code in rowspan cell)
        let tourOperator = '';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        $row.find('td[rowspan]').each((_: number, c: any) => {
          const text = $(c).text().trim();
          if (/^[A-Z]{2,4}$/.test(text)) tourOperator = text;
        });

        // Flight info from itinerary cells
        const itinCells = $row.find('td.ligne-point-itin');
        let departureDate = '';
        let flightNumber = '';
        let departureTime = '';
        let arrivalTime = '';

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        itinCells.each((_: number, c: any) => {
          const text = $(c).text().trim().replace(/\s+/g, ' ');
          if (/^[A-Z]{3}\s+\d+$/.test(text)) {
            departureDate = text;
          } else if (/^[A-Z]{2}\d+/.test(text)) {
            flightNumber = text.replace(/\s*\*.*$/, '').trim();
          } else if (/^\d{1,2}:\d{2}$/.test(text)) {
            if (!departureTime) departureTime = text;
            else arrivalTime = text;
          }
        });

        // Prices from colored background cells
        const priceCells = $row.find('td[style*="background-color"]');
        const prices: string[] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        priceCells.each((_: number, c: any) => {
          const $c = $(c);
          // Get current price (not strikethrough)
          const allText = $c
            .clone()
            .children('span[style*="line-through"]')
            .remove()
            .end()
            .text()
            .trim();
          const priceMatch = allText.match(/\$[\d,]+/);
          if (priceMatch) prices.push(priceMatch[0]);

          // Grand total might be in an anchor
          const anchorPrice = $c.find('a').first().text().trim();
          if (anchorPrice.startsWith('$') && !prices.includes(anchorPrice)) {
            prices.push(anchorPrice);
          }
        });

        // Baggage: check suitcase icon title first, then generic class
        let baggage = '';
        const suitcaseIcon = $row.find('i.fas.fa-suitcase-rolling[title]');
        if (suitcaseIcon.length) {
          baggage = suitcaseIcon.attr('title') ?? '';
        }
        if (!baggage) {
          // Fall back to [class*="baggage"] title
          baggage = $row.find('[class*="baggage"]').attr('title') ?? '';
        }
        // Also check the question-mark icon for unknown baggage
        if (!baggage) {
          const questionIcon = $row.find(
            'i.included-baggage-unknown-superpose[title]',
          );
          if (questionIcon.length) {
            baggage = questionIcon.attr('title') ?? '';
          }
        }

        packages.push({
          roomType,
          mealPlan,
          nights,
          tourOperator,
          departureDate,
          flightNumber,
          departureTime,
          arrivalTime,
          baggage,
          basePrice: dollarsToCents(prices[0] ?? ''),
          taxes: dollarsToCents(prices[1] ?? ''),
          totalPrice: dollarsToCents(prices[2] ?? ''),
          grandTotal: dollarsToCents(prices[3] ?? ''),
        });
      });

      if (hotelId) {
        results.push({
          hotelId,
          hotelName: hotelName || `Hotel ${hotelId}`,
          destination,
          starRating,
          imageUrl,
          amenities: [...new Set(amenities)],
          monarcRating,
          monarcReviewCount,
          packages,
        });
      }
    });

    return results;
  }
}
