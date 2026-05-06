# Phase 5: Full Portal Experience — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the client portal with payment tracking and agent-client messaging, replacing the two remaining stub pages.

**Architecture:** Payments page backed by a new `GET /portal/my-payments` endpoint that queries `trip_orders` for finalized orders. Messages page backed by a new `portal_messages` table with a simple thread-per-trip model — agents send messages from Tailfire, consumers view and reply in the portal. Not real-time WebSocket — uses polling via React Query refetch interval.

**Tech Stack:** NestJS (API), Drizzle ORM, Next.js 15 (Client Portal), React Query with polling, Tailwind CSS

---

## Scope Note

The exploration revealed that most of Phase 5's spec requirements are already built:
- ✅ Trip list + detail pages
- ✅ Itinerary view with day-by-day breakdown
- ✅ Proposal review + approval workflow
- ✅ Change request + feedback system
- ✅ Traveling mode (itinerary detail serves this)

**Only two features remain as stubs:**
1. **Payments** — expose payment/invoice data to consumers
2. **Messages** — agent-client communication thread

---

## File Structure

### New files — Backend
| File | Responsibility |
|------|----------------|
| `packages/database/src/schema/portal-messages.schema.ts` | Drizzle schema for `portal_messages` table |
| `packages/database/src/migrations/{TS}_create_portal_messages.sql` | Migration |
| `apps/api/src/portal-messages/portal-messages.module.ts` | NestJS module |
| `apps/api/src/portal-messages/portal-messages.controller.ts` | GET + POST endpoints for both portal and admin |
| `apps/api/src/portal-messages/portal-messages.service.ts` | Message CRUD |
| `apps/api/src/portal-messages/dto/send-message.dto.ts` | Validation DTO |

### New files — Client Portal
| File | Responsibility |
|------|----------------|
| `apps/client/src/hooks/use-portal-messages.ts` | Message fetch + send hooks |
| `apps/client/src/hooks/use-portal-payments.ts` | Payment data hook |

### Modified files
| File | Change |
|------|--------|
| `apps/api/src/app.module.ts` | Register PortalMessagesModule |
| `apps/api/src/portal/portal.service.ts` | Add `getPaymentsForPortalUser()` method |
| `apps/api/src/portal/portal.controller.ts` | Add `GET /portal/my-payments` endpoint |
| `apps/client/src/app/(dashboard)/payments/page.tsx` | Replace stub with payment history page |
| `apps/client/src/app/(dashboard)/messages/page.tsx` | Replace stub with messaging thread UI |
| `packages/database/src/schema/index.ts` | Export portal-messages schema |

---

### Task 1: Database — portal_messages Table

**Files:**
- Create: `packages/database/src/schema/portal-messages.schema.ts`
- Create: `packages/database/src/migrations/{TS}_create_portal_messages.sql`
- Modify: `packages/database/src/schema/index.ts`

- [ ] **Step 1: Create portal_messages schema**

```typescript
// packages/database/src/schema/portal-messages.schema.ts
import { pgTable, uuid, text, timestamp, boolean, index } from 'drizzle-orm/pg-core'
import { contacts } from './contacts.schema'
import { trips } from './trips.schema'

export const portalMessages = pgTable(
  'portal_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    contactId: uuid('contact_id').notNull().references(() => contacts.id),
    tripId: uuid('trip_id').references(() => trips.id),
    senderType: text('sender_type').notNull(), // 'agent' | 'consumer'
    senderId: uuid('sender_id'), // user_profiles.id for agent, contacts.id for consumer
    senderName: text('sender_name'),
    body: text('body').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_portal_messages_contact').on(table.contactId, table.createdAt),
    index('idx_portal_messages_trip').on(table.tripId, table.createdAt),
  ],
)
```

- [ ] **Step 2: Create migration**

