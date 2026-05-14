'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAgencyTaxFiling, useUpsertAgencyTaxFiling } from '@/hooks/use-agency-tax-filing'
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { ApiError } from '@/lib/api'
import { SettingsTabsLayout } from '../_components/settings-tabs-layout'
import { FileText } from 'lucide-react'

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
const PROVINCE_CODES = CANADIAN_PROVINCES.map((p) => p.code) as [ProvinceCode, ...ProvinceCode[]]

// ─── Validation schema ────────────────────────────────────────────────────────

const schema = z.object({
  legalName: z.string().min(2, 'Must be at least 2 characters').max(255),
  payerAccountNumber: z
    .string()
    .regex(
      /^\d{9}[A-Z]{2}\d{4}$/,
      'Must be CRA BN15 format — 9 digits + 2 letters + 4 digits (e.g. 123456789RP0001)',
    ),
  transmitterNumber: z
    .string()
    .regex(/^MM\d{6}$/, 'Must be MM###### format (e.g. MM123456)')
    .optional()
    .or(z.literal('')),
  filingAddress: z.object({
    street: z.string().min(1, 'Street address is required'),
    city: z.string().min(1, 'City is required'),
    province: z.enum(PROVINCE_CODES, { errorMap: () => ({ message: 'Select a province' }) }),
    postalCode: z
      .string()
      .regex(/^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/, 'Enter a valid Canadian postal code (e.g. M5V 2T6)'),
  }),
  filingProvince: z.enum(PROVINCE_CODES, { errorMap: () => ({ message: 'Select a province' }) }),
  filingContactName: z.string().optional(),
  filingContactEmail: z.string().email('Must be a valid email').optional().or(z.literal('')),
  filingContactPhone: z.string().optional(),
  effectiveFrom: z.string().date('Must be a valid date (YYYY-MM-DD)'),
})

type TaxFilingFormValues = z.infer<typeof schema>

// ─── Component ────────────────────────────────────────────────────────────────

