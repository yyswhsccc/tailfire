# Tailfire Beta - Admin Dashboard

B2B admin dashboard for the Tailfire travel agency management system, built with Next.js 15, shadcn/ui, and TanStack Query.

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **UI Library**: shadcn/ui (Radix UI + Tailwind CSS)
- **State Management**:
  - Zustand for client state (authentication, UI preferences)
  - TanStack Query for server state (API data fetching & caching)
- **Styling**: Tailwind CSS with CSS variables theming
- **Type Safety**: TypeScript with strict mode
- **Icons**: Lucide React
- **Deployment**: Vercel

## Project Structure

```
apps/admin/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── dashboard/         # Dashboard with KPI cards, sidebar, calendar
│   │   ├── trips/             # Trips management (incl. group booking detail)
│   │   ├── contacts/          # Contacts (CRM, emails tab, recent emails card)
│   │   ├── emails/            # Email inbox (3-column layout, compose, folders)
│   │   ├── tasks/             # Task management
│   │   ├── library/           # Supplier library, notifications
│   │   ├── calendar/          # Calendar view
│   │   ├── profile/           # User profile (incl. email account setup)
│   │   ├── settings/          # Settings (email config, agency)
│   │   ├── commission/        # Commission tracking (in development)
│   │   ├── reporting/         # Reporting (in development)
│   │   ├── destinations/      # Destinations (in development)
│   │   ├── layout.tsx         # Root layout with providers
│   │   ├── page.tsx           # Landing page
│   │   └── globals.css        # Global styles & theme
│   ├── components/
│   │   ├── layout/            # Layout components (Sidebar, etc.)
│   │   └── ui/                # shadcn/ui components
│   ├── lib/
│   │   ├── api.ts             # API client utilities
│   │   └── utils.ts           # Helper functions
│   ├── hooks/                 # Custom React hooks
│   └── stores/                # Zustand stores
│       └── auth.store.ts      # Authentication state
├── components.json            # shadcn/ui configuration
├── tailwind.config.ts         # Tailwind configuration
└── next.config.ts             # Next.js configuration
```

## Getting Started

### Prerequisites

- Node.js 20+ and pnpm
- Running NestJS API (`@tailfire/api`)
- Environment variables configured

### Installation

From the monorepo root:

```bash
pnpm install
```

### Environment Variables

Create `.env.local`:

```env
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:3101/api/v1

# Optional: Enable React Query DevTools
NEXT_PUBLIC_ENABLE_DEVTOOLS=true

# Optional: Supabase (for 10% direct access use cases)
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Development

```bash
# From monorepo root
pnpm --filter @tailfire/admin dev

# Or from apps/admin directory
pnpm dev
```

Visit [http://localhost:3100](http://localhost:3100)

### Build

```bash
pnpm --filter @tailfire/admin build
```

### Type Checking

```bash
pnpm --filter @tailfire/admin typecheck
```

### Linting

```bash
pnpm --filter @tailfire/admin lint
```

## Architecture

### State Management Strategy

**90/10 Rule**: 90% of requests go through NestJS API, 10% can use direct Supabase access.

#### Server State (TanStack Query)
- API data fetching and caching
- Automatic background refetching
- Optimistic updates
- Request deduplication

```typescript
// Example: Fetching trips with TanStack Query
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

function TripsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['trips', page, limit],
    queryFn: () => api.get(`/trips?page=${page}&limit=${limit}`),
    staleTime: 60_000, // 1 minute
  })

  // ...
}
```

#### Client State (Zustand)
- Authentication state
- UI preferences (theme, sidebar state)
- Form state (multi-step forms)

```typescript
// Example: Using auth store
import { useAuthStore } from '@/stores/auth.store'

function Sidebar() {
  const { user, logout } = useAuthStore()

  return (
    <button onClick={logout}>
      Sign Out
    </button>
  )
}
```

### API Client

Type-safe API client with error handling:

```typescript
import { api } from '@/lib/api'

// GET request
const trips = await api.get<Trip[]>('/trips')

// POST request
const newTrip = await api.post<Trip>('/trips', {
  name: 'Summer Vacation',
  destination: 'Hawaii',
})

