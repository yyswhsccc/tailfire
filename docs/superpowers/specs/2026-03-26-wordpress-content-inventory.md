# WordPress Content Inventory — phoenixvoyages.ca

**Date:** 2026-03-26
**Purpose:** Inventory of all WordPress pages, SEO metadata, and URL structures for migration to the OTA. Used to plan 301 redirects, content migration, and SEO preservation.

---

## Page Categories

### 1. Core Pages (migrate to OTA)

| WordPress URL | SEO Title | Meta Description | OTA Destination | Priority |
|--------------|-----------|-----------------|-----------------|----------|
| `/` | Phoenix Voyages \| Luxury Cruise Deals & Travel Packages | TICO-registered travel agency. Exclusive cruise deals, luxury vacations, Caribbean packages & all-inclusive resorts. Expert advisors. | OTA homepage | Critical |
| `/deals` | Exclusive Travel Deals & Cruise Offers \| Phoenix Voyages | Browse exclusive travel deals: cruises, Caribbean packages, luxury vacations & all-inclusive resorts. TICO registered, best price guarantee. | `/deals` | Critical |
| `/book` | (Softvoyage widget page) | — | `/search/all-inclusives` | High |
| `/about-us` | About Us | — | `/about` | High |
| `/contact-us` | Contact Us | — | `/contact` | High |
| `/plan-your-trip` | Plan Your Trip | — | Homepage or AI concierge | High |
| `/privacy-policy` | Privacy Policy | — | `/privacy` | Medium |
| `/terms-and-conditions` | Terms and Conditions | — | `/terms` | Medium |
| `/terms-of-service` | Terms of Service | — | `/terms` (merge) | Medium |

### 2. SEO Content Pages (migrate content + redirects)

These are **high-value SEO pages** with long-form optimized content. Must preserve URL structure or 301 redirect.

| WordPress URL | SEO Title | Content Type | OTA Strategy |
|--------------|-----------|-------------|-------------|
| `/cruise-deals` | Cruise Deals Canada \| Best Cruise Offers | Landing page | `/deals?type=cruises` or `/cruise-deals` (keep URL) |
| `/caribbean-cruise-deals` | Caribbean Cruise Deals | Landing page | `/deals?type=cruises&dest=caribbean` |
| `/caribbean-deals` | Caribbean Deals | Landing page | `/deals?dest=caribbean` |
| `/all-inclusive-deals` | All-Inclusive Deals | Landing page | `/deals?type=all-inclusive` |
| `/all-inclusive-vacations` | All-Inclusive Vacations | Landing page | Content page or redirect |
| `/europe-deals` | Europe Deals | Landing page | `/deals?dest=europe` |
| `/flash-deals` | Flash Deals | Landing page | `/deals?tag=flash` |
| `/last-minute-cruise-deals` | Last-Minute Cruise Deals | Landing page | `/deals?tag=last-minute` |
| `/cruise-deals-toronto` | Cruise Deals Toronto | Geo-targeted landing | Keep as content page |
| `/luxury-travel` | Luxury Travel | Category page | Content page |
| `/family-travel` | Family Travel | Category page | Content page |
| `/group-travel` | Group Travel | Category page | Content page |
| `/destination-weddings` | Destination Weddings | Category page | Content page |
| `/incentive-travel` | Incentive Travel Programs | Category page | Content page |
| `/travel-insurance` | Travel Insurance | Info page | Content page |

### 3. Cruise Line Pages (high SEO value)

