'use client'

/**
 * Package Form Component
 *
 * Form for creating and editing Package activities. Packages are containers
 * that group multiple activities with unified pricing/booking.
 *
 * Key concepts:
 * - Package = Activity Type (container)
 * - Booking = Status (not an entity)
 * - Uses same reusable components as other activity forms
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useSaveStatus } from '@/hooks/use-save-status'
import { Package, FileText, DollarSign, Loader2, Check, Link as LinkIcon, Unlink } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { PackageResponseDto, PackageLinkedActivityDto } from '@tailfire/shared-types/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import {
  useBooking,
  useCreateBooking,
  useUpdateBooking,
  useBookingLinkedActivities,
  useLinkActivities,
  useUnlinkActivities,
  useUnlinkedActivities,
} from '@/hooks/use-bookings'
import { PricingSection, CommissionSection, BookingDetailsSection, type SupplierDefaults } from '@/components/pricing'
import { useMyProfile } from '@/hooks/use-user-profile'
import { DocumentUploader } from '@/components/document-uploader'
import { SupplierCombobox } from '@/components/suppliers/supplier-combobox'
import { PaymentScheduleSection } from './payment-schedule-section'
import type { PricingData, PricingBreakdownItem } from '@/lib/pricing'
import {
  packageFormSchema,
  toPackageDefaults,
  toPackageApiPayload,
  toPackageUpdatePayload,
  type PackageFormData,
} from '@/lib/validation/package-validation'
import { scrollToFirstError } from '@/lib/validation/utils'

/** Tab values for the package form - exported for use in page component */
export type PackageTab = 'general' | 'documents' | 'booking'

interface PackageFormProps {
  tripId: string
  /** Existing package ID for editing */
  packageId?: string | null
  /** Package data if already fetched */
  packageData?: PackageResponseDto | null
  /** Default tab to show - defaults to 'general' for new packages */
  defaultTab?: PackageTab
  onSuccess?: () => void
  onCancel?: () => void
}

const STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'completed', label: 'Completed' },
] as const

const PAYMENT_STATUSES = [
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'deposit_paid', label: 'Deposit Paid' },
  { value: 'paid', label: 'Paid' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'partially_refunded', label: 'Partially Refunded' },
] as const

