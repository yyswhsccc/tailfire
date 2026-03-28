'use client'
import Image, { type ImageProps } from 'next/image'
import { useState } from 'react'

interface SafeImageProps extends Omit<ImageProps, 'onError'> {
  fallback?: React.ReactNode
  hideOnError?: boolean
}

export function SafeImage({ fallback, hideOnError = false, alt, ...props }: SafeImageProps) {
  const [error, setError] = useState(false)
  if (error) {
    if (hideOnError) return null
    return fallback ? <>{fallback}</> : null
  }
  return <Image {...props} alt={alt} onError={() => setError(true)} />
}
