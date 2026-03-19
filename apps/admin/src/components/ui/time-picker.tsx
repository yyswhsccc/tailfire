'use client'

/**
 * Time Picker Component
 *
 * A branded time selection component with manual text input and
 * popover time selector. Follows the same design pattern as
 * DatePickerEnhanced for consistency.
 *
 * Features:
 * - Manual text input with HH:MM format validation
 * - Popover with hour/minute selectors
 * - 12-hour (AM/PM) or 24-hour format support
 * - Clear button
 * - Accessible with proper ARIA labels
 * - WCAG 2.1 AA compliant touch targets (44px minimum)
 */

import * as React from 'react'
import { Clock, X, ChevronUp, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface TimePickerProps {
  /**
   * Current time value (HH:MM format, 24-hour)
   */
  value?: string | null

  /**
   * Callback when time changes
   * @param time - Time string (HH:MM) or null
   */
  onChange?: (time: string | null) => void

  /**
   * Placeholder text when no time selected
   * @default 'HH:MM'
   */
  placeholder?: string

  /**
   * Disabled state
   */
  disabled?: boolean

  /**
   * Additional CSS classes for the container
   */
  className?: string

  /**
   * ARIA label for accessibility
   */
  'aria-label'?: string

  /**
   * Show clear button when time is selected
   * @default true
   */
  showClear?: boolean

  /**
   * Use 12-hour format with AM/PM
   * @default false
   */
  use12Hour?: boolean
}

/**
 * Parse time string to hours and minutes
 */
function parseTime(time: string | null | undefined): { hours: number; minutes: number } | null {
  if (!time) return null
  const match = time.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const hours = parseInt(match[1]!, 10)
  const minutes = parseInt(match[2]!, 10)
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return { hours, minutes }
}

/**
 * Format hours and minutes to HH:MM string
 */
function formatTime(hours: number, minutes: number): string {
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
}

/**
 * Validate time string format
 */
function isValidTimeFormat(time: string): boolean {
  return /^([01]?\d|2[0-3]):([0-5]\d)$/.test(time)
}

/**
 * Time Picker with Manual Input and Popover Selector
 *
 * @example
 * ```tsx
 * <TimePicker
 *   value={departureTime}
 *   onChange={(time) => setDepartureTime(time)}
 *   placeholder="Select time"
 *   aria-label="Departure time"
 * />
 * ```
 */
export function TimePicker({
  value,
  onChange,
  placeholder = 'HH:MM',
  disabled = false,
  className,
  'aria-label': ariaLabel,
  showClear = true,
  use12Hour = false,
}: TimePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [inputValue, setInputValue] = React.useState(value || '')
  const [isValid, setIsValid] = React.useState(true)
  const isTypingRef = React.useRef(false)

  // Sync external value changes (only when not actively typing)
  React.useEffect(() => {
    if (!isTypingRef.current && value !== undefined) {
      const externalValue = value || ''
      if (externalValue !== inputValue) {
        setInputValue(externalValue)
        setIsValid(!externalValue || isValidTimeFormat(externalValue))
      }
    }
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  // Parse current time for selectors
  const parsed = parseTime(value)
  const currentHours = parsed?.hours ?? 12
  const currentMinutes = parsed?.minutes ?? 0

  /**
   * Auto-format time input as user types.
   * Strips non-digits, auto-inserts colon after 2 digits.
   * "1" → "1", "11" → "11", "113" → "11:3", "1130" → "11:30"
   * Also handles if user types colon manually: "11:" → "11:"
   */
  const autoFormatTime = (raw: string): string => {
    // If user typed a colon, let it through as-is
    if (raw.includes(':')) return raw

    // Strip non-digits
    const digits = raw.replace(/\D/g, '')

    // Auto-insert colon after first 2 digits
    if (digits.length <= 2) return digits
    return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`
  }

  // Handle manual input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    isTypingRef.current = true
    const formatted = autoFormatTime(e.target.value)

    // Limit to 5 chars (HH:MM)
    const newValue = formatted.slice(0, 5)
    setInputValue(newValue)

    // Only call onChange for valid values or empty (clear)
    if (newValue === '') {
      setIsValid(true)
      onChange?.(null)
    } else if (isValidTimeFormat(newValue)) {
      setIsValid(true)
      onChange?.(newValue)
    } else {
      // Intermediate typing state — don't call onChange or show error
      setIsValid(true)
    }
  }

  // Handle input blur - normalize format and clear typing flag
  const handleInputBlur = () => {
    isTypingRef.current = false

    // Try to normalize common formats on blur
    const digits = inputValue.replace(/\D/g, '')
    if (digits.length === 3 || digits.length === 4) {
      // "130" → "01:30", "1130" → "11:30"
      const padded = digits.padStart(4, '0')
      const normalized = `${padded.slice(0, 2)}:${padded.slice(2, 4)}`
      if (isValidTimeFormat(normalized)) {
        setInputValue(normalized)
        setIsValid(true)
        onChange?.(normalized)
        return
      }
    }

    if (inputValue && isValidTimeFormat(inputValue)) {
      const parsed = parseTime(inputValue)
      if (parsed) {
        const normalized = formatTime(parsed.hours, parsed.minutes)
        setInputValue(normalized)
        onChange?.(normalized)
      }
    } else if (inputValue && !isValidTimeFormat(inputValue)) {
      setIsValid(false)
    }
  }

  // Handle hour change from selector
  const handleHourChange = (delta: number) => {
    const newHours = ((currentHours + delta + 24) % 24)
    const newTime = formatTime(newHours, currentMinutes)
    setInputValue(newTime)
    setIsValid(true)
    onChange?.(newTime)
  }

  // Handle minute change from selector
  const handleMinuteChange = (delta: number) => {
    const newMinutes = ((currentMinutes + delta + 60) % 60)
    const newTime = formatTime(currentHours, newMinutes)
    setInputValue(newTime)
    setIsValid(true)
    onChange?.(newTime)
  }

  // Handle clear button
  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    setInputValue('')
    setIsValid(true)
    onChange?.(null)
  }

  // Format display for 12-hour mode
  const getDisplayValue = () => {
    if (!inputValue || !isValidTimeFormat(inputValue)) return inputValue
    if (!use12Hour) return inputValue

    const parsed = parseTime(inputValue)
    if (!parsed) return inputValue

    const hours12 = parsed.hours === 0 ? 12 : parsed.hours > 12 ? parsed.hours - 12 : parsed.hours
    const ampm = parsed.hours >= 12 ? 'PM' : 'AM'
    return `${hours12}:${parsed.minutes.toString().padStart(2, '0')} ${ampm}`
  }

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Input
        type="text"
        value={use12Hour ? getDisplayValue() : inputValue}
        onChange={handleInputChange}
        onBlur={handleInputBlur}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel || 'Enter time in HH:MM format'}
        aria-invalid={!isValid}
        className={cn(
          'min-h-11 flex-1',
          !isValid && 'border-destructive focus-visible:ring-destructive'
        )}
      />

      {/* Clear Button */}
      {showClear && inputValue && !disabled && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleClear}
          className="h-9 w-9 shrink-0"
          aria-label="Clear time"
        >
          <X className="h-4 w-4" />
        </Button>
      )}

      {/* Time Selector Popup Button */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={disabled}
            className="h-9 w-9 shrink-0"
            aria-label="Open time selector"
          >
            <Clock className="h-4 w-4" />
          </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-4" align="end">
              <div className="flex items-center gap-4">
                {/* Hours Selector */}
                <div className="flex flex-col items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleHourChange(1)}
                    className="h-8 w-8 p-0"
                    aria-label="Increase hours"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <div className="w-12 h-12 flex items-center justify-center text-2xl font-mono font-semibold bg-muted rounded-md">
                    {use12Hour
                      ? (currentHours === 0 ? 12 : currentHours > 12 ? currentHours - 12 : currentHours).toString().padStart(2, '0')
                      : currentHours.toString().padStart(2, '0')
                    }
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleHourChange(-1)}
                    className="h-8 w-8 p-0"
                    aria-label="Decrease hours"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </div>

                {/* Separator */}
                <div className="text-2xl font-mono font-semibold">:</div>

                {/* Minutes Selector */}
                <div className="flex flex-col items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleMinuteChange(1)}
                    className="h-8 w-8 p-0"
                    aria-label="Increase minutes"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <div className="w-12 h-12 flex items-center justify-center text-2xl font-mono font-semibold bg-muted rounded-md">
                    {currentMinutes.toString().padStart(2, '0')}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleMinuteChange(-1)}
                    className="h-8 w-8 p-0"
                    aria-label="Decrease minutes"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </div>

                {/* AM/PM Selector (12-hour mode only) */}
                {use12Hour && (
                  <div className="flex flex-col items-center gap-1">
                    <Button
                      type="button"
                      variant={currentHours < 12 ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        if (currentHours >= 12) {
                          const newTime = formatTime(currentHours - 12, currentMinutes)
                          setInputValue(newTime)
                          onChange?.(newTime)
                        }
                      }}
                      className="h-8 w-12 text-xs"
                    >
                      AM
                    </Button>
                    <Button
                      type="button"
                      variant={currentHours >= 12 ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        if (currentHours < 12) {
                          const newTime = formatTime(currentHours + 12, currentMinutes)
                          setInputValue(newTime)
                          onChange?.(newTime)
                        }
                      }}
                      className="h-8 w-12 text-xs"
                    >
                      PM
                    </Button>
                  </div>
                )}
              </div>

              {/* Quick time presets */}
              <div className="mt-4 pt-4 border-t flex gap-2 flex-wrap">
                {['09:00', '12:00', '15:00', '18:00'].map((preset) => (
                  <Button
                    key={preset}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setInputValue(preset)
                      setIsValid(true)
                      onChange?.(preset)
                      setOpen(false)
                    }}
                    className="text-xs"
                  >
                    {use12Hour
                      ? (() => {
                          const p = parseTime(preset)
                          if (!p) return preset
                          const h = p.hours === 0 ? 12 : p.hours > 12 ? p.hours - 12 : p.hours
                          const ampm = p.hours >= 12 ? 'PM' : 'AM'
                          return `${h}:${p.minutes.toString().padStart(2, '0')} ${ampm}`
                        })()
                      : preset
                    }
                  </Button>
                ))}
              </div>
            </PopoverContent>
      </Popover>

      {/* Validation Feedback */}
      {!isValid && inputValue && (
        <span className="sr-only" role="alert">
          Invalid time format. Please use HH:MM format.
        </span>
      )}
    </div>
  )
}
