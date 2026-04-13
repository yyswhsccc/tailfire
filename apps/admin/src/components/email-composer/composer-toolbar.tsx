'use client'

import * as React from 'react'
import { Bold, Italic, Underline, List, ListOrdered, Link2, Paperclip, FileText } from 'lucide-react'
import { type Editor } from '@tiptap/react'
import { Toggle } from '@/components/ui/toggle'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Input } from '@/components/ui/input'

interface ComposerToolbarProps {
  editor: Editor | null
  onAttachClick?: () => void
  onTemplateClick?: () => void
}

function ToolbarToggle({
  pressed,
  onPressedChange,
  icon: Icon,
  label,
}: {
  pressed: boolean
  onPressedChange: () => void
  icon: React.ComponentType<{ className?: string }>
  label: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Toggle
          size="sm"
          pressed={pressed}
          onPressedChange={onPressedChange}
          aria-label={label}
        >
          <Icon className="h-4 w-4" />
        </Toggle>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function ComposerToolbar({
  editor,
  onAttachClick,
  onTemplateClick,
}: ComposerToolbarProps) {
  const [linkUrl, setLinkUrl] = React.useState('')
  const [linkPopoverOpen, setLinkPopoverOpen] = React.useState(false)

  const applyLink = () => {
    if (!editor) return
    const url = linkUrl.trim()
    if (!url) return

    const finalUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`

    editor.chain().focus().extendMarkRange('link').setLink({ href: finalUrl }).run()
    setLinkUrl('')
    setLinkPopoverOpen(false)
  }

  const handleLinkKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      applyLink()
    }
  }

  if (!editor) return null

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-0.5 p-1 border-b bg-muted/30">
        {/* Formatting group */}
        <ToolbarToggle
          pressed={editor.isActive('bold')}
          onPressedChange={() => editor.chain().focus().toggleBold().run()}
          icon={Bold}
          label="Bold"
        />
        <ToolbarToggle
          pressed={editor.isActive('italic')}
          onPressedChange={() => editor.chain().focus().toggleItalic().run()}
          icon={Italic}
          label="Italic"
        />
        <ToolbarToggle
          pressed={editor.isActive('underline')}
          onPressedChange={() => editor.chain().focus().toggleUnderline().run()}
          icon={Underline}
          label="Underline"
        />

        <Separator orientation="vertical" className="mx-1 h-5" />

        {/* List group */}
        <ToolbarToggle
          pressed={editor.isActive('bulletList')}
          onPressedChange={() => editor.chain().focus().toggleBulletList().run()}
          icon={List}
          label="Bullet List"
        />
        <ToolbarToggle
          pressed={editor.isActive('orderedList')}
          onPressedChange={() => editor.chain().focus().toggleOrderedList().run()}
          icon={ListOrdered}
          label="Ordered List"
        />

        <Separator orientation="vertical" className="mx-1 h-5" />

        {/* Link popover */}
        <Popover open={linkPopoverOpen} onOpenChange={setLinkPopoverOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Toggle
                  size="sm"
                  pressed={editor.isActive('link')}
                  onPressedChange={() => setLinkPopoverOpen((prev) => !prev)}
                  aria-label="Insert Link"
                >
                  <Link2 className="h-4 w-4" />
                </Toggle>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>Insert Link</TooltipContent>
          </Tooltip>
          <PopoverContent className="w-72 p-3" align="start">
            <p className="text-sm font-medium mb-2">Insert link</p>
            <div className="flex gap-2">
              <Input
                placeholder="https://example.com"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={handleLinkKeyDown}
                className="h-8 text-sm"
                autoFocus
              />
              <Button size="sm" className="h-8 shrink-0" onClick={applyLink}>
                Apply
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <Separator orientation="vertical" className="mx-1 h-5" />

        {/* Utility buttons */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0"
              onClick={onAttachClick}
              aria-label="Attach file"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Attach file</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0"
              onClick={onTemplateClick}
              aria-label="Use template"
            >
              <FileText className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Use template</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}
