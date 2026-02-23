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

export function DayCommentButton({
  dayId,
  comments,
  count,
  onSubmit,
}: {
  dayId: string
  comments: ProposalCommentDto[]
  count: number
  onSubmit: (content: string) => Promise<void>
}) {
  const dayComments = comments.filter((c) => c.dayId === dayId && !c.activityId)

  return (
    <Popover>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 gap-1 text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
              >
                <MessageCircle className="h-3.5 w-3.5" />
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
            <p>Leave feedback about this day</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Day Comments</h4>
          <CommentThread
            comments={dayComments}
            onSubmit={onSubmit}
            placeholder="Comment on this day..."
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
