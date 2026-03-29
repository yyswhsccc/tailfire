import { readFileSync } from 'fs';
import { join } from 'path';
import {
  SoftvoyageResultParserService,
  VacationSearchResult,
} from '../softvoyage-result-parser.service';

describe('SoftvoyageResultParserService', () => {
  let service: SoftvoyageResultParserService;
  let results: VacationSearchResult[];

  beforeAll(() => {
    service = new SoftvoyageResultParserService();
    const html = readFileSync(
      join(__dirname, 'fixtures', 'vcm-results.html'),
      'utf-8',
    );
    results = service.parseResults(html);
  });

  // ─── Top-level result count ──────────────────────────────────────────────

  it('should parse 2 hotels from the fixture', () => {
    expect(results).toHaveLength(2);
  });

  // ─── Hotel 1: Grand Oasis Palm ───────────────────────────────────────────

  describe('Hotel 1 — Grand Oasis Palm', () => {
    let hotel!: VacationSearchResult;
    beforeAll(() => {
      hotel = results[0]!;
    });

    it('should have hotel id "2735"', () => {
      expect(hotel.hotelId).toBe('2735');
    });

    it('should have hotel name "Grand Oasis Palm"', () => {
      expect(hotel.hotelName).toBe('Grand Oasis Palm');
    });

    it('should have destination containing "Cancun"', () => {
      expect(hotel.destination).toContain('Cancun');
    });

    it('should have star rating 4', () => {
      expect(hotel.starRating).toBe(4);
    });

    it('should have an image URL from images.softvoyage.com', () => {
      expect(hotel.imageUrl).toContain('images.softvoyage.com');
      expect(hotel.imageUrl).toContain('2735');
    });

    it('should have amenities including beach, spa, wifi', () => {
      expect(hotel.amenities).toEqual(
        expect.arrayContaining([
          'Directly on the beach',
          'Spa',
          'Wifi',
        ]),
      );
      expect(hotel.amenities.length).toBeGreaterThanOrEqual(4);
    });

    it('should have monarc rating "3.14"', () => {
      expect(hotel.monarcRating).toBe('3.14');
    });

    it('should have 85 monarc reviews', () => {
      expect(hotel.monarcReviewCount).toBe(85);
    });

    it('should have 6 package options', () => {
      expect(hotel.packages).toHaveLength(6);
    });

    describe('first package option (SQV, 5 nights)', () => {
      it('should have room type "limited view room"', () => {
        expect(hotel.packages[0]!.roomType).toBe('limited view room');
      });

      it('should have meal plan "All Inclusive"', () => {
        expect(hotel.packages[0]!.mealPlan).toBe('All Inclusive');
      });

      it('should have 5 nights', () => {
        expect(hotel.packages[0]!.nights).toBe(5);
      });

      it('should have tour operator "SQV"', () => {
        expect(hotel.packages[0]!.tourOperator).toBe('SQV');
      });

      it('should have departure date "APR 05"', () => {
        expect(hotel.packages[0]!.departureDate).toBe('APR 05');
      });

      it('should have flight number "TS426"', () => {
        expect(hotel.packages[0]!.flightNumber).toBe('TS426');
      });

      it('should have departure time "14:50"', () => {
        expect(hotel.packages[0]!.departureTime).toBe('14:50');
      });

      it('should have arrival time "18:10"', () => {
        expect(hotel.packages[0]!.arrivalTime).toBe('18:10');
      });

      it('should have base price $859 = 85900 cents', () => {
        expect(hotel.packages[0]!.basePrice).toBe(85900);
      });

      it('should have taxes $356 = 35600 cents', () => {
        expect(hotel.packages[0]!.taxes).toBe(35600);
      });

      it('should have total price $1215 = 121500 cents', () => {
        expect(hotel.packages[0]!.totalPrice).toBe(121500);
      });

      it('should have grand total $2430 = 243000 cents', () => {
        expect(hotel.packages[0]!.grandTotal).toBe(243000);
      });
    });

    describe('second package option (SWG, 7 nights — has sale price)', () => {
      it('should have tour operator "SWG"', () => {
        expect(hotel.packages[1]!.tourOperator).toBe('SWG');
      });

      it('should have 7 nights', () => {
        expect(hotel.packages[1]!.nights).toBe(7);
      });

      it('should have flight number "WS2852"', () => {
        expect(hotel.packages[1]!.flightNumber).toBe('WS2852');
      });

      it('should extract the current (sale) base price, not strikethrough', () => {
        // $835 current, not $1395 strikethrough
        expect(hotel.packages[1]!.basePrice).toBe(83500);
      });

      it('should have taxes $540 = 54000 cents', () => {
        expect(hotel.packages[1]!.taxes).toBe(54000);
      });

      it('should have total $1375 = 137500 cents', () => {
        expect(hotel.packages[1]!.totalPrice).toBe(137500);
      });

      it('should have grand total $2750 = 275000 cents', () => {
        expect(hotel.packages[1]!.grandTotal).toBe(275000);
      });

      it('should have baggage info', () => {
        expect(hotel.packages[1]!.baggage).toContain('Complimentary');
      });
    });

    it('should extract tour operators across packages', () => {
      const operators = [...new Set(hotel.packages.map((p) => p.tourOperator))];
      expect(operators).toEqual(expect.arrayContaining(['SQV', 'SWG']));
    });

    it('should extract varying night counts', () => {
      const nights = hotel.packages.map((p) => p.nights);
      expect(nights).toEqual([5, 7, 6, 8, 9, 10]);
    });
  });

  // ─── Hotel 2: The Grand Oasis Cancun ─────────────────────────────────────

  describe('Hotel 2 — The Grand Oasis Cancun', () => {
    let hotel!: VacationSearchResult;
    beforeAll(() => {
      hotel = results[1]!;
    });

    it('should have hotel id "1842"', () => {
      expect(hotel.hotelId).toBe('1842');
    });

    it('should have hotel name "The Grand Oasis Cancun"', () => {
      expect(hotel.hotelName).toBe('The Grand Oasis Cancun');
    });

    it('should have destination containing "Cancun"', () => {
      expect(hotel.destination).toContain('Cancun');
    });

    it('should have star rating 4', () => {
      expect(hotel.starRating).toBe(4);
    });

    it('should have monarc rating "3.33"', () => {
      expect(hotel.monarcRating).toBe('3.33');
    });

    it('should have 188 monarc reviews', () => {
      expect(hotel.monarcReviewCount).toBe(188);
    });

    it('should have amenities including eco-responsible', () => {
      expect(hotel.amenities).toEqual(
        expect.arrayContaining(['Eco-responsible']),
      );
    });

    it('should have 6 package options', () => {
      expect(hotel.packages).toHaveLength(6);
    });

    it('first package: grand room, SQV, 5 nights, TS426', () => {
      const pkg = hotel.packages[0]!;
      expect(pkg.roomType).toBe('grand room');
      expect(pkg.tourOperator).toBe('SQV');
      expect(pkg.nights).toBe(5);
      expect(pkg.flightNumber).toBe('TS426');
      expect(pkg.basePrice).toBe(90900);
      expect(pkg.taxes).toBe(35600);
      expect(pkg.totalPrice).toBe(126500);
      expect(pkg.grandTotal).toBe(253000);
    });
  });

  // ─── Edge cases ──────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('should return empty array for empty HTML', () => {
      expect(service.parseResults('')).toEqual([]);
    });

    it('should return empty array for HTML with no hotel tables', () => {
      expect(
        service.parseResults('<html><body><p>No results</p></body></html>'),
      ).toEqual([]);
    });

    it('should handle hotel with no packages gracefully', () => {
      const html = `
        <table id="hotel-9999" class="search">
          <tr><td class="box2">
            <table><tr>
              <td style="color: #CC6633; font-size: 17px;">Test Hotel<br/><nobr>Test City</nobr></td>
            </tr></table>
          </td></tr>
        </table>
      `;
      const parsed = service.parseResults(html);
      expect(parsed).toHaveLength(1);
      expect(parsed[0]!.hotelId).toBe('9999');
      expect(parsed[0]!.hotelName).toBe('Test Hotel');
      expect(parsed[0]!.packages).toEqual([]);
    });
  });
});
