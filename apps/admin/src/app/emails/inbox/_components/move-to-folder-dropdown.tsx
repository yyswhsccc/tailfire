'use client'

import { FolderInput } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useEmailFolders, useMoveEmail } from '@/hooks/use-emails'

interface MoveToFolderDropdownProps {
  accountId: string | null
  emailId: string
  currentFolder?: string
  size?: 'sm' | 'default'
  onMoved?: () => void
}

export function MoveToFolderDropdown({
  accountId,
  emailId,
  currentFolder,
  size = 'sm',
  onMoved,
}: MoveToFolderDropdownProps) {
  const { data: folders } = useEmailFolders(accountId)
  const moveEmail = useMoveEmail(accountId)

  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'
  const btnSize = size === 'sm' ? 'h-6 w-6' : 'h-8 w-8'

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={btnSize}
              onClick={(e) => e.stopPropagation()}
            >
              <FolderInput className={iconSize} />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Move to folder</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-44">
        {(folders || [])
          .filter((f) => f.path !== currentFolder)
          .map((folder) => (
            <DropdownMenuItem
              key={folder.path}
              onClick={(e) => {
                e.stopPropagation()
                moveEmail.mutate(
                  { emailId, folder: folder.path },
                  { onSuccess: onMoved },
                )
              }}
            >
              {folder.name}
            </DropdownMenuItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