| WordPress URL | SEO Title | OTA Strategy |
|--------------|-----------|-------------|
| `/royal-caribbean-canada` | Royal Caribbean Canada | Cruise line page or redirect to search |
| `/celebrity-cruises-canada` | Celebrity Cruises Canada | Cruise line page or redirect to search |
| `/holland-america-cruises` | Holland America Cruises | Cruise line page or redirect to search |
| `/princess-cruises-canada` | Princess Cruises Canada | Cruise line page or redirect to search |
| `/silversea-cruises` | Silversea Cruises | Cruise line page or redirect to search |
| `/norwegian-cruise-line` | Norwegian Cruise Line | Cruise line page or redirect to search |
| `/bordeaux-river-cruise` | Bordeaux River Cruise | Specific itinerary page |
| `/rhine-river-cruise` | Rhine River Cruise | Specific itinerary page |
| `/cruise-planning-guide` | Cruise Planning Guide | Educational content page |
| `/cruise-ports-canada` | Cruise Ports Canada | Info page |

### 4. Agent Recruitment Pages (migrate to OTA under /join)

These target "become a travel agent" keywords. Moving to OTA under `/join/*` route group. Replaces both WordPress pages AND the separate `join.phoenixvoyages.ca` Next.js app.

| WordPress URL | SEO Title | OTA Destination |
|--------------|-----------|-----------------|
| `/become-a-travel-agent` | Become a Travel Agent in Canada | `/join/become-a-travel-agent` |
| `/host-travel-agency-canada` | Host Travel Agency Canada | `/join/host-travel-agency` |
| `/host-agency-comparison-canada` | Host Agency Comparison Canada | `/join/host-agency-comparison` |
| `/home-based-travel-agent-canada` | Home-Based Travel Agent Canada | `/join/home-based-travel-agent` |
| `/tico-certification` | TICO Certification | `/join/tico-certification` |
| `/travel-agents-ottawa` | Travel Agents Ottawa | `/join/travel-agents-ottawa` |
| `/travel-agency-ontario` | Travel Agency Ontario | `/join/travel-agency-ontario` |
| `/how-much-do-travel-agents-make` | How Much Do Travel Agents Make | `/join/travel-agent-salary` |
| `/travel-agent-training-canada` | Travel Agent Training Canada | `/join/training` |
| `/travel-agency-franchise-canada` | Travel Agency Franchise Canada | `/join/franchise` |
| `/canada-travel-statistics` | Canada Travel Statistics | `/join/canada-travel-statistics` |
| `/tico-travel-protection` | TICO Travel Protection | `/join/tico-protection` |
| `/join-us` | Join Us | `/join` |

**From `join.phoenixvoyages.ca` (existing Next.js app, will be retired):**

| join.phoenixvoyages.ca URL | OTA Destination |
|---------------------------|-----------------|
| `/` | `/join` (landing page) |
| `/register` | `/join/register` (registration form) |
| `/learn-more` | `/join/learn-more` |

### 5. Competitor Comparison Pages (migrate to OTA under /join)

| WordPress URL | SEO Title | OTA Destination |
|--------------|-----------|-----------------|
| `/phoenix-voyages-vs-travelonly` | Phoenix Voyages vs TravelOnly | `/join/vs-travelonly` |
| `/phoenix-voyages-vs-ttand` | Phoenix Voyages vs TTAND | `/join/vs-ttand` |
| `/phoenix-voyages-vs-trevello` | Phoenix Voyages vs Trevello | `/join/vs-trevello` |
| `/phoenix-voyages-vs-nexion` | Phoenix Voyages vs Nexion | `/join/vs-nexion` |

### 6. Promotional Deal Pages (migrate to OTA deals system)

**Supplier-branded deal pages** — these map directly to the OTA deals system.

