# Automation System

This document describes the centralized job queue system for scheduled and delayed tasks in Tailfire.

## Overview

The Automation System uses **BullMQ + Redis** to handle:
- Trip status auto-transitions (booked → in_progress → completed)
- Client care automations (welcome emails, follow-ups)
- Notification delivery (push, email, SMS)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         NestJS API                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐    ┌─────────────────────────────────┐   │
│  │  Business Logic  │───▶│      AutomationModule           │   │
│  │  (TripsService)  │    │                                 │   │
│  └──────────────────┘    │  ┌─────────────────────────┐   │   │
│                          │  │   AutomationService     │   │   │
│  ┌──────────────────┐    │  │   - schedule()          │   │   │
│  │  EventEmitter2   │───▶│  │   - scheduleAt()        │   │   │
│  │  (sync events)   │    │  │   - cancel()            │   │   │
│  └──────────────────┘    │  └─────────────────────────┘   │   │
│                          │                                 │   │
│  ┌──────────────────┐    │  Queues:                       │   │
│  │  Cron (EXCLUDED) │    │  - trip-automation (high)      │   │
│  │  - Cruise sync   │    │  - client-care (normal)        │   │
│  │  - Tour sync     │    │  - notifications (normal)      │   │
│  └──────────────────┘    └─────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                          ┌─────────────────┐
                          │  Redis (Railway) │
                          │  - Job persistence│
                          │  - Distributed locks│
                          └─────────────────┘
```

## Technology Choice

| Criteria | BullMQ | pg-boss | Why BullMQ |
|----------|--------|---------|------------|
| NestJS integration | Excellent | Good | `@nestjs/bullmq` is mature |
| Delayed jobs | Native | Native | Both good |
| Monitoring | Bull Board | Basic | Bull Board is excellent |
| Infrastructure | Redis | PostgreSQL | Railway has Redis built-in |

---

## Queues

| Queue | Purpose | Priority |
|-------|---------|----------|
| `trip-automation` | Status transitions, reminders | High |
| `client-care` | Emails, follow-ups | Normal |
| `notifications` | Push, email, SMS delivery | Normal |

---

## Job Types

### Trip Automation

| Job Type | Description |
|----------|-------------|
| `trip.status.transition` | Auto-transition trip status based on dates |
| `trip.reminder` | Departure/payment reminders |
| `trip.backfill` | Backfill existing trips on deployment |

### Client Care

| Job Type | Description |
|----------|-------------|
| `client.welcome` | Welcome email for new clients |
| `client.post_trip` | Post-trip follow-up |
| `client.birthday` | Birthday greetings |
| `client.follow_up` | General follow-ups |

### Notifications

| Job Type | Description |
|----------|-------------|
| `notification.push` | Push notifications |
| `notification.email` | Email delivery |
| `notification.sms` | SMS delivery |

---

## Trip Status Auto-Transitions

When a trip is booked with dates, the system automatically schedules status transitions:

```
┌─────────┐     Start Date     ┌─────────────┐     Day After End     ┌───────────┐
│ booked  │ ─────────────────▶ │ in_progress │ ─────────────────────▶ │ completed │
└─────────┘                    └─────────────┘                        └───────────┘
```

### How It Works

1. **Trip Booked**: When a trip transitions to `booked` status with dates:
   - Schedules `in_progress` transition at midnight of `startDate`
   - Schedules `completed` transition at midnight of day after `endDate`

2. **Dates Changed**: If trip dates are updated:
   - Cancels existing scheduled jobs
   - Schedules new jobs with updated dates

3. **Trip Cancelled**: If trip is cancelled:
   - Cancels all scheduled transitions

4. **Idempotent Processing**: Processors check current status before applying changes

### Timezone-Aware Scheduling

Jobs are scheduled based on the trip's timezone (with fallback to UTC):

```typescript
// Midnight in trip's timezone
const inProgressAt = computeLocalMidnight(trip.startDate, trip.timezone)
```

### Deterministic Job IDs

Job IDs are deterministic to prevent duplicates:

```typescript
// Format: trip:{tripId}:{status}
const jobId = `trip:abc123:in_progress`
```

---

## Bull Board Dashboard

### Access

- **URL**: `/admin/queues`
- **Auth**: Admin JWT required (HS256 or ES256)
- **Production**: Disabled by default (set `ENABLE_BULL_BOARD=true`)

### Features

- View queue status and job counts
- Inspect delayed/waiting/active jobs
- Retry failed jobs
- Monitor job history

---

## Admin API

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/automation/queues` | Get all queue counts |
| GET | `/admin/automation/queues/:name/delayed` | Get delayed jobs |
| GET | `/admin/automation/jobs/:id` | Get job status |
| DELETE | `/admin/automation/jobs/:id` | Cancel a job |
| POST | `/admin/automation/jobs/schedule` | Manually schedule a job |
| POST | `/admin/automation/trips/backfill` | Trigger trip backfill |
| DELETE | `/admin/automation/jobs/pattern` | Cancel jobs by pattern |

