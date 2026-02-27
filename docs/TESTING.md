# Testing Guide

This document describes the testing strategy, frameworks, and conventions used across the Tailfire monorepo.

## Overview

| Test Type | Framework | Purpose |
|-----------|-----------|---------|
| **Unit Tests (API)** | Jest | Isolated service/controller testing |
| **Unit Tests (Admin)** | Vitest | Component and hook testing |
| **Unit Tests (Packages)** | Jest | Utility and type testing |
| **E2E Tests** | Playwright | Full user workflow testing |

---

## Test Frameworks by App

| App/Package | Unit/Integration | E2E | Notes |
|-------------|------------------|-----|-------|
| `apps/api` | Jest | Jest (e2e config) | Full test suite |
| `apps/admin` | Vitest | Playwright | `vitest.config.ts` at app root |
| `apps/ota` | - | - | No test scripts configured |
| `apps/client` | - | - | No test scripts configured |
| `packages/shared-types` | Jest | N/A | Date utilities, schema tests |
| `packages/database` | - | N/A | Schema-only, no tests |

---

## Running Tests

### API (NestJS + Jest)

```bash
cd apps/api

pnpm test              # Run all tests
pnpm test:watch        # Watch mode
pnpm test:cov          # Coverage report
pnpm test:ci           # CI mode (--runInBand)
pnpm test:e2e          # E2E tests
pnpm test:debug        # Debug mode
```

### Admin (Next.js + Vitest)

```bash
cd apps/admin

pnpm test              # Run all Vitest tests (vitest run)
pnpm test:watch        # Watch mode
pnpm test:coverage     # Coverage report
```

### Admin E2E (Playwright)

```bash
cd apps/admin

pnpm test:e2e          # Run Playwright tests
pnpm test:e2e:ui       # Playwright UI mode (recommended for debugging)
pnpm test:e2e:headed   # Headed browser mode
```

### Shared Types (Jest)

```bash
cd packages/shared-types

pnpm test              # Run all Jest tests
pnpm test:watch        # Watch mode
pnpm test:cov          # Coverage report
```

### Monorepo-Wide

```bash
# From root
pnpm test              # Run tests in all apps via Turborepo
pnpm --filter @tailfire/api test        # Specific app
pnpm --filter @tailfire/admin test      # Admin tests
pnpm --filter @tailfire/shared-types test   # Package tests
```

---

## Test File Organization

### Naming Conventions

| Type | Pattern | Location |
|------|---------|----------|
| Unit tests | `*.test.ts` / `*.test.tsx` | `tests/unit/` or co-located |
| Integration tests | `*.test.ts` | `tests/integration/` |
| E2E tests | `*.spec.ts` | `tests/e2e/` |
| Test helpers | `*-helper.ts` | `tests/helpers/` |
| Test factories | `*-factories.ts` | `tests/helpers/` |

### Directory Structure (Admin App)

```
apps/admin/
├── src/
│   └── components/
│       └── Button/
│           ├── Button.tsx
│           └── Button.test.tsx     # Co-located unit test (Vitest)
├── tests/
│   ├── unit/                       # Unit tests
│   │   └── payment-processor.test.ts
│   ├── integration/                # Integration tests
│   │   └── trip-totals.test.ts
│   ├── e2e/                        # Playwright E2E tests
│   │   ├── helpers/
│   │   │   └── test-helpers.ts
│   │   └── booking-flow.spec.ts
│   └── helpers/
│       └── test-factories.ts
├── vitest.config.ts                # Vitest configuration
└── playwright.config.ts            # Playwright configuration
```

### Directory Structure (API)

```
apps/api/
├── src/
│   └── trips/
│       ├── trips.service.ts
│       └── trips.service.spec.ts   # Co-located unit test (Jest)
├── test/
│   ├── app.e2e-spec.ts            # E2E tests
│   └── jest-e2e.json              # E2E Jest config
└── jest.config.js
```

---

## Writing Unit Tests

### API Pattern (Jest + NestJS)

```typescript
// trips.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing'
import { TripsService } from './trips.service'

describe('TripsService', () => {
  let service: TripsService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TripsService,
        {
          provide: 'DATABASE',
          useValue: mockDatabase,
        },
      ],
    }).compile()

    service = module.get<TripsService>(TripsService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('findAll', () => {
    it('should return trips for agency', async () => {
      const result = await service.findAll('agency-123')
      expect(result).toHaveLength(2)
    })

    it('should throw on invalid agency', async () => {
      await expect(service.findAll('')).rejects.toThrow()
    })
  })
})
```

### Admin Pattern (Vitest)

```typescript
// components/Button.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button } from './Button'

describe('Button', () => {
  it('renders with text', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByText('Click me')).toBeDefined()
  })

  it('calls onClick handler', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Click</Button>)
    screen.getByText('Click').click()
    expect(onClick).toHaveBeenCalled()
  })
})
```