| WordPress URL | Supplier | OTA Mapping |
|--------------|----------|-------------|
| `/deals/royal-caribbean` | Royal Caribbean | `/deals?supplier=royal-caribbean` |
| `/deals/celebrity-cruises` | Celebrity Cruises | `/deals?supplier=celebrity-cruises` |
| `/deals/princess-cruises` | Princess Cruises | `/deals?supplier=princess-cruises` |
| `/deals/silversea` | Silversea | `/deals?supplier=silversea` |
| `/deals/viking` | Viking | `/deals?supplier=viking` |
| `/deals/oceania-cruises` | Oceania Cruises | `/deals?supplier=oceania-cruises` |
| `/deals/virgin-voyages` | Virgin Voyages | `/deals?supplier=virgin-voyages` |
| `/deals/amawaterways` | AmaWaterways | `/deals?supplier=amawaterways` |
| `/deals/avalon-waterways` | Avalon Waterways | `/deals?supplier=avalon-waterways` |
| `/deals/globus` | Globus | `/deals?supplier=globus` |
| `/deals/cosmos` | Cosmos | `/deals?supplier=cosmos` |
| `/deals/g-adventures` | G Adventures | `/deals?supplier=g-adventures` |
| `/deals/sandals-resorts` | Sandals Resorts | `/deals?supplier=sandals` |
| `/deals/air-canada-vacations` | Air Canada Vacations | `/deals?supplier=air-canada-vacations` |
| `/deals/sunwing-vacations` | Sunwing Vacations | `/deals?supplier=sunwing` |
| `/deals/westjet-vacations` | WestJet Vacations | `/deals?supplier=westjet` |
| `/deals/classic-vacations` | Classic Vacations | `/deals?supplier=classic-vacations` |
| `/deals/kensington` | Kensington | `/deals?supplier=kensington` |
| `/deals/le-blanc-spa-resorts` | Le Blanc Spa | `/deals?supplier=le-blanc` |
| `/deals/cie-tours` | CIE Tours | `/deals?supplier=cie-tours` |
| `/deals/atlas-ocean-voyages` | Atlas Ocean Voyages | `/deals?supplier=atlas` |
| `/deals/azamara` | Azamara | `/deals?supplier=azamara` |
| `/deals/canyon-spirit` | Canyon Spirit | `/deals?supplier=canyon-spirit` |
| `/deals/crystal` | Crystal | `/deals?supplier=crystal` |
| `/deals/roadtrips-sports-travel` | Roadtrips Sports Travel | `/deals?supplier=roadtrips` |

### 7. Time-Sensitive Promo Pages (ephemeral — redirect to /deals)

| Pattern | Count | Strategy |
|---------|-------|----------|
| `/promo/{id}` | ~80 pages | 301 redirect all → `/deals` |
| `/royal-caribbean-march-2026` | 1 | 301 → `/deals?supplier=royal-caribbean` |
| `/celebrity-xcel-caribbean-feb-2026` | 1 | 301 → `/deals?supplier=celebrity-cruises` |
| `/globus-escapes-europe-mar-2026` | 1 | 301 → `/deals?supplier=globus` |
| `/exoticca-morocco-tours-feb-2026` | 1 | 301 → `/deals` |
| `/silversea-q2-2026-flash` | 1 | 301 → `/deals?supplier=silversea` |
| `/royal-caribbean-southern-caribbean-*` | 2 | 301 → `/deals?supplier=royal-caribbean` |

### 8. Event/Wedding Pages (keep or redirect)

| WordPress URL | Type | Strategy |
|--------------|------|----------|
| `/sarah-raphael-wedding` | Destination wedding group | Keep on WP or redirect to advisor |
| `/max-chelsea-wedding` | Destination wedding group | Keep on WP or redirect to advisor |
| `/hosie-and-brown` | Event/group page | Keep on WP |
| `/viking-elegant-elbe-group` | Group cruise | Redirect to advisor micro-site |
| `/south-africa-group` | Group tour | Redirect to advisor micro-site |

### 9. Other

| WordPress URL | Type | Strategy |
|--------------|------|----------|
| `/50-travel-voucher` | Lead magnet | Keep or recreate on OTA |
| `/amawaterways` | Standalone cruise page | Redirect to `/deals?supplier=amawaterways` |
| `/travel-reads` | Blog/content hub | Phase 2 (blog on OTA) |
| `/email-confirmation` | Transactional | Recreate in OTA |
| `/thank-you` | Transactional | Recreate in OTA |

