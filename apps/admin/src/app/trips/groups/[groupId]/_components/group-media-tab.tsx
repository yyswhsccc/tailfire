'use client'

import { MediaUploader } from '@/components/media-uploader'

interface GroupMediaTabProps {
  groupId: string
}

export function GroupMediaTab({ groupId }: GroupMediaTabProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Media</h3>
        <MediaUploader
          apiEndpoint={`/trips/groups/${groupId}/media`}
          allowedTypes={['image']}
          showStockPhotos={false}
          queryKey={['group-media', groupId]}
        />
      </div>
    </div>
  )
}
