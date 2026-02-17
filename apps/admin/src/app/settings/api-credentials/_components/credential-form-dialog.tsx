'use client'

import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { ApiProvider, CreateCredentialDto } from '@tailfire/shared-types/api'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { DatePickerEnhanced } from '@/components/ui/date-picker-enhanced'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCreateCredential, useProviderMetadata } from '@/hooks/use-api-credentials'
import { useToast } from '@/hooks/use-toast'
import { AlertTriangle, Loader2 } from 'lucide-react'

interface CredentialFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CredentialFormDialog({
  open,
  onOpenChange,
}: CredentialFormDialogProps) {
  const { data: allProviders, isLoading: loadingProviders } = useProviderMetadata()
  const createCredential = useCreateCredential()
  const { toast } = useToast()

  // Only show providers that support database-managed credentials (not env-only)
  const providers = useMemo(
    () => allProviders?.filter(p => p.sourcePolicy !== 'env-only'),
    [allProviders]
  )

  const form = useForm({
    resolver: zodResolver(z.object({
      provider: z.nativeEnum(ApiProvider),
      name: z.string().min(1, 'Name is required').max(255),
      expiresAt: z.string().optional().or(z.literal('')),
    }).passthrough()), // Allow dynamic credential fields to pass through validation
    defaultValues: {
      provider: '' as ApiProvider,
      name: '',
      expiresAt: '',
    },
  })

  const selectedProvider = form.watch('provider')
  const providerMetadata = useMemo(
    () => providers?.find((p) => p.provider === selectedProvider),
    [providers, selectedProvider]
  )

  // Register dynamic fields with empty defaults when provider changes
  // This prevents controlled/uncontrolled input warnings
  useEffect(() => {
    if (providerMetadata) {
      form.clearErrors()
      // Register each required field with an empty string default if not already set
      providerMetadata.requiredFields.forEach((fieldDef) => {
        const currentValue = form.getValues(fieldDef.name as any)
        if (currentValue === undefined) {
          form.setValue(fieldDef.name as any, '')
        }
      })
    }
  }, [providerMetadata, form])

  const onSubmit = async (data: Record<string, any>) => {
    if (!providerMetadata) return

    try {
      // Build credentials object from dynamic fields
      const credentials: Record<string, any> = {}
      providerMetadata.requiredFields.forEach((field) => {
        if (data[field.name]) {
          credentials[field.name] = data[field.name]
        }
      })

      const dto: CreateCredentialDto = {
        provider: data.provider,
        name: data.name,
        credentials,
        ...(data.expiresAt && { expiresAt: data.expiresAt }),
      }

      await createCredential.mutateAsync(dto)
      toast({
        title: 'Credential created',
        description: 'The API credential has been successfully created and encrypted.',
      })
      onOpenChange(false)
      form.reset()
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : 'Failed to create credential. Please try again.'
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add API Credential</DialogTitle>
          <DialogDescription>
            Add a new encrypted API credential for third-party service integration.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200">
          <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
          <div className="text-sm text-amber-900">
            <p className="font-semibold">Security Notice</p>
            <p>Credentials will be encrypted with AES-256-GCM before storage. Never share credentials via insecure channels.</p>
          </div>
        </div>

        {!loadingProviders && providers?.length === 0 && (
          <div className="text-center py-6 text-muted-foreground">
            <p className="text-sm">All API providers are currently managed via Doppler.</p>
            <p className="text-xs mt-1">
              To add or update credentials, please use the{' '}
              <a
                href="https://dashboard.doppler.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Doppler Dashboard
              </a>
              .
            </p>
          </div>
        )}

        {loadingProviders ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-ash-400" />
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="provider"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>API Provider</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select provider" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {providers?.map((provider) => (
                          <SelectItem key={provider.provider} value={provider.provider}>
                            <div className="flex items-center gap-2">
                              <span>{provider.displayName}</span>
                              {provider.costTier === 'free' && (
                                <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                                  Free
                                </span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      The third-party service for which these credentials are used
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Credential Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={providerMetadata ? `${providerMetadata.displayName} API` : 'My Credential'}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      A descriptive name to identify this credential
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Provider-specific fields */}
              {providerMetadata && (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground">
                    {providerMetadata.displayName} Credentials
                  </h3>

                  {providerMetadata.documentation && (
                    <p className="text-xs text-muted-foreground">
                      {providerMetadata.documentation}
                    </p>
                  )}

                  {providerMetadata.requiredFields.map((fieldDef) => (
                    <FormField
                      key={fieldDef.name}
                      control={form.control}
                      name={fieldDef.name as any}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {fieldDef.label}
                            {!fieldDef.required && (
                              <span className="text-muted-foreground ml-1">(Optional)</span>
                            )}
                          </FormLabel>
                          <FormControl>
                            <Input
                              type={fieldDef.type === 'password' ? 'password' : 'text'}
                              placeholder={fieldDef.placeholder}
                              {...field}
                              value={field.value ?? ''}
                            />
                          </FormControl>
                          <FormDescription className="text-xs">
                            {fieldDef.description}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
              )}

              <FormField
                control={form.control}
                name="expiresAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expiration Date (Optional)</FormLabel>
                    <FormControl>
                      <DatePickerEnhanced
                        value={field.value || null}
                        onChange={(date) => field.onChange(date || '')}
                        placeholder="Select expiration date"
                      />
                    </FormControl>
                    <FormDescription>
                      Set a reminder for when these credentials should be rotated
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createCredential.isPending || !selectedProvider}
                >
                  {createCredential.isPending ? 'Creating...' : 'Create Credential'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  )
}
