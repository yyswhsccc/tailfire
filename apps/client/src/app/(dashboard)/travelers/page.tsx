"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowLeft, Camera, Trash2, Save, Loader2, Plus, Pencil, Award } from "lucide-react";
import Link from "next/link";
import {
  usePortalProfile,
  useUpdatePortalProfile,
  useUploadPortalAvatar,
  useDeletePortalAvatar,
  usePortalLoyaltyPrograms,
  usePortalLoyaltyCatalog,
  useCreatePortalLoyaltyProgram,
  useUpdatePortalLoyaltyProgram,
  useDeletePortalLoyaltyProgram,
  type UpdatePortalProfileInput,
  type PortalLoyaltyProgram,
  type PortalLoyaltyCatalogItem,
  type CreatePortalLoyaltyProgramInput,
  type UpdatePortalLoyaltyProgramInput,
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
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
            <FormField label="Middle Name" value={form.middleName} onChange={(v) => updateField("middleName", v)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Preferred Name" value={form.preferredName} onChange={(v) => updateField("preferredName", v)} placeholder="What you go by" />
            <FormField label="Phone" value={form.phone} onChange={(v) => updateField("phone", v)} placeholder="+1 (555) 123-4567" />
          </div>
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

      {/* Loyalty & Memberships */}
      <LoyaltyMembershipsSection />

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
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    // Prevent year overflow on date inputs (browsers allow >4 digit years)
    if (type === "date" && val) {
      const parts = val.split("-");
      if (parts[0] && parts[0].length > 4) {
        parts[0] = parts[0].slice(0, 4);
        val = parts.join("-");
      }
    }
    onChange(val);
  };

  return (
    <div className="space-y-2">
      <Label className="text-phoenix-text-light">{label}</Label>
      <Input
        type={type}
        value={value ?? ""}
        onChange={handleChange}
        placeholder={placeholder}
        max={type === "date" ? "2099-12-31" : undefined}
        min={type === "date" ? "1900-01-01" : undefined}
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

// ============================================================================
// Loyalty & Memberships Section
// ============================================================================

const PROGRAM_TYPE_LABELS: Record<string, string> = {
  cruise: "Cruise",
  airline: "Airline",
  hotel: "Hotel",
  other: "Other",
};

function LoyaltyMembershipsSection() {
  const { data: programs, isLoading } = usePortalLoyaltyPrograms();
  const deleteMutation = useDeletePortalLoyaltyProgram();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PortalLoyaltyProgram | null>(null);

  const handleAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const handleEdit = (program: PortalLoyaltyProgram) => {
    setEditing(program);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      toast({ title: "Membership removed", description: "Your loyalty membership has been deleted." });
    } catch {
      toast({ title: "Error", description: "Failed to delete membership.", variant: "destructive" });
    }
  };

  return (
    <>
      <Card className="bg-phoenix-charcoal/50 border-phoenix-gold/30">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <Award className="h-5 w-5 text-phoenix-gold" />
            Loyalty & Memberships
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            className="border-phoenix-gold/30 text-phoenix-text-light hover:bg-phoenix-gold/10"
            onClick={handleAdd}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full bg-phoenix-charcoal/30" />
              <Skeleton className="h-12 w-full bg-phoenix-charcoal/30" />
            </div>
          ) : !programs?.length ? (
            <p className="text-phoenix-text-muted text-sm text-center py-6">
              No loyalty memberships yet. Add your first one to get started.
            </p>
          ) : (
            <div className="space-y-3">
              {programs.map((program) => (
                <div
                  key={program.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-phoenix-charcoal/50 border border-phoenix-gold/10"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-medium text-sm">{program.providerName}</span>
                      <span className="text-phoenix-text-muted text-sm">{program.programName}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-phoenix-text-muted text-xs font-mono">#{program.membershipNumber}</span>
                      {program.tierLevel && (
                        <Badge variant="outline" className="text-xs border-phoenix-gold/30 text-phoenix-gold">
                          {program.tierLevel}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-2 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-phoenix-text-muted hover:text-white"
                      onClick={() => handleEdit(program)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-phoenix-text-muted hover:text-red-400"
                      onClick={() => handleDelete(program.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <LoyaltyProgramDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
      />
    </>
  );
}

function LoyaltyProgramDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: PortalLoyaltyProgram | null;
}) {
  const { data: catalog } = usePortalLoyaltyCatalog();
  const createMutation = useCreatePortalLoyaltyProgram();
  const updateMutation = useUpdatePortalLoyaltyProgram();
  const { toast } = useToast();

  const hasCatalog = (catalog?.length ?? 0) > 0;
  const [mode, setMode] = useState<"catalog" | "custom">("custom");
  const [selectedCatalogId, setSelectedCatalogId] = useState<string>("");
  const [providerName, setProviderName] = useState("");
  const [programName, setProgramName] = useState("");
  const [membershipNumber, setMembershipNumber] = useState("");
  const [tierLevel, setTierLevel] = useState("");
  const [notes, setNotes] = useState("");

  // Reset form when dialog opens/closes or editing changes
  useEffect(() => {
    if (open) {
      if (editing) {
        setProviderName(editing.providerName);
        setProgramName(editing.programName);
        setMembershipNumber(editing.membershipNumber);
        setTierLevel(editing.tierLevel ?? "");
        setNotes(editing.notes ?? "");
        if (editing.loyaltyProgramId && hasCatalog) {
          setMode("catalog");
          setSelectedCatalogId(editing.loyaltyProgramId);
        } else {
          setMode("custom");
          setSelectedCatalogId("");
        }
      } else {
        setMode(hasCatalog ? "catalog" : "custom");
        setSelectedCatalogId("");
        setProviderName("");
        setProgramName("");
        setMembershipNumber("");
        setTierLevel("");
        setNotes("");
      }
    }
  }, [open, editing, hasCatalog]);

  // When selecting from catalog, auto-fill provider and program name
  const handleCatalogSelect = (catalogId: string) => {
    setSelectedCatalogId(catalogId);
    const item = catalog?.find((c) => c.id === catalogId);
    if (item) {
      setProviderName(item.providerName);
      setProgramName(item.programName);
    }
  };

  // Group catalog items by type
  const catalogGroups = catalog
    ? Object.entries(
        catalog.reduce<Record<string, PortalLoyaltyCatalogItem[]>>((acc, item) => {
          const type = item.programType || "other";
          if (!acc[type]) acc[type] = [];
          acc[type].push(item);
          return acc;
        }, {}),
      ).sort(([a], [b]) => {
        const order = ["cruise", "airline", "hotel", "other"];
        return order.indexOf(a) - order.indexOf(b);
      })
    : [];

  const handleSubmit = async () => {
    if (!membershipNumber.trim()) {
      toast({ title: "Error", description: "Membership number is required.", variant: "destructive" });
      return;
    }
    if (!providerName.trim() || !programName.trim()) {
      toast({ title: "Error", description: "Provider and program name are required.", variant: "destructive" });
      return;
    }

    try {
      if (editing) {
        const data: UpdatePortalLoyaltyProgramInput = {
          providerName: providerName.trim(),
          programName: programName.trim(),
          membershipNumber: membershipNumber.trim(),
          tierLevel: tierLevel.trim() || undefined,
          notes: notes.trim() || undefined,
          loyaltyProgramId: mode === "catalog" && selectedCatalogId ? selectedCatalogId : undefined,
        };
        await updateMutation.mutateAsync({ id: editing.id, data });
        toast({ title: "Membership updated", description: "Your loyalty membership has been updated." });
      } else {
        const data: CreatePortalLoyaltyProgramInput = {
          providerName: providerName.trim(),
          programName: programName.trim(),
          membershipNumber: membershipNumber.trim(),
          tierLevel: tierLevel.trim() || undefined,
          notes: notes.trim() || undefined,
          loyaltyProgramId: mode === "catalog" && selectedCatalogId ? selectedCatalogId : undefined,
        };
        await createMutation.mutateAsync(data);
        toast({ title: "Membership added", description: "Your loyalty membership has been created." });
      }
      onOpenChange(false);
    } catch {
      toast({ title: "Error", description: "Failed to save membership. Please try again.", variant: "destructive" });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-phoenix-charcoal border-phoenix-gold/30 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">
            {editing ? "Edit Membership" : "Add Loyalty Membership"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Mode toggle — only show when catalog has programs */}
          {hasCatalog && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant={mode === "catalog" ? "default" : "outline"}
                size="sm"
                className={mode === "catalog"
                  ? "bg-phoenix-gold text-white hover:bg-phoenix-gold/90"
                  : "border-phoenix-gold/30 text-phoenix-text-light hover:bg-phoenix-gold/10"}
                onClick={() => setMode("catalog")}
              >
                From Catalog
              </Button>
              <Button
                type="button"
                variant={mode === "custom" ? "default" : "outline"}
                size="sm"
                className={mode === "custom"
                  ? "bg-phoenix-gold text-white hover:bg-phoenix-gold/90"
                  : "border-phoenix-gold/30 text-phoenix-text-light hover:bg-phoenix-gold/10"}
                onClick={() => {
                  setMode("custom");
                  setSelectedCatalogId("");
                }}
              >
                Custom
              </Button>
            </div>
          )}

          {/* Catalog selector */}
          {mode === "catalog" && (
            <div className="space-y-2">
              <Label className="text-phoenix-text-light">Program</Label>
              <Select value={selectedCatalogId || undefined} onValueChange={handleCatalogSelect}>
                <SelectTrigger className="bg-phoenix-charcoal border-phoenix-gold/30 text-white">
                  <SelectValue placeholder="Select a loyalty program..." />
                </SelectTrigger>
                <SelectContent className="bg-phoenix-charcoal border-phoenix-gold/30 max-h-60">
                  {catalogGroups.map(([type, items]) => (
                    <div key={type}>
                      <div className="px-2 py-1.5 text-xs font-semibold text-phoenix-text-muted uppercase tracking-wide">
                        {PROGRAM_TYPE_LABELS[type] ?? type}
                      </div>
                      {items.map((item) => (
                        <SelectItem
                          key={item.id}
                          value={item.id}
                          className="text-white hover:bg-phoenix-gold/10"
                        >
                          {item.providerName} — {item.programName}
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Custom provider/program fields */}
          {mode === "custom" && (
            <>
              <div className="space-y-2">
                <Label className="text-phoenix-text-light">Provider Name</Label>
                <Input
                  value={providerName}
                  onChange={(e) => setProviderName(e.target.value)}
                  placeholder="e.g. Royal Caribbean"
                  className="bg-phoenix-charcoal border-phoenix-gold/30 text-white placeholder:text-phoenix-text-muted"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-phoenix-text-light">Program Name</Label>
                <Input
                  value={programName}
                  onChange={(e) => setProgramName(e.target.value)}
                  placeholder="e.g. Crown & Anchor Society"
                  className="bg-phoenix-charcoal border-phoenix-gold/30 text-white placeholder:text-phoenix-text-muted"
                />
              </div>
            </>
          )}

          {/* Common fields */}
          <div className="space-y-2">
            <Label className="text-phoenix-text-light">Membership Number</Label>
            <Input
              value={membershipNumber}
              onChange={(e) => setMembershipNumber(e.target.value)}
              placeholder="e.g. 12345678"
              className="bg-phoenix-charcoal border-phoenix-gold/30 text-white placeholder:text-phoenix-text-muted"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-phoenix-text-light">Tier / Status Level</Label>
            <Input
              value={tierLevel}
              onChange={(e) => setTierLevel(e.target.value)}
              placeholder="e.g. Gold, Platinum, Diamond"
              className="bg-phoenix-charcoal border-phoenix-gold/30 text-white placeholder:text-phoenix-text-muted"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-phoenix-text-light">Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional details..."
              className="bg-phoenix-charcoal border-phoenix-gold/30 text-white placeholder:text-phoenix-text-muted"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            className="border-phoenix-gold/30 text-phoenix-text-light hover:bg-phoenix-gold/10"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            className="bg-phoenix-gold text-white hover:bg-phoenix-gold/90"
            onClick={handleSubmit}
            disabled={isPending}
          >
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {editing ? "Update" : "Add"} Membership
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
