'use client'

import { useMyProfile } from '@/hooks/use-user-profile'

export function SignaturePreview() {
  const { data: profile } = useMyProfile()
  const signatureConfig = profile?.emailSignatureConfig as any
  const signatureHtml = signatureConfig?.enabled && signatureConfig?.signatureHtml
    ? signatureConfig.signatureHtml
    : null

  if (!signatureHtml) return null

  return (
    <div className="border-t px-4 py-3">
      <div
        className="pointer-events-none select-none opacity-50 text-sm"
        dangerouslySetInnerHTML={{ __html: signatureHtml }}
      />
    </div>
  )
}
