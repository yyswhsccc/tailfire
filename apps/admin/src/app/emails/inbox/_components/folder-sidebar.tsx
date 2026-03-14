'use client'

import { cn } from '@/lib/utils'
import { Inbox, Send, FileText, Trash2, FolderOpen, AlertCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { EmailFolderDto } from '@tailfire/shared-types/api'

interface FolderSidebarProps {
  folders: EmailFolderDto[]
  activeFolder: string
  onSelectFolder: (path: string) => void
}

const folderIcons: Record<string, React.ReactNode> = {
  '\\Inbox': <Inbox className="h-4 w-4" />,
  '\\Sent': <Send className="h-4 w-4" />,
  '\\Drafts': <FileText className="h-4 w-4" />,
  '\\Trash': <Trash2 className="h-4 w-4" />,
  '\\Junk': <AlertCircle className="h-4 w-4" />,
}

export function FolderSidebar({ folders, activeFolder, onSelectFolder }: FolderSidebarProps) {
  return (
    <nav className="space-y-1">
      {folders.map((folder) => {
        const isActive = folder.path === activeFolder
        const icon = folderIcons[folder.specialUse || ''] || <FolderOpen className="h-4 w-4" />

        return (
          <button
            key={folder.path}
            onClick={() => onSelectFolder(folder.path)}
            className={cn(
              'flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
            )}
          >
            <span className="flex items-center gap-2">
              {icon}
              {folder.name}
            </span>
            {folder.unseenMessages > 0 && (
              <Badge variant="secondary" className="h-5 min-w-5 px-1 text-xs">
                {folder.unseenMessages}
              </Badge>
            )}
          </button>
        )
      })}
    </nav>
  )
}
