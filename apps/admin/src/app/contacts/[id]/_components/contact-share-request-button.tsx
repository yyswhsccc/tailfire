'use client'

import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { useState } from 'react'
import { toast } from 'sonner'

interface ContactShareRequestButtonProps {
  contactId: string
  initialStatus?: 'none' | 'pending' | 'approved' | 'denied' | null
}

export function ContactShareRequestButton({
  contactId,
  initialStatus,
}: ContactShareRequestButtonProps) {
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(initialStatus || 'none')

  async function handleRequest() {
    setLoading(true)
    try {
      await api.post(`/contacts/${contactId}/share-requests`)
      setStatus('pending')
      toast.success('Access request sent to contact owner')
    } catch (err: any) {
      toast.error(err.message || 'Failed to request access')
    } finally {
      setLoading(false)
    }
  }

  if (status === 'pending') {
    return (
      <Button variant="outline" size="sm" disabled className="text-amber-600 border-amber-300">
        Access Requested
      </Button>
    )
  }

  if (status === 'approved') {
    return null
  }

  if (status === 'denied') {
    return (
      <Button variant="outline" size="sm" onClick={handleRequest} disabled={loading}>
        {loading ? 'Requesting...' : 'Request Again'}
      </Button>
    )
  }

  return (
    <Button variant="outline" size="sm" onClick={handleRequest} disabled={loading}>
      {loading ? 'Requesting...' : 'Request Access'}
    </Button>
  )
}
