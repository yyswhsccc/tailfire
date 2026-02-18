"use client"

import { useEffect } from "react"
import { useForm } from "react-hook-form"
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@tailfire/ui-public"
import { toast } from "sonner"
import { Loader2, Save, User, Plane, MapPin, Heart } from "lucide-react"
import { useClientProfile, useUpdateProfile, type ClientProfile } from "@/hooks/use-client-profile"

function FormField({
  label,
  id,
  type = "text",
  register,
  placeholder,
}: {
  label: string
  id: string
  type?: string
  register: any
  placeholder?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-phoenix-text-light text-sm">
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        placeholder={placeholder}
        {...register(id)}
        className="bg-phoenix-charcoal/50 border-phoenix-gold/30 text-white placeholder:text-phoenix-text-muted"
      />
    </div>
  )
}

export function PassengerInfoForm() {
  const { data: profile, isLoading } = useClientProfile()
  const updateProfile = useUpdateProfile()

  const { register, handleSubmit, reset, formState: { isDirty } } = useForm<Partial<ClientProfile>>()

  useEffect(() => {
    if (profile) {
      reset(profile)
    }
  }, [profile, reset])

  const onSubmit = (data: Partial<ClientProfile>) => {
    // Only send changed fields
    const changes: Record<string, any> = {}
    if (!profile) return

    const fields = [
      "legalFirstName", "legalLastName", "middleName", "preferredName",
      "prefix", "suffix", "gender", "pronouns", "dateOfBirth",
      "passportNumber", "passportExpiry", "passportCountry", "passportIssueDate",
      "nationality", "redressNumber", "knownTravelerNumber", "phone",
      "address1", "address2", "city", "state", "postalCode", "country",
      "dietaryRequirements", "mobilityRequirements", "seatPreference",
      "cabinPreference", "floorPreference",
    ] as const

    for (const field of fields) {
      if (data[field] !== profile[field]) {
        changes[field] = data[field] || null
      }
    }

    if (Object.keys(changes).length === 0) {
      toast.info("No changes to save")
      return
    }

    updateProfile.mutate(changes, {
      onSuccess: () => {
        toast.success("Profile updated successfully")
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : "Failed to update profile")
      },
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-phoenix-gold" />
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Personal Information */}
      <Card className="bg-phoenix-charcoal/50 border-phoenix-gold/30">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <User className="h-5 w-5 text-phoenix-gold" />
            Personal Information
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <FormField label="Prefix" id="prefix" register={register} placeholder="Mr./Mrs./Dr." />
          <FormField label="Legal First Name" id="legalFirstName" register={register} />
          <FormField label="Legal Last Name" id="legalLastName" register={register} />
          <FormField label="Middle Name" id="middleName" register={register} />
          <FormField label="Preferred Name" id="preferredName" register={register} />
          <FormField label="Suffix" id="suffix" register={register} placeholder="Jr./Sr./III" />
          <FormField label="Gender" id="gender" register={register} />
          <FormField label="Pronouns" id="pronouns" register={register} placeholder="e.g., they/them" />
          <FormField label="Date of Birth" id="dateOfBirth" type="date" register={register} />
          <FormField label="Phone" id="phone" register={register} placeholder="+1 (555) 123-4567" />
        </CardContent>
      </Card>

      {/* Travel Documents */}
      <Card className="bg-phoenix-charcoal/50 border-phoenix-gold/30">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Plane className="h-5 w-5 text-phoenix-gold" />
            Travel Documents
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <FormField label="Passport Number" id="passportNumber" register={register} />
          <FormField label="Passport Expiry" id="passportExpiry" type="date" register={register} />
          <FormField label="Passport Country" id="passportCountry" register={register} />
          <FormField label="Passport Issue Date" id="passportIssueDate" type="date" register={register} />
          <FormField label="Nationality" id="nationality" register={register} />
          <FormField label="Redress Number" id="redressNumber" register={register} />
          <FormField label="Known Traveler Number" id="knownTravelerNumber" register={register} />
        </CardContent>
      </Card>

      {/* Address */}
      <Card className="bg-phoenix-charcoal/50 border-phoenix-gold/30">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <MapPin className="h-5 w-5 text-phoenix-gold" />
            Address
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <FormField label="Address Line 1" id="address1" register={register} />
          </div>
          <div className="sm:col-span-2">
            <FormField label="Address Line 2" id="address2" register={register} />
          </div>
          <FormField label="City" id="city" register={register} />
          <FormField label="State/Province" id="state" register={register} />
          <FormField label="Postal Code" id="postalCode" register={register} />
          <FormField label="Country" id="country" register={register} />
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card className="bg-phoenix-charcoal/50 border-phoenix-gold/30">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Heart className="h-5 w-5 text-phoenix-gold" />
            Travel Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <FormField label="Seat Preference" id="seatPreference" register={register} placeholder="Window/Aisle" />
          <FormField label="Cabin Preference" id="cabinPreference" register={register} placeholder="Balcony/Interior" />
          <FormField label="Floor Preference" id="floorPreference" register={register} placeholder="High/Low" />
          <div className="sm:col-span-2 lg:col-span-3">
            <FormField label="Dietary Requirements" id="dietaryRequirements" register={register} placeholder="Vegetarian, gluten-free, etc." />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <FormField label="Mobility Requirements" id="mobilityRequirements" register={register} placeholder="Wheelchair access, etc." />
          </div>
        </CardContent>
      </Card>

      {/* Save button */}
      <div className="flex justify-end">
        <Button
          type="submit"
          className="btn-phoenix-primary"
          disabled={updateProfile.isPending || !isDirty}
        >
          {updateProfile.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