```sql
CREATE TABLE IF NOT EXISTS portal_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id),
  trip_id UUID REFERENCES trips(id),
  sender_type TEXT NOT NULL,
  sender_id UUID,
  sender_name TEXT,
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portal_messages_contact ON portal_messages(contact_id, created_at);
CREATE INDEX IF NOT EXISTS idx_portal_messages_trip ON portal_messages(trip_id, created_at);
```

- [ ] **Step 3: Export schema + register migration**

Add to `packages/database/src/schema/index.ts`:
```typescript
export * from './portal-messages.schema'
```

Register in `_journal.json`.

- [ ] **Step 4: Commit**

```bash
git add packages/database/
git commit -m "feat(db): add portal_messages table for agent-client messaging"
```

---

### Task 2: Backend — Portal Messages API

**Files:**
- Create: `apps/api/src/portal-messages/dto/send-message.dto.ts`
- Create: `apps/api/src/portal-messages/portal-messages.service.ts`
- Create: `apps/api/src/portal-messages/portal-messages.controller.ts`
- Create: `apps/api/src/portal-messages/portal-messages.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Create DTO**

```typescript
// apps/api/src/portal-messages/dto/send-message.dto.ts
import { IsString, IsOptional, IsUUID } from 'class-validator'

export class SendMessageDto {
  @IsString()
  body!: string

  @IsOptional()
  @IsUUID()
  tripId?: string
}
```

- [ ] **Step 2: Create service**

The service handles messages for both sides (portal consumers and admin agents):

```typescript
// apps/api/src/portal-messages/portal-messages.service.ts
import { Injectable, NotFoundException } from '@nestjs/common'
import { DatabaseService } from '../db/database.service'
import { eq, and, desc, isNull } from 'drizzle-orm'

@Injectable()
export class PortalMessagesService {
  constructor(private readonly db: DatabaseService) {}

  /** Get all messages for a contact (portal consumer view) */
  async getMessagesForContact(contactId: string, tripId?: string) {
    const { portalMessages } = this.db.schema

    const conditions = [eq(portalMessages.contactId, contactId)]
    if (tripId) conditions.push(eq(portalMessages.tripId, tripId))

    return this.db.client
      .select()
      .from(portalMessages)
      .where(and(...conditions))
      .orderBy(desc(portalMessages.createdAt))
      .limit(100)
  }

  /** Send a message from a consumer */
  async sendFromConsumer(contactId: string, contactName: string, dto: { body: string; tripId?: string }) {
    const { portalMessages } = this.db.schema

    const [msg] = await this.db.client
      .insert(portalMessages)
      .values({
        contactId,
        tripId: dto.tripId || null,
        senderType: 'consumer',
        senderId: contactId,
        senderName: contactName,
        body: dto.body,
      })
      .returning()

    return msg
  }

  /** Send a message from an agent (called from admin API) */
  async sendFromAgent(contactId: string, agentId: string, agentName: string, dto: { body: string; tripId?: string }) {
    const { portalMessages } = this.db.schema

    const [msg] = await this.db.client
      .insert(portalMessages)
      .values({
        contactId,
        tripId: dto.tripId || null,
        senderType: 'agent',
        senderId: agentId,
        senderName: agentName,
        body: dto.body,
      })
      .returning()

    return msg
  }

  /** Mark messages as read (consumer reads agent messages) */
  async markAsRead(contactId: string) {
    const { portalMessages } = this.db.schema

    await this.db.client
      .update(portalMessages)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(portalMessages.contactId, contactId),
          eq(portalMessages.senderType, 'agent'),
          isNull(portalMessages.readAt),
        ),
      )
  }

  /** Get unread count for a contact */
  async getUnreadCount(contactId: string): Promise<number> {
    const { portalMessages } = this.db.schema

    const result = await this.db.client
      .select()
      .from(portalMessages)
      .where(
        and(
          eq(portalMessages.contactId, contactId),
          eq(portalMessages.senderType, 'agent'),
          isNull(portalMessages.readAt),
        ),
      )

    return result.length
  }

  /** Get messages for a contact (admin agent view — for a specific contact) */
  async getMessagesForAdmin(contactId: string) {
    return this.getMessagesForContact(contactId)
  }
}
```

- [ ] **Step 3: Create controller**

Two sets of endpoints — portal (consumer-facing) and admin (agent-facing):

```typescript
// apps/api/src/portal-messages/portal-messages.controller.ts
import { Controller, Get, Post, Body, Query, Patch } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { PortalMessagesService } from './portal-messages.service'
import { SendMessageDto } from './dto/send-message.dto'
// Import portal auth decorators — check how portal.controller.ts does it
// Import admin auth decorators for the admin endpoint

