'use client'

import { usePortalBoards, type PortalBoard, type BoardComponent } from '@/hooks/use-portal-boards'
import { Sparkles, Ship, Plane, Hotel, MapPin, ExternalLink } from 'lucide-react'
import Image from 'next/image'

function formatPrice(price?: string) {
  if (!price) return null
  return price
}

function ComponentCard({ component }: { component: BoardComponent }) {
  const icons: Record<string, typeof MapPin> = { cruise: Ship, flight: Plane, hotel: Hotel, tour: MapPin }
  const Icon = icons[component.type] || MapPin

  return (
    <div className="group overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md">
      {component.display?.heroImage && (
        <div className="relative h-40 w-full">
          <Image
            src={component.display.heroImage}
            alt={component.display?.title || component.type}
            fill
            className="object-cover"
          />
        </div>
      )}
      <div className="p-4">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-phoenix-gold" />
          <span className="text-xs font-medium uppercase text-gray-500">{component.type}</span>
        </div>
        <h3 className="mt-1 text-sm font-semibold text-phoenix-charcoal">
          {component.display?.title || 'Untitled'}
        </h3>
        {component.display?.subtitle && (
          <p className="mt-0.5 text-xs text-gray-500">{component.display.subtitle}</p>
        )}
        {component.display?.price && (
          <p className="mt-2 text-sm font-bold text-phoenix-gold">{formatPrice(component.display.price)}</p>
        )}
      </div>
    </div>
  )
}

function BoardCard({ board }: { board: PortalBoard }) {
  const componentCount = board.components?.length ?? 0

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-phoenix-charcoal">{board.title || 'My Dream Board'}</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            {componentCount} item{componentCount !== 1 ? 's' : ''} saved
          </p>
        </div>
        <span className="rounded-full bg-phoenix-gold/10 px-3 py-1 text-xs font-medium text-phoenix-gold">
          {board.status}
        </span>
      </div>

      {componentCount > 0 ? (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {board.components.map((c) => (
            <ComponentCard key={c.id} component={c} />
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-xl bg-gray-50 p-8 text-center">
          <Sparkles className="mx-auto size-8 text-gray-300" />
          <p className="mt-2 text-sm text-gray-500">No items saved yet</p>
          <a
            href={process.env.NEXT_PUBLIC_OTA_URL || 'https://ota.phoenixvoyages.ca'}
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-phoenix-gold hover:underline"
          >
            Browse trips <ExternalLink className="size-3.5" />
          </a>
        </div>
      )}
    </div>
  )
}

export default function BoardPage() {
  const { data: boards, isLoading, error } = usePortalBoards()

  return (
    <div className="mx-auto max-w-5xl py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-phoenix-charcoal">My Dream Board</h1>
          <p className="mt-1 text-sm text-gray-500">Your saved trip ideas and inspiration</p>
        </div>
        <a
          href={process.env.NEXT_PUBLIC_OTA_URL || 'https://ota.phoenixvoyages.ca'}
          className="inline-flex w-fit items-center gap-1.5 rounded-full bg-phoenix-gold px-4 py-2.5 text-sm font-medium text-white hover:bg-phoenix-gold/90"
        >
          Add more <ExternalLink className="size-3.5" />
        </a>
      </div>

      {isLoading && (
        <div className="mt-8 space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
      )}

      {error && (
        <div className="mt-8 rounded-xl bg-red-50 p-4 text-sm text-red-600">
          Unable to load your boards. Please try again.
        </div>
      )}

      {boards && boards.length === 0 && (
        <div className="mt-12 text-center">
          <Sparkles className="mx-auto size-12 text-gray-200" />
          <h2 className="mt-4 text-lg font-semibold text-phoenix-charcoal">No boards yet</h2>
          <p className="mt-2 text-sm text-gray-500">
            Start exploring destinations, cruises, and more on our travel site.
          </p>
          <a
            href={process.env.NEXT_PUBLIC_OTA_URL || 'https://ota.phoenixvoyages.ca'}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-phoenix-gold px-6 py-2.5 text-sm font-medium text-white hover:bg-phoenix-gold/90"
          >
            Start exploring <ExternalLink className="size-3.5" />
          </a>
        </div>
      )}

      {boards && boards.length > 0 && (
        <div className="mt-6 space-y-6">
          {boards.map((board) => (
            <BoardCard key={board.id} board={board} />
          ))}
        </div>
      )}
    </div>
  )
}
