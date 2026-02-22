"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowLeft, Camera, Trash2, Save, Loader2 } from "lucide-react";
import Link from "next/link";
import {
  usePortalProfile,
  useUpdatePortalProfile,
  useUploadPortalAvatar,
  useDeletePortalAvatar,
  type UpdatePortalProfileInput,
} from "@/hooks/use-portal-data";
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
  Avatar,
  AvatarImage,
  AvatarFallback,
  Skeleton,
  Separator,
  Textarea,
  useToast,
} from "@tailfire/ui-public";

const SEAT_OPTIONS = [
  { value: "aisle", label: "Aisle" },
  { value: "window", label: "Window" },
  { value: "middle", label: "Middle" },
  { value: "no_preference", label: "No Preference" },
];

const CABIN_OPTIONS = [
  { value: "economy", label: "Economy" },
  { value: "premium_economy", label: "Premium Economy" },
  { value: "business", label: "Business" },
  { value: "first", label: "First" },
];

const FLOOR_OPTIONS = [
  { value: "high", label: "High Floor" },
  { value: "low", label: "Low Floor" },
  { value: "no_preference", label: "No Preference" },
];

export default function ProfilePage() {
  const { data: profile, isLoading } = usePortalProfile();
  const updateProfile = useUpdatePortalProfile();
  const uploadAvatar = useUploadPortalAvatar();
  const deleteAvatar = useDeletePortalAvatar();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state — initialized from profile data
  const [form, setForm] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState(false);

  // Hydrate form when profile loads
  useEffect(() => {
    if (profile) {
      const fields: Record<string, string> = {};
      const keys = [
        "firstName", "lastName", "preferredName", "prefix", "suffix",
        "legalFirstName", "legalLastName", "middleName",
        "phone", "dateOfBirth", "gender", "pronouns",
        "passportNumber", "passportExpiry", "passportCountry",
        "passportIssueDate", "nationality",
        "redressNumber", "knownTravelerNumber",
        "addressLine1", "addressLine2", "city", "province", "postalCode", "country",
        "dietaryRequirements", "mobilityRequirements",
        "seatPreference", "cabinPreference", "floorPreference",
      ] as const;

      for (const key of keys) {
        fields[key] = (profile as any)[key] ?? "";
      }
      setForm(fields);
      setIsDirty(false);
    }
  }, [profile]);

  const updateField = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const handleSave = async () => {
    try {
      await updateProfile.mutateAsync(form as UpdatePortalProfileInput);
      setIsDirty(false);
      toast({ title: "Profile updated", description: "Your changes have been saved." });
    } catch {
      toast({ title: "Error", description: "Failed to save profile. Please try again.", variant: "destructive" });
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadAvatar.mutateAsync(file);
      toast({ title: "Photo updated", description: "Your profile photo has been uploaded." });
    } catch {
      toast({ title: "Error", description: "Failed to upload photo. Please try again.", variant: "destructive" });
    }
    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleAvatarDelete = async () => {
    try {
      await deleteAvatar.mutateAsync();
      toast({ title: "Photo removed", description: "Your profile photo has been removed." });
    } catch {
      toast({ title: "Error", description: "Failed to remove photo.", variant: "destructive" });
    }
  };

  const userInitials = profile
    ? [profile.firstName, profile.lastName]
        .filter(Boolean)
        .map((n) => n![0])
        .join("")
        .toUpperCase() || "?"
    : "?";

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48 bg-phoenix-charcoal/30" />
        <Skeleton className="h-32 w-full bg-phoenix-charcoal/30" />
        <Skeleton className="h-64 w-full bg-phoenix-charcoal/30" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/">
          <Button variant="ghost" size="icon" className="text-phoenix-text-muted hover:text-white">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold text-white font-display">My Profile</h1>
      </div>

      {/* Avatar Section */}
      <Card className="bg-phoenix-charcoal/50 border-phoenix-gold/30">
        <CardContent className="p-6">
          <div className="flex items-center gap-6">
            <Avatar className="h-20 w-20 border-2 border-phoenix-gold/50">
              {profile?.photoUrl ? (
                <AvatarImage src={profile.photoUrl} alt="Profile photo" />
              ) : null}
              <AvatarFallback className="bg-phoenix-gold/20 text-phoenix-gold text-2xl">
                {userInitials}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-2">
              <p className="text-white font-medium">{profile?.displayName}</p>
              <p className="text-sm text-phoenix-text-muted">{profile?.email}</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-phoenix-gold/30 text-phoenix-text-light hover:bg-phoenix-gold/10"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadAvatar.isPending}
                >
                  {uploadAvatar.isPending ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Camera className="h-4 w-4 mr-1" />
                  )}
                  {profile?.photoUrl ? "Change" : "Upload"} Photo
                </Button>
                {profile?.photoUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                    onClick={handleAvatarDelete}
                    disabled={deleteAvatar.isPending}
                  >
                    {deleteAvatar.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 mr-1" />
                    )}
                    Remove
                  </Button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={handleAvatarUpload}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Personal Information */}
      <Card className="bg-phoenix-charcoal/50 border-phoenix-gold/30">
        <CardHeader>
          <CardTitle className="text-white">Personal Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Prefix" value={form.prefix} onChange={(v) => updateField("prefix", v)} placeholder="Mr., Ms., Dr." />
            <FormField label="First Name" value={form.firstName} onChange={(v) => updateField("firstName", v)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Last Name" value={form.lastName} onChange={(v) => updateField("lastName", v)} />
            <FormField label="Preferred Name" value={form.preferredName} onChange={(v) => updateField("preferredName", v)} placeholder="What you go by" />
          </div>
          <FormField label="Phone" value={form.phone} onChange={(v) => updateField("phone", v)} placeholder="+1 (555) 123-4567" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Gender" value={form.gender} onChange={(v) => updateField("gender", v)} placeholder="e.g. male, female, non-binary" />
            <FormField label="Pronouns" value={form.pronouns} onChange={(v) => updateField("pronouns", v)} placeholder="e.g. she/her, he/him, they/them" />
          </div>
          <FormField label="Date of Birth" value={form.dateOfBirth} onChange={(v) => updateField("dateOfBirth", v)} type="date" />
        </CardContent>
      </Card>

      {/* Passport & Travel ID */}
      <Card className="bg-phoenix-charcoal/50 border-phoenix-gold/30">
        <CardHeader>
          <CardTitle className="text-white">Passport & Travel ID</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Legal First Name" value={form.legalFirstName} onChange={(v) => updateField("legalFirstName", v)} placeholder="As on passport" />
            <FormField label="Legal Last Name" value={form.legalLastName} onChange={(v) => updateField("legalLastName", v)} placeholder="As on passport" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Middle Name" value={form.middleName} onChange={(v) => updateField("middleName", v)} />
            <FormField label="Suffix" value={form.suffix} onChange={(v) => updateField("suffix", v)} placeholder="Jr., Sr., III" />
          </div>
          <Separator className="bg-phoenix-gold/20" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Passport Number" value={form.passportNumber} onChange={(v) => updateField("passportNumber", v)} />
            <FormField label="Passport Country" value={form.passportCountry} onChange={(v) => updateField("passportCountry", v)} placeholder="e.g. CAN, USA" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Passport Issue Date" value={form.passportIssueDate} onChange={(v) => updateField("passportIssueDate", v)} type="date" />
            <FormField label="Passport Expiry" value={form.passportExpiry} onChange={(v) => updateField("passportExpiry", v)} type="date" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Nationality" value={form.nationality} onChange={(v) => updateField("nationality", v)} placeholder="e.g. CAN, USA" />
          </div>
          <Separator className="bg-phoenix-gold/20" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Redress Number" value={form.redressNumber} onChange={(v) => updateField("redressNumber", v)} />
            <FormField label="Known Traveler Number" value={form.knownTravelerNumber} onChange={(v) => updateField("knownTravelerNumber", v)} placeholder="TSA PreCheck / Global Entry" />
          </div>
        </CardContent>
      </Card>

      {/* Address */}
      <Card className="bg-phoenix-charcoal/50 border-phoenix-gold/30">
        <CardHeader>
          <CardTitle className="text-white">Address</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField label="Address Line 1" value={form.addressLine1} onChange={(v) => updateField("addressLine1", v)} />
          <FormField label="Address Line 2" value={form.addressLine2} onChange={(v) => updateField("addressLine2", v)} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="City" value={form.city} onChange={(v) => updateField("city", v)} />
            <FormField label="Province / State" value={form.province} onChange={(v) => updateField("province", v)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Postal Code" value={form.postalCode} onChange={(v) => updateField("postalCode", v)} />
            <FormField label="Country" value={form.country} onChange={(v) => updateField("country", v)} placeholder="e.g. CAN, USA" />
          </div>
        </CardContent>
      </Card>

      {/* Travel Preferences */}
      <Card className="bg-phoenix-charcoal/50 border-phoenix-gold/30">
        <CardHeader>
          <CardTitle className="text-white">Travel Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SelectField
              label="Seat Preference"
              value={form.seatPreference}
              onChange={(v) => updateField("seatPreference", v)}
              options={SEAT_OPTIONS}
            />
            <SelectField
              label="Cabin Preference"
              value={form.cabinPreference}
              onChange={(v) => updateField("cabinPreference", v)}
              options={CABIN_OPTIONS}
            />
            <SelectField
              label="Floor Preference"
              value={form.floorPreference}
              onChange={(v) => updateField("floorPreference", v)}
              options={FLOOR_OPTIONS}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-phoenix-text-light">Dietary Requirements</Label>
            <Textarea
              value={form.dietaryRequirements ?? ""}
              onChange={(e) => updateField("dietaryRequirements", e.target.value)}
              placeholder="e.g. Vegetarian, Gluten-free, Kosher"
              className="bg-phoenix-charcoal border-phoenix-gold/30 text-white placeholder:text-phoenix-text-muted"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-phoenix-text-light">Mobility Requirements</Label>
            <Textarea
              value={form.mobilityRequirements ?? ""}
              onChange={(e) => updateField("mobilityRequirements", e.target.value)}
              placeholder="e.g. Wheelchair accessible, Limited mobility"
              className="bg-phoenix-charcoal border-phoenix-gold/30 text-white placeholder:text-phoenix-text-muted"
            />
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end pb-8">
        <Button
          onClick={handleSave}
          disabled={!isDirty || updateProfile.isPending}
          className="bg-phoenix-gold text-white hover:bg-phoenix-gold/90 disabled:opacity-50"
        >
          {updateProfile.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Changes
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Helper components
// ============================================================================

function FormField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-phoenix-text-light">{label}</Label>
      <Input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-phoenix-charcoal border-phoenix-gold/30 text-white placeholder:text-phoenix-text-muted"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-2">
      <Label className="text-phoenix-text-light">{label}</Label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger className="bg-phoenix-charcoal border-phoenix-gold/30 text-white">
          <SelectValue placeholder="Select..." />
        </SelectTrigger>
        <SelectContent className="bg-phoenix-charcoal border-phoenix-gold/30">
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="text-white hover:bg-phoenix-gold/10">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
