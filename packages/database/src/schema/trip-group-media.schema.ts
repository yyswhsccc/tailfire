/**
 * Trip Group Media Schema
 *
 * Images and media files associated with trip groups.
 */

import { pgTable, uuid, varchar, text, integer, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tripGroups } from './trips.schema'
import { mediaTypeEnum } from './activity-media.schema'

export const tripGroupMedia = pgTable(
  'trip_group_media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripGroupId: uuid('trip_group_id')
      .notNull()
      .references(() => tripGroups.id, { onDelete: 'cascade' }),
    mediaType: mediaTypeEnum('media_type').notNull(),
    fileUrl: text('file_url').notNull(),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    fileSize: integer('file_size'),
    caption: text('caption'),
    orderIndex: integer('order_index').notNull().default(0),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
    uploadedBy: uuid('uploaded_by'),
  },
  (table) => [
    index('idx_trip_group_media_group').on(table.tripGroupId),
  ]
)

export const tripGroupMediaRelations = relations(tripGroupMedia, ({ one }) => ({
  tripGroup: one(tripGroups, {
    fields: [tripGroupMedia.tripGroupId],
    references: [tripGroups.id],
  }),
}))

export type TripGroupMedia = typeof tripGroupMedia.$inferSelect
export type NewTripGroupMedia = typeof tripGroupMedia.$inferInsert
