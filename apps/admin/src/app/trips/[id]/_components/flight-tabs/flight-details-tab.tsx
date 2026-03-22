'use client'

import { Input } from '@/components/ui/input'
import { TimePicker } from '@/components/ui/time-picker'
import { DatePickerEnhanced } from '@/components/ui/date-picker-enhanced'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'approved', label: 'Approved' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'optional', label: 'Optional' },
] as const

interface FlightDetailsTabProps {
  baseData: {
    name: string
    description: string
    startDatetime: string
    endDatetime: string
    timezone: string
    location: string
    address: string
    notes: string
    confirmationNumber: string
    status: string
  }
  flightDetails: {
    airline: string
    flightNumber: string
    departureAirportCode: string
    departureDate: string
    departureTime: string
    departureTimezone: string
    departureTerminal: string
    departureGate: string
    arrivalAirportCode: string
    arrivalDate: string
    arrivalTime: string
    arrivalTimezone: string
    arrivalTerminal: string
    arrivalGate: string
  }
  onBaseDataChange: (data: any) => void
  onFlightDetailsChange: (data: any) => void
}

export function FlightDetailsTab({
  baseData,
  flightDetails,
  onBaseDataChange,
  onFlightDetailsChange,
}: FlightDetailsTabProps) {
  return (
    <div className="space-y-6">
      {/* Basic Information */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-ash-900">Basic Information</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-ash-900 block mb-2">
              Flight Name *
            </label>
            <Input
              value={baseData.name}
              onChange={(e) => onBaseDataChange({ ...baseData, name: e.target.value })}
              placeholder="e.g., Flight to Paris"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-ash-900 block mb-2">
              Status
            </label>
            <Select
              value={baseData.status}
              onValueChange={(value) => onBaseDataChange({ ...baseData, status: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-ash-900 block mb-2">
            Description
          </label>
          <Textarea
            value={baseData.description}
            onChange={(e) => onBaseDataChange({ ...baseData, description: e.target.value })}
            placeholder="Brief description of the flight"
            rows={3}
          />
        </div>

        <div>
          <label className="text-sm font-medium text-ash-900 block mb-2">
            Confirmation Number
          </label>
          <Input
            value={baseData.confirmationNumber}
            onChange={(e) => onBaseDataChange({ ...baseData, confirmationNumber: e.target.value })}
            placeholder="Booking reference"
          />
        </div>
      </div>

      {/* Flight Information */}
      <div className="space-y-4 pt-4 border-t">
        <h3 className="text-sm font-semibold text-ash-900">Flight Information</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-ash-900 block mb-2">
              Airline
            </label>
            <Input
              value={flightDetails.airline}
              onChange={(e) => onFlightDetailsChange({ ...flightDetails, airline: e.target.value })}
              placeholder="e.g., Air France"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-ash-900 block mb-2">
              Flight Number
            </label>
            <Input
              value={flightDetails.flightNumber}
              onChange={(e) => onFlightDetailsChange({ ...flightDetails, flightNumber: e.target.value })}
              placeholder="e.g., AF123"
            />
          </div>
        </div>
      </div>

      {/* Departure Details */}
      <div className="space-y-4 pt-4 border-t">
        <h3 className="text-sm font-semibold text-ash-900">Departure</h3>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium text-ash-900 block mb-2">
              Airport Code
            </label>
            <Input
              value={flightDetails.departureAirportCode}
              onChange={(e) => onFlightDetailsChange({ ...flightDetails, departureAirportCode: e.target.value.toUpperCase() })}
              placeholder="JFK"
              maxLength={3}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-ash-900 block mb-2">
              Date
            </label>
            <DatePickerEnhanced
              value={flightDetails.departureDate || null}
              onChange={(date) => onFlightDetailsChange({ ...flightDetails, departureDate: date || '' })}
              placeholder="Select departure date"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-ash-900 block mb-2">
              Time
            </label>
            <TimePicker
              value={flightDetails.departureTime || null}
              onChange={(time) => onFlightDetailsChange({ ...flightDetails, departureTime: time || '' })}
              placeholder="HH:MM"
              aria-label="Departure time"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium text-ash-900 block mb-2">
              Timezone
            </label>
            <Input
              value={flightDetails.departureTimezone}
              onChange={(e) => onFlightDetailsChange({ ...flightDetails, departureTimezone: e.target.value })}
              placeholder="America/New_York"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-ash-900 block mb-2">
              Terminal
            </label>
            <Input
              value={flightDetails.departureTerminal}
              onChange={(e) => onFlightDetailsChange({ ...flightDetails, departureTerminal: e.target.value })}
              placeholder="Terminal 1"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-ash-900 block mb-2">
              Gate
            </label>
            <Input
              value={flightDetails.departureGate}
              onChange={(e) => onFlightDetailsChange({ ...flightDetails, departureGate: e.target.value })}
              placeholder="A12"
            />
          </div>
        </div>
      </div>

      {/* Arrival Details */}
      <div className="space-y-4 pt-4 border-t">
        <h3 className="text-sm font-semibold text-ash-900">Arrival</h3>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium text-ash-900 block mb-2">
              Airport Code
            </label>
            <Input
              value={flightDetails.arrivalAirportCode}
              onChange={(e) => onFlightDetailsChange({ ...flightDetails, arrivalAirportCode: e.target.value.toUpperCase() })}
              placeholder="CDG"
              maxLength={3}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-ash-900 block mb-2">
              Date
            </label>
            <DatePickerEnhanced
              value={flightDetails.arrivalDate || null}
              onChange={(date) => onFlightDetailsChange({ ...flightDetails, arrivalDate: date || '' })}
              placeholder="Select arrival date"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-ash-900 block mb-2">
              Time
            </label>
            <TimePicker
              value={flightDetails.arrivalTime || null}
              onChange={(time) => onFlightDetailsChange({ ...flightDetails, arrivalTime: time || '' })}
              placeholder="HH:MM"
              aria-label="Arrival time"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium text-ash-900 block mb-2">
              Timezone
            </label>
            <Input
              value={flightDetails.arrivalTimezone}
              onChange={(e) => onFlightDetailsChange({ ...flightDetails, arrivalTimezone: e.target.value })}
              placeholder="Europe/Paris"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-ash-900 block mb-2">
              Terminal
            </label>
            <Input
              value={flightDetails.arrivalTerminal}
              onChange={(e) => onFlightDetailsChange({ ...flightDetails, arrivalTerminal: e.target.value })}
              placeholder="Terminal 2E"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-ash-900 block mb-2">
              Gate
            </label>
            <Input
              value={flightDetails.arrivalGate}
              onChange={(e) => onFlightDetailsChange({ ...flightDetails, arrivalGate: e.target.value })}
              placeholder="E45"
            />
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="pt-4 border-t">
        <label className="text-sm font-medium text-ash-900 block mb-2">
          Additional Notes
        </label>
        <Textarea
          value={baseData.notes}
          onChange={(e) => onBaseDataChange({ ...baseData, notes: e.target.value })}
          placeholder="Special instructions, baggage information, etc."
          rows={3}
        />
      </div>
    </div>
  )
}
