# Python VCO Proxy Service — Design Spec

## Purpose

A lightweight Python FastAPI service that proxies vacation package search requests to Softvoyage VCO, bypasses DataDome bot detection, parses HTML results, and returns structured JSON. Hosted on the Phoenix Voyages VPS alongside existing services.

## Why Python Instead of Node.js

During the Tailfire vacation packages implementation (March 2026), we discovered:
- `puppeteer-extra` + stealth plugin crashes unpredictably under NestJS SWC compilation
- `require('puppeteer-extra')` at module level prevents BullMQ processor from loading
- Manual stealth patches with `puppeteer-core` work inconsistently
- DataDome blocks Railway's datacenter IPs even with residential proxy + stealth
- Python has mature, battle-tested anti-detection libraries (`undetected-chromedriver`, `cloudscraper`, `curl_cffi`)

## Architecture

```
┌─────────────────────────────────────────────────┐
│ Tailfire NestJS API (Railway)                    │
│                                                  │
│ BullMQ VACATION_SEARCH processor                 │
│   → HTTP POST to Python proxy                    │
│   → Receives JSON with hotels + pricing          │
│   → Caches in Redis, returns to client           │
└──────────────────┬──────────────────────────────┘
                   │ HTTPS
                   ▼
┌─────────────────────────────────────────────────┐
│ Python VCO Proxy (VPS)                           │
│                                                  │
│ FastAPI service on port 8500 (or configured)     │
│   → Receives search params                       │
│   → Navigates VCO with stealth browser           │
│   → Parses HTML with BeautifulSoup               │
│   → Returns structured JSON                      │
│                                                  │
│ Features:                                        │
│   - 2captcha residential proxy                   │
│   - undetected-chromedriver OR curl_cffi         │
│   - Cheerio-equivalent parsing                   │
│   - API key auth (shared secret)                 │
└─────────────────────────────────────────────────┘
```

## VCO Knowledge Base (Everything We Learned)

### VCO Identifiers
- `code_ag=VCO`
- `alias=YAQ`
- Base URL: `https://vco.sax.softvoyage.com/cgi-bin/`

### VCO Endpoints

**Catalog (JSON, no auth, no DataDome):**
- `GET ajax.cgi?action=getPackagesGateways&code_ag=VCO&alias=YAQ&language=en` → gateway list
- `GET ajax.cgi?action=getPackagesDestinations&gateway_dep={code}&code_ag=VCO&alias=YAQ&language=en` → destinations
- `GET ajax.cgi?action=getPackagesHotels&gateway_dep={code}&dest_dep={ids}&code_ag=VCO&alias=YAQ&language=en` → hotel names

**Search (HTML, requires browser, DataDome protected):**
1. Navigate to `querypackage.cgi?code_ag=VCO&alias=YAQ&language=en` (establishes session)
2. POST to `resultspackage.cgi` with form data (returns results page with hotel cards)
3. Optionally: GET `resultspackage.cgi?action=results&sid={sid}&search_id={search_id}` for full AJAX results

### Search Form Parameters
```
code_ag=VCO
alias=YAQ
language=en
gateway_dep=YOW          # Airport code
dest_dep=29              # Provider destination ID (can be comma-separated)
date_dep=20260501        # YYYYMMDD
duration=7               # nights
nb_adult_forf=2          # adults
nb_rooms=1               # rooms
all_inclusive=Y           # Y or N
price_max=99999
```

### DataDome Bypass

DataDome blocks:
- Plain HTTP requests (no browser)
- Headless browsers from datacenter IPs
- Puppeteer without stealth from any IP

DataDome allows:
- Real browsers from residential IPs
- `undetected-chromedriver` from residential IPs
- Headless browser + stealth plugin + residential proxy (inconsistent)

**Residential proxy (2captcha):**
- Host: `na.proxy.2captcha.com`
- Port: `2334`
- Username: `u62ff1984579905d7-zone-custom`
- Password: `u62ff1984579905d7`
- Format: `http://username:password@host:port`
- Cost: ~$5/GB (~$0.001 per search)

### VCO HTML Structure (Confirmed March 2026)

**Result cards** (initial page):
```html
<div class="card result" id="result-{hotelId}">
  <div class="card-header">
    <h5 class="card-title">Hotel Name <i class="fas fa-star"></i>×N</h5>
  </div>
  <div class="card-body">
    <img src="https://images.softvoyage.com/hotels/280x210/{destId}/{hotelId}.jpg">
    <p>Destination, Country</p>
    <span title="Spa"></span> <span title="Beach"></span> <!-- amenities -->
  </div>
</div>
```

**Pricing table** (inside or after each result card):
```html
<table class="table table-options-chambres meilleure-offre">
  <tbody>
    <tr class="option-chambre meilleure-offre d-none d-md-table-row tr-desktop">
      <td class="col-tour-op"><img src="...VAC.gif" title="Air Canada Vacations"></td>
      <td class="col-chambre">
        <a class="description-chambre">Resort room</a>
        <p class="description-meal">All inclusive</p>
      </td>
      <td class="col-nuit">7</td>
      <td class="col-bagage">...</td>
      <td class="col-itin">flight info...</td>
      <td class="col-prix">$4,019</td>
    </tr>
  </tbody>
</table>
```

**Monarc rating** (inside result card):
```html
<a href="javascript:void(0);" onclick="...monarc...">
  Monarc #5/42 ★★★★☆ (4.20) 188 reviews
</a>
```

### Parser Selectors Summary