export default function TaxFilingPage() {
  const { data: existing, isLoading } = useAgencyTaxFiling()
  const upsert = useUpsertAgencyTaxFiling()
  const { toast } = useToast()

  const form = useForm<TaxFilingFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      legalName: '',
      payerAccountNumber: '',
      transmitterNumber: '',
      filingAddress: {
        street: '',
        city: '',
        province: 'ON',
        postalCode: '',
      },
      filingProvince: 'ON',
      filingContactName: '',
      filingContactEmail: '',
      filingContactPhone: '',
      effectiveFrom: new Date().toISOString().slice(0, 10),
    },
  })

  // Hydrate form when existing config loads
  useEffect(() => {
    if (existing) {
      form.reset({
        legalName: existing.legalName,
        payerAccountNumber: existing.payerAccountNumber,
        transmitterNumber: existing.transmitterNumber ?? '',
        filingAddress: {
          street: existing.filingAddress.street,
          city: existing.filingAddress.city,
          province: (existing.filingAddress.province as ProvinceCode) || 'ON',
          postalCode: existing.filingAddress.postalCode,
        },
        filingProvince: (existing.filingProvince as ProvinceCode) || 'ON',
        filingContactName: existing.filingContactName ?? '',
        filingContactEmail: existing.filingContactEmail ?? '',
        filingContactPhone: existing.filingContactPhone ?? '',
        effectiveFrom: existing.effectiveFrom,
      })
    }
  }, [existing, form])

  const onSubmit = async (values: TaxFilingFormValues) => {
    try {
      await upsert.mutateAsync({
        ...values,
        transmitterNumber: values.transmitterNumber || undefined,
        filingContactEmail: values.filingContactEmail || undefined,
        filingContactName: values.filingContactName || undefined,
        filingContactPhone: values.filingContactPhone || undefined,
      })
      toast({
        title: existing ? 'Tax filing config updated' : 'Tax filing config created',
        description: 'CRA payer identity saved successfully.',
      })
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to save tax filing config'
      toast({ title: 'Error', description: message, variant: 'destructive' })
    }
  }

  return (
    <SettingsTabsLayout activeTab="tax-filing">
      {/* Page header */}
      <div className="mb-6">
        <h3 className="text-xl font-semibold">Tax filing configuration</h3>
        <p className="text-sm text-muted-foreground">
          CRA payer identity used on T4A slips and XFile submissions. This information is printed on
          every T4A issued to independent contractors.
        </p>
      </div>

      {isLoading ? (
        <div className="py-8 text-sm text-muted-foreground">Loading…</div>
      ) : (
        <Card className="max-w-2xl">
          <CardHeader className="flex flex-row items-center gap-4">
            <div className="rounded-lg bg-phoenix-gold-50 p-2 text-phoenix-gold-600">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">
                {existing ? 'Update payer identity' : 'Set up payer identity'}
              </CardTitle>
              <CardDescription>
                {existing
                  ? `Last updated: ${new Date(existing.updatedAt).toLocaleDateString()}`
                  : 'No configuration yet — fill in the fields below to create one.'}
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

                {/* ── Payer identity ──────────────────────────────────────── */}
                <fieldset className="space-y-4">
                  <legend className="text-sm font-medium">Payer identity</legend>

                  <FormField
                    control={form.control}
                    name="legalName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Legal name (payer)</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Phoenix Voyages Inc." {...field} />
                        </FormControl>
                        <FormDescription>
                          The legal name printed on T4A slips.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="payerAccountNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Payer account number (BN15)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g. 123456789RP0001"
                            autoComplete="off"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Your CRA Business Number in BN15 format: 9 digits + program identifier
                          (RP) + account number (0001).
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="transmitterNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Transmitter number (optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. MM123456" autoComplete="off" {...field} />
                        </FormControl>
                        <FormDescription>
                          CRA-assigned transmitter ID (MM######) for electronic XML filing. Leave
                          blank if filing via a third-party service.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </fieldset>

                {/* ── Filing address ──────────────────────────────────────── */}
                <fieldset className="space-y-4">
                  <legend className="text-sm font-medium">Filing address</legend>
                  <p className="text-sm text-muted-foreground -mt-2">
                    The agency address printed on T4A slips.
                  </p>

                  <FormField
                    control={form.control}
                    name="filingAddress.street"
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
                      name="filingAddress.city"
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
                      name="filingAddress.postalCode"
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
                    name="filingAddress.province"
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

                {/* ── Filing province (tax jurisdiction) ─────────────────── */}
                <FormField
                  control={form.control}
                  name="filingProvince"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Filing province</FormLabel>
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
                      <FormDescription>
                        The province of the payer for T4A purposes. Usually the province where
                        the agency is registered.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* ── Contact ─────────────────────────────────────────────── */}
                <fieldset className="space-y-4">
                  <legend className="text-sm font-medium">Filing contact (optional)</legend>
                  <p className="text-sm text-muted-foreground -mt-2">
                    CRA contact person for T4A inquiries.
                  </p>

                  <FormField
                    control={form.control}
                    name="filingContactName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Alex Smith" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="filingContactEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contact email</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="tax@agency.ca" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="filingContactPhone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contact phone</FormLabel>
                          <FormControl>
                            <Input type="tel" placeholder="416-555-0100" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </fieldset>

                {/* ── Effective from ──────────────────────────────────────── */}
                <FormField
                  control={form.control}
                  name="effectiveFrom"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Effective from</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormDescription>
                        The date from which this payer configuration applies (typically Jan 1 of
                        the filing year).
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* ── Submit ──────────────────────────────────────────────── */}
                <div className="pt-2">
                  <Button type="submit" disabled={upsert.isPending}>
                    {upsert.isPending
                      ? 'Saving…'
                      : existing
                        ? 'Update configuration'
                        : 'Create configuration'}
                  </Button>
                </div>

              </form>
            </Form>
          </CardContent>
        </Card>
      )}
    </SettingsTabsLayout>
  )
}
