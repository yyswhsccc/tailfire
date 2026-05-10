'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useCreatePayoutAccount } from '@/hooks/use-ic-payouts'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/hooks/use-toast'
import { ApiError } from '@/lib/api'
import type { IcPayoutRail } from '@tailfire/shared-types/api'

// ─── Rail metadata ────────────────────────────────────────────────────────────

const RAILS: { value: IcPayoutRail; label: string; description: string }[] = [
  {
    value: 'interac_etransfer',
    label: 'Interac e-Transfer',
    description: 'Real-time, requires email',
  },
  {
    value: 'eft',
    label: 'EFT (bank deposit)',
    description: 'Canadian bank, T+1–3 days, requires PAD agreement',
  },
  {
    value: 'wise',
    label: 'Wise',
    description: 'International, requires Wise email',
  },
  {
    value: 'wire',
    label: 'Wire',
    description: 'International, requires SWIFT and account',
  },
  {
    value: 'visa_direct',
    label: 'Visa Direct (push to debit card)',
    description: 'Real-time to debit card',
  },
]

// ─── Validation schema ────────────────────────────────────────────────────────

// Per-rail details schemas — must stay in sync with IcPayoutAccountsService.validateRailDetails on the server
const detailsSchema = z.discriminatedUnion('rail', [
  z.object({
    rail: z.literal('interac_etransfer'),
    details: z.object({
      email: z.string().email('Enter a valid email'),
      securityQuestion: z.string().optional(),
      securityAnswer: z.string().optional(),
    }),
  }),
  z.object({
    rail: z.literal('eft'),
    details: z.object({
      institution: z.string().regex(/^\d{3}$/, 'Institution must be 3 digits'),
      transit: z.string().regex(/^\d{5}$/, 'Transit must be 5 digits'),
      account: z
        .string()
        .regex(/^\d{1,12}$/, 'Account number must be 1–12 digits'),
    }),
  }),
  z.object({
    rail: z.literal('wise'),
    details: z.object({
      email: z.string().email('Enter a valid email'),
    }),
  }),
  z.object({
    rail: z.literal('wire'),
    details: z.object({
      swift: z
        .string()
        .min(8, 'SWIFT/BIC must be 8–11 characters')
        .max(11, 'SWIFT/BIC must be 8–11 characters'),
      account: z.string().min(1, 'Account / IBAN is required'),
    }),
  }),
  z.object({
    rail: z.literal('visa_direct'),
    details: z.object({
      cardLast4: z.string().regex(/^\d{4}$/, 'Must be exactly 4 digits'),
      cardholderName: z.string().min(1, 'Cardholder name is required'),
    }),
  }),
])

const baseSchema = z.object({
  label: z.string().min(1, 'Label is required').max(80, 'Label is too long'),
  currency: z.enum(['CAD', 'USD']),
  isDefaultForCurrency: z.boolean().default(false),
  padAccepted: z.boolean().default(false), // UI gating only — not sent to server
})

const formSchema = z
  .intersection(baseSchema, detailsSchema)
  .superRefine((data, ctx) => {
    if (data.rail === 'eft' && !data.padAccepted) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['padAccepted'],
        message: 'PAD agreement must be accepted for EFT deposits',
      })
    }
  })

type FormValues = z.infer<typeof formSchema>

// ─── Default details per rail ─────────────────────────────────────────────────

