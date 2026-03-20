'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useImpersonation } from '@/hooks/use-impersonation'
import { Button } from '@/components/ui/button'

export function ImpersonationBanner() {
  const { active, targetName, expiresAt, extend, end } = useImpersonation()
  const [remaining, setRemaining] = useState('')

  useEffect(() => {
    if (!active || !expiresAt) return

    const update = () => {
      const diff = new Date(expiresAt).getTime() - Date.now()
      if (diff <= 0) {
        setRemaining('Expired')
        return
      }
      const mins = Math.floor(diff / 60000)
      const secs = Math.floor((diff % 60000) / 1000)
      setRemaining(`${mins}:${secs.toString().padStart(2, '0')}`)
    }

    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [active, expiresAt])

  if (!active) return null

  return (
    <>
    {/* Spacer to push sticky nav down so banner doesn't overlap it */}
    <div className="h-10 w-full" />
    <div className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-4 bg-amber-500 px-4 py-2 text-sm font-medium text-black">
      <span>
        Viewing as <strong>{targetName}</strong> — {remaining} remaining — Admin features disabled
      </span>
      <Button
        size="sm"
        variant="outline"
        className="h-7 border-black/30 bg-transparent text-black hover:bg-amber-600"
        onClick={async () => {
          try {
            await extend()
            toast.success('Session extended by 30 minutes')
          } catch (err: any) {
            toast.error(err?.message || 'Failed to extend')
          }
        }}
      >
        Extend
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-7 border-black/30 bg-transparent text-black hover:bg-amber-600"
        onClick={async () => {
          try {
            await end()
          } catch (err: any) {
            toast.error(err?.message || 'Failed to exit')
          }
        }}
      >
        Exit
      </Button>
    </div>
    </>
  )
}
