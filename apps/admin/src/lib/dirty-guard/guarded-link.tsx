'use client'

/**
 * <GuardedLink> — drop-in replacement for next/link that prompts before
 * navigating when a registered form is dirty. Use this anywhere a user might
 * click their way out of an unsaved form: top-nav, sidebar, breadcrumbs,
 * back-links.
 *
 * Anything that wants to opt OUT (e.g. the Cancel button on a form — Cancel
 * IS the discard affordance) should keep using the bare next/link.
 */

import Link, { type LinkProps } from 'next/link'
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react'
import { useDirtyGuard } from './dirty-guard-provider'

type GuardedLinkProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & {
    children?: ReactNode
    /** Custom confirm message; falls back to the provider default. */
    confirmMessage?: string
  }

export function GuardedLink({ onClick, confirmMessage, children, ...rest }: GuardedLinkProps) {
  const { confirmIfDirty } = useDirtyGuard()

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    // Let modified clicks (cmd/ctrl/shift) through unmolested — they open a
    // new tab/window where the current dirty form remains intact.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      onClick?.(e)
      return
    }
    if (!confirmIfDirty(confirmMessage)) {
      e.preventDefault()
      return
    }
    onClick?.(e)
  }

  return (
    <Link onClick={handleClick} {...rest}>
      {children}
    </Link>
  )
}
