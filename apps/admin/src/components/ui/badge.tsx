import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-ash-100 text-ash-700",
        destructive: "bg-destructive text-destructive-foreground",
        outline: "border border-ash-300 text-ash-700",

        // Status badges (current lifecycle: inbound → planning → active → travelling → travelled → cancelled)
        inbound: "bg-ash-200 text-ash-700",
        planning: "bg-amber-100 text-amber-700",
        active: "bg-blue-100 text-blue-700",
        travelling: "bg-cyan-100 text-cyan-700",
        travelled: "bg-green-100 text-green-700",
        cancelled: "bg-red-100 text-red-700",
        // Legacy aliases (kept for backward compatibility)
        booked: "bg-blue-100 text-blue-700",
        traveling: "bg-cyan-100 text-cyan-700",
        completed: "bg-green-100 text-green-700",

        // Brand variants
        teal: "bg-phoenix-gold-500 text-white",
        highlight: "bg-golden-orange-500 text-white",

        // Traveler type badge
        traveler: "bg-ash-900 text-white",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