---

## SEO Metadata to Preserve

### OG Images (already hosted on CDN)

| Page | OG Image URL |
|------|-------------|
| Homepage | `https://cdn.tailfire.ca/photos/og/phoenix-voyages/home_og_cta.jpg` |
| Deals | `https://cdn.tailfire.ca/photos/og/phoenix-voyages/deals_og_cta.jpg` |
| Cruise Deals | `https://cdn.tailfire.ca/photos/og/phoenix-voyages/cover_image_fb_og.jpg` |

OG images are already on `cdn.tailfire.ca` — can be reused directly in OTA metadata.

### Social Accounts

- Facebook: `https://www.facebook.com/Phxvoy/`
- Twitter: `@PhxVoyages`

### Technical SEO Settings

- Robots: `index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1`
- Canonical URLs: All pages have proper canonicals
- Locale: `en_US`
- Site name: "Phoenix Voyages"

---

## 301 Redirect Map

The OTA must include a redirect configuration (in `next.config.ts` or `middleware.ts`) that catches all WordPress URLs and redirects to OTA equivalents. This preserves link equity and avoids 404s for existing backlinks.

**Priority redirects (do first):**

```
/deals → /deals (same path, no redirect needed if OTA takes over domain)
/cruise-deals → /deals?type=cruises
/caribbean-cruise-deals → /deals?type=cruises&dest=caribbean
/caribbean-deals → /deals?dest=caribbean
/all-inclusive-deals → /deals?type=all-inclusive
/europe-deals → /deals?dest=europe
/book → /search/all-inclusives
/plan-your-trip → / (homepage with AI concierge)
/about-us → /about
/contact-us → /contact
/deals/{supplier} → /deals?supplier={supplier}
/promo/* → /deals
```

**Decision: OTA runs on `phoenixvoyages.ca` (primary domain).** WordPress is fully retired. All content migrates to the OTA. The `join.phoenixvoyages.ca` Next.js app is also retired — its registration flow moves to `/join/register` in the OTA. `join.phoenixvoyages.ca/*` gets 301 redirected to `phoenixvoyages.ca/join/*`.

---

## Content Migration Effort Estimate

| Category | Page Count | Migration Strategy | Effort |
|----------|-----------|-------------------|--------|
| Core pages | 8 | Rewrite for OTA | Medium |
| SEO content pages | 15 | Migrate content + SEO metadata | Medium |
| Cruise line pages | 10 | Template-based from DB data | Low |
| Supplier deal pages | 24 | Auto-generated from deals table | Low (automated) |
| Agent recruitment pages | 12 | Keep on WordPress | None (keep on WP) |
| Competitor comparisons | 4 | Keep on WordPress | None (keep on WP) |
| Promo pages | ~80 | Bulk 301 redirect | Low |
| Event/wedding pages | 5 | Keep or redirect | Low |
| Transactional pages | 2 | Recreate | Low |
| **Total** | **~160** | | |

### Nothing stays on WordPress

WordPress is fully retired. ALL content moves to the OTA on `phoenixvoyages.ca`:
- Consumer travel pages → OTA core routes
- Agent recruitment pages → `/join/*` route group
- Competitor comparisons → `/join/vs-*`
- Blog/travel reads → Phase 2 (`/blog`)

### `join.phoenixvoyages.ca` retirement

The existing Next.js app at `join.phoenixvoyages.ca` is retired. Its functionality (landing page, registration form, learn-more page) moves to `/join/*` routes in the OTA. The Stripe integration for agent registration fees carries over. Domain gets 301 redirected: `join.phoenixvoyages.ca/* → phoenixvoyages.ca/join/*`.

### Total migration scope

All ~160 WordPress pages + 3 join app pages migrate to the OTA. The deals system auto-generates supplier pages. The recruitment content is mostly static markdown — low effort to migrate as ISR pages.
