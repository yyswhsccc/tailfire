'use client'

import { useState } from 'react'
import Image from 'next/image'
import { ActivityIconBadge } from '@/components/ui/activity-icon-badge'

interface ActivityThumbnailProps {
  src: string | null | undefined
  alt: string
  activityType: string
  size?: 'sm' | 'md'
}

export function ActivityThumbnail({ src, alt, activityType, size = 'sm' }: ActivityThumbnailProps) {
  const [failed, setFailed] = useState(false)
  const px = size === 'md' ? 'w-8 h-8' : 'w-7 h-7'
  const sizePx = size === 'md' ? '32px' : '28px'

  if (!src || failed) {
    return <ActivityIconBadge type={activityType} size="sm" />
  }

  return (
    <div className={`relative ${px} rounded-md overflow-hidden flex-shrink-0 border border-phoenix-gold-200`}>
      <Image
        src={src}
        alt={alt}
        fill
        className="object-cover"
        sizes={sizePx}
        onError={() => setFailed(true)}
      />
    </div>
  )
}
