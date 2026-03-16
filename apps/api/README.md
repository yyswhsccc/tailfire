# @tailfire/api - NestJS Backend

**Next-Generation Travel Agency Backend Platform**

---

## 🚀 Quick Start

```bash
# Install dependencies (from monorepo root)
pnpm install

# Copy environment variables
cp .env.example .env
# Edit .env with your Supabase credentials

# Run database migrations
pnpm db:migrate

# Start development server
pnpm dev
```

The API will be available at `http://localhost:3101/api/v1`

---

## 📁 Project Structure

```
apps/api/
├── src/
│   ├── common/              # Shared utilities
│   │   ├── decorators/      # Custom decorators
│   │   ├── dto/             # Data transfer objects
│   │   ├── filters/         # Exception filters
│   │   └── guards/          # Auth guards
│   ├── config/              # Configuration files
│   ├── db/                  # Database integration
│   │   ├── database.module.ts
│   │   ├── database.service.ts
│   │   └── migrate.ts       # Migration runner
│   ├── trips/               # Trip management (incl. group bookings, shares)
│   ├── contacts/            # Contact/CRM
│   ├── email-accounts/      # Agent IMAP/SMTP email (sync, send, folders)
│   ├── email/               # System email (templates, delivery)
│   ├── enrichment/          # Activity enrichment (geocoding, catalog match)
│   ├── catalog-matcher/     # Cruise catalog matching service
│   ├── ...                  # Other feature modules
│   ├── app.module.ts        # Root module
│   ├── app.controller.ts    # Root controller
│   ├── app.service.ts       # Root service
│   └── main.ts              # Application entry point
├── test/                    # E2E tests
├── drizzle.config.ts        # Drizzle Kit configuration
├── nest-cli.json            # NestJS CLI configuration
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🛠️ Development

### Available Scripts

```bash
# Development
pnpm dev                  # Start with hot reload
pnpm start:debug          # Start with debugger

# Build
pnpm build                # Build for production
pnpm start                # Start production build

# Database - Migrations
pnpm db:generate          # Generate migration from schema changes
pnpm db:migrate           # Run pending migrations
pnpm db:studio            # Open Drizzle Studio GUI
pnpm db:push              # Push schema changes (development only)

# Database - Reset & Seed
pnpm db:reset             # Reset database (interactive)
pnpm db:reset:dry-run     # Preview reset without changes
pnpm db:reset:force       # Reset without confirmation (automation)
pnpm db:seed              # Reset + seed with test data
pnpm db:seed:dry-run      # Preview seed data
pnpm db:seed:force        # Reset + seed without confirmation

# Testing
pnpm test                 # Run unit tests
pnpm test:watch           # Run tests in watch mode
pnpm test:cov             # Run tests with coverage
pnpm test:e2e             # Run E2E tests

# Code Quality
pnpm lint                 # Lint and fix
pnpm typecheck            # Type check
```

---

## 🗄️ Database Integration

This app uses the `@tailfire/database` package for all database operations.

### Running Migrations

**IMPORTANT:** Database migrations MUST be run from this app only.

```bash
# 1. Update schema in packages/database/src/schema/
vim ../../packages/database/src/schema/trips.schema.ts

# 2. Generate migration
pnpm db:generate

# 3. Review generated SQL
cat ../../packages/database/src/migrations/YYYYMMDD_description.sql

# 4. Apply migration
pnpm db:migrate
```

### Database Reset & Seed

For development and testing, you can reset your database and populate it with test data.

**Quick Start:**
```bash
# Set up environment
cp .env.example .env
# Edit .env and set:
#   DATABASE_URL=postgresql://...
#   ALLOW_DATABASE_RESET=true

# Reset and seed with test data
pnpm db:seed
# Type "yes" when prompted
```

**Commands:**
```bash
# Interactive reset (confirmation required)
pnpm db:reset             # Drop tables + run migrations
pnpm db:seed              # Reset + populate test data

# Preview mode (no changes)
pnpm db:reset:dry-run     # See what would happen
pnpm db:seed:dry-run      # See operations + seed data

# Force mode (automation, no confirmation)
pnpm db:reset:force       # For scripts/CI
pnpm db:seed:force        # For scripts/CI
```

**Test Data Includes:**
- 31 contacts (22 clients, 9 leads)
- 8 relationships (spouses, colleagues, travel companions)
- 5 groups (families, corporate, wedding)
- Various scenarios: passport expiration, LGBTQ+ inclusive data, accessibility needs, international clients

**Safety Features:**
- Environment variable check (`ALLOW_DATABASE_RESET=true` required)
- Production protection (blocked if `NODE_ENV=production`)
- Whitelist-based host validation
- Interactive confirmation (type "yes")
- Dry-run mode for preview

**Related Documentation:**
- [Local Development](../../docs/LOCAL_DEV.md) - Running apps locally
- [Testing Guide](../../docs/TESTING.md) - Test frameworks and patterns
- [Database Architecture](../../docs/DATABASE_ARCHITECTURE.md) - Schema overview

### Using Database in Services

```typescript
import { Injectable } from '@nestjs/common'
import { DatabaseService } from '@/db/database.service'

