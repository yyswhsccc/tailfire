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
import { useRouter } from 'next/navigation'
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react'
import { useDirtyGuard } from './dirty-guard-provider'

type GuardedLinkProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & {
    children?: ReactNode
    /** Custom confirm message; falls back to the provider default. */
    confirmMessage?: string
  }

export function GuardedLink({ onClick, confirmMessage, children, ...rest }: GuardedLinkProps) {
  const { isDirtyNow, confirmIfDirty } = useDirtyGuard()
  const router = useRouter()

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    // Let modified clicks (cmd/ctrl/shift) through unmolested — they open a
    // new tab/window where the current dirty form remains intact.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      onClick?.(e)
      return
    }

    // Clean form: let next/link handle navigation natively. No await means
    // no preventDefault, so the browser's prefetched payload is used.
    if (!isDirtyNow()) {
      onClick?.(e)
      return
    }

    // Dirty form: block native nav, ask via shadcn AlertDialog, then
    // programmatically navigate if the user confirms. We can't `await`
    // inside the click handler and then call the original native click,
    // so route through router.push instead.
    e.preventDefault()
    const targetHref = typeof rest.href === 'string' ? rest.href : (rest.href as { toString: () => string })?.toString?.()
    if (!targetHref) {
      onClick?.(e)
      return
    }
    void confirmIfDirty(confirmMessage).then((ok) => {
      if (!ok) return
      onClick?.(e)
      router.push(targetHref)
    })
  }

  return (
    <Link onClick={handleClick} {...rest}>
      {children}
    </Link>
  )
}
