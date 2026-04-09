# @tailfire/ota

Next.js public discovery surface for Phoenix Voyages. The OTA currently combines marketing content, catalog-backed discovery, AI chat, advisor attribution, trip-request capture, and a traveler-facing `my-trip` experience.

## Current Route Surface

The tracked app includes these route areas:

- marketing pages: home, about, contact, privacy, and terms
- discovery pages: deals, destinations, regions, cruise lines, ships, cruises, and advisors
- search flows: cruises, flights, hotels, tours, and all-inclusives
- recruitment pages under `/join/*`
- traveler access under `/my-trip/[id]`
- app routes under `/api/*` for airports, chat, destinations, health, revalidation, and trip requests

## Data And Runtime Model

- Server components and route handlers call the NestJS API through the app-local helpers in `src/lib/api.ts`.
- `src/lib/api.ts` exposes `publicFetch`, `catalogFetch`, and `serviceFetch` for public, catalog-key, and OTA service-key requests.
- `src/app/api/chat/route.ts` uses `AI_MODEL_ID` and falls back to `gpt-4o-mini` when unset.
- `src/app/my-trip/[id]/page.tsx` supports both shared-token access (`?token=`) and identified access via the `ota_session` cookie with contact fallback checks.
- `/search/all-inclusives` embeds the Softvoyage widget, but bookings are still serviced by Phoenix Voyages advisors.

## Environment

Copy `apps/ota/.env.example` to `apps/ota/.env.local`.

Current variables in the tracked example:

- `NEXT_PUBLIC_API_URL`
- `API_URL`
- `NEXT_PUBLIC_SITE_URL`
- `CLIENT_PORTAL_URL`
- `OTA_SERVICE_KEY`
- `CATALOG_API_KEY`
- `REVALIDATION_SECRET`
- `AI_MODEL_ID`
- `OPENAI_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- optional `UPSTASH_REDIS_REST_URL`
- optional `UPSTASH_REDIS_REST_TOKEN`

## Scripts

Run from `apps/ota`:

```bash
pnpm dev
pnpm build
pnpm start
pnpm lint
```

This workspace does not currently define `typecheck` or `test` scripts.

## Current Caveats

- OTA discovery is API-backed, but conversion is still advisor-led rather than self-serve checkout.
- The public contact and join forms are presentational today; they are not wired to a live submission backend yet.
- Privacy and terms pages still contain placeholder legal copy pending completion.
- `sitemap.ts` and `structured-data.ts` do not yet cover the full live discovery surface.

## Related Docs

- [`../../docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md)
- [`../../docs/ENVIRONMENTS.md`](../../docs/ENVIRONMENTS.md)
- [`../../docs/REPOSITORY_REVIEW_ISSUES.md`](../../docs/REPOSITORY_REVIEW_ISSUES.md)
