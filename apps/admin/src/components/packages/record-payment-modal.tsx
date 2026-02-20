'use client'

/**
 * Record Payment Modal
 *
 * Modal dialog for recording payment transactions against expected payment items.
 * Supports payment, refund, and adjustment transaction types.
 * Includes "Paid By" contact picker with trip travelers + search + new contact.
 */

import { useState, useMemo, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CalendarIcon, Search, UserPlus } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { useCreatePaymentTransaction } from '@/hooks/use-payment-schedules'
import { useTripTravelers, useCreateTripTraveler } from '@/hooks/use-trip-travelers'
import { useContacts, useCreateContact } from '@/hooks/use-contacts'
import { dollarsToCents, centsToDollars } from '@/lib/payment-calculations'
import { formatCurrency } from '@/lib/pricing/currency-helpers'
import type { PaymentTransactionType, PaymentMethod, ExpectedPaymentItemDto } from '@tailfire/shared-types/api'

interface RecordPaymentModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  expectedPaymentItem: ExpectedPaymentItemDto
  activityPricingId: string
  tripId: string
  currency: string
}

export function RecordPaymentModal({
  open,
  onOpenChange,
  expectedPaymentItem,
  activityPricingId,
  tripId,
  currency,
}: RecordPaymentModalProps) {
  const createTransaction = useCreatePaymentTransaction(activityPricingId, tripId)
  const { data: travelers = [] } = useTripTravelers(tripId)
  const createTripTraveler = useCreateTripTraveler(tripId)
  const createContact = useCreateContact()

  // Contact search state
  const [contactSearch, setContactSearch] = useState('')
  const [showContactSearch, setShowContactSearch] = useState(false)
  const [showNewContactForm, setShowNewContactForm] = useState(false)
  const [newFirstName, setNewFirstName] = useState('')
  const [newLastName, setNewLastName] = useState('')
  const [newEmail, setNewEmail] = useState('')

  // Search contacts when user types
  const { data: searchResults } = useContacts(
    contactSearch.length >= 2 ? { search: contactSearch, limit: 10 } : {}
  )

  // Build traveler contact options
  const travelerOptions = useMemo(() => {
    const options: { id: string; name: string; isPrimary: boolean }[] = []
    const seen = new Set<string>()

    for (const traveler of travelers) {
      if (!traveler.contactId || seen.has(traveler.contactId)) continue
      seen.add(traveler.contactId)
      const name = traveler.contact
        ? `${traveler.contact.firstName || ''} ${traveler.contact.lastName || ''}`.trim()
        : `Traveler ${traveler.sequenceOrder}`
      options.push({
        id: traveler.contactId,
        name: name || 'Unknown',
        isPrimary: traveler.isPrimaryTraveler ?? false,
      })
    }

    return options
  }, [travelers])

  // Default contactId to primary traveler
  const defaultContactId = useMemo(() => {
    const primary = travelerOptions.find(o => o.isPrimary)
    return primary?.id || travelerOptions[0]?.id || null
  }, [travelerOptions])

  // Form state
  const [transactionType, setTransactionType] = useState<PaymentTransactionType>('payment')
  const [amountDollars, setAmountDollars] = useState<number>(
    parseFloat(centsToDollars(expectedPaymentItem.expectedAmountCents - (expectedPaymentItem.paidAmountCents || 0)))
  )
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>('credit_card')
  const [referenceNumber, setReferenceNumber] = useState<string>('')
  const [transactionDate, setTransactionDate] = useState<Date>(new Date())
  const [notes, setNotes] = useState<string>('')
  const [contactId, setContactId] = useState<string | null>(null)

  // Set default contact when travelers load
  useEffect(() => {
    if (defaultContactId && !contactId) {
      setContactId(defaultContactId)
    }
  }, [defaultContactId, contactId])

  const remainingAmount = expectedPaymentItem.expectedAmountCents - (expectedPaymentItem.paidAmountCents || 0)

  const handleSelectSearchContact = async (selectedContactId: string) => {
    // Check if contact is already a traveler
    const isTraveler = travelers.some(t => t.contactId === selectedContactId)
    if (!isTraveler) {
      // Auto-add as trip traveler
      try {
        await createTripTraveler.mutateAsync({
          contactId: selectedContactId,
          role: 'limited_access',
        })
      } catch {
        // Contact may already be a traveler (race condition) - continue
      }
    }
    setContactId(selectedContactId)
    setShowContactSearch(false)
    setContactSearch('')
  }

  const handleCreateNewContact = async () => {
    if (!newFirstName.trim() || !newLastName.trim()) return

    try {
      const newContact = await createContact.mutateAsync({
        firstName: newFirstName.trim(),
        lastName: newLastName.trim(),
        email: newEmail.trim() || undefined,
      })

      // Add as trip traveler
      try {
        await createTripTraveler.mutateAsync({
          contactId: newContact.id,
          role: 'limited_access',
        })
      } catch {
        // May already be a traveler
      }

      setContactId(newContact.id)
      setShowNewContactForm(false)
      setNewFirstName('')
      setNewLastName('')
      setNewEmail('')
    } catch {
      // Error handled by useCreateContact hook toast
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!contactId) return

    createTransaction.mutate(
      {
        expectedPaymentItemId: expectedPaymentItem.id,
        transactionType,
        amountCents: dollarsToCents(amountDollars),
        currency,
        paymentMethod: paymentMethod || undefined,
        referenceNumber: referenceNumber || undefined,
        transactionDate: transactionDate.toISOString(),
        notes: notes || undefined,
        contactId,
      },
      {
        onSuccess: () => {
          onOpenChange(false)
          // Reset form
          setTransactionType('payment')
          setAmountDollars(0)
          setPaymentMethod('credit_card')
          setReferenceNumber('')
          setNotes('')
          setContactId(null)
          setShowContactSearch(false)
          setShowNewContactForm(false)
        },
      }
    )
  }

  // Get the display name for the selected contact
  const selectedContactName = useMemo(() => {
    const traveler = travelerOptions.find(o => o.id === contactId)
    if (traveler) return traveler.name
    // Check search results
    const searchContact = searchResults?.data?.find(c => c.id === contactId)
    if (searchContact) return `${searchContact.firstName || ''} ${searchContact.lastName || ''}`.trim()
    return null
  }, [contactId, travelerOptions, searchResults])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Record a payment for &quot;{expectedPaymentItem.paymentName}&quot;.
              Remaining balance: {formatCurrency(remainingAmount, currency)}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Paid By (Contact Picker) */}
            <div className="grid gap-2">
              <Label>Paid By <span className="text-destructive">*</span></Label>

              {!showContactSearch && !showNewContactForm ? (
                <Select
                  value={contactId || ''}
                  onValueChange={(value) => {
                    if (value === '__search__') {
                      setShowContactSearch(true)
                      return
                    }
                    if (value === '__new__') {
                      setShowNewContactForm(true)
                      return
                    }
                    setContactId(value)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select who paid">
                      {selectedContactName || 'Select who paid'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Trip Travelers</SelectLabel>
                      {travelerOptions.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.name}{option.isPrimary ? ' (primary)' : ''}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectItem value="__search__">
                        <span className="flex items-center gap-1.5">
                          <Search className="h-3.5 w-3.5" />
                          Search all contacts...
                        </span>
                      </SelectItem>
                      <SelectItem value="__new__">
                        <span className="flex items-center gap-1.5">
                          <UserPlus className="h-3.5 w-3.5" />
                          New Contact...
                        </span>
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              ) : showContactSearch ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Search contacts by name..."
                      value={contactSearch}
                      onChange={(e) => setContactSearch(e.target.value)}
                      autoFocus
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowContactSearch(false)
                        setContactSearch('')
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                  {contactSearch.length >= 2 && searchResults?.data && (
                    <div className="max-h-40 overflow-y-auto border rounded-md">
                      {searchResults.data.length === 0 ? (
                        <p className="p-2 text-sm text-muted-foreground">No contacts found</p>
                      ) : (
                        searchResults.data.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-accent cursor-pointer"
                            onClick={() => handleSelectSearchContact(c.id)}
                          >
                            {c.firstName} {c.lastName}
                            {c.email && <span className="text-muted-foreground ml-2">{c.email}</span>}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* New Contact Form */
                <div className="space-y-2 border rounded-md p-3">
                  <p className="text-sm font-medium">New Contact</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="First name *"
                      value={newFirstName}
                      onChange={(e) => setNewFirstName(e.target.value)}
                      autoFocus
                    />
                    <Input
                      placeholder="Last name *"
                      value={newLastName}
                      onChange={(e) => setNewLastName(e.target.value)}
                    />
                  </div>
                  <Input
                    placeholder="Email (optional)"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                  />
                  <div className="flex gap-2 justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowNewContactForm(false)
                        setNewFirstName('')
                        setNewLastName('')
                        setNewEmail('')
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleCreateNewContact}
                      disabled={!newFirstName.trim() || !newLastName.trim() || createContact.isPending}
                    >
                      {createContact.isPending ? 'Creating...' : 'Create & Select'}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Transaction Type */}
            <div className="grid gap-2">
              <Label htmlFor="transactionType">Transaction Type</Label>
              <Select
                value={transactionType}
                onValueChange={(value) => setTransactionType(value as PaymentTransactionType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="payment">Payment</SelectItem>
                  <SelectItem value="refund">Refund</SelectItem>
                  <SelectItem value="adjustment">Adjustment</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Amount */}
            <div className="grid gap-2">
              <Label htmlFor="amount">Amount ({currency})</Label>
              <Input
                id="amount"
                type="number"
                min={0}
                step="0.01"
                value={amountDollars}
                onChange={(e) => setAmountDollars(parseFloat(e.target.value) || 0)}
                className="text-right"
              />
            </div>

            {/* Payment Method */}
            <div className="grid gap-2">
              <Label htmlFor="paymentMethod">Payment Method</Label>
              <Select
                value={paymentMethod || ''}
                onValueChange={(value) => setPaymentMethod(value as PaymentMethod)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="credit_card">Credit Card</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="check">Check</SelectItem>
                  <SelectItem value="stripe">Stripe</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Reference Number */}
            <div className="grid gap-2">
              <Label htmlFor="referenceNumber">Reference Number (Optional)</Label>
              <Input
                id="referenceNumber"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="e.g., confirmation #, check #"
              />
            </div>

            {/* Transaction Date */}
            <div className="grid gap-2">
              <Label>Transaction Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'justify-start text-left font-normal',
                      !transactionDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {transactionDate ? format(transactionDate, 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={transactionDate}
                    onSelect={(date) => date && setTransactionDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Notes */}
            <div className="grid gap-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any additional notes..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createTransaction.isPending || amountDollars <= 0 || !contactId}>
              {createTransaction.isPending ? 'Recording...' : 'Record Payment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