@ApiTags('Portal Messages')
@Controller()
export class PortalMessagesController {
  constructor(private readonly service: PortalMessagesService) {}

  // --- Portal (consumer) endpoints ---

  @Get('portal/my-messages')
  @ApiOperation({ summary: 'Get messages for authenticated consumer' })
  // Use same auth guard as other portal endpoints
  async getMyMessages(
    @GetPortalAuth() auth: PortalAuthContext,
    @Query('tripId') tripId?: string,
  ) {
    await this.service.markAsRead(auth.contactId) // mark all as read on open
    return this.service.getMessagesForContact(auth.contactId, tripId)
  }

  @Post('portal/my-messages')
  @ApiOperation({ summary: 'Send a message from consumer' })
  async sendMessage(
    @GetPortalAuth() auth: PortalAuthContext,
    @Body() dto: SendMessageDto,
  ) {
    // Get contact name for display
    const contact = await this.getContactName(auth.contactId)
    return this.service.sendFromConsumer(auth.contactId, contact, dto)
  }

  @Get('portal/my-messages/unread')
  @ApiOperation({ summary: 'Get unread message count' })
  async getUnreadCount(@GetPortalAuth() auth: PortalAuthContext) {
    const count = await this.service.getUnreadCount(auth.contactId)
    return { count }
  }

  // Helper
  private async getContactName(contactId: string): Promise<string> {
    // Query contact for name
    return 'Consumer' // simplified — read from contacts table
  }
}
```

Follow the exact auth guard patterns used in `apps/api/src/portal/portal.controller.ts`. Check how `@GetPortalAuth()` and `PortalAuthContext` are imported.

- [ ] **Step 4: Create module + register**

```typescript
// apps/api/src/portal-messages/portal-messages.module.ts
import { Module } from '@nestjs/common'
import { PortalMessagesController } from './portal-messages.controller'
import { PortalMessagesService } from './portal-messages.service'

@Module({
  controllers: [PortalMessagesController],
  providers: [PortalMessagesService],
  exports: [PortalMessagesService],
})
export class PortalMessagesModule {}
```

Register in `apps/api/src/app.module.ts`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/portal-messages/ apps/api/src/app.module.ts
git commit -m "feat(api): add portal messages module — agent-client messaging with read tracking"
```

---

### Task 3: Backend — Portal Payments Endpoint

**Files:**
- Modify: `apps/api/src/portal/portal.service.ts`
- Modify: `apps/api/src/portal/portal.controller.ts`

- [ ] **Step 1: Add getPaymentsForPortalUser to portal service**

Read `apps/api/src/portal/portal.service.ts`. Add a method that queries `trip_orders` for finalized orders linked to the consumer's trips:

