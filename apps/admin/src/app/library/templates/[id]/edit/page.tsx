'use client'

import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'

// Dynamically import the editor component to avoid SSR issues with Monaco
const TemplateEditorContent = dynamic(
  () => import('./_editor-content'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <Loader2 className="h-8 w-8 animate-spin text-ash-400" />
      </div>
    ),
  }
)

export default function TemplateEditorPage() {
  const params = useParams<{ id: string }>()
  return <TemplateEditorContent templateId={params.id} />
}
