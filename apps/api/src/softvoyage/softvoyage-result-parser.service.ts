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
   * Parse Softvoyage HTML results page into structured data.
   * Supports both VCO (div[id^="result-"]) and VCM (table[id^="hotel-"]) formats.
   */
  parseResults(html: string): VacationSearchResult[] {
    const $ = cheerio.load(html);
    const results: VacationSearchResult[] = [];

    // Detect format: VCO uses div[id^="result-"], VCM uses table[id^="hotel-"]
    const isVCO = $('div[id^="result-"]').length > 0;
    const selector = isVCO ? 'div[id^="result-"]' : 'table[id^="hotel-"]';
    const idPrefix = isVCO ? 'result-' : 'hotel-';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $(selector).each((_: number, hotelEl: any) => {
      const $hotel = $(hotelEl);
      const hotelId = $hotel.attr('id')?.replace(idPrefix, '') ?? '';

      // ── Hotel name ──────────────────────────────────────────────
      let hotelName = '';
      let destination = '';

      if (isVCO) {
        // VCO: name in h5.card-title, destination in <p> inside .link column
        const titleEl = $hotel.find('h5.card-title, .card-header h5').first();
        if (titleEl.length) {
          // Get text without star icons
          hotelName = titleEl.clone().find('i').remove().end().text().trim();
        }
        // Destination from <p> in the .link column
        const destP = $hotel.find('.link p, .card-body p').first();
        if (destP.length) {
          destination = destP.text().trim();
        }
      } else {
        // VCM: name in td with inline color style
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
          destination = nameCell.find('nobr').text().trim();
          if (!destination) {
            destination = nameCell
              .find('span[style*="font-size:12px"]')
              .first()
              .text()
              .trim();
          }
        }
      }

      // ── Star rating ───────────────────────────────────────────
      // VCO uses <i class="fas fa-star">, VCM uses <img src="...star1...">
      const starRating = isVCO
        ? $hotel.find('i.fa-star').length
        : $hotel.find('img[src*="star1"]').length;
      // VCO counts stars twice (desktop + mobile) — take half rounded down
      const adjustedStars = isVCO ? Math.ceil(starRating / 2) : starRating;

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
      const monarcLink = $hotel.find('a[onclick*="monarc"], a[href*="monarc"]');
      const monarcText = monarcLink.text();
      const monarcRating = monarcText.match(/\(([0-9.]+)\)/)?.[1] ?? '';
      const monarcReviewCount = parseInt(
        monarcText.match(/(\d+)\s*reviews?/)?.[1] ?? '0',
        10,
      );

      // ── Package pricing rows ─────────────────────────────────
      const packages: VacationPackageOption[] = [];
      // VCM: #moreres-{id} tbody tr
      // VCO: table inside the card, or table after the card
      let $moreres = $(`#moreres-${hotelId}`);
      if (!$moreres.length) {
        // VCO: look for tables inside the result card
        $moreres = $hotel.find('table').first();
      }
      if (!$moreres.length) {
        // VCO: the results table might be a sibling, not a child
        $moreres = $hotel.next('table');
      }

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
          starRating: adjustedStars,
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
