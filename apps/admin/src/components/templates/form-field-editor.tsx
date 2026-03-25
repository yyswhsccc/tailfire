'use client'

import { useState, useCallback, useMemo } from 'react'
import {
  Type,
  AlignLeft,
  ChevronDown,
  Circle,
  CheckSquare,
  Calendar,
  Mail,
  Phone,
  PenLine,
  Heading,
  Text,
  ChevronUp,
  Trash2,
  Plus,
  X,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'

// ============================================================================
// Types
// ============================================================================

export type FormFieldType =
  | 'text'
  | 'textarea'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'date'
  | 'email'
  | 'phone'
  | 'signature'
  | 'heading'
  | 'paragraph'

export interface FormField {
  id: string
  type: FormFieldType
  label: string
  placeholder?: string
  required?: boolean
  options?: string[]
  showWhen?: { field: string; value: string }
  validation?: { minLength?: number; maxLength?: number; pattern?: string }
  defaultValue?: string
}

export interface FormSchema {
  fields: FormField[]
  settings?: { submitButtonText?: string }
}

export interface FormFieldEditorProps {
  value: FormSchema | null
  onChange: (schema: FormSchema) => void
}

// ============================================================================
// Constants
// ============================================================================

const FIELD_TYPES: { value: FormFieldType; label: string; icon: typeof Type }[] = [
  { value: 'text', label: 'Text', icon: Type },
  { value: 'textarea', label: 'Textarea', icon: AlignLeft },
  { value: 'select', label: 'Select', icon: ChevronDown },
  { value: 'radio', label: 'Radio', icon: Circle },
  { value: 'checkbox', label: 'Checkbox', icon: CheckSquare },
  { value: 'date', label: 'Date', icon: Calendar },
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'phone', label: 'Phone', icon: Phone },
  { value: 'signature', label: 'Signature', icon: PenLine },
  { value: 'heading', label: 'Heading', icon: Heading },
  { value: 'paragraph', label: 'Paragraph', icon: Text },
]

const FIELD_TYPE_MAP = Object.fromEntries(
  FIELD_TYPES.map((ft) => [ft.value, ft])
) as Record<FormFieldType, (typeof FIELD_TYPES)[number]>

/** Field types that support a placeholder input */
const PLACEHOLDER_TYPES: FormFieldType[] = ['text', 'textarea', 'email', 'phone', 'date']

/** Field types that use an options list */
const OPTIONS_TYPES: FormFieldType[] = ['select', 'radio']

/** Field types that are layout-only (no required toggle, no placeholder) */
const LAYOUT_TYPES: FormFieldType[] = ['heading', 'paragraph']

// ============================================================================
// Helpers
// ============================================================================

