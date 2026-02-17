'use client'

/**
 * Trip Insurance Section Component
 *
 * Manages insurance packages for a trip and per-traveler insurance compliance.
 * Supports compliance states: pending, has_own_insurance, declined, selected_package
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { Plus, Pencil, Trash2, Shield, CheckCircle2, XCircle, Clock, AlertTriangle } from 'lucide-react'
import {
  useInsurancePackages,
  useCreateInsurancePackage,
  useDeleteInsurancePackage,
  useTravelerInsurance,
  useCreateTravelerInsurance,
  useUpdateTravelerInsurance,
} from '@/hooks/use-insurance'
import { useTripTravelers } from '@/hooks/use-trip-travelers'
import type { TripResponseDto } from '@tailfire/shared-types/api'
import type {
  TripInsurancePackageDto,
  CreateTripInsurancePackageDto,
  TravelerInsuranceStatus,
  InsurancePolicyType,
} from '@tailfire/shared-types/api'
import { formatCurrency } from '@/lib/pricing/currency-helpers'

interface TripInsuranceProps {
  trip: TripResponseDto
}

const POLICY_TYPES: { value: InsurancePolicyType; label: string }[] = [
  { value: 'trip_cancellation', label: 'Trip Cancellation' },
  { value: 'medical', label: 'Medical' },
  { value: 'comprehensive', label: 'Comprehensive' },
  { value: 'evacuation', label: 'Evacuation' },
  { value: 'baggage', label: 'Baggage' },
  { value: 'other', label: 'Other' },
]

const STATUS_CONFIG: Record<TravelerInsuranceStatus, {
  label: string
  icon: typeof CheckCircle2
  variant: 'default' | 'secondary' | 'outline' | 'destructive'
}> = {
  pending: {
    label: 'Pending',
    icon: Clock,
    variant: 'outline',
  },
  has_own_insurance: {
    label: 'Has Own Insurance',
    icon: CheckCircle2,
    variant: 'default',
  },
  declined: {
    label: 'Declined',
    icon: XCircle,
    variant: 'destructive',
  },
  selected_package: {
    label: 'Selected Package',
    icon: Shield,
    variant: 'default',
  },
}

export function TripInsurance({ trip }: TripInsuranceProps) {
  const [showPackageDialog, setShowPackageDialog] = useState(false)
  const [editingPackage, setEditingPackage] = useState<TripInsurancePackageDto | null>(null)
  const [showTravelerDialog, setShowTravelerDialog] = useState(false)
  const [selectedTravelerId, setSelectedTravelerId] = useState<string | null>(null)

  // Data hooks
  const { data: packagesData, isLoading: loadingPackages } = useInsurancePackages(trip.id)
  const { data: travelersInsuranceData, isLoading: loadingTravelerInsurance } = useTravelerInsurance(trip.id)
  const { data: travelers = [] } = useTripTravelers(trip.id)

  // Mutation hooks
  const createPackage = useCreateInsurancePackage(trip.id)
  const deletePackage = useDeleteInsurancePackage(trip.id)

  const packages = packagesData?.packages || []
  const travelerInsuranceList = travelersInsuranceData?.travelers || []
  const summary = travelersInsuranceData?.summary

  // Package form state
  const [packageForm, setPackageForm] = useState<CreateTripInsurancePackageDto>({
    providerName: '',
    packageName: '',
    policyType: 'comprehensive',
    premiumCents: 0,
    currency: trip.currency || 'CAD',
  })

  // Traveler insurance form state
  const [travelerForm, setTravelerForm] = useState({
    status: 'pending' as TravelerInsuranceStatus,
    selectedPackageId: null as string | null,
    externalPolicyNumber: '',
    externalProviderName: '',
    declinedReason: '',
    notes: '',
  })

  const handleOpenPackageDialog = (pkg?: TripInsurancePackageDto) => {
    if (pkg) {
      setEditingPackage(pkg)
      setPackageForm({
        providerName: pkg.providerName,
        packageName: pkg.packageName,
        policyType: pkg.policyType,
        premiumCents: pkg.premiumCents,
        coverageAmountCents: pkg.coverageAmountCents ?? undefined,
        deductibleCents: pkg.deductibleCents ?? undefined,
        currency: pkg.currency,
        coverageDetails: pkg.coverageDetails ?? undefined,
        termsUrl: pkg.termsUrl ?? undefined,
      })
    } else {
      setEditingPackage(null)
      setPackageForm({
        providerName: '',
        packageName: '',
        policyType: 'comprehensive',
        premiumCents: 0,
        currency: trip.currency || 'CAD',
      })
    }
    setShowPackageDialog(true)
  }

  const handleSavePackage = async () => {
    if (editingPackage) {
      // Update not implemented in this version
    } else {
      await createPackage.mutateAsync(packageForm)
    }
    setShowPackageDialog(false)
  }

  const handleDeletePackage = async (packageId: string) => {
    if (confirm('Are you sure you want to delete this insurance package?')) {
      await deletePackage.mutateAsync(packageId)
    }
  }

  const handleOpenTravelerDialog = (travelerId: string) => {
    setSelectedTravelerId(travelerId)
    const existing = travelerInsuranceList.find(t => t.tripTravelerId === travelerId)
    if (existing) {
      setTravelerForm({
        status: existing.status,
        selectedPackageId: existing.selectedPackageId,
        externalPolicyNumber: existing.externalPolicyNumber || '',
        externalProviderName: existing.externalProviderName || '',
        declinedReason: existing.declinedReason || '',
        notes: existing.notes || '',
      })
    } else {
      setTravelerForm({
        status: 'pending',
        selectedPackageId: null,
        externalPolicyNumber: '',
        externalProviderName: '',
        declinedReason: '',
        notes: '',
      })
    }
    setShowTravelerDialog(true)
  }

  // Get traveler name from contact snapshot
  const getTravelerName = (travelerId: string): string => {
    const traveler = travelers.find(t => t.id === travelerId)
    if (!traveler) return 'Unknown Traveler'
    const snapshot = traveler.contactSnapshot
    if (snapshot?.firstName || snapshot?.lastName) {
      return `${snapshot.firstName || ''} ${snapshot.lastName || ''}`.trim()
    }
    const contact = traveler.contact
    if (contact?.firstName || contact?.lastName) {
      return `${contact.firstName || ''} ${contact.lastName || ''}`.trim()
    }
    return 'Unknown Traveler'
  }

  // Get insurance status for a traveler
  const getTravelerInsuranceStatus = (travelerId: string) => {
    const insurance = travelerInsuranceList.find(t => t.tripTravelerId === travelerId)
    return insurance?.status || 'pending'
  }

  const isLoading = loadingPackages || loadingTravelerInsurance

  return (
    <div className="space-y-6">
      {/* Insurance Packages Section */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-ash-900">Insurance Packages</h2>
            <p className="text-sm text-ash-500">Manage available insurance options for this trip</p>
          </div>
          <Button onClick={() => handleOpenPackageDialog()} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Add Package
          </Button>
        </div>

        {isLoading ? (
          <div className="text-sm text-ash-500 py-8 text-center">Loading insurance packages...</div>
        ) : packages.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-ash-200 rounded-lg">
            <Shield className="h-8 w-8 text-ash-400 mx-auto mb-2" />
            <p className="text-sm text-ash-500">No insurance packages configured</p>
            <p className="text-xs text-ash-400 mt-1">Add packages to offer travelers insurance options</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Package</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Premium</TableHead>
                <TableHead className="text-right">Coverage</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {packages.map((pkg) => (
                <TableRow key={pkg.id}>
                  <TableCell className="font-medium">{pkg.packageName}</TableCell>
                  <TableCell>{pkg.providerName}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {POLICY_TYPES.find(t => t.value === pkg.policyType)?.label || pkg.policyType}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(pkg.premiumCents, pkg.currency)}</TableCell>
                  <TableCell className="text-right">
                    {pkg.coverageAmountCents ? formatCurrency(pkg.coverageAmountCents, pkg.currency) : '–'}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleOpenPackageDialog(pkg)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeletePackage(pkg.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Traveler Insurance Status Section */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-ash-900">Traveler Insurance Status</h2>
            <p className="text-sm text-ash-500">Track insurance compliance for each traveler</p>
          </div>
          {summary && (
            <div className="flex gap-4 text-sm">
              <span className="text-ash-500">
                <span className="font-medium text-green-600">{summary.hasOwnInsurance + summary.selectedPackage}</span> covered
              </span>
              <span className="text-ash-500">
                <span className="font-medium text-yellow-600">{summary.pending}</span> pending
              </span>
              <span className="text-ash-500">
                <span className="font-medium text-red-600">{summary.declined}</span> declined
              </span>
            </div>
          )}
        </div>

        {travelers.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-ash-200 rounded-lg">
            <AlertTriangle className="h-8 w-8 text-ash-400 mx-auto mb-2" />
            <p className="text-sm text-ash-500">No travelers on this trip</p>
            <p className="text-xs text-ash-400 mt-1">Add travelers to track their insurance status</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Traveler</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Details</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {travelers.map((traveler) => {
                const status = getTravelerInsuranceStatus(traveler.id)
                const insurance = travelerInsuranceList.find(t => t.tripTravelerId === traveler.id)
                const config = STATUS_CONFIG[status]
                const Icon = config.icon

                return (
                  <TableRow key={traveler.id}>
                    <TableCell className="font-medium">{getTravelerName(traveler.id)}</TableCell>
                    <TableCell>
                      <Badge variant={config.variant} className="gap-1">
                        <Icon className="h-3 w-3" />
                        {config.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-ash-500">
                      {status === 'selected_package' && insurance?.selectedPackageId && (
                        <span>{packages.find(p => p.id === insurance.selectedPackageId)?.packageName || 'Selected Package'}</span>
                      )}
                      {status === 'has_own_insurance' && insurance?.externalProviderName && (
                        <span>{insurance.externalProviderName}</span>
                      )}
                      {status === 'declined' && insurance?.declinedReason && (
                        <span className="text-red-600">{insurance.declinedReason}</span>
                      )}
                      {status === 'pending' && <span className="italic">Awaiting response</span>}
                    </TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => handleOpenTravelerDialog(traveler.id)}>
                        Update
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Package Dialog */}
      <Dialog open={showPackageDialog} onOpenChange={setShowPackageDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingPackage ? 'Edit Insurance Package' : 'Add Insurance Package'}</DialogTitle>
            <DialogDescription>
              Configure an insurance package to offer travelers.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="providerName">Provider Name</Label>
              <Input
                id="providerName"
                value={packageForm.providerName}
                onChange={(e) => setPackageForm({ ...packageForm, providerName: e.target.value })}
                placeholder="e.g., Manulife, Blue Cross"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="packageName">Package Name</Label>
              <Input
                id="packageName"
                value={packageForm.packageName}
                onChange={(e) => setPackageForm({ ...packageForm, packageName: e.target.value })}
                placeholder="e.g., Comprehensive Travel Protection"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="policyType">Policy Type</Label>
              <Select
                value={packageForm.policyType}
                onValueChange={(value) => setPackageForm({ ...packageForm, policyType: value as InsurancePolicyType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POLICY_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="premiumCents">Premium (cents)</Label>
                <Input
                  id="premiumCents"
                  type="number"
                  value={packageForm.premiumCents}
                  onChange={(e) => setPackageForm({ ...packageForm, premiumCents: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="coverageAmountCents">Coverage (cents)</Label>
                <Input
                  id="coverageAmountCents"
                  type="number"
                  value={packageForm.coverageAmountCents || ''}
                  onChange={(e) => setPackageForm({ ...packageForm, coverageAmountCents: parseInt(e.target.value) || undefined })}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="coverageDetails">Coverage Details</Label>
              <Textarea
                id="coverageDetails"
                value={(packageForm.coverageDetails as { description?: string })?.description || ''}
                onChange={(e) => setPackageForm({
                  ...packageForm,
                  coverageDetails: e.target.value ? { description: e.target.value } : undefined
                })}
                placeholder="Describe what this package covers..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPackageDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSavePackage} disabled={createPackage.isPending}>
              {createPackage.isPending ? 'Saving...' : 'Save Package'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Traveler Insurance Dialog */}
      <TravelerInsuranceDialog
        open={showTravelerDialog}
        onOpenChange={setShowTravelerDialog}
        tripId={trip.id}
        travelerId={selectedTravelerId}
        packages={packages}
        existingInsurance={travelerInsuranceList.find(t => t.tripTravelerId === selectedTravelerId)}
        form={travelerForm}
        setForm={setTravelerForm}
        travelerName={selectedTravelerId ? getTravelerName(selectedTravelerId) : ''}
      />
    </div>
  )
}

// Separate component for traveler insurance dialog to use hooks properly
interface TravelerInsuranceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tripId: string
  travelerId: string | null
  packages: TripInsurancePackageDto[]
  existingInsurance?: {
    id: string
    status: TravelerInsuranceStatus
    selectedPackageId: string | null
    externalPolicyNumber: string | null
    externalProviderName: string | null
    declinedReason: string | null
    notes: string | null
  }
  form: {
    status: TravelerInsuranceStatus
    selectedPackageId: string | null
    externalPolicyNumber: string
    externalProviderName: string
    declinedReason: string
    notes: string
  }
  setForm: (form: any) => void
  travelerName: string
}

function TravelerInsuranceDialog({
  open,
  onOpenChange,
  tripId,
  travelerId,
  packages,
  existingInsurance,
  form,
  setForm,
  travelerName,
}: TravelerInsuranceDialogProps) {
  const createTravelerInsurance = useCreateTravelerInsurance(tripId)
  const updateTravelerInsurance = useUpdateTravelerInsurance(tripId, existingInsurance?.id || '')

  const handleSave = async () => {
    if (!travelerId) return

    const data = {
      tripTravelerId: travelerId,
      status: form.status,
      selectedPackageId: form.status === 'selected_package' ? form.selectedPackageId : null,
      externalPolicyNumber: form.status === 'has_own_insurance' ? form.externalPolicyNumber || null : null,
      externalProviderName: form.status === 'has_own_insurance' ? form.externalProviderName || null : null,
      declinedReason: form.status === 'declined' ? form.declinedReason || null : null,
      notes: form.notes || null,
    }

    if (existingInsurance) {
      await updateTravelerInsurance.mutateAsync(data)
    } else {
      await createTravelerInsurance.mutateAsync(data)
    }
    onOpenChange(false)
  }

  const isPending = createTravelerInsurance.isPending || updateTravelerInsurance.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Update Insurance Status</DialogTitle>
          <DialogDescription>
            Set the insurance status for {travelerName}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="status">Insurance Status</Label>
            <Select
              value={form.status}
              onValueChange={(value) => setForm({ ...form, status: value as TravelerInsuranceStatus })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="selected_package">Selected Package</SelectItem>
                <SelectItem value="has_own_insurance">Has Own Insurance</SelectItem>
                <SelectItem value="declined">Declined</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.status === 'selected_package' && (
            <div className="grid gap-2">
              <Label htmlFor="selectedPackage">Select Package</Label>
              <Select
                value={form.selectedPackageId || ''}
                onValueChange={(value) => setForm({ ...form, selectedPackageId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a package" />
                </SelectTrigger>
                <SelectContent>
                  {packages.map((pkg) => (
                    <SelectItem key={pkg.id} value={pkg.id}>
                      {pkg.packageName} - {formatCurrency(pkg.premiumCents, pkg.currency)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {form.status === 'has_own_insurance' && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="externalProviderName">Insurance Provider</Label>
                <Input
                  id="externalProviderName"
                  value={form.externalProviderName}
                  onChange={(e) => setForm({ ...form, externalProviderName: e.target.value })}
                  placeholder="e.g., Blue Cross"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="externalPolicyNumber">Policy Number</Label>
                <Input
                  id="externalPolicyNumber"
                  value={form.externalPolicyNumber}
                  onChange={(e) => setForm({ ...form, externalPolicyNumber: e.target.value })}
                  placeholder="Policy number"
                />
              </div>
            </>
          )}

          {form.status === 'declined' && (
            <div className="grid gap-2">
              <Label htmlFor="declinedReason">Reason for Declining</Label>
              <Textarea
                id="declinedReason"
                value={form.declinedReason}
                onChange={(e) => setForm({ ...form, declinedReason: e.target.value })}
                placeholder="Optional reason..."
                rows={2}
              />
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Additional notes..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
