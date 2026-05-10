'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  useCreateTaxProfile,
  useUpdateTaxProfile,
  useMyTaxProfile,
} from '@/hooks/use-ic-payouts'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

// ─── Canadian provinces ───────────────────────────────────────────────────────

const CANADIAN_PROVINCES = [
  { code: 'AB', label: 'Alberta' },
  { code: 'BC', label: 'British Columbia' },
  { code: 'MB', label: 'Manitoba' },
  { code: 'NB', label: 'New Brunswick' },
  { code: 'NL', label: 'Newfoundland and Labrador' },
  { code: 'NS', label: 'Nova Scotia' },
  { code: 'NT', label: 'Northwest Territories' },
  { code: 'NU', label: 'Nunavut' },
  { code: 'ON', label: 'Ontario' },
  { code: 'PE', label: 'Prince Edward Island' },
  { code: 'QC', label: 'Quebec' },
  { code: 'SK', label: 'Saskatchewan' },
  { code: 'YT', label: 'Yukon' },
] as const

type ProvinceCode = (typeof CANADIAN_PROVINCES)[number]['code']

// ─── Validation schema ────────────────────────────────────────────────────────

const PROVINCE_CODES = CANADIAN_PROVINCES.map((p) => p.code) as [ProvinceCode, ...ProvinceCode[]]

const schema = z
  .object({
    legalName: z.string().min(2, 'Legal name must be at least 2 characters').max(255),
    domicileAddress: z.object({
      street: z.string().min(1, 'Street address is required'),
      city: z.string().min(1, 'City is required'),
      province: z.enum(PROVINCE_CODES, { errorMap: () => ({ message: 'Select a province' }) }),
      postalCode: z
        .string()
        .regex(/^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/, 'Enter a valid Canadian postal code (e.g. M5V 2T6)'),
    }),
    domicileProvince: z.enum(PROVINCE_CODES, { errorMap: () => ({ message: 'Select a province' }) }),
    isCorporation: z.boolean(),
    sinOrBn: z
      .string()
      .min(9, 'Must be at least 9 characters')
      .max(16, 'Must be at most 16 characters')
      .regex(/^[\d\-A-Za-z]{9,16}$/, 'Enter a valid SIN (9 digits) or Business Number (9–15 characters)'),
    gstHstRegistered: z.boolean(),
    gstHstNumber: z.string().optional(),
    gstHstEffectiveFrom: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.gstHstRegistered) {
      if (!data.gstHstNumber || data.gstHstNumber.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'GST/HST number is required when registered',
          path: ['gstHstNumber'],
        })
      }
      if (!data.gstHstEffectiveFrom || data.gstHstEffectiveFrom.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'GST/HST effective date is required when registered',
          path: ['gstHstEffectiveFrom'],
        })
      }
    }
  })

type TaxProfileFormValues = z.infer<typeof schema>

// ─── Props ────────────────────────────────────────────────────────────────────