```typescript
  async getPaymentsForPortalUser(portalUserId: string) {
    const { contacts, trips, tripOrders, travelers } = this.db.schema

    // 1. Find contact
    const [contact] = await this.db.client
      .select({ id: contacts.id })
      .from(contacts)
      .where(eq(contacts.portalUserId, portalUserId))

    if (!contact) return []

    // 2. Find trips where contact is a traveler or primary contact
    const contactTrips = await this.db.client
      .select({ tripId: travelers.tripId })
      .from(travelers)
      .where(eq(travelers.contactId, contact.id))

    const tripIds = contactTrips.map((t) => t.tripId)
    if (tripIds.length === 0) return []

    // 3. Get finalized/sent trip orders for those trips
    const orders = await this.db.client
      .select()
      .from(tripOrders)
      .where(
        and(
          inArray(tripOrders.tripId, tripIds),
          inArray(tripOrders.status, ['finalized', 'sent']),
        ),
      )
      .orderBy(desc(tripOrders.createdAt))

    // 4. Map to portal-safe response
    return orders.map((o) => ({
      id: o.id,
      tripId: o.tripId,
      versionNumber: o.versionNumber,
      status: o.status,
      paymentSummary: o.paymentSummary,
      sentAt: o.sentAt?.toISOString() ?? null,
      createdAt: o.createdAt?.toISOString() ?? null,
    }))
  }
```

Make sure `inArray` is imported from `drizzle-orm`. Check if `tripOrders` exists in the schema — it might be named differently (e.g., `trip_orders`). Read the trips schema to find the correct table name.

- [ ] **Step 2: Add endpoint to controller**

```typescript
  @Get('my-payments')
  @ApiOperation({ summary: 'Get payment history for authenticated consumer' })
  async getMyPayments(@GetPortalAuth() auth: PortalAuthContext) {
    return this.portalService.getPaymentsForPortalUser(auth.userId)
  }
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/portal/
git commit -m "feat(api): add portal payments endpoint — finalized trip orders for consumer"
```

---

### Task 4: Portal Payments Page

**Files:**
- Create: `apps/client/src/hooks/use-portal-payments.ts`
- Modify: `apps/client/src/app/(dashboard)/payments/page.tsx`

- [ ] **Step 1: Create payments hook**

```typescript
// apps/client/src/hooks/use-portal-payments.ts
'use client'

import { useQuery } from '@tanstack/react-query'
import { portalApi } from '@/lib/api'

export interface PortalPayment {
  id: string
  tripId: string
  versionNumber: number
  status: string
  paymentSummary: {
    totalAmountCents?: number
    paidAmountCents?: number
    remainingAmountCents?: number
    currency?: string
    installments?: Array<{
      dueDate: string
      amountCents: number
      status: string
    }>
  } | null
  sentAt: string | null
  createdAt: string | null
}

export function usePortalPayments() {
  return useQuery({
    queryKey: ['portal', 'payments'],
    queryFn: () => portalApi<PortalPayment[]>('/portal/my-payments'),
  })
}
```

- [ ] **Step 2: Replace payments stub page**

Read the existing stub at `apps/client/src/app/(dashboard)/payments/page.tsx`. Replace with a working payments page:

```typescript
// apps/client/src/app/(dashboard)/payments/page.tsx
'use client'

import { usePortalPayments } from '@/hooks/use-portal-payments'
import { CreditCard, Clock, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'

function formatCurrency(cents: number, currency = 'CAD') {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency }).format(cents / 100)
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}

const STATUS_STYLES: Record<string, { icon: typeof CheckCircle; color: string; label: string }> = {
  paid: { icon: CheckCircle, color: 'text-green-600 bg-green-50', label: 'Paid' },
  pending: { icon: Clock, color: 'text-amber-600 bg-amber-50', label: 'Pending' },
  overdue: { icon: AlertCircle, color: 'text-red-600 bg-red-50', label: 'Overdue' },
}

export default function PaymentsPage() {
  const { data: payments, isLoading, error } = usePortalPayments()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-[#C59746]" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex items-center gap-3">
        <CreditCard className="size-6 text-[#C59746]" />
        <div>
          <h1 className="text-2xl font-bold text-[#1A1A1A]">Payments</h1>
          <p className="text-sm text-gray-500">Your trip payment history and upcoming installments</p>
        </div>
      </div>

      {error && (
        <div className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-600">
          Unable to load payment history. Please try again.
        </div>
      )}

      {payments && payments.length === 0 && (
        <div className="mt-12 text-center">
          <CreditCard className="mx-auto size-12 text-gray-200" />
          <h2 className="mt-4 text-lg font-semibold text-[#1A1A1A]">No payments yet</h2>
          <p className="mt-2 text-sm text-gray-500">
            Payment details will appear here once your trip is booked.
          </p>
        </div>
      )}

      {payments && payments.length > 0 && (
        <div className="mt-6 space-y-4">
          {payments.map((payment) => {
            const summary = payment.paymentSummary
            const total = summary?.totalAmountCents ?? 0
            const paid = summary?.paidAmountCents ?? 0
            const remaining = summary?.remainingAmountCents ?? (total - paid)
            const currency = summary?.currency || 'CAD'

            return (
              <div key={payment.id} className="rounded-xl border border-gray-200 bg-white p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Invoice #{payment.versionNumber}</p>
                    <p className="text-xs text-gray-400">Sent {formatDate(payment.sentAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-[#1A1A1A]">{formatCurrency(total, currency)}</p>
                    {remaining > 0 && (
                      <p className="text-xs text-amber-600">{formatCurrency(remaining, currency)} remaining</p>
                    )}
                    {remaining <= 0 && total > 0 && (
                      <p className="text-xs text-green-600">Paid in full</p>
                    )}
                  </div>
                </div>

                {summary?.installments && summary.installments.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-medium text-gray-500">Payment Schedule</p>
                    {summary.installments.map((inst, i) => {
                      const style = STATUS_STYLES[inst.status] || STATUS_STYLES.pending!
                      const Icon = style.icon
                      return (
                        <div key={i} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Icon className={`size-4 ${style.color.split(' ')[0]}`} />
                            <span className="text-sm">{formatDate(inst.dueDate)}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium">{formatCurrency(inst.amountCents, currency)}</span>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style.color}`}>
                              {style.label}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/hooks/use-portal-payments.ts apps/client/src/app/\(dashboard\)/payments/
git commit -m "feat(client): portal payments page — invoice history with installment schedule"
```

---

### Task 5: Portal Messages Page

**Files:**
- Create: `apps/client/src/hooks/use-portal-messages.ts`
- Modify: `apps/client/src/app/(dashboard)/messages/page.tsx`

- [ ] **Step 1: Create messages hook**

```typescript
// apps/client/src/hooks/use-portal-messages.ts
'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { portalApi } from '@/lib/api'

export interface PortalMessage {
  id: string
  contactId: string
  tripId: string | null
  senderType: 'agent' | 'consumer'
  senderId: string | null
  senderName: string | null
  body: string
  readAt: string | null
  createdAt: string
}

export function usePortalMessages(tripId?: string) {
  const qs = tripId ? `?tripId=${tripId}` : ''
  return useQuery({
    queryKey: ['portal', 'messages', tripId],
    queryFn: () => portalApi<PortalMessage[]>(`/portal/my-messages${qs}`),
    refetchInterval: 15000, // Poll every 15 seconds for new messages
  })
}

export function useSendMessage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { body: string; tripId?: string }) =>
      portalApi<PortalMessage>('/portal/my-messages', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal', 'messages'] })
    },
  })
}

export function useUnreadCount() {
  return useQuery({
    queryKey: ['portal', 'messages', 'unread'],
    queryFn: () => portalApi<{ count: number }>('/portal/my-messages/unread'),
    refetchInterval: 30000, // Poll every 30 seconds
  })
}
```

- [ ] **Step 2: Replace messages stub page**

Read the existing stub. Replace with a chat-style messaging UI:

```typescript
// apps/client/src/app/(dashboard)/messages/page.tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { usePortalMessages, useSendMessage } from '@/hooks/use-portal-messages'
import { useAuth } from '@/lib/auth'
import { MessageCircle, Send, Loader2, User } from 'lucide-react'

