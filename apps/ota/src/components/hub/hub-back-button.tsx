'use client'
import { useRouter } from 'next/navigation'

export function HubBackButton() {
  const router = useRouter()
  return (
    <button
      onClick={() => router.back()}
      className="flex size-10 items-center justify-center rounded-full bg-white/15 text-lg text-white backdrop-blur-md transition-colors hover:bg-white/25"
      aria-label="Go back"
    >
      ←
    </button>
  )
}