@Injectable()
export class TripsService {
  constructor(private databaseService: DatabaseService) {}

  async findAll() {
    const db = this.databaseService.db
    return db.query.trips.findMany()
  }
}
```

---

## 📚 API Documentation

Swagger documentation is available at:
```
http://localhost:3101/api/v1/docs
```

To disable Swagger in production, set `ENABLE_SWAGGER_DOCS=false` in `.env`.

---

## 🔐 Environment Variables

See `.env.example` for all required environment variables.

**Required:**
- `DATABASE_URL` - Supabase PostgreSQL connection string
- `SUPABASE_SERVICE_ROLE_KEY` - For migrations (bypasses RLS)
- `JWT_SECRET` - For authentication

**Optional:**
- `PORT` - API port (default: 3101)
- `API_PREFIX` - API prefix (default: api/v1)
- `ENABLE_SWAGGER_DOCS` - Enable Swagger docs (default: true)

---

## 📦 Storage Providers

Tailfire uses Cloudflare R2 for document and media storage, with Supabase Storage as a fallback.

### Storage Configuration

| Provider | Usage | Notes |
|----------|-------|-------|
| **Cloudflare R2** | Production | Zero egress fees, S3-compatible API |
| **Supabase Storage** | Fallback | Used when R2 credentials unavailable |

Credentials are managed via **Doppler** (see [ENVIRONMENTS.md](../../../docs/ENVIRONMENTS.md#storage-configuration-cloudflare-r2)).

### Configuring Storage

Credentials are stored encrypted in the database and managed via API:

```bash
# Create credentials
curl -X POST http://localhost:3101/api/v1/api-credentials \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "cloudflare_r2",
    "name": "My R2 Storage",
    "credentials": {
      "accountId": "your-account-id",
      "accessKeyId": "your-access-key",
      "secretAccessKey": "your-secret-key",
      "bucketName": "your-bucket"
    }
  }'

# Test connection
curl -X POST http://localhost:3101/api/v1/api-credentials/{id}/test-connection

# List available providers
curl http://localhost:3101/api/v1/api-credentials/providers
```

### Bucket Configuration

| Environment | Bucket Name |
|-------------|-------------|
| Local Dev | `tailfire-media-dev` |
| Cloud Preview | `tailfire-media-stg` |
| Production | `tailfire-media` |

See [ENVIRONMENTS.md](../../../docs/ENVIRONMENTS.md#storage-configuration-cloudflare-r2) for full configuration details.

### Provider Features

- **Encryption:** Credentials encrypted with AES-256-GCM before database storage
- **Versioning:** Support for credential rotation with version tracking
- **Caching:** 5-minute in-memory cache for decrypted credentials
- **Lazy Loading:** Providers initialized on first use
- **Connection Testing:** Validate credentials before activation

---

## 🏗️ Architecture

### Module Structure

Each feature module follows this structure:

```
modules/trips/
├── dto/
│   ├── create-trip.dto.ts
│   ├── update-trip.dto.ts
│   └── trip-response.dto.ts
├── trips.controller.ts
├── trips.service.ts
├── trips.module.ts
└── trips.spec.ts
```

### Request Flow

```
HTTP Request
    ↓
Controller (validation, decorators)
    ↓
Service (business logic)
    ↓
DatabaseService (Drizzle ORM)
    ↓
Supabase PostgreSQL
```

---

## 🧪 Testing

### Unit Tests

```typescript
import { Test, TestingModule } from '@nestjs/testing'
import { TripsService } from './trips.service'

describe('TripsService', () => {
  let service: TripsService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TripsService],
    }).compile()

    service = module.get<TripsService>(TripsService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })
})
```

### E2E Tests

```typescript
import * as request from 'supertest'
import { Test } from '@nestjs/testing'
import { AppModule } from './../src/app.module'

describe('TripsController (e2e)', () => {
  it('/api/v1/trips (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/trips')
      .expect(200)
      .expect('Content-Type', /json/)
  })
})
```

---

## 📦 Dependencies

### Core
- **NestJS 10+** - Progressive Node.js framework
- **@tailfire/database** - Shared Drizzle ORM schema
- **@tailfire/shared-types** - Shared TypeScript types

### Database
- **Drizzle ORM** - Type-safe database access
- **postgres** - PostgreSQL driver

### Utilities
- **class-validator** - DTO validation
- **class-transformer** - Object transformation
- **helmet** - Security headers

---

## 🚀 Deployment

### Railway/Render

1. Connect GitHub repository
2. Set environment variables
3. Deploy command: `pnpm build && pnpm db:migrate && pnpm start`

### Docker (Future)

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build
CMD ["pnpm", "start"]
```

---

## 🔗 Related Packages

- [`@tailfire/database`](../../packages/database/README.md) - Shared database layer
- [`@tailfire/shared-types`](../../packages/shared-types/README.md) - TypeScript types
- [`@tailfire/config`](../../packages/config/README.md) - ESLint & TypeScript configs

---

**Last Updated:** March 16, 2026
