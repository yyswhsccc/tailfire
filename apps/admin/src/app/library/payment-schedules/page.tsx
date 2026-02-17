'use client'

import { useState, useCallback } from 'react'
import { CalendarClock, Plus, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
  PaymentTemplateModal,
  type PaymentTemplate,
} from './_components/payment-template-modal'

/**
 * Payment Schedule Templates Library
 *
 * Agency-scoped reusable payment schedule patterns for TICO compliance.
 * Templates can be applied to activities to auto-generate payment milestones.
 *
 * Features:
 * - View/manage payment schedule templates
 * - Create new templates with deposit/installment configurations
 * - Mark templates as default for activity types
 * - TICO-compliant audit logging
 */

const INITIAL_TEMPLATES: PaymentTemplate[] = [
  {
    id: '1',
    name: 'Standard Cruise Deposit',
    isDefault: true,
    isActive: true,
    requiresPaymentReminders: true,
    milestones: [
      { id: 'm1', name: 'Deposit', percentage: 25, dueTiming: 'on_booking', daysBeforeDeparture: null },
      { id: 'm2', name: 'Balance', percentage: 75, dueTiming: 'days_before_departure', daysBeforeDeparture: 90 },
    ],
  },
  {
    id: '2',
    name: '3-Payment Plan',
    isDefault: false,
    isActive: true,
    requiresPaymentReminders: true,
    milestones: [
      { id: 'm3', name: 'First Payment', percentage: 34, dueTiming: 'on_booking', daysBeforeDeparture: null },
      { id: 'm4', name: 'Second Payment', percentage: 33, dueTiming: 'days_before_departure', daysBeforeDeparture: 60 },
      { id: 'm5', name: 'Final Payment', percentage: 33, dueTiming: 'days_before_departure', daysBeforeDeparture: 30 },
    ],
  },
  {
    id: '3',
    name: 'Full Payment Required',
    isDefault: false,
    isActive: true,
    requiresPaymentReminders: true,
    milestones: [
      { id: 'm6', name: 'Full Payment', percentage: 100, dueTiming: 'on_booking', daysBeforeDeparture: null },
    ],
  },
  {
    id: '4',
    name: 'Pay at Property',
    description: 'No advance payment required - guest pays at check-in',
    isDefault: false,
    isActive: true,
    requiresPaymentReminders: false,
    milestones: [
      { id: 'm7', name: 'Payment at Check-in', percentage: 100, dueTiming: 'at_checkin', daysBeforeDeparture: null },
    ],
  },
]

function getMilestonesSummary(template: PaymentTemplate): string {
  if (template.milestones.length === 0) {
    return 'No payments configured'
  }
  if (template.milestones.length === 1) {
    const m = template.milestones[0]
    if (m) {
      if (m.dueTiming === 'at_checkin') return 'Pay at Property'
      if (m.dueTiming === 'on_booking') return 'Full Payment'
      return m.name
    }
  }
  return template.milestones.map((m) => m.name).join(' → ')
}

export default function PaymentSchedulesLibraryPage() {
  const [isLoading] = useState(false)
  const [error] = useState<string | null>(null)
  const [templates, setTemplates] = useState<PaymentTemplate[]>(INITIAL_TEMPLATES)

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<PaymentTemplate | null>(null)

  // Handle opening modal for new template
  const handleNewTemplate = useCallback(() => {
    setEditingTemplate(null)
    setIsModalOpen(true)
  }, [])

  // Handle opening modal for editing
  const handleEditTemplate = useCallback((template: PaymentTemplate) => {
    setEditingTemplate(template)
    setIsModalOpen(true)
  }, [])

  // Handle saving template (create or update)
  const handleSaveTemplate = useCallback(
    (templateData: Omit<PaymentTemplate, 'id'> & { id?: string }) => {
      if (templateData.id) {
        // Update existing template
        setTemplates((prev) =>
          prev.map((t) =>
            t.id === templateData.id ? { ...t, ...templateData } as PaymentTemplate : t
          )
        )
      } else {
        // Create new template with generated ID
        const newTemplate: PaymentTemplate = {
          ...templateData,
          id: crypto.randomUUID(),
        }
        setTemplates((prev) => [...prev, newTemplate])
      }
    },
    []
  )

  // TODO: Replace with actual hook when API integration is ready
  // const { data: templates, isLoading, error } = usePaymentTemplates(agencyId)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <CalendarClock className="h-8 w-8 text-phoenix-gold-600" />
            <h1 className="text-2xl font-bold text-ash-900">Payment Schedule Templates</h1>
          </div>
          <p className="mt-1 text-sm text-ash-500">
            Create and manage reusable payment schedules for TICO-compliant booking workflows
          </p>
        </div>
        <Button onClick={handleNewTemplate}>
          <Plus className="mr-2 h-4 w-4" />
          New Template
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-ash-400" />
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <AlertCircle className="mx-auto h-12 w-12 text-red-400" />
          <h3 className="mt-2 text-sm font-medium text-ash-900">Error loading templates</h3>
          <p className="mt-1 text-sm text-ash-500">{error}</p>
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-ash-200 rounded-lg">
          <CalendarClock className="mx-auto h-12 w-12 text-ash-400" />
          <h3 className="mt-2 text-sm font-medium text-ash-900">No templates yet</h3>
          <p className="mt-1 text-sm text-ash-500">
            Create your first payment schedule template to streamline bookings
          </p>
          <Button className="mt-4" onClick={handleNewTemplate}>
            <Plus className="mr-2 h-4 w-4" />
            Create Template
          </Button>
        </div>
      ) : (
        <div className="border border-ash-200 rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Template Name</TableHead>
                <TableHead>Payment Flow</TableHead>
                <TableHead className="text-center">Payments</TableHead>
                <TableHead className="text-center">Reminders</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((template) => (
                <TableRow key={template.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {template.name}
                      {template.isDefault && (
                        <Badge variant="secondary" className="text-xs">Default</Badge>
                      )}
                    </div>
                    {template.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{template.description}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {getMilestonesSummary(template)}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">{template.milestones.length}</TableCell>
                  <TableCell className="text-center">
                    {template.requiresPaymentReminders ? (
                      <Badge variant="outline" className="border-blue-300 text-blue-700">On</Badge>
                    ) : (
                      <Badge variant="secondary">Off</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {template.isActive ? (
                      <Badge variant="outline" className="border-green-300 text-green-700">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditTemplate(template)}
                    >
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Info Section */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-blue-900">TICO Compliance</h4>
        <p className="mt-1 text-sm text-blue-700">
          Payment schedule templates help ensure compliance with TICO regulations by enforcing
          proper deposit structures and payment timing relative to departure dates.
        </p>
      </div>

      {/* Template Modal */}
      <PaymentTemplateModal
        template={editingTemplate}
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        onSave={handleSaveTemplate}
      />
    </div>
  )
}
