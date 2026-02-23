'use client'

import { MessageCircle } from 'lucide-react'
import {
  Button,
  Popover,
  PopoverTrigger,
  PopoverContent,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@tailfire/ui-public'
import type { ProposalCommentDto } from '@tailfire/shared-types'
import { CommentThread } from './CommentThread'

export function ActivityCommentButton({
  activityId,
  comments,
  count,
  onSubmit,
}: {
  activityId: string
  comments: ProposalCommentDto[]
  count: number
  onSubmit: (content: string) => Promise<void>
}) {
  const activityComments = comments.filter((c) => c.activityId === activityId)

  return (
    <Popover>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2.5 gap-1.5 text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
              >
                <MessageCircle className="h-4 w-4" />
                {count > 0 ? (
                  <span className="text-xs font-medium min-w-[1rem] text-center bg-primary/10 text-primary rounded-full px-1.5 py-0.5">
                    {count}
                  </span>
                ) : (
                  <span className="text-xs">Comment</span>
                )}
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>Leave feedback or ask your advisor a question</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Comments</h4>
          <CommentThread
            comments={activityComments}
            onSubmit={onSubmit}
            placeholder="Comment on this activity..."
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