### Mocking Dependencies

```typescript
// Jest (API)
const mockSupabase = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue({ data: mockData, error: null }),
}

// Vitest (Admin)
import { vi } from 'vitest'
vi.mock('@/lib/external-api', () => ({
  fetchData: vi.fn().mockResolvedValue({ items: [] }),
}))
```

---

## Writing Integration Tests

Integration tests use real database connections with `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS.

### Test Factory Pattern

```typescript
// tests/helpers/test-factories.ts
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!  // Bypasses RLS
)

export async function createTestTrip(overrides = {}) {
  const trip = {
    id: crypto.randomUUID(),
    agencyId: 'test-agency-id',
    ownerId: 'test-user-id',
    status: 'draft',
    ...overrides,
  }

  const { data, error } = await supabase
    .from('trips')
    .insert(trip)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function cleanupTestTrip(id: string) {
  await supabase.from('trips').delete().eq('id', id)
}
```

### Integration Test Example

```typescript
// tests/integration/trip-totals.test.ts
import { createTestTrip, cleanupTestTrip } from '../helpers/test-factories'

describe('Trip Totals Calculation', () => {
  let tripId: string

  beforeEach(async () => {
    const trip = await createTestTrip()
    tripId = trip.id
  })

  afterEach(async () => {
    await cleanupTestTrip(tripId)
  })

  it('should calculate totals when booking added', async () => {
    // Create booking linked to trip
    await createTestBooking({ tripId, amount: 1000 })

    // Verify trigger updated totals
    const totals = await getTripTotals(tripId)
    expect(totals.totalAmount).toBe(1000)
  })
})
```

---

## Writing E2E Tests (Playwright)

### Configuration

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3100',
    reuseExistingServer: !process.env.CI,
  },
})
```

### E2E Test Example

```typescript
// tests/e2e/trip-creation.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Trip Creation', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/login')
    await page.fill('[name="email"]', 'test@example.com')
    await page.fill('[name="password"]', 'testpassword')
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL('/dashboard')
  })

  test('should create new trip', async ({ page }) => {
    await page.goto('/trips/new')

    await page.fill('[name="title"]', 'Test Trip')
    await page.fill('[name="destination"]', 'Paris')
    await page.click('button[type="submit"]')

    // Verify success
    await expect(page.locator('.toast')).toContainText('Trip created')
    await expect(page).toHaveURL(/\/trips\/[\w-]+/)
  })

  test('should validate required fields', async ({ page }) => {
    await page.goto('/trips/new')
    await page.click('button[type="submit"]')

    await expect(page.locator('[name="title"]')).toHaveAttribute(
      'aria-invalid',
      'true'
    )
  })
})
```

### Test Helpers

```typescript
// tests/e2e/helpers/test-helpers.ts
import { Page } from '@playwright/test'

export class TestHelpers {
  constructor(private page: Page) {}

  async login(email: string, password: string) {
    await this.page.goto('/login')
    await this.page.fill('[name="email"]', email)
    await this.page.fill('[name="password"]', password)
    await this.page.click('button[type="submit"]')
  }

  async waitForToast(text: string) {
    await this.page.locator('.toast').filter({ hasText: text }).waitFor()
  }

  async screenshot(name: string) {
    await this.page.screenshot({
      path: `screenshots/${name}-${Date.now()}.png`,
    })
  }
}
```

---

## Coverage Requirements

### Thresholds

| Metric | Minimum |
|--------|---------|
| Lines | 70% |
| Branches | 70% |
| Functions | 70% |
| Statements | 70% |

---

## Best Practices

### Do

- Write tests for business logic and edge cases
- Use test factories for consistent test data
- Clean up test data in `afterEach` hooks
- Mock external services (APIs, email, etc.)
- Test error paths, not just happy paths
- Use `vi.fn()` for Vitest mocks, `jest.fn()` for Jest mocks

### Don't

- Test implementation details (private methods)
- Write tests that depend on test execution order
- Hard-code IDs or timestamps
- Leave test data in the database
- Skip tests without a comment explaining why
- Mix Jest and Vitest APIs in the same test file

### Test Isolation

```typescript
// Good: Each test is independent
describe('UserService', () => {
  let testUserId: string

  beforeEach(async () => {
    testUserId = await createTestUser()
  })

  afterEach(async () => {
    await deleteTestUser(testUserId)
  })

  it('test 1', () => { /* uses testUserId */ })
  it('test 2', () => { /* uses fresh testUserId */ })
})
```

---

## Related Documentation

- [Local Development](./LOCAL_DEV.md) - Running apps locally
- [CI/CD Pipeline](./CI_CD.md) - Deployment workflows
- [Security Model](./SECURITY.md) - Auth testing considerations
