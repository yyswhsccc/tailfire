'use client'

import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { useState } from 'react'
import { toast } from 'sonner'

export function ContactShareRequestButton({ contactId }: { contactId: string }) {
  const [loading, setLoading] = useState(false)
  const [requested, setRequested] = useState(false)

  async function handleRequest() {
    setLoading(true)
    try {
      await api.post(`/contacts/${contactId}/share-requests`)
      setRequested(true)
      toast.success('Access request sent to contact owner')
    } catch (err: any) {
      toast.error(err.message || 'Failed to request access')
    } finally {
      setLoading(false)
    }
  }

  if (requested) {
    return <Button variant="outline" size="sm" disabled>Request Sent</Button>
  }

  return (
    <Button variant="outline" size="sm" onClick={handleRequest} disabled={loading}>
      {loading ? 'Requesting...' : 'Request Access'}
    </Button>
  )
}