| Data | Selector |
|------|----------|
| Hotel container | `div.card.result[id^="result-"]` |
| Hotel ID | `id` attribute minus `result-` |
| Hotel name | `h5.card-title` (remove `<i>` star icons) |
| Star rating | Count of `i.fa-star` ÷ 2 (appears in desktop + mobile) |
| Image | `img[src*="images.softvoyage.com"]` |
| Destination | `p` inside `.link` column |
| Amenities | `span[title]` where title length 2-50, exclude "Check-in" |
| Monarc rating | `a[onclick*="monarc"]` text → regex `\(([0-9.]+)\)` |
| Monarc reviews | Same text → regex `(\d+)\s*reviews?` |
| Pricing table | `table.table-options-chambres` |
| Package row | `tr.option-chambre` (skip `tr-mobile` rows) |
| Tour operator | `td.col-tour-op img[title]` |
| Room type | `a.description-chambre` |
| Meal plan | `p.description-meal` |
| Nights | `td.col-nuit` |
| Baggage | `td.col-bagage` or `[title*="bag"]` |
| Flight info | `td.col-itin` (parse date, flight#, times from text) |
| Price | `td.col-prix` or find `$` amounts in row |

## API Contract

### POST /search

**Request:**
```json
{
  "gateway_code": "YOW",
  "dest_dep": "29",
  "date_dep": "20260501",
  "duration": "7",
  "nb_adults": 2,
  "nb_rooms": 1,
  "all_inclusive": true
}
```

**Response:**
```json
{
  "hotels": [
    {
      "hotel_id": "1027",
      "hotel_name": "Divi Village Golf And Beach Resort",
      "destination": "Aruba, Aruba",
      "star_rating": 4,
      "image_url": "https://images.softvoyage.com/hotels/280x210/29/1027.jpg",
      "amenities": ["Directly on the beach", "Mini-club", "Casino", "Spa"],
      "monarc_rating": "3.92",
      "monarc_review_count": 188,
      "packages": [
        {
          "room_type": "Golf villa studio",
          "meal_plan": "All inclusive",
          "tour_operator": "WestJet Vacations",
          "nights": 7,
          "departure_date": "MAY 01",
          "flight_number": "WS2852",
          "departure_time": "14:15",
          "arrival_time": "17:39",
          "baggage": "Complimentary 1st checked bag",
          "base_price_cents": 406300,
          "taxes_cents": 0,
          "total_price_cents": 406300,
          "grand_total_cents": 812600
        }
      ]
    }
  ],
  "search_meta": {
    "gateway": "YOW",
    "destination": "29",
    "date": "20260501",
    "duration": "7",
    "fetched_at": "2026-05-01T12:00:00Z",
    "source": "vco"
  }
}
```

**Auth:** `X-API-Key` header with shared secret (same as `INTERNAL_API_KEY` or a new dedicated key)

### GET /health

Returns `{ "status": "ok", "proxy": true/false, "browser": "available" }`

## Implementation Plan

### Dependencies
```
fastapi
uvicorn
beautifulsoup4
lxml
undetected-chromedriver  # OR selenium-wire + seleniumbase
requests
pydantic
```

### File Structure
```
vco-proxy/
├── main.py              # FastAPI app
├── vco_search.py         # Browser navigation + form submission
├── vco_parser.py         # BeautifulSoup HTML parser
├── config.py             # Env vars (proxy, port, API key)
├── requirements.txt
├── Dockerfile            # Optional if VPS runs Docker
└── README.md
```

### Steps

1. **Set up FastAPI app** with `/search` endpoint + API key auth
2. **Implement VCO browser navigation** with `undetected-chromedriver` + residential proxy
3. **Implement HTML parser** with BeautifulSoup using the selectors above
4. **Deploy to VPS** as a systemd service or Docker container
5. **Update NestJS processor** to call Python proxy via HTTP instead of puppeteer
6. **Add `VCO_PROXY_URL` env var** to Doppler for all environments

### VPS Deployment
```bash
# On the VPS
cd /opt/services
git clone ... vco-proxy
cd vco-proxy
pip install -r requirements.txt
# Install Chrome
apt install chromium-browser  # or google-chrome-stable

# Run as systemd service
cat > /etc/systemd/system/vco-proxy.service << EOF
[Unit]
Description=VCO Proxy Service
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/services/vco-proxy
ExecStart=/usr/bin/python3 -m uvicorn main:app --host 0.0.0.0 --port 8500
Restart=always
Environment=PROXY_URL=http://u62ff1984579905d7-zone-custom:u62ff1984579905d7@na.proxy.2captcha.com:2334
Environment=API_KEY=your-shared-secret

[Install]
WantedBy=multi-user.target
EOF

systemctl enable vco-proxy
systemctl start vco-proxy
```

### NestJS Processor Update
Replace the entire puppeteer logic with:
```typescript
const proxyUrl = this.configService.get<string>('VCO_PROXY_URL')
const proxyApiKey = this.configService.get<string>('VCO_PROXY_API_KEY')

const response = await firstValueFrom(
  this.httpService.post(`${proxyUrl}/search`, {
    gateway_code: gatewayCode,
    dest_dep: destDep,
    date_dep: dateDep,
    duration,
    nb_adults: nbAdults,
    nb_rooms: nbRooms,
    all_inclusive: allInclusive,
  }, {
    headers: { 'X-API-Key': proxyApiKey },
    timeout: 30000,
  })
)

const results = response.data.hotels // Already parsed, structured JSON
```

No puppeteer, no Chromium, no stealth, no browser pool. Just an HTTP call.