interface TaxProfileStepProps {
  onComplete: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TaxProfileStep({ onComplete }: TaxProfileStepProps) {
  const { data: existing, isLoading } = useMyTaxProfile()
  const create = useCreateTaxProfile()
  const update = useUpdateTaxProfile()
  const { toast } = useToast()

  const form = useForm<TaxProfileFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      legalName: '',
      domicileAddress: {
        street: '',
        city: '',
        province: 'ON',
        postalCode: '',
      },
      domicileProvince: 'ON',
      isCorporation: false,
      sinOrBn: '',
      gstHstRegistered: false,
      gstHstNumber: '',
      gstHstEffectiveFrom: '',
    },
  })

  // Populate form when existing profile loads
  // sinOrBn is intentionally left blank — server never returns raw value
  useEffect(() => {
    if (existing) {
      form.reset({
        legalName: existing.legalName,
        domicileAddress: {
          street: existing.domicileAddress.street,
          city: existing.domicileAddress.city,
          province: (existing.domicileAddress.province as ProvinceCode) || 'ON',
          postalCode: existing.domicileAddress.postalCode,
        },
        domicileProvince: (existing.domicileProvince as ProvinceCode) || 'ON',
        isCorporation: existing.isCorporation,
        sinOrBn: '', // never re-display raw SIN/BN — IC must re-enter to update
        gstHstRegistered: existing.gstHstRegistered,
        gstHstNumber: existing.gstHstNumber ?? '',
        gstHstEffectiveFrom: existing.gstHstEffectiveFrom ?? '',
      })
    }
  }, [existing, form])

  const gstHstRegistered = form.watch('gstHstRegistered')
  const isCorporation = form.watch('isCorporation')
  const addressProvince = form.watch('domicileAddress.province')

  // Keep domicileProvince in sync with address province as a convenience
  useEffect(() => {
    if (addressProvince) {
      form.setValue('domicileProvince', addressProvince as ProvinceCode, { shouldValidate: false })
    }
  }, [addressProvince, form])

  const onSubmit = async (values: TaxProfileFormValues) => {
    try {
      if (existing) {
        // Update: sinOrBn is omitted — only update the non-sensitive fields
        await update.mutateAsync({
          legalName: values.legalName,
          domicileAddress: values.domicileAddress,
          domicileProvince: values.domicileProvince,
          gstHstRegistered: values.gstHstRegistered,
          gstHstNumber: values.gstHstRegistered ? values.gstHstNumber || undefined : undefined,
        })
      } else {
        await create.mutateAsync({
          legalName: values.legalName,
          domicileAddress: values.domicileAddress,
          domicileProvince: values.domicileProvince,
          isCorporation: values.isCorporation,
          sinOrBn: values.sinOrBn,
          gstHstRegistered: values.gstHstRegistered,
          gstHstNumber: values.gstHstRegistered ? values.gstHstNumber || undefined : undefined,
          gstHstEffectiveFrom: values.gstHstRegistered ? values.gstHstEffectiveFrom || undefined : undefined,
        })
      }
      toast({ title: 'Tax profile saved' })
      onComplete()
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to save tax profile'
      toast({ title: 'Error', description: message, variant: 'destructive' })
    }
  }

  if (isLoading) {
    return <div className="py-8 text-sm text-muted-foreground">Loading your tax profile…</div>
  }

  const isPending = create.isPending || update.isPending
  const sinOrBnLabel = isCorporation ? 'Business Number (BN)' : 'Social Insurance Number (SIN)'
  const sinOrBnPlaceholder = isCorporation ? 'e.g. 123456789' : '9-digit SIN'
  const sinOrBnDescription = existing
    ? `Current value: ${existing.sinOrBnMask} — enter a new value only if you want to update it`
    : isCorporation
      ? 'Your 9-digit CRA Business Number'
      : 'Your 9-digit SIN. Stored encrypted and never displayed again.'

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 max-w-2xl">

        {/* ── Legal name ─────────────────────────────────────────────────── */}
        <FormField
          control={form.control}
          name="legalName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Legal name</FormLabel>
              <FormControl>
                <Input placeholder="Your full legal name or corporation name" {...field} />
              </FormControl>
              <FormDescription>
                As it appears on your tax documents or articles of incorporation.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* ── Entity type ────────────────────────────────────────────────── */}
        <FormField
          control={form.control}
          name="isCorporation"
          render={({ field }) => (
            <FormItem className={cn(existing && 'opacity-60')}>
              <FormLabel>Entity type</FormLabel>
              <FormControl>
                <RadioGroup
                  value={field.value ? 'corporation' : 'individual'}
                  onValueChange={(v) => !existing && field.onChange(v === 'corporation')}
                  className="flex gap-6 mt-1"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="individual" id="entity-individual" disabled={!!existing} />
                    <Label htmlFor="entity-individual" className={cn(existing && 'cursor-default')}>
                      Sole proprietor / individual
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="corporation" id="entity-corporation" disabled={!!existing} />
                    <Label htmlFor="entity-corporation" className={cn(existing && 'cursor-default')}>
                      Incorporated
                    </Label>
                  </div>
                </RadioGroup>
              </FormControl>
              {existing && (
                <FormDescription>Entity type cannot be changed after initial setup.</FormDescription>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        {/* ── SIN / BN ───────────────────────────────────────────────────── */}
        <FormField
          control={form.control}
          name="sinOrBn"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{sinOrBnLabel}</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  autoComplete="off"
                  placeholder={sinOrBnPlaceholder}
                  required={!existing}
                  {...field}
                />
              </FormControl>
              <FormDescription>{sinOrBnDescription}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* ── Domicile address ───────────────────────────────────────────── */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-medium leading-none">Domicile address</legend>
          <p className="text-sm text-muted-foreground -mt-2">
            Your primary Canadian residential or business address.
          </p>

          <FormField
            control={form.control}
            name="domicileAddress.street"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Street address</FormLabel>
                <FormControl>
                  <Input placeholder="123 Main St" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="domicileAddress.city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>City</FormLabel>
                  <FormControl>
                    <Input placeholder="Toronto" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="domicileAddress.postalCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Postal code</FormLabel>
                  <FormControl>
                    <Input placeholder="M5V 2T6" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="domicileAddress.province"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Province</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a province" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {CANADIAN_PROVINCES.map((p) => (
                      <SelectItem key={p.code} value={p.code}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </fieldset>

        {/* ── Domicile province (tax jurisdiction) ───────────────────────── */}
        {/* Show only if user explicitly wants a different tax province than address */}
        <FormField
          control={form.control}
          name="domicileProvince"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tax province</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select province" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {CANADIAN_PROVINCES.map((p) => (
                    <SelectItem key={p.code} value={p.code}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                The province used to determine your tax obligations. Defaults to your address province.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* ── GST/HST registration ───────────────────────────────────────── */}
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="gstHstRegistered"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">GST/HST registered</FormLabel>
                  <FormDescription>
                    I have a CRA GST/HST registration number for charging tax on services.
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          {gstHstRegistered && (
            <div className="rounded-lg border p-4 space-y-4 bg-muted/30">
              <FormField
                control={form.control}
                name="gstHstNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>GST/HST number</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. 123456789 RT 0001" {...field} />
                    </FormControl>
                    <FormDescription>
                      Your 15-character CRA GST/HST account number.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="gstHstEffectiveFrom"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Registration effective date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormDescription>
                      The date your GST/HST registration took effect.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}
        </div>

        {/* ── Submit ─────────────────────────────────────────────────────── */}
        <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
          {isPending ? 'Saving…' : 'Save and continue'}
        </Button>
      </form>
    </Form>
  )
}
