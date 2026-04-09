# Repository Review Issues

Review date: 2026-04-07

Scope: canonical repo docs, OTA-facing docs, wiki/help-center pages, and the shipped admin help content were reviewed against the current `main` checkout. Historical plan and spec files were not refreshed.

## Priority 1

### 1. OTA conversion is still advisor-led, not self-serve transactional

Evidence:

- `apps/ota/src/app/search/all-inclusives/page.tsx`
- `apps/ota/src/app/api/trip-requests/route.ts`
- `apps/ota/src/app/my-trip/[id]/page.tsx`

Why it matters:

- The public site can support discovery, chat, and trip requests, but it is not a live end-to-end checkout flow.
- Docs and marketing copy can overstate what the OTA currently converts on its own.

Suggested next step:

- Decide whether the product should stay advisor-led or gain a real self-serve checkout path, then align the OTA UX and docs to that decision.

### 2. OTA public forms and legal pages are still partial

Evidence:

- `apps/ota/src/components/layout/contact-form.tsx`
- `apps/ota/src/app/join/page.tsx`
- `apps/ota/src/app/join/register/page.tsx`
- `apps/ota/src/app/(marketing)/privacy/page.tsx`
- `apps/ota/src/app/(marketing)/terms/page.tsx`

Why it matters:

- Contact and join flows present submit actions without a verified backend submission path.
- Privacy and terms pages still carry placeholder legal banners.

Suggested next step:

- Wire the public forms to supported backend endpoints and replace the placeholder legal copy with finalized content.

### 3. OTA sitemap and structured-data coverage lag the live discovery surface

Evidence:

- `apps/ota/src/app/sitemap.ts`
- `apps/ota/src/lib/structured-data.ts`
- `apps/ota/src/app/destinations/`
- `apps/ota/src/app/regions/`
- `apps/ota/src/app/cruise-lines/`
- `apps/ota/src/app/ships/`
- `apps/ota/src/app/cruises/`

Why it matters:

- The app serves more discovery routes than the sitemap and JSON-LD currently describe.
- Metadata drift hurts search coverage and makes the OTA look less complete than the route tree actually is.

Suggested next step:

- Expand sitemap and structured-data generation to cover the current discovery entities and their canonical slugs.

### 4. CI/CD is deploy-only; there is no pre-merge validation workflow

Evidence:

- `.github/workflows/deploy-preview.yml`
- `.github/workflows/deploy-prod.yml`
- no additional workflow files under `.github/workflows/`

Why it matters:

- Code can reach preview or production without a dedicated pull-request gate for install, lint, typecheck, and tests.
- Failures surface late, after deployment steps have already started.

Suggested next step:

- Add a PR workflow that runs the current minimum validation bar before deploy workflows become the next line of defense.

## Priority 2

### 5. Preview API deployment depends on a generated Railway URL

Evidence:

- `.github/workflows/deploy-preview.yml`

Why it matters:

- The preview workflow health check is pinned to `https://api-dev-dev-13dd.up.railway.app/api/v1/health`.
- Generated URLs are brittle and easy to forget when infrastructure changes.

Suggested next step:

- Move preview health checks to a stable alias or make the workflow derive the deployed URL dynamically.

### 6. The API package advertises an E2E command, but the harness is missing

Evidence:

- `apps/api/package.json`
- missing `apps/api/test/jest-e2e.json`

Why it matters:

- Contributors can reasonably expect API E2E coverage to be runnable when the script is present.
- The command currently fails before providing any validation value.

Suggested next step:

- Restore the missing harness or remove the stale script until the E2E path is real again.

### 7. Automated validation coverage is still uneven across apps and packages

Evidence:

- `apps/client/package.json`
- `apps/ota/package.json`
- `packages/database/package.json`
- `packages/api-client/package.json`
- `packages/ui-public/package.json`
- `packages/trip-proposal-ui/package.json`

Why it matters:

- Root validation skips large parts of the repo because missing scripts are treated as absent work rather than failures.
- OTA, client, and several shared-package changes can land without tests.

Suggested next step:

- Define a minimum validation contract per workspace and expose it through root scripts and CI.

### 8. Proposal UI is only partially shared between admin preview and client rendering

Evidence:

- `apps/admin/src/app/trips/[id]/preview/page.tsx`
- `packages/trip-proposal-ui/`
- `apps/client/src/app/shared/trips/[token]/_components/`

Why it matters:

- Admin preview and client-facing proposal rendering can drift if they continue to evolve on different component surfaces.

Suggested next step:

- Consolidate the shared-trip client route onto `@tailfire/trip-proposal-ui` or retire the package explicitly.

## Priority 3

### 9. Root `pnpm dev` still assumes local Redis tooling

Evidence:

- `package.json`
- `apps/api/src/automation/automation.module.ts`

Why it matters:

- The root `predev` hook assumes `redis-cli` and `redis-server` even though the API itself supports an explicit `REDIS_URL`.
- This makes local startup more brittle than runtime behavior needs to be.

Suggested next step:

- Make the root startup path honor `REDIS_URL` before probing localhost or document a supported no-local-Redis flow in scripts.

### 10. Generated `tsconfig.tsbuildinfo` files are tracked in git

Evidence:

- `apps/admin/tsconfig.tsbuildinfo`
- `apps/client/tsconfig.tsbuildinfo`
- `apps/ota/tsconfig.tsbuildinfo`
- `packages/database/tsconfig.tsbuildinfo`
- `packages/shared-types/tsconfig.tsbuildinfo`

Why it matters:

- Generated artifacts create noisy diffs and hide real review signal.

Suggested next step:

- Stop tracking these files and ignore them unless there is a deliberate reason to version build artifacts.