function generateFieldId(): string {
  return `field_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

function createDefaultField(): FormField {
  return {
    id: generateFieldId(),
    type: 'text',
    label: 'New Field',
    required: false,
  }
}

// ============================================================================
// Sub-components
// ============================================================================

interface OptionsEditorProps {
  options: string[]
  onChange: (options: string[]) => void
}

function OptionsEditor({ options, onChange }: OptionsEditorProps) {
  const [newOption, setNewOption] = useState('')

  const addOption = useCallback(() => {
    const trimmed = newOption.trim()
    if (!trimmed) return
    onChange([...options, trimmed])
    setNewOption('')
  }, [newOption, options, onChange])

  const removeOption = useCallback(
    (index: number) => {
      onChange(options.filter((_, i) => i !== index))
    },
    [options, onChange]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        addOption()
      }
    },
    [addOption]
  )

  return (
    <div className="space-y-2">
      <Label className="text-xs text-ash-500">Options</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt, index) => (
          <Badge
            key={index}
            variant="secondary"
            className="flex items-center gap-1 pr-1"
          >
            {opt}
            <button
              type="button"
              onClick={() => removeOption(index)}
              className="ml-0.5 rounded-full hover:bg-ash-300 p-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-1.5">
        <Input
          value={newOption}
          onChange={(e) => setNewOption(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add option..."
          className="h-8 text-sm"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addOption}
          disabled={!newOption.trim()}
          className="h-8 px-2 shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

interface ShowWhenEditorProps {
  showWhen: { field: string; value: string } | undefined
  availableFields: FormField[]
  currentFieldId: string
  onChange: (showWhen: { field: string; value: string } | undefined) => void
}

function ShowWhenEditor({
  showWhen,
  availableFields,
  currentFieldId,
  onChange,
}: ShowWhenEditorProps) {
  const otherFields = useMemo(
    () => availableFields.filter((f) => f.id !== currentFieldId && !LAYOUT_TYPES.includes(f.type)),
    [availableFields, currentFieldId]
  )

  if (!showWhen) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-xs text-ash-500 h-7 px-2"
        onClick={() => onChange({ field: '', value: '' })}
      >
        + Add condition
      </Button>
    )
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label className="text-xs text-ash-500 shrink-0">Show when</Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0 text-ash-400 hover:text-red-500 ml-auto"
          onClick={() => onChange(undefined)}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
      <div className="flex items-center gap-1.5">
        <Select
          value={showWhen.field}
          onValueChange={(val) => onChange({ ...showWhen, field: val })}
        >
          <SelectTrigger className="h-8 text-xs flex-1">
            <SelectValue placeholder="Field..." />
          </SelectTrigger>
          <SelectContent>
            {otherFields.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.label || f.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-ash-400">=</span>
        <Input
          value={showWhen.value}
          onChange={(e) => onChange({ ...showWhen, value: e.target.value })}
          placeholder="Value..."
          className="h-8 text-xs flex-1"
        />
      </div>
    </div>
  )
}

interface FieldCardProps {
  field: FormField
  index: number
  total: number
  allFields: FormField[]
  onUpdate: (id: string, updates: Partial<FormField>) => void
  onDelete: (id: string) => void
  onMoveUp: (index: number) => void
  onMoveDown: (index: number) => void
}

function FieldCard({
  field,
  index,
  total,
  allFields,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
}: FieldCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isLayout = LAYOUT_TYPES.includes(field.type)
  const hasPlaceholder = PLACEHOLDER_TYPES.includes(field.type)
  const hasOptions = OPTIONS_TYPES.includes(field.type)
  const FieldIcon = FIELD_TYPE_MAP[field.type]?.icon ?? Type

  const handleDelete = useCallback(() => {
    const hasContent =
      field.label && field.label !== 'New Field' && field.label.trim().length > 0
    if (hasContent && !confirmDelete) {
      setConfirmDelete(true)
      return
    }
    onDelete(field.id)
  }, [field, confirmDelete, onDelete])

  return (
    <Card className="p-3 space-y-3">
      {/* Header row: type icon, field number, move/delete actions */}
      <div className="flex items-center gap-2">
        <FieldIcon className="h-4 w-4 text-ash-400 shrink-0" />
        <span className="text-xs text-ash-400 font-medium">
          #{index + 1}
        </span>
        <div className="flex-1" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          disabled={index === 0}
          onClick={() => onMoveUp(index)}
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          disabled={index === total - 1}
          onClick={() => onMoveDown(index)}
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
        {confirmDelete ? (
          <div className="flex items-center gap-1">
            <span className="text-xs text-red-500">Delete?</span>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={handleDelete}
            >
              Yes
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setConfirmDelete(false)}
            >
              No
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-ash-400 hover:text-red-500"
            onClick={handleDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Type + Required row */}
      <div className="flex items-end gap-3">
        <div className="flex-1 min-w-[120px] max-w-[180px]">
          <Label className="text-xs text-ash-500 mb-1 block">Type</Label>
          <Select
            value={field.type}
            onValueChange={(val) =>
              onUpdate(field.id, { type: val as FormFieldType })
            }
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FIELD_TYPES.map((ft) => {
                const Icon = ft.icon
                return (
                  <SelectItem key={ft.value} value={ft.value}>
                    <span className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5 text-ash-400" />
                      {ft.label}
                    </span>
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </div>

        {!isLayout && (
          <div className="flex items-center gap-2 pb-0.5">
            <Label className="text-xs text-ash-500">Required</Label>
            <Switch
              checked={field.required ?? false}
              onCheckedChange={(checked) =>
                onUpdate(field.id, { required: checked })
              }
            />
          </div>
        )}
      </div>

      {/* Label input */}
      <div>
        <Label className="text-xs text-ash-500 mb-1 block">Label</Label>
        <Input
          value={field.label}
          onChange={(e) => onUpdate(field.id, { label: e.target.value })}
          placeholder="Field label..."
          className="h-8 text-sm"
        />
      </div>

      {/* Placeholder (conditional) */}
      {hasPlaceholder && (
        <div>
          <Label className="text-xs text-ash-500 mb-1 block">Placeholder</Label>
          <Input
            value={field.placeholder ?? ''}
            onChange={(e) =>
              onUpdate(field.id, { placeholder: e.target.value || undefined })
            }
            placeholder="Placeholder text..."
            className="h-8 text-sm"
          />
        </div>
      )}

      {/* Options (conditional) */}
      {hasOptions && (
        <OptionsEditor
          options={field.options ?? []}
          onChange={(options) => onUpdate(field.id, { options })}
        />
      )}

      {/* Show When (conditional) */}
      {!isLayout && (
        <ShowWhenEditor
          showWhen={field.showWhen}
          availableFields={allFields}
          currentFieldId={field.id}
          onChange={(showWhen) => onUpdate(field.id, { showWhen })}
        />
      )}
    </Card>
  )
}

// ============================================================================
// Code View
// ============================================================================

interface CodeViewProps {
  schema: FormSchema
  onApply: (schema: FormSchema) => void
}

function CodeView({ schema, onApply }: CodeViewProps) {
  const [jsonText, setJsonText] = useState(() =>
    JSON.stringify(schema, null, 2)
  )
  const [error, setError] = useState<string | null>(null)

  const handleBlur = useCallback(() => {
    try {
      const parsed = JSON.parse(jsonText)
      // Basic validation: must have a fields array
      if (!parsed || !Array.isArray(parsed.fields)) {
        setError('JSON must have a "fields" array')
        return
      }
      setError(null)
      onApply(parsed as FormSchema)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid JSON')
    }
  }, [jsonText, onApply])

  return (
    <div className="flex flex-col h-full">
      <textarea
        value={jsonText}
        onChange={(e) => {
          setJsonText(e.target.value)
          if (error) setError(null)
        }}
        onBlur={handleBlur}
        spellCheck={false}
        className="flex-1 w-full p-4 font-mono text-sm bg-ash-50 border border-ash-200 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        placeholder='{"fields": [], "settings": {}}'
      />
      {error && (
        <div className="flex items-center gap-2 mt-2 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function FormFieldEditor({ value, onChange }: FormFieldEditorProps) {
  const schema: FormSchema = useMemo(
    () => value ?? { fields: [], settings: { submitButtonText: 'Submit' } },
    [value]
  )

  const [activeView, setActiveView] = useState<string>('visual')

  // --- Field CRUD operations ---

  const updateField = useCallback(
    (id: string, updates: Partial<FormField>) => {
      const next = {
        ...schema,
        fields: schema.fields.map((f) =>
          f.id === id ? { ...f, ...updates } : f
        ),
      }
      onChange(next)
    },
    [schema, onChange]
  )

  const deleteField = useCallback(
    (id: string) => {
      const next = {
        ...schema,
        fields: schema.fields.filter((f) => f.id !== id),
      }
      onChange(next)
    },
    [schema, onChange]
  )

  const addField = useCallback(() => {
    const next = {
      ...schema,
      fields: [...schema.fields, createDefaultField()],
    }
    onChange(next)
  }, [schema, onChange])

  const moveField = useCallback(
    (fromIndex: number, direction: 'up' | 'down') => {
      const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1
      if (toIndex < 0 || toIndex >= schema.fields.length) return
      const fields = [...schema.fields]
      const removed = fields.splice(fromIndex, 1)
      if (removed[0]) fields.splice(toIndex, 0, removed[0])
      onChange({ ...schema, fields })
    },
    [schema, onChange]
  )

  const updateSettings = useCallback(
    (submitButtonText: string) => {
      onChange({
        ...schema,
        settings: { ...schema.settings, submitButtonText },
      })
    },
    [schema, onChange]
  )

  const handleCodeApply = useCallback(
    (newSchema: FormSchema) => {
      onChange(newSchema)
    },
    [onChange]
  )

  return (
    <div className="flex flex-col h-full">
      <Tabs value={activeView} onValueChange={setActiveView} className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-ash-200 bg-ash-50 shrink-0">
          <span className="text-sm font-medium text-ash-700">Form Fields</span>
          <TabsList className="h-8">
            <TabsTrigger value="visual" className="text-xs px-3 h-6">
              Visual
            </TabsTrigger>
            <TabsTrigger value="code" className="text-xs px-3 h-6">
              Code
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Visual view */}
        <TabsContent value="visual" className="flex-1 overflow-y-auto mt-0 p-4 space-y-3">
          {schema.fields.length === 0 && (
            <div className="text-center py-12 text-ash-400">
              <Text className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No form fields yet</p>
              <p className="text-xs mt-1">Click "Add Field" to get started</p>
            </div>
          )}

          {schema.fields.map((field, index) => (
            <FieldCard
              key={field.id}
              field={field}
              index={index}
              total={schema.fields.length}
              allFields={schema.fields}
              onUpdate={updateField}
              onDelete={deleteField}
              onMoveUp={(i) => moveField(i, 'up')}
              onMoveDown={(i) => moveField(i, 'down')}
            />
          ))}

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={addField}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Field
          </Button>

          {/* Settings section */}
          <Separator className="my-2" />
          <div className="space-y-2">
            <Label className="text-xs font-medium text-ash-600">Settings</Label>
            <div>
              <Label className="text-xs text-ash-500 mb-1 block">
                Submit Button Text
              </Label>
              <Input
                value={schema.settings?.submitButtonText ?? 'Submit'}
                onChange={(e) => updateSettings(e.target.value)}
                placeholder="Submit"
                className="h-8 text-sm"
              />
            </div>
          </div>
        </TabsContent>

        {/* Code view */}
        <TabsContent value="code" className="flex-1 mt-0 p-4">
          <CodeView schema={schema} onApply={handleCodeApply} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