function defaultDetailsForRail(rail: IcPayoutRail): Record<string, string> {
  switch (rail) {
    case 'interac_etransfer':
      return { email: '', securityQuestion: '', securityAnswer: '' }
    case 'eft':
      return { institution: '', transit: '', account: '' }
    case 'wise':
      return { email: '' }
    case 'wire':
      return { swift: '', account: '' }
    case 'visa_direct':
      return { cardLast4: '', cardholderName: '' }
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  onSuccess: () => void
  defaultCurrency?: 'CAD' | 'USD'
  /**
   * When true, omits the "is default for currency" toggle and forces it to true.
   * Used by FirstAccountStep where the first account is always the default.
   */
  forceDefault?: boolean
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AccountFormDialog({
  onSuccess,
  defaultCurrency = 'CAD',
  forceDefault = false,
}: Props) {
  const create = useCreatePayoutAccount()
  const { toast } = useToast()

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      label: '',
      currency: defaultCurrency,
      rail: 'interac_etransfer',
      details: { email: '', securityQuestion: '', securityAnswer: '' },
      isDefaultForCurrency: forceDefault,
      padAccepted: false,
    },
  })

  const rail = form.watch('rail') as IcPayoutRail
  const currency = form.watch('currency')
  const isEft = rail === 'eft'

  const handleRailChange = (newRail: string) => {
    form.setValue('rail', newRail as IcPayoutRail, { shouldValidate: false })
    form.setValue(
      'details',
      defaultDetailsForRail(newRail as IcPayoutRail) as any,
      { shouldValidate: false },
    )
    // Reset PAD checkbox when leaving EFT
    if (newRail !== 'eft') {
      form.setValue('padAccepted', false, { shouldValidate: false })
    }
  }

  const onSubmit = async (values: FormValues) => {
    try {
      await create.mutateAsync({
        label: values.label,
        currency: values.currency,
        rail: values.rail,
        details: values.details as Record<string, unknown>,
        isDefaultForCurrency: forceDefault ? true : values.isDefaultForCurrency,
        padAgreementVersion: isEft ? 'PAD-2026-05' : undefined,
      })
      toast({ title: 'Payout account saved' })
      onSuccess()
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Failed to save account'
      toast({ title: 'Error', description: message, variant: 'destructive' })
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {/* ── Label ──────────────────────────────────────────────────── */}
        <FormField
          control={form.control}
          name="label"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Account label</FormLabel>
              <FormControl>
                <Input placeholder="My RBC chequing" {...field} />
              </FormControl>
              <FormDescription>
                A short name to identify this account.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* ── Currency ───────────────────────────────────────────────── */}
        <FormField
          control={form.control}
          name="currency"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Currency</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="CAD">CAD</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* ── Rail ───────────────────────────────────────────────────── */}
        <FormField
          control={form.control}
          name="rail"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Payment rail</FormLabel>
              <Select
                onValueChange={handleRailChange}
                value={field.value}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {RAILS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      <span className="font-medium">{r.label}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {r.description}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* ── Rail-specific fields ────────────────────────────────────── */}

        {/* Interac e-Transfer / Wise: email */}
        {(rail === 'interac_etransfer' || rail === 'wise') && (
          <FormField
            control={form.control}
            name="details.email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Recipient email</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="you@example.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Interac e-Transfer: optional security Q/A */}
        {rail === 'interac_etransfer' && (
          <>
            <FormField
              control={form.control}
              name="details.securityQuestion"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Security question (optional)</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormDescription>
                    Leave blank if your bank uses Auto-Deposit.
                  </FormDescription>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="details.securityAnswer"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Security answer (optional)</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
          </>
        )}

        {/* EFT: institution / transit / account + PAD agreement */}
        {rail === 'eft' && (
          <>
            <div className="grid grid-cols-3 gap-2">
              <FormField
                control={form.control}
                name="details.institution"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Institution #</FormLabel>
                    <FormControl>
                      <Input placeholder="003" maxLength={3} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="details.transit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Transit #</FormLabel>
                    <FormControl>
                      <Input placeholder="12345" maxLength={5} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="details.account"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account #</FormLabel>
                    <FormControl>
                      <Input maxLength={12} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="padAccepted"
              render={({ field }) => (
                <FormItem className="rounded-lg border p-4 space-y-0">
                  <div className="flex items-start gap-3">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1">
                      <FormLabel className="font-normal text-sm leading-snug">
                        I authorize Phoenix Voyages to deposit funds to this
                        bank account via EFT under a Pre-Authorized Debit (PAD)
                        agreement (version PAD-2026-05).
                      </FormLabel>
                      <FormMessage />
                    </div>
                  </div>
                </FormItem>
              )}
            />
          </>
        )}

        {/* Wire: SWIFT + account/IBAN */}
        {rail === 'wire' && (
          <>
            <FormField
              control={form.control}
              name="details.swift"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>SWIFT / BIC code</FormLabel>
                  <FormControl>
                    <Input placeholder="ABCDXXAA" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="details.account"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Account / IBAN</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}

        {/* Visa Direct: cardholder name + last 4 */}
        {rail === 'visa_direct' && (
          <>
            <FormField
              control={form.control}
              name="details.cardholderName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cardholder name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="details.cardLast4"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Last 4 digits of card</FormLabel>
                  <FormControl>
                    <Input maxLength={4} {...field} />
                  </FormControl>
                  <FormDescription>
                    v1 stub — Phase 2 will use a tokenized card iframe.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}

        {/* ── Default for currency toggle (hidden when forceDefault) ── */}
        {!forceDefault && (
          <FormField
            control={form.control}
            name="isDefaultForCurrency"
            render={({ field }) => (
              <FormItem className="flex items-center gap-2">
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <FormLabel className="font-normal">
                  Make default for {currency}
                </FormLabel>
              </FormItem>
            )}
          />
        )}

        {/* ── Submit ─────────────────────────────────────────────────── */}
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Saving…' : 'Save account'}
        </Button>
      </form>
    </Form>
  )
}
