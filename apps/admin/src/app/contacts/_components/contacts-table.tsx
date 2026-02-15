import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ContactResponseDto } from '@tailfire/shared-types/api'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { TernBadge } from '@/components/tern/core'
import { ContactFormDialog } from './contact-form-dialog'
import { ContactAvatar } from '@/components/contacts/contact-avatar'

interface ContactsTableProps {
  contacts: ContactResponseDto[]
  onDelete: (id: string) => void
}

export function ContactsTable({
  contacts,
  onDelete,
}: ContactsTableProps) {
  const router = useRouter()
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [editContact, setEditContact] = useState<ContactResponseDto | null>(
    null
  )

  const handleRowClick = (contactId: string) => {
    router.push(`/contacts/${contactId}`)
  }

  return (
    <>
      <div className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-tern-gray-200 hover:bg-transparent">
              <TableHead className="h-10 px-4 text-xs font-medium text-tern-gray-600">First Name</TableHead>
              <TableHead className="h-10 px-4 text-xs font-medium text-tern-gray-600">Last Name</TableHead>
              <TableHead className="h-10 px-4 text-xs font-medium text-tern-gray-600">Email</TableHead>
              <TableHead className="h-10 px-4 text-xs font-medium text-tern-gray-600">Next Trip</TableHead>
              <TableHead className="h-10 px-4 text-xs font-medium text-tern-gray-600">Birthday</TableHead>
              <TableHead className="h-10 px-4 text-xs font-medium text-tern-gray-600">Tags</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.map((contact) => (
              <TableRow
                key={contact.id}
                onClick={() => handleRowClick(contact.id)}
                className="cursor-pointer hover:bg-tern-gray-50/50 transition-colors border-b border-tern-gray-100"
              >
                <TableCell className="h-12 px-4 py-2">
                  <div className="flex items-center gap-2">
                    <ContactAvatar
                      firstName={contact.firstName}
                      lastName={contact.lastName}
                      // avatarUrl={contact.avatarUrl} // TODO: Add avatarUrl to ContactResponseDto
                      size="sm"
                    />
                    <span className="text-sm text-tern-gray-900">{contact.firstName || '-'}</span>
                  </div>
                </TableCell>
                <TableCell className="h-12 px-4 py-2 text-sm text-tern-gray-900">{contact.lastName || '-'}</TableCell>
                <TableCell className="h-12 px-4 py-2 text-sm text-tern-gray-700">{contact.email || '-'}</TableCell>
                <TableCell className="h-12 px-4 py-2 text-sm text-tern-gray-700">-</TableCell>
                <TableCell className="h-12 px-4 py-2 text-sm text-tern-gray-700">-</TableCell>
                <TableCell className="h-12 px-4 py-2">
                  {contact.contactType === 'lead' ? (
                    <TernBadge variant="inbound">VIP</TernBadge>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              contact and all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) {
                  onDelete(deleteId)
                  setDeleteId(null)
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Dialog */}
      <ContactFormDialog
        open={!!editContact}
        onOpenChange={(open) => !open && setEditContact(null)}
        mode="edit"
        contact={editContact || undefined}
      />
    </>
  )
}
