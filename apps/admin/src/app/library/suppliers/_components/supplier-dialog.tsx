'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useCreateSupplier, useUpdateSupplier } from '@/hooks/use-suppliers'
import { SUPPLIER_TYPES, type SupplierDto, type SupplierContactInfo } from '@tailfire/shared-types/api'

interface SupplierFormData {
  name: string
  legalName: string
  supplierType: string
  email: string
  phone: string
  website: string
  address: string
  defaultCommissionRate: string
  // PR-2 commit 7: commission-tax defaults
  defaultCommissionTaxType: string
  defaultCommissionTaxRatePercent: string
  commissionIncludesTax: boolean
  isActive: boolean
  isPreferred: boolean
  notes: string
  defaultTermsAndConditions: string
  defaultCancellationPolicy: string
}

interface SupplierDialogProps {
  supplier: SupplierDto | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SupplierDialog({ supplier, open, onOpenChange }: SupplierDialogProps) {
  const isEditing = !!supplier

  const createMutation = useCreateSupplier()
  const updateMutation = useUpdateSupplier()

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<SupplierFormData>({
    defaultValues: {
      name: '',
      legalName: '',
      supplierType: '',
      email: '',
      phone: '',
      website: '',
      address: '',
      defaultCommissionRate: '',
      defaultCommissionTaxType: '',
      defaultCommissionTaxRatePercent: '',
      commissionIncludesTax: false,
      isActive: true,
      isPreferred: false,
      notes: '',
      defaultTermsAndConditions: '',
      defaultCancellationPolicy: '',
    },
  })

  const supplierType = watch('supplierType')
  const isActive = watch('isActive')
  const isPreferred = watch('isPreferred')

  // Reset form when dialog opens/closes or supplier changes
  useEffect(() => {
    if (open) {
      if (supplier) {
        reset({
          name: supplier.name,
          legalName: supplier.legalName || '',
          supplierType: supplier.supplierType || '',
          email: supplier.contactInfo?.email || '',
          phone: supplier.contactInfo?.phone || '',
          website: supplier.contactInfo?.website || '',
          address: supplier.contactInfo?.address || '',
          defaultCommissionRate: supplier.defaultCommissionRate || '',
          defaultCommissionTaxType: supplier.defaultCommissionTaxType || '',
          defaultCommissionTaxRatePercent: supplier.defaultCommissionTaxRatePercent || '',
          commissionIncludesTax: supplier.commissionIncludesTax,
          isActive: supplier.isActive,
          isPreferred: supplier.isPreferred,
          notes: supplier.notes || '',
          defaultTermsAndConditions: supplier.defaultTermsAndConditions || '',
          defaultCancellationPolicy: supplier.defaultCancellationPolicy || '',
        })
      } else {
        reset({
          name: '',
          legalName: '',
          supplierType: '',
          email: '',
          phone: '',
          website: '',
          address: '',
          defaultCommissionRate: '',
          defaultCommissionTaxType: '',
          defaultCommissionTaxRatePercent: '',
          commissionIncludesTax: false,
          isActive: true,
          isPreferred: false,
          notes: '',
          defaultTermsAndConditions: '',
          defaultCancellationPolicy: '',
        })
      }
    }
  }, [open, supplier, reset])

  const onSubmit = async (data: SupplierFormData) => {
    const contactInfo: SupplierContactInfo = {}
    if (data.email) contactInfo.email = data.email
    if (data.phone) contactInfo.phone = data.phone
    if (data.website) contactInfo.website = data.website
    if (data.address) contactInfo.address = data.address

    const payload = {
      name: data.name.trim(),
      legalName: data.legalName?.trim() || undefined,
      supplierType: data.supplierType || undefined,
      contactInfo: Object.keys(contactInfo).length > 0 ? contactInfo : undefined,
      defaultCommissionRate: data.defaultCommissionRate || undefined,
      // PR-2 commit 7: commission-tax defaults. Blank string → null (clear);
      // otherwise pass through.
      defaultCommissionTaxType: data.defaultCommissionTaxType || null,
      defaultCommissionTaxRatePercent: data.defaultCommissionTaxRatePercent || null,
      commissionIncludesTax: data.commissionIncludesTax,
      isActive: data.isActive,
      isPreferred: data.isPreferred,
      notes: data.notes || undefined,
      defaultTermsAndConditions: data.defaultTermsAndConditions || undefined,
      defaultCancellationPolicy: data.defaultCancellationPolicy || undefined,
    }

    try {
      if (isEditing && supplier) {
        await updateMutation.mutateAsync({ id: supplier.id, data: payload })
      } else {
        await createMutation.mutateAsync(payload)
      }
      onOpenChange(false)
    } catch {
      // Error is handled by mutation
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Supplier' : 'New Supplier'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Tabs defaultValue="general" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="contact">Contact</TabsTrigger>
              <TabsTrigger value="defaults">Defaults</TabsTrigger>
            </TabsList>

            {/* General Tab */}
            <TabsContent value="general" className="space-y-4 pt-4">
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name">
                  Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="name"
                  {...register('name', { required: 'Name is required' })}
                  placeholder="Enter supplier name"
                />
                {errors.name && (
                  <p className="text-sm text-red-500">{errors.name.message}</p>
                )}
              </div>

              {/* Legal Name */}
              <div className="space-y-2">
                <Label htmlFor="legalName">Legal Name</Label>
                <Input
                  id="legalName"
                  {...register('legalName')}
                  placeholder="Legal business name (for contracts)"
                />
              </div>

              {/* Supplier Type */}
              <div className="space-y-2">
                <Label htmlFor="supplierType">Type</Label>
                <Select
                  value={supplierType}
                  onValueChange={(value) => setValue('supplierType', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier type" />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPLIER_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type.replace(/_/g, ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Commission Rate */}
              <div className="space-y-2">
                <Label htmlFor="defaultCommissionRate">Default Commission Rate (%)</Label>
                <Input
                  id="defaultCommissionRate"
                  {...register('defaultCommissionRate', {
                    pattern: {
                      value: /^\d{1,3}(\.\d{1,2})?$/,
                      message: 'Enter a valid percentage (e.g., 10.00)',
                    },
                  })}
                  placeholder="e.g., 10.00"
                />
                {errors.defaultCommissionRate && (
                  <p className="text-sm text-red-500">{errors.defaultCommissionRate.message}</p>
                )}
              </div>

              {/* Status Toggles */}
              <div className="flex items-center gap-8 pt-2">
                <div className="flex items-center gap-2">
                  <Switch
                    id="isActive"
                    checked={isActive}
                    onCheckedChange={(checked) => setValue('isActive', checked)}
                  />
                  <Label htmlFor="isActive">Active</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="isPreferred"
                    checked={isPreferred}
                    onCheckedChange={(checked) => setValue('isPreferred', checked)}
                  />
                  <Label htmlFor="isPreferred">Preferred Supplier</Label>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="notes">Internal Notes</Label>
                <Textarea
                  id="notes"
                  {...register('notes')}
                  placeholder="Internal notes about this supplier..."
                  rows={3}
                />
              </div>
            </TabsContent>

            {/* Contact Tab */}
            <TabsContent value="contact" className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    {...register('email')}
                    placeholder="email@example.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    {...register('phone')}
                    placeholder="+1 (555) 123-4567"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  {...register('website')}
                  placeholder="https://example.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Textarea
                  id="address"
                  {...register('address')}
                  placeholder="123 Main St, City, Country"
                  rows={2}
                />
              </div>
            </TabsContent>

            {/* Defaults Tab */}
            <TabsContent value="defaults" className="space-y-4 pt-4">
              {/* PR-2 commit 7: commission-tax defaults
                  Used by finalizeDeposit to auto-derive embedded_tax_*
                  on each commission_check_item. When commissionIncludesTax
                  is true and a rate is set, computeEmbeddedTaxFromInclusive
                  splits the supplier's gross into base + embedded tax. */}
              <div className="rounded-md border border-ash-200 p-4 space-y-3">
                <div>
                  <h4 className="text-sm font-semibold text-ash-900">Commission tax defaults</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    When this supplier embeds tax in their commission payments (e.g. ACV
                    pays $105 = $100 commissionable + $5 GST), enable the toggle and set
                    the rate. Deposit finalize will split it automatically.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="defaultCommissionTaxType">Tax type</Label>
                    <Select
                      value={watch('defaultCommissionTaxType')}
                      onValueChange={(v) => setValue('defaultCommissionTaxType', v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="None / no tax" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        <SelectItem value="GST">GST</SelectItem>
                        <SelectItem value="HST">HST</SelectItem>
                        <SelectItem value="QST">QST</SelectItem>
                        <SelectItem value="PST">PST</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="defaultCommissionTaxRatePercent">Rate (%)</Label>
                    <Input
                      id="defaultCommissionTaxRatePercent"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      {...register('defaultCommissionTaxRatePercent')}
                      placeholder="e.g., 5.00 for GST"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Switch
                    id="commissionIncludesTax"
                    checked={watch('commissionIncludesTax')}
                    onCheckedChange={(checked) => setValue('commissionIncludesTax', checked)}
                  />
                  <Label htmlFor="commissionIncludesTax" className="text-sm">
                    Supplier&apos;s payment already includes the tax above
                  </Label>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="defaultTermsAndConditions">Default Terms & Conditions</Label>
                <Textarea
                  id="defaultTermsAndConditions"
                  {...register('defaultTermsAndConditions')}
                  placeholder="Enter default terms and conditions for bookings with this supplier..."
                  rows={6}
                />
                <p className="text-xs text-muted-foreground">
                  These will be pre-filled when selecting this supplier for a booking.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="defaultCancellationPolicy">Default Cancellation Policy</Label>
                <Textarea
                  id="defaultCancellationPolicy"
                  {...register('defaultCancellationPolicy')}
                  placeholder="Enter default cancellation policy for bookings with this supplier..."
                  rows={6}
                />
                <p className="text-xs text-muted-foreground">
                  This will be pre-filled when selecting this supplier for a booking.
                </p>
              </div>
            </TabsContent>
          </Tabs>

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? 'Save Changes' : 'Create Supplier'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