export function PackageForm({
  tripId,
  packageId,
  packageData: initialPackageData,
  defaultTab = 'general',
  onSuccess,
  onCancel,
}: PackageFormProps) {
  const { toast } = useToast()
  const isEditing = !!packageId

  const [activeTab, setActiveTab] = useState<PackageTab>(defaultTab)
  const [currentPackageId, setCurrentPackageId] = useState<string | null>(packageId || null)
  const [activityPricingId, setActivityPricingId] = useState<string | null>(null)

  // User profile for commission split settings
  const { data: userProfile } = useMyProfile()

  // Track supplier commission rate from selected supplier
  const [supplierCommissionRate, setSupplierCommissionRate] = useState<number | null>(null)

  // Pricing breakdown for per-person pricing
  const [pricingBreakdown, setPricingBreakdown] = useState<PricingBreakdownItem[] | null>(
    (initialPackageData as any)?.pricingBreakdownJson ?? null
  )

  // Safety net ref to prevent duplicate creation race condition
  const createInProgressRef = useRef(false)

  // Fetch package data if not provided
  const { data: fetchedPackageData } = useBooking(packageId || null, {
    enabled: !!packageId && !initialPackageData,
  })
  const packageData = initialPackageData || fetchedPackageData

  // Linked activities management
  const { data: linkedActivities } = useBookingLinkedActivities(currentPackageId)
  const { data: unlinkedActivitiesData } = useUnlinkedActivities(tripId)
  const linkActivities = useLinkActivities()
  const unlinkActivities = useUnlinkActivities()

  // Auto-save state
  const {
    saveStatus: autoSaveStatus,
    setSaveStatus: setAutoSaveStatus,
    lastSavedAt,
    setLastSavedAt,
  } = useSaveStatus({
    activityId: packageId,
    updatedAt: packageData?.updatedAt,
  })
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Initialize react-hook-form with Zod validation
  const form = useForm<PackageFormData>({
    resolver: zodResolver(packageFormSchema),
    defaultValues: toPackageDefaults(null),
    mode: 'onSubmit',
  })

  const {
    control,
    register,
    setValue,
    getValues,
    reset,
    formState: { errors, isDirty, isValid, isValidating, isSubmitting },
  } = form

  // useWatch for form fields
  const statusValue = useWatch({ control, name: 'status' })
  const paymentStatusValue = useWatch({ control, name: 'paymentStatus' })
  const nameValue = useWatch({ control, name: 'name' })
  const supplierNameValue = useWatch({ control, name: 'supplierName' })

  // Mutations
  const createBooking = useCreateBooking()
  const updateBooking = useUpdateBooking()

  // Ref to track loaded package ID
  const packageIdRef = useRef<string | null>(null)

  // Smart re-seeding when package data changes
  useEffect(() => {
    let cancelled = false

    if (packageData && packageData.id !== packageIdRef.current) {
      packageIdRef.current = packageData.id
      setCurrentPackageId(packageData.id)
      setActivityPricingId(packageData.activityPricingId || null)

      const defaults = toPackageDefaults(packageData)

      queueMicrotask(() => {
        if (!cancelled) {
          reset(defaults)
        }
      })
    }

    return () => {
      cancelled = true
    }
  }, [packageData, reset])

  // Watch all form values for auto-save
  const watchedValues = useWatch({ control })
  // Create stable string representation for dependency comparison
  // useWatch returns new object reference every render - JSON.stringify creates stable primitive
  const watchedValuesKey = useMemo(() => JSON.stringify(watchedValues), [watchedValues])

  // Auto-save effect
  useEffect(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current)
    }

    if (!isDirty || !isValid || isValidating || isSubmitting || createBooking.isPending || updateBooking.isPending) {
      return
    }

    autoSaveTimeoutRef.current = setTimeout(async () => {
      // SAFETY NET: Check refs to prevent duplicate creation race condition
      if (createInProgressRef.current) {
        return
      }

      setAutoSaveStatus('saving')
      try {
        const formData = getValues()

        let response
        // Use ref for immediate check (state may be stale)
        if (currentPackageId || packageIdRef.current) {
          const id = currentPackageId || packageIdRef.current!
          const updatePayload = { ...toPackageUpdatePayload(formData), pricingBreakdownJson: pricingBreakdown }
          response = await updateBooking.mutateAsync({ id, data: updatePayload })
        } else {
          // Mark create as in progress before API call
          createInProgressRef.current = true
          try {
            const createPayload = { ...toPackageApiPayload(formData, tripId), pricingBreakdownJson: pricingBreakdown }
            response = await createBooking.mutateAsync(createPayload)
          } finally {
            createInProgressRef.current = false
          }
        }

        if (response.id && !packageIdRef.current) {
          // Update ref immediately (synchronous) before React state update
          packageIdRef.current = response.id
          setCurrentPackageId(response.id)
        }

        // Update activityPricingId from response (created/returned by API)
        if (response.activityPricingId && response.activityPricingId !== activityPricingId) {
          setActivityPricingId(response.activityPricingId)
        }

        setAutoSaveStatus('saved')
        setLastSavedAt(new Date())
      } catch (err: any) {
        setAutoSaveStatus('error')
        toast({
          title: 'Auto-save failed',
          description: err.message,
          variant: 'destructive',
        })
      }
    }, 1000)

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
      }
    }
  }, [
    watchedValuesKey, // Use stable string instead of object reference
    isDirty,
    isValid,
    isValidating,
    isSubmitting,
    currentPackageId,
    activityPricingId,
    tripId,
    getValues,
    pricingBreakdown,
    createBooking,
    updateBooking,
    toast,
    setAutoSaveStatus,
    setLastSavedAt,
  ])

  // Force save handler
  const forceSave = useCallback(async () => {
    if (!isValid) {
      scrollToFirstError(errors)
      toast({
        title: 'Validation Error',
        description: 'Please fix the errors before saving.',
        variant: 'destructive',
      })
      return
    }

    setAutoSaveStatus('saving')
    try {
      const formData = getValues()

      let response
      if (currentPackageId) {
        const updatePayload = { ...toPackageUpdatePayload(formData), pricingBreakdownJson: pricingBreakdown }
        response = await updateBooking.mutateAsync({ id: currentPackageId, data: updatePayload })
      } else {
        const createPayload = { ...toPackageApiPayload(formData, tripId), pricingBreakdownJson: pricingBreakdown }
        response = await createBooking.mutateAsync(createPayload)
      }

      if (!currentPackageId && response.id) {
        setCurrentPackageId(response.id)
      }

      // Update activityPricingId from response (created/returned by API)
      if (response.activityPricingId && response.activityPricingId !== activityPricingId) {
        setActivityPricingId(response.activityPricingId)
      }

      setAutoSaveStatus('saved')
      setLastSavedAt(new Date())

      toast({
        title: 'Package saved',
        description: 'Your changes have been saved.',
      })

      onSuccess?.()
    } catch (err: any) {
      setAutoSaveStatus('error')
      toast({
        title: 'Save failed',
        description: err.message,
        variant: 'destructive',
      })
    }
  }, [
    isValid,
    errors,
    currentPackageId,
    activityPricingId,
    tripId,
    getValues,
    pricingBreakdown,
    createBooking,
    updateBooking,
    toast,
    onSuccess,
    setAutoSaveStatus,
    setLastSavedAt,
  ])

  // Link activity to package
  const handleLinkActivity = async (activityId: string) => {
    if (!currentPackageId) {
      toast({
        title: 'Save package first',
        description: 'Please save the package before linking activities.',
        variant: 'destructive',
      })
      return
    }

    try {
      await linkActivities.mutateAsync({
        bookingId: currentPackageId,
        activityIds: [activityId],
      })
      toast({
        title: 'Activity linked',
        description: 'The activity has been added to this package.',
      })
    } catch (err: any) {
      toast({
        title: 'Failed to link activity',
        description: err.message,
        variant: 'destructive',
      })
    }
  }

  // Unlink activity from package
  const handleUnlinkActivity = async (activityId: string) => {
    if (!currentPackageId) return

    try {
      await unlinkActivities.mutateAsync({
        bookingId: currentPackageId,
        activityIds: [activityId],
      })
      toast({
        title: 'Activity unlinked',
        description: 'The activity has been removed from this package.',
      })
    } catch (err: any) {
      toast({
        title: 'Failed to unlink activity',
        description: err.message,
        variant: 'destructive',
      })
    }
  }

  // Build pricingData for PricingSection components
  const pricingData: PricingData = useMemo(() => {
    void watchedValues
    return {
      invoiceType: 'individual_item', // Package is always individual (it's the container)
      pricingType: (getValues('pricingType') || 'flat_rate') as PricingData['pricingType'],
      totalPriceCents: getValues('totalPriceCents') || 0,
      taxesAndFeesCents: getValues('taxesCents') || 0,
      currency: getValues('currency') || 'CAD',
      confirmationNumber: getValues('confirmationNumber') || '',
      commissionTotalCents: getValues('commissionCents') || 0,
      commissionSplitPercentage: getValues('commissionPercentage') || 0,
      commissionExpectedDate: null,
      termsAndConditions: getValues('termsAndConditions') || '',
      cancellationPolicy: getValues('cancellationPolicy') || '',
      supplier: getValues('supplierName') || '',
      pricingBreakdown,
    }
  }, [watchedValues, getValues, pricingBreakdown])

  // Handle pricing updates from child components
  const handlePricingUpdate = useCallback((updates: Partial<PricingData>) => {
    if ('pricingBreakdown' in updates) {
      setPricingBreakdown(updates.pricingBreakdown ?? null)
    }
    Object.entries(updates).forEach(([key, value]) => {
      if (key === 'pricingBreakdown') return
      // Map PricingData keys to PackageFormData keys
      const keyMap: Record<string, keyof PackageFormData> = {
        totalPriceCents: 'totalPriceCents',
        taxesAndFeesCents: 'taxesCents',
        currency: 'currency',
        pricingType: 'pricingType',
        confirmationNumber: 'confirmationNumber',
        commissionTotalCents: 'commissionCents',
        commissionSplitPercentage: 'commissionPercentage',
        termsAndConditions: 'termsAndConditions',
        cancellationPolicy: 'cancellationPolicy',
        supplier: 'supplierName',
      }

      const formKey = keyMap[key]
      if (formKey) {
        setValue(formKey, value as any, { shouldDirty: true, shouldValidate: true })
      }
    })
  }, [setValue])

  // Handler for when supplier defaults are applied from SupplierCombobox
  const handleSupplierDefaultsApplied = useCallback((defaults: SupplierDefaults) => {
    setSupplierCommissionRate(defaults.commissionRate)
  }, [])

  // Travelers for per-person pricing breakdown
  // Package forms don't have direct access to trip travelers, but we pass the prop for consistency
  const travelers: Array<{ id: string; name: string }> = []

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        {/* Package Icon */}
        <div className="flex-shrink-0 w-16 h-16 bg-teal-600 rounded-lg flex items-center justify-center">
          <Package className="h-8 w-8 text-white" />
        </div>

        {/* Title and Meta */}
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold text-gray-900 mb-3">
            {nameValue || 'New Package'}
          </h1>

          <div className="flex items-center gap-6 flex-wrap">
            {/* Status */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Status</span>
              <Select
                value={statusValue}
                onValueChange={(v) => setValue('status', v as PackageFormData['status'], { shouldDirty: true })}
              >
                <SelectTrigger className="w-32 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Payment Status */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Payment</span>
              <Select
                value={paymentStatusValue}
                onValueChange={(v) => setValue('paymentStatus', v as PackageFormData['paymentStatus'], { shouldDirty: true })}
              >
                <SelectTrigger className="w-36 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Auto-save Status */}
            <div className="flex items-center gap-2 text-sm text-gray-500">
              {autoSaveStatus === 'saving' && (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Saving...</span>
                </>
              )}
              {autoSaveStatus === 'saved' && lastSavedAt && (
                <>
                  <Check className="h-4 w-4 text-green-500" />
                  <span>Saved {formatDistanceToNow(lastSavedAt, { addSuffix: true })}</span>
                </>
              )}
              {autoSaveStatus === 'error' && (
                <span className="text-red-500">Save failed</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as PackageTab)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="general" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            General Info
          </TabsTrigger>
          <TabsTrigger value="documents" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Documents
          </TabsTrigger>
          <TabsTrigger value="booking" className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Booking & Pricing
          </TabsTrigger>
        </TabsList>

        {/* General Info Tab */}
        <TabsContent value="general" className="mt-6 space-y-6">
          {/* Basic Info Card */}
          <Card>
            <CardHeader>
              <CardTitle>Package Details</CardTitle>
              <CardDescription>Basic information about this package</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Package Name */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Package Name *</label>
                <Input
                  {...register('name')}
                  placeholder="e.g., 5 Night Bahamas Getaway Cruise"
                />
                {errors.name && (
                  <p className="text-sm text-red-500">{errors.name.message}</p>
                )}
              </div>

              {/* Description */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Description</label>
                <Textarea
                  {...register('description')}
                  placeholder="Describe what's included in this package..."
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Confirmation Number */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Confirmation Number</label>
                  <Input
                    {...register('confirmationNumber')}
                    placeholder="e.g., ABC123"
                  />
                </div>

                {/* Group Booking Number */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Group Booking Number</label>
                  <Input
                    {...register('groupBookingNumber')}
                    placeholder="e.g., GRP-456"
                  />
                </div>
              </div>

              {/* Supplier */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Supplier</label>
                <SupplierCombobox
                  value={supplierNameValue}
                  onValueChange={(name) => {
                    setValue('supplierName', name, { shouldDirty: true })
                  }}
                  onSupplierSelect={(supplier) => {
                    if (supplier?.defaultCommissionRate) {
                      setSupplierCommissionRate(Number(supplier.defaultCommissionRate))
                    }
                  }}
                  placeholder="Search suppliers..."
                  allowCreate
                />
              </div>
            </CardContent>
          </Card>

          {/* Linked Activities Card */}
          <Card>
            <CardHeader>
              <CardTitle>Linked Activities</CardTitle>
              <CardDescription>
                Activities included in this package. Their pricing is managed at the package level.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!currentPackageId ? (
                <p className="text-sm text-gray-500">
                  Save the package first to link activities.
                </p>
              ) : (
                <div className="space-y-4">
                  {/* Linked Activities List */}
                  {linkedActivities && linkedActivities.length > 0 ? (
                    <div className="space-y-2">
                      {linkedActivities.map((activity: PackageLinkedActivityDto) => (
                        <div
                          key={activity.id}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <Badge variant="outline">{activity.activityType}</Badge>
                            <span className="font-medium">{activity.name}</span>
                            {activity.dayDate && (
                              <span className="text-sm text-gray-500">
                                Day {activity.dayNumber}
                              </span>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleUnlinkActivity(activity.id)}
                            disabled={unlinkActivities.isPending}
                          >
                            <Unlink className="h-4 w-4 mr-1" />
                            Unlink
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No activities linked to this package yet.</p>
                  )}

                  <Separator />

                  {/* Available Activities to Link */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Available Activities</h4>
                    {unlinkedActivitiesData?.activities && unlinkedActivitiesData.activities.length > 0 ? (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {unlinkedActivitiesData.activities.map((activity) => (
                          <div
                            key={activity.id}
                            className="flex items-center justify-between p-2 border rounded-lg hover:bg-gray-50"
                          >
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">
                                {activity.activityType}
                              </Badge>
                              <span className="text-sm">{activity.name}</span>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleLinkActivity(activity.id)}
                              disabled={linkActivities.isPending}
                            >
                              <LinkIcon className="h-4 w-4 mr-1" />
                              Link
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No unlinked activities available.</p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="mt-6">
          {currentPackageId ? (
            <DocumentUploader componentId={currentPackageId} />
          ) : (
            <div className="bg-gray-50 rounded-lg p-8 text-center">
              <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-700">Documents</h3>
              <p className="text-sm mt-1 text-gray-500">
                Documents will be available after the package is created.
              </p>
            </div>
          )}
        </TabsContent>

        {/* Booking & Pricing Tab */}
        <TabsContent value="booking" className="mt-6 space-y-6">
          {/* Pricing Section */}
          <PricingSection
            pricingData={pricingData}
            onUpdate={handlePricingUpdate}
            errors={{}}
            allowedPricingTypes={['flat_rate', 'per_person']}
            // Package doesn't link to other packages - it IS the package
            packageId={null}
            packages={[]}
            tripId={tripId}
            travelers={travelers}
          />

          <Separator />

          {/* Payment Schedule */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Credit Card Authorization & Payment</h3>
            <PaymentScheduleSection
              activityPricingId={activityPricingId}
              totalPriceCents={pricingData.totalPriceCents}
              currency={pricingData.currency}
              tripId={tripId}
            />
          </div>

          <Separator />

          {/* Booking Details */}
          <BookingDetailsSection
            pricingData={pricingData}
            onUpdate={handlePricingUpdate}
            onSupplierDefaultsApplied={handleSupplierDefaultsApplied}
          />

          <Separator />

          {/* Commission Section */}
          <CommissionSection
            pricingData={pricingData}
            onUpdate={handlePricingUpdate}
            errors={{}}
            supplierCommissionRate={supplierCommissionRate}
            userSplitValue={userProfile?.commissionSettings?.splitValue ?? null}
            userSplitType={userProfile?.commissionSettings?.splitType ?? null}
          />
        </TabsContent>
      </Tabs>

      {/* Form Actions */}
      <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-gray-200">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={forceSave} className="bg-teal-600 hover:bg-teal-700">
          {isEditing ? 'Save Changes' : 'Create Package'}
        </Button>
      </div>
    </div>
  )
}
