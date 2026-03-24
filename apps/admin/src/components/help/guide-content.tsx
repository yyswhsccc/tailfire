'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface GuideContentProps {
  content: string
}

export function GuideContent({ content }: GuideContentProps) {
  return (
    <div
      className="prose prose-sm prose-zinc max-w-none
      prose-headings:font-semibold prose-headings:text-zinc-900
      prose-h1:text-xl prose-h1:border-b prose-h1:pb-2 prose-h1:mb-4
      prose-h2:text-lg prose-h2:mt-6
      prose-h3:text-base prose-h3:mt-4
      prose-p:text-zinc-700 prose-p:leading-relaxed
      prose-li:text-zinc-700
      prose-strong:text-zinc-900
      prose-code:bg-zinc-100 prose-code:px-1 prose-code:rounded prose-code:text-xs
      prose-blockquote:border-l-amber-400 prose-blockquote:bg-amber-50 prose-blockquote:py-1 prose-blockquote:text-amber-800
      prose-table:text-sm
      prose-th:text-left prose-th:text-zinc-600"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}