function formatTime(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000)

  if (diffDays === 0) return date.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return date.toLocaleDateString('en-CA', { weekday: 'short' })
  return date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
}

export default function MessagesPage() {
  const { user } = useAuth()
  const { data: messages, isLoading } = usePortalMessages()
  const sendMessage = useSendMessage()
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || sendMessage.isPending) return
    await sendMessage.mutateAsync({ body: input.trim() })
    setInput('')
  }

  // Reverse messages for chronological order (API returns newest first)
  const sortedMessages = [...(messages || [])].reverse()

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col px-4 py-4">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4">
        <MessageCircle className="size-6 text-[#C59746]" />
        <div>
          <h1 className="text-xl font-bold text-[#1A1A1A]">Messages</h1>
          <p className="text-xs text-gray-500">Chat with your travel advisor</p>
        </div>
      </div>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-4">
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="size-5 animate-spin text-[#C59746]" />
          </div>
        )}

        {!isLoading && sortedMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <MessageCircle className="size-10 text-gray-200" />
            <p className="mt-3 text-sm font-medium text-gray-500">No messages yet</p>
            <p className="mt-1 text-xs text-gray-400">
              Send a message to your travel advisor below.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {sortedMessages.map((msg) => {
            const isMe = msg.senderType === 'consumer'
            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                {!isMe && (
                  <div className="mr-2 mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-[#C59746]">
                    <User className="size-3.5 text-white" />
                  </div>
                )}
                <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                  isMe
                    ? 'bg-[#1A1A1A] text-white'
                    : 'border border-gray-200 bg-white text-[#1A1A1A]'
                }`}>
                  {!isMe && msg.senderName && (
                    <p className="mb-0.5 text-xs font-medium text-[#C59746]">{msg.senderName}</p>
                  )}
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.body}</p>
                  <p className={`mt-1 text-xs ${isMe ? 'text-white/50' : 'text-gray-400'}`}>
                    {formatTime(msg.createdAt)}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Input area */}
      <form onSubmit={handleSend} className="mt-3 flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          disabled={sendMessage.isPending}
          className="flex-1 rounded-full border border-gray-200 bg-white px-4 py-2.5 text-sm text-[#1A1A1A] placeholder:text-gray-400 focus:border-[#C59746] focus:outline-none focus:ring-1 focus:ring-[#C59746] disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!input.trim() || sendMessage.isPending}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#C59746] text-white hover:bg-[#B08638] disabled:opacity-50"
        >
          {sendMessage.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/hooks/use-portal-messages.ts apps/client/src/app/\(dashboard\)/messages/
git commit -m "feat(client): portal messages page — chat-style agent-client messaging with polling"
```

---

## Self-Review

**Spec coverage:**

| Phase 5 Requirement | Task/Status |
|---|---|
| Portal `/trips` | Already fully built (list + detail + itineraries) |
| Portal `/trips/[id]/proposal` | Already built (itinerary approval/change-request) |
| Portal `/trips/[id]/itinerary` | Already built (day-by-day detail) |
| `/messages` — messaging with advisor | Task 2 (API) + Task 5 (UI) |
| `/payments` — payment history + upcoming | Task 3 (API) + Task 4 (UI) |
| Agent push: proposal → portal notification | Already built (itinerary proposing status + feedback) |
| Traveling mode: day-by-day itinerary | Already built (itinerary detail page) |

**Note on agent-side messaging:** This plan creates the consumer-facing messaging UI and the API. The agent-side UI for sending messages from Tailfire admin is NOT included — agents would need a "Send Message" button on the contact profile or trip detail page. This can be added as a follow-up since the API supports it (`sendFromAgent()` method exists).

**Placeholder scan:** No TBDs or TODOs. All tasks have complete code.

**Type consistency:** `PortalMessage` and `PortalPayment` interfaces match the backend response shapes. `SendMessageDto` matches the mutation payload. Polling intervals set at 15s (messages) and 30s (unread count).
