'use client'

import Image from 'next/image'
import { useState } from 'react'
import type { ShipImage } from '@/types/entities'

export function ShipGallery({ images }: { images: ShipImage[] }) {
  const [selected, setSelected] = useState(0)
  if (images.length === 0) return null

  return (
    <div>
      <div className="relative mb-3 aspect-video overflow-hidden rounded-xl">
        <Image
          src={images[selected]!.imageUrl}
          alt={images[selected]!.caption || 'Ship photo'}
          fill
          className="object-cover"
          sizes="(max-width: 1024px) 100vw, 60vw"
        />
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <button
              key={img.id}
              onClick={() => setSelected(i)}
              className={`relative size-16 shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
                i === selected ? 'border-[#C59746]' : 'border-transparent opacity-70 hover:opacity-100'
              }`}
            >
              <Image src={img.imageUrl} alt={img.caption || ''} fill className="object-cover" sizes="64px" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