### Example: Check Queue Status

```bash
curl https://api.tailfire.ca/api/v1/admin/automation/queues \
  -H "Authorization: Bearer $TOKEN"
```

### Example: Trigger Backfill

```bash
curl -X POST https://api.tailfire.ca/api/v1/admin/automation/trips/backfill \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"batchSize": 100}'
```

---

## Job History

Jobs are logged to `automation_job_history` table for permanent audit trail:

```sql
CREATE TABLE automation_job_history (
  id UUID PRIMARY KEY,
  queue_name VARCHAR(50) NOT NULL,
  job_id VARCHAR(100) NOT NULL,
  job_type VARCHAR(100) NOT NULL,
  job_data JSONB NOT NULL,
  status automation_job_status NOT NULL, -- queued, processing, completed, failed
  error_message TEXT,
  scheduled_for TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
);
```

---

## Environment Configuration

### Redis Setup

| Environment | Redis Source | URL Variable |
|-------------|--------------|--------------|
| Local Dev | Docker (`docker-compose up -d redis`) | `REDIS_URL=redis://localhost:6379` |
| Preview | Railway Redis | Auto-injected by Railway |
| Production | Railway Redis | Auto-injected by Railway |

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `ENABLE_BULL_BOARD` | Enable Bull Board in production | `false` |

---

## Local Development

### Start Redis

```bash
# Using Docker
docker run -d --name tailfire-redis -p 6379:6379 redis:7-alpine

# Or with docker-compose
docker-compose up -d redis
```

### Verify Connection

```bash
# Check Redis is running
docker ps | grep redis

# Test connection
redis-cli ping  # Should return PONG
```

### Monitor Jobs

1. Start the dev server: `turbo dev`
2. Navigate to `http://localhost:3101/admin/queues`
3. Authenticate with admin JWT token

---

## Best Practices

### 1. Idempotent Processors

Always check current state before applying changes:

```typescript
// Good - check status first
if (trip.status === toStatus) {
  logger.log('Trip already in target status - skipping')
  return
}

// Then apply transition
await updateTripStatus(tripId, toStatus)
```

### 2. Deterministic Job IDs

Use predictable IDs for deduplication:

```typescript
// Good - deterministic
const jobId = `trip:${tripId}:in_progress`

// Bad - random
const jobId = `${Date.now()}-${Math.random()}`
```

### 3. Cancel Before Reschedule

When dates change, cancel existing jobs first:

```typescript
await cancelScheduledTransitions(tripId)
await scheduleStatusTransitions(tripId, newStartDate, newEndDate)
```

### 4. Timezone Awareness

Always use trip's timezone for scheduling:

```typescript
const runAt = computeLocalMidnight(date, trip.timezone || 'UTC')
```

---

## Troubleshooting

### Jobs Not Processing

1. Check Redis connection: `redis-cli ping`
2. Verify `REDIS_URL` is set correctly
3. Check worker logs for errors
4. Verify queue is registered in `AutomationModule`

### Bull Board 401 Error

1. Ensure JWT token has admin role (`app_metadata.role = 'admin'`)
2. For ES256 tokens (newer Supabase projects), JWKS is used
3. Check `SUPABASE_URL` and `SUPABASE_JWT_SECRET` are set

### Duplicate Jobs

1. Use deterministic job IDs
2. Cancel existing jobs before scheduling new ones
3. Check job history for duplicates

### Jobs Running Multiple Times

1. Verify processor is idempotent
2. Check for retry configuration
3. Review failed job attempts in Bull Board

---

## Related Documentation

- [Architecture Overview](./ARCHITECTURE.md) - System architecture
- [Database Architecture](./DATABASE_ARCHITECTURE.md) - Schema details
- [Security](./SECURITY.md) - Authentication & authorization
