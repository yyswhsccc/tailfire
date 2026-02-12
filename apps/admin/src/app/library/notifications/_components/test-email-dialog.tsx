'use client'

import { useState } from 'react'
import { Send, Mail, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
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
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useSendTestEmail } from '@/hooks/use-email-templates'
import { toast } from '@/hooks/use-toast'
import type { EmailTemplateResponse } from '@tailfire/shared-types'

interface TestEmailDialogProps {
  template: EmailTemplateResponse | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Test Email Dialog
 *
 * Confirmation dialog for sending a test email with sample data.
 * Sends to the current user's email address.
 */
export function TestEmailDialog({ template, open, onOpenChange }: TestEmailDialogProps) {
  const [sendSuccess, setSendSuccess] = useState(false)
  const sendTestMutation = useSendTestEmail()

  const handleSendTest = async () => {
    if (!template) return

    try {
      await sendTestMutation.mutateAsync({ slug: template.slug })
      setSendSuccess(true)
      toast({
        title: 'Test email sent successfully',
        description: 'Check your inbox for the test email.',
      })
      // Close dialog after a brief delay to show success
      setTimeout(() => {
        onOpenChange(false)
        setSendSuccess(false)
      }, 1500)
    } catch (error) {
      toast({
        title: 'Failed to send test email',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive',
      })
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setSendSuccess(false)
    }
    onOpenChange(newOpen)
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Send Test Email
          </AlertDialogTitle>
          <AlertDialogDescription>
            Send a test email using this template with sample data.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-4 space-y-4">
          {sendSuccess ? (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                Test email sent successfully! Check your inbox.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="space-y-1">
                  <div className="font-medium">{template?.name}</div>
                  <div className="text-sm text-muted-foreground">
                    <code className="text-xs bg-background px-1.5 py-0.5 rounded">
                      {template?.slug}
                    </code>
                  </div>
                </div>
              </div>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  The email will be sent to your account email address with sample data.
                  The subject will be prefixed with <strong>[TEST]</strong> to distinguish it from
                  real emails.
                </AlertDescription>
              </Alert>
            </>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={sendTestMutation.isPending}>Cancel</AlertDialogCancel>
          {!sendSuccess && (
            <AlertDialogAction
              onClick={handleSendTest}
              disabled={sendTestMutation.isPending || !template}
            >
              {sendTestMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Send Test Email
                </>
              )}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