// Error handling
try {
  await api.post('/trips', tripData)
} catch (error) {
  if (error instanceof ApiError) {
    console.error(`API Error (${error.status}): ${error.message}`)
  }
}
```

### Component Structure

#### shadcn/ui Components
Located in `src/components/ui/`. These are **NOT** npm packages - they're source files you can modify:

- **Button**: Primary actions, form submissions
- **Card**: Content containers
- **Table**: Data display
- **Dialog**: Modals and confirmations
- **Input/Label**: Form fields
- More can be added with `npx shadcn-ui@latest add [component]`

#### Layout Components
Located in `src/components/layout/`:

- **DashboardLayout**: Main app layout with sidebar
- **Sidebar**: Navigation menu with active state

### Routing

Next.js App Router with file-based routing:

- `/` - Landing page (redirects to dashboard)
- `/dashboard` - Main dashboard with KPI cards, sidebar (quick create, recent emails, calendar)
- `/trips` - Trip management (list, detail, itinerary builder)
- `/trips/groups/[groupId]` - Group booking detail (notes, documents, media tabs)
- `/contacts` - Contact management (CRM)
- `/contacts/[id]` - Contact detail (activity timeline, emails tab, recent emails card)
- `/emails/inbox` - Email inbox (3-column layout: folders, email list, reader + compose)
- `/tasks` - Task management
- `/calendar` - Calendar view (trips, activities, tasks, birthdays)
- `/library` - Supplier library, notification templates
- `/profile` - User profile (email account IMAP/SMTP setup)
- `/settings` - Settings (email allowed domains, agency settings)
- `/commission` - Commission tracking (in development)
- `/reporting` - Reporting & analytics (in development)
- `/destinations` - Destination browser (in development)

## Adding New Features

### 1. Add a New Page

Create a file in `src/app/[route]/page.tsx`:

```typescript
'use client'

import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export default function MyPage() {
  const { data } = useQuery({
    queryKey: ['my-data'],
    queryFn: () => api.get('/my-endpoint'),
  })

  return (
    <DashboardLayout>
      <h1>My Page</h1>
      {/* Your content */}
    </DashboardLayout>
  )
}
```

### 2. Add a New UI Component

```bash
# Use shadcn/ui CLI to add components
npx shadcn-ui@latest add [component-name]

# Example: Add a Select component
npx shadcn-ui@latest add select
```

### 3. Add a New Store

Create a file in `src/stores/`:

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface MyState {
  value: string
  setValue: (value: string) => void
}

export const useMyStore = create<MyState>()(
  persist(
    (set) => ({
      value: '',
      setValue: (value) => set({ value }),
    }),
    {
      name: 'my-storage',
    }
  )
)
```

### 4. Add a New API Query Hook

Create a file in `src/hooks/`:

```typescript
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useTrips(page = 1, limit = 10) {
  return useQuery({
    queryKey: ['trips', page, limit],
    queryFn: () => api.get(`/trips?page=${page}&limit=${limit}`),
  })
}

export function useCreateTrip() {
  return useMutation({
    mutationFn: (data: CreateTripDto) => api.post('/trips', data),
  })
}
```

## Deployment

### Vercel

Deployed automatically via CI/CD:
- Preview: push to `preview` branch -> `deploy-preview.yml`
- Production: merge to `main` -> `deploy-prod.yml`

## Theming

The app uses CSS variables for theming. Modify in `src/app/globals.css`:

```css
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --primary: 221.2 83.2% 53.3%;
    /* ... more variables */
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    /* ... dark mode variables */
  }
}
```

## Best Practices

1. **Component Organization**
   - Keep page components in `src/app/`
   - Keep reusable UI components in `src/components/ui/`
   - Keep layout components in `src/components/layout/`

2. **State Management**
   - Use TanStack Query for **server state** (API data)
   - Use Zustand for **client state** (UI state, auth)
   - Avoid duplicating server data in Zustand

3. **API Calls**
   - Always use the `api` client from `@/lib/api`
   - Wrap in TanStack Query hooks for automatic caching
   - Handle errors with try-catch blocks

4. **Type Safety**
   - Define interfaces for all API responses
   - Use TypeScript strict mode
   - Import shared types from `@tailfire/shared-types`

5. **Styling**
   - Use Tailwind utility classes
   - Use `cn()` helper for conditional classes
   - Follow shadcn/ui component patterns

## Troubleshooting

### Issue: Module not found '@/...'

**Solution**: Verify `tsconfig.json` has correct path aliases:
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

### Issue: API calls fail with CORS error

**Solution**:
1. Check API is running on correct port
2. Verify `NEXT_PUBLIC_API_URL` in `.env.local`
3. Ensure NestJS API has correct CORS configuration

### Issue: TanStack Query DevTools not showing

**Solution**: Set `NEXT_PUBLIC_ENABLE_DEVTOOLS=true` in `.env.local`

### Issue: Styles not applying

**Solution**:
1. Verify `globals.css` is imported in `layout.tsx`
2. Check Tailwind config includes all content paths
3. Restart dev server after config changes

## Related Documentation

- [NestJS API](../api/README.md)
- [Database Package](../../packages/database/README.md)
- [Monorepo README](../../README.md)
- [Next.js Docs](https://nextjs.org/docs)
- [shadcn/ui Docs](https://ui.shadcn.com)
- [TanStack Query Docs](https://tanstack.com/query/latest/docs/react/overview)
- [Zustand Docs](https://zustand-demo.pmnd.rs)
