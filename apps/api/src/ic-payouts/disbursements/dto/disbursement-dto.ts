import { z } from 'zod'

export const markSentSchema = z.object({
  reference: z.string().min(1).max(255),
  // proofPath is the storage path returned by an earlier file upload to /storage endpoint.
  // The UI in Task 35 will upload first, then POST the path here.
  proofPath: z.string().min(1).max(1024).optional(),
})

export const markFailedSchema = z.object({
  reason: z.string().min(1).max(2000),
})

export type MarkSentDto = z.infer<typeof markSentSchema>
export type MarkFailedDto = z.infer<typeof markFailedSchema>
