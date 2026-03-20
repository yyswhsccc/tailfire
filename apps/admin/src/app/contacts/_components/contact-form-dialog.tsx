import { useEffect, useState, useRef, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import type {
  ContactResponseDto,
  CreateContactDto,
  UpdateContactDto,
} from '@tailfire/shared-types/api'
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
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DatePickerEnhanced } from '@/components/ui/date-picker-enhanced'
import { useCreateContact, useUpdateContact } from '@/hooks/use-contacts'
import { useToast } from '@/hooks/use-toast'
import { MapPin, Loader2 } from 'lucide-react'

const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''

interface GooglePrediction {
  placeId: string
  mainText: string
  secondaryText: string
}

interface AddressComponents {
  addressLine1: string
  city: string
  province: string
  postalCode: string
  country: string
}

function useAddressAutocomplete(onSelect: (addr: AddressComponents) => void) {
  const [query, setQuery] = useState('')
  const [predictions, setPredictions] = useState<GooglePrediction[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  const abortRef = useRef<AbortController>()

  const search = useCallback(async (text: string) => {
    if (!GOOGLE_API_KEY || !text.trim()) return
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setIsLoading(true)
    try {
      const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GOOGLE_API_KEY },
        body: JSON.stringify({ input: text, includedPrimaryTypes: ['street_address', 'premise', 'subpremise', 'route'] }),
        signal: abortRef.current.signal,
      })
      const data = await res.json()
      setPredictions(
        (data.suggestions || [])
          .filter((s: any) => s.placePrediction)
          .map((s: any) => ({
            placeId: s.placePrediction.placeId,
            mainText: s.placePrediction.structuredFormat?.mainText?.text || s.placePrediction.text?.text || '',
            secondaryText: s.placePrediction.structuredFormat?.secondaryText?.text || '',
          }))
      )
      setIsOpen(true)
    } catch (e: any) {
      if (e.name !== 'AbortError') setPredictions([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleChange = (val: string) => {
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!val.trim()) { setPredictions([]); setIsOpen(false); return }
    setIsOpen(true)
    debounceRef.current = setTimeout(() => search(val), 300)
  }

  const handleSelect = async (prediction: GooglePrediction) => {
    setIsOpen(false)
    setQuery(prediction.mainText + (prediction.secondaryText ? `, ${prediction.secondaryText}` : ''))
    if (!GOOGLE_API_KEY) return
    setIsLoading(true)
    try {
      const res = await fetch(
        `https://places.googleapis.com/v1/places/${prediction.placeId}?fields=addressComponents,formattedAddress`,
        { headers: { 'X-Goog-Api-Key': GOOGLE_API_KEY, 'X-Goog-FieldMask': 'addressComponents,formattedAddress' } }
      )
      const place = await res.json()
      const comps = place.addressComponents || []
      const find = (type: string) => comps.find((c: any) => c.types?.includes(type))
      const streetNumber = find('street_number')?.longText || ''
      const route = find('route')?.longText || ''
      onSelect({
        addressLine1: streetNumber ? `${streetNumber} ${route}` : (place.formattedAddress || prediction.mainText),
        city: find('locality')?.longText || find('sublocality')?.longText || '',
        province: find('administrative_area_level_1')?.shortText || '',
        postalCode: find('postal_code')?.longText || '',
        country: find('country')?.shortText || '',
      })
    } catch { /* ignore */ } finally { setIsLoading(false) }
  }

  return { query, setQuery, predictions, isOpen, setIsOpen, isLoading, handleChange, handleSelect }
}

// Updated schema to reflect Phase 1-4 requirements
const contactFormSchema = z.object({
  // Phase 1: Name fields (at least one name field should be present)
  firstName: z.string().max(100).optional().or(z.literal('')),
  lastName: z.string().max(100).optional().or(z.literal('')),
  legalFirstName: z.string().optional().or(z.literal('')),
  legalLastName: z.string().optional().or(z.literal('')),
  middleName: z.string().optional().or(z.literal('')),
  preferredName: z.string().optional().or(z.literal('')),
  prefix: z.string().max(10).optional().or(z.literal('')),
  suffix: z.string().max(10).optional().or(z.literal('')),

  // Phase 1: LGBTQ+ inclusive fields
  gender: z.string().max(50).optional().or(z.literal('')),
  pronouns: z.string().max(50).optional().or(z.literal('')),
  maritalStatus: z.string().max(50).optional().or(z.literal('')),

  // Contact information
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  phone: z.string().max(50).optional().or(z.literal('')),
  dateOfBirth: z.string().optional().or(z.literal('')),

  // Passport information
  passportNumber: z.string().max(50).optional().or(z.literal('')),
  passportExpiry: z.string().optional().or(z.literal('')),
  passportCountry: z.string().max(3).optional().or(z.literal('')),
  passportIssueDate: z.string().optional().or(z.literal('')),
  nationality: z.string().max(3).optional().or(z.literal('')),

  // Phase 4: TSA credentials
  redressNumber: z.string().max(20).optional().or(z.literal('')),
  knownTravelerNumber: z.string().max(20).optional().or(z.literal('')),

  // Address
  addressLine1: z.string().max(255).optional().or(z.literal('')),
  addressLine2: z.string().max(255).optional().or(z.literal('')),
  city: z.string().max(100).optional().or(z.literal('')),
  province: z.string().max(100).optional().or(z.literal('')),
  postalCode: z.string().max(20).optional().or(z.literal('')),
  country: z.string().max(3).optional().or(z.literal('')),

  // Requirements
  dietaryRequirements: z.string().optional().or(z.literal('')),
  mobilityRequirements: z.string().optional().or(z.literal('')),

  // Phase 4: Travel preferences
  seatPreference: z.string().max(20).optional().or(z.literal('')),
  cabinPreference: z.string().max(20).optional().or(z.literal('')),
  floorPreference: z.string().max(20).optional().or(z.literal('')),
})

type ContactFormValues = z.infer<typeof contactFormSchema>

interface ContactFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  contact?: ContactResponseDto
}

export function ContactFormDialog({
  open,
  onOpenChange,
  mode,
  contact,
}: ContactFormDialogProps) {
  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      legalFirstName: '',
      legalLastName: '',
      middleName: '',
      preferredName: '',
      prefix: '',
      suffix: '',
      gender: '',
      pronouns: '',
      maritalStatus: '',
      email: '',
      phone: '',
      dateOfBirth: '',
      passportNumber: '',
      passportExpiry: '',
      passportCountry: '',
      passportIssueDate: '',
      nationality: '',
      redressNumber: '',
      knownTravelerNumber: '',
      addressLine1: '',
      addressLine2: '',
      city: '',
      province: '',
      postalCode: '',
      country: '',
      dietaryRequirements: '',
      mobilityRequirements: '',
      seatPreference: '',
      cabinPreference: '',
      floorPreference: '',
    },
  })

  const createContact = useCreateContact()
  const updateContact = useUpdateContact()
  const { toast } = useToast()

  // Address autocomplete
  const addressAC = useAddressAutocomplete((addr) => {
    form.setValue('addressLine1', addr.addressLine1, { shouldDirty: true })
    form.setValue('city', addr.city, { shouldDirty: true })
    form.setValue('province', addr.province, { shouldDirty: true })
    form.setValue('postalCode', addr.postalCode, { shouldDirty: true })
    form.setValue('country', addr.country, { shouldDirty: true })
  })

  // Reset form when contact changes or dialog opens
  useEffect(() => {
    if (contact && mode === 'edit') {
      form.reset({
        firstName: contact.firstName || '',
        lastName: contact.lastName || '',
        legalFirstName: contact.legalFirstName || '',
        legalLastName: contact.legalLastName || '',
        middleName: contact.middleName || '',
        preferredName: contact.preferredName || '',
        prefix: contact.prefix || '',
        suffix: contact.suffix || '',
        gender: contact.gender || '',
        pronouns: contact.pronouns || '',
        maritalStatus: contact.maritalStatus || '',
        email: contact.email || '',
        phone: contact.phone || '',
        dateOfBirth: contact.dateOfBirth || '',
        passportNumber: contact.passportNumber || '',
        passportExpiry: contact.passportExpiry || '',
        passportCountry: contact.passportCountry || '',
        passportIssueDate: contact.passportIssueDate || '',
        nationality: contact.nationality || '',
        redressNumber: contact.redressNumber || '',
        knownTravelerNumber: contact.knownTravelerNumber || '',
        addressLine1: contact.addressLine1 || '',
        addressLine2: contact.addressLine2 || '',
        city: contact.city || '',
        province: contact.province || '',
        postalCode: contact.postalCode || '',
        country: contact.country || '',
        dietaryRequirements: contact.dietaryRequirements || '',
        mobilityRequirements: contact.mobilityRequirements || '',
        seatPreference: contact.seatPreference || '',
        cabinPreference: contact.cabinPreference || '',
        floorPreference: contact.floorPreference || '',
      })
      addressAC.setQuery(contact.addressLine1 || '')
    } else if (mode === 'create') {
      form.reset()
      addressAC.setQuery('')
    }
  }, [contact, mode, form, open]) // eslint-disable-line react-hooks/exhaustive-deps

  const onSubmit = async (data: ContactFormValues) => {
    try {
      // Remove empty strings to match API expectations
      const cleanData = Object.fromEntries(
        Object.entries(data).filter(([_, v]) => v !== '')
      ) as Partial<ContactFormValues>

      if (mode === 'create') {
        await createContact.mutateAsync(cleanData as unknown as CreateContactDto)
        toast({
          title: 'Contact created',
          description: 'The contact has been successfully created.',
        })
      } else if (contact) {
        await updateContact.mutateAsync({
          id: contact.id,
          data: cleanData as unknown as UpdateContactDto,
        })
        toast({
          title: 'Contact updated',
          description: 'The contact has been successfully updated.',
        })
      }
      onOpenChange(false)
      form.reset()
    } catch (error) {
      toast({
        title: 'Error',
        description: `Failed to ${mode} contact. Please try again.`,
        variant: 'destructive',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Create New Contact' : 'Edit Contact'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Add a new contact to your database.'
              : 'Update contact information.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <Tabs defaultValue="identity" className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="identity">Identity</TabsTrigger>
                <TabsTrigger value="contact">Contact</TabsTrigger>
                <TabsTrigger value="travel">Travel Docs</TabsTrigger>
                <TabsTrigger value="address">Address</TabsTrigger>
                <TabsTrigger value="preferences">Preferences</TabsTrigger>
              </TabsList>

              {/* Identity Tab */}
              <TabsContent value="identity" className="space-y-6 mt-6">
                {/* Name Elements */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground">Name Elements</h3>
                  <div className="grid grid-cols-4 gap-4">
                    <FormField
                      control={form.control}
                      name="prefix"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Prefix</FormLabel>
                          <FormControl>
                            <Input placeholder="Mr., Mrs., Dr." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem className="col-span-2">
                          <FormLabel>First Name</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last Name</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="middleName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Middle Name</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="preferredName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Preferred Name</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormDescription className="text-xs">
                            What they like to be called
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="suffix"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Suffix</FormLabel>
                          <FormControl>
                            <Input placeholder="Jr., Sr., III" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Legal Names */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground">Legal Name (for Travel Documents)</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="legalFirstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Legal First Name</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormDescription className="text-xs">
                            As it appears on passport
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="legalLastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Legal Last Name</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormDescription className="text-xs">
                            As it appears on passport
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Inclusive Identity Fields */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground">Personal Information</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="gender"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Gender Identity</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select gender" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="male">Male</SelectItem>
                              <SelectItem value="female">Female</SelectItem>
                              <SelectItem value="non-binary">Non-binary</SelectItem>
                              <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="pronouns"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Pronouns</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select pronouns" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="she/her">she/her</SelectItem>
                              <SelectItem value="he/him">he/him</SelectItem>
                              <SelectItem value="they/them">they/them</SelectItem>
                              <SelectItem value="ze/zir">ze/zir</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="maritalStatus"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Marital Status</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select status" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="single">Single</SelectItem>
                              <SelectItem value="married">Married</SelectItem>
                              <SelectItem value="domestic_partnership">Domestic Partnership</SelectItem>
                              <SelectItem value="divorced">Divorced</SelectItem>
                              <SelectItem value="widowed">Widowed</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </TabsContent>

              {/* Contact Tab */}
              <TabsContent value="contact" className="space-y-6 mt-6">
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground">Contact Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email Address</FormLabel>
                          <FormControl>
                            <Input type="email" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone Number</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="dateOfBirth"
                    render={({ field }) => (
                      <FormItem className="w-1/2">
                        <FormLabel>Date of Birth</FormLabel>
                        <FormControl>
                          <DatePickerEnhanced
                            value={field.value || null}
                            onChange={(isoDate) => field.onChange(isoDate || '')}
                            placeholder="YYYY-MM-DD"
                            aria-label="Date of birth"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>

              {/* Travel Documents Tab */}
              <TabsContent value="travel" className="space-y-6 mt-6">
                {/* Passport Information */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground">Passport Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="passportNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Passport Number</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="passportCountry"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Issuing Country</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., CAN, USA" {...field} />
                          </FormControl>
                          <FormDescription className="text-xs">
                            3-letter country code
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="passportIssueDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Issue Date</FormLabel>
                          <FormControl>
                            <DatePickerEnhanced
                              value={field.value || null}
                              onChange={(date) => field.onChange(date || '')}
                              placeholder="Select date"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="passportExpiry"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Expiry Date</FormLabel>
                          <FormControl>
                            <DatePickerEnhanced
                              value={field.value || null}
                              onChange={(date) => field.onChange(date || '')}
                              placeholder="Select date"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="nationality"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nationality</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., CAN, USA" {...field} />
                          </FormControl>
                          <FormDescription className="text-xs">
                            3-letter country code
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* TSA Credentials */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground">TSA & Security Credentials</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="knownTravelerNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Known Traveler Number</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormDescription className="text-xs">
                            TSA PreCheck, Global Entry, NEXUS
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="redressNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Redress Number</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormDescription className="text-xs">
                            For passengers with watchlist issues
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </TabsContent>

              {/* Address Tab */}
              <TabsContent value="address" className="space-y-6 mt-6">
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground">Mailing Address</h3>
                  <FormField
                    control={form.control}
                    name="addressLine1"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address Line 1</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                            <Input
                              value={addressAC.query}
                              onChange={(e) => {
                                addressAC.handleChange(e.target.value)
                                field.onChange(e.target.value)
                              }}
                              onBlur={() => {
                                setTimeout(() => addressAC.setIsOpen(false), 200)
                                field.onBlur()
                              }}
                              placeholder="Start typing to search..."
                              className="pl-9"
                              autoComplete="off"
                            />
                            {addressAC.isLoading && (
                              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                            )}
                            {addressAC.isOpen && addressAC.predictions.length > 0 && (
                              <div className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-lg max-h-48 overflow-y-auto">
                                {addressAC.predictions.map((p) => (
                                  <button
                                    key={p.placeId}
                                    type="button"
                                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-start gap-2"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                      addressAC.handleSelect(p)
                                    }}
                                  >
                                    <MapPin className="h-3.5 w-3.5 mt-0.5 text-gray-400 shrink-0" />
                                    <span>
                                      <span className="font-medium">{p.mainText}</span>
                                      {p.secondaryText && (
                                        <span className="text-gray-500 ml-1">{p.secondaryText}</span>
                                      )}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="addressLine2"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address Line 2</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>City</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="province"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Province/State</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="postalCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Postal Code</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="country"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Country</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., CAN, USA" {...field} />
                          </FormControl>
                          <FormDescription className="text-xs">
                            3-letter country code
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </TabsContent>

              {/* Preferences Tab */}
              <TabsContent value="preferences" className="space-y-6 mt-6">
                {/* Travel Preferences */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground">Travel Preferences</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="seatPreference"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Seat Preference</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select preference" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="window">Window</SelectItem>
                              <SelectItem value="aisle">Aisle</SelectItem>
                              <SelectItem value="middle">Middle</SelectItem>
                              <SelectItem value="no_preference">No Preference</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="cabinPreference"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cabin Preference</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select cabin" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="economy">Economy</SelectItem>
                              <SelectItem value="premium_economy">Premium Economy</SelectItem>
                              <SelectItem value="business">Business</SelectItem>
                              <SelectItem value="first">First Class</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="floorPreference"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Hotel Floor</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select preference" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="high">High Floor</SelectItem>
                              <SelectItem value="low">Low Floor</SelectItem>
                              <SelectItem value="no_preference">No Preference</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Special Requirements */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground">Special Requirements</h3>
                  <FormField
                    control={form.control}
                    name="dietaryRequirements"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Dietary Requirements</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="e.g., vegetarian, gluten-free, allergies..."
                            className="resize-none"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="mobilityRequirements"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mobility & Accessibility Requirements</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="e.g., wheelchair access, special assistance..."
                            className="resize-none"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createContact.isPending || updateContact.isPending}
              >
                {createContact.isPending || updateContact.isPending
                  ? 'Saving...'
                  : mode === 'create'
                    ? 'Create Contact'
                    : 'Update Contact'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
