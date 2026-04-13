'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useContacts } from '@/hooks/use-contacts'
import { useDebounce } from '@/hooks/use-debounce'
import type { ContactListItemDto } from '@tailfire/shared-types/api'

// ============================================================================
// Types
// ============================================================================

export interface RecipientToken {
  address: string
  name?: string
  contactId?: string
}

interface RecipientTokenInputProps {
  label: string // "To", "Cc", or "Bcc"
  tokens: RecipientToken[]
  onChange: (tokens: RecipientToken[]) => void
  placeholder?: string
  className?: string
}

// ============================================================================
// Helpers
// ============================================================================

const NAME_EMAIL_RE = /^(.+?)\s*<(.+?)>$/

/**
 * Parse a raw string into a RecipientToken.
 * Accepts "Name <email>", plain email, or empty string (returns null).
 */
function parseRawToken(raw: string): RecipientToken | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const match = NAME_EMAIL_RE.exec(trimmed)
  if (match && match[1] != null && match[2] != null) {
    const name = match[1].trim()
    const address = match[2].trim()
    if (!address.includes('@')) return null
    return { address, name: name || undefined }
  }

  if (!trimmed.includes('@')) return null
  return { address: trimmed }
}

/**
 * Dedup tokens by lowercased email address.
 * Existing tokens are kept; new ones are skipped if already present.
 */
function dedupTokens(
  existing: RecipientToken[],
  incoming: RecipientToken[]
): RecipientToken[] {
  const seen = new Set(existing.map((t) => t.address.toLowerCase()))
  const result = [...existing]
  for (const token of incoming) {
    const key = token.address.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      result.push(token)
    }
  }
  return result
}

// ============================================================================
// Component
// ============================================================================

export function RecipientTokenInput({
  label,
  tokens,
  onChange,
  placeholder = 'Add recipients...',
  className,
}: RecipientTokenInputProps) {
  const [inputValue, setInputValue] = React.useState('')
  const [showDropdown, setShowDropdown] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Debounce search 300 ms
  const debouncedSearch = useDebounce(inputValue.trim(), 300)

  // CRM search — only active when there's a search term
  const { data: contactsData } = useContacts(
    debouncedSearch
      ? { search: debouncedSearch, limit: 8, scope: 'all' }
      : {}
  )

  const contacts: ContactListItemDto[] =
    debouncedSearch && contactsData?.data ? contactsData.data : []

  // Show dropdown only when we have a search term AND results
  const dropdownVisible = showDropdown && debouncedSearch.length > 0 && contacts.length > 0

  // ── Token helpers ────────────────────────────────────────────────────────

  function addTokens(incoming: RecipientToken[]) {
    const next = dedupTokens(tokens, incoming)
    if (next.length !== tokens.length) {
      onChange(next)
    }
  }

  function addFromContact(contact: ContactListItemDto) {
    if (!contact.email) return
    addTokens([
      {
        address: contact.email,
        name: contact.displayName || undefined,
        contactId: contact.id,
      },
    ])
    setInputValue('')
    setShowDropdown(false)
    inputRef.current?.focus()
  }

  function removeToken(index: number) {
    const next = tokens.filter((_, i) => i !== index)
    onChange(next)
  }

  function commitInputValue(raw: string) {
    const token = parseRawToken(raw)
    if (token) {
      addTokens([token])
    }
    setInputValue('')
  }

  // ── Input handlers ───────────────────────────────────────────────────────

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      if (inputValue.trim()) {
        e.preventDefault()
        commitInputValue(inputValue)
      }
      return
    }

    if (e.key === 'Backspace' && inputValue === '' && tokens.length > 0) {
      removeToken(tokens.length - 1)
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setInputValue(e.target.value)
    setShowDropdown(true)
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData('text')
    // Split on comma or semicolon
    const parts = pasted.split(/[,;]+/)
    if (parts.length > 1) {
      e.preventDefault()
      const newTokens = parts
        .map((p) => parseRawToken(p))
        .filter((t): t is RecipientToken => t !== null)
      addTokens(newTokens)
      setInputValue('')
    }
    // If single value, let it fall through to normal input handling
  }

  function handleBlur() {
    // Delay to allow dropdown click to register first
    setTimeout(() => {
      setShowDropdown(false)
      if (inputValue.trim()) {
        commitInputValue(inputValue)
      }
    }, 200)
  }

  function handleFocus() {
    if (inputValue.trim()) {
      setShowDropdown(true)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className={cn('relative border-b px-3 py-2', className)}>
      <div className="flex flex-wrap items-center gap-1.5 min-h-[32px]">
        {/* Label */}
        <span className="text-xs font-medium text-muted-foreground min-w-[28px] shrink-0">
          {label}
        </span>

        {/* Token chips */}
        {tokens.map((token, index) => (
          <span
            key={`${token.address}-${index}`}
            className="inline-flex items-center gap-1 bg-primary/10 text-primary rounded-full px-2.5 py-0.5 text-xs font-medium"
          >
            <span className="max-w-[200px] truncate">
              {token.name ? `${token.name} <${token.address}>` : token.address}
            </span>
            <button
              type="button"
              onClick={() => removeToken(index)}
              className="rounded-full hover:bg-primary/20 transition-colors p-0.5 -mr-0.5"
              aria-label={`Remove ${token.address}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        {/* Text input */}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onBlur={handleBlur}
          onFocus={handleFocus}
          placeholder={tokens.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
      </div>

      {/* CRM contact dropdown */}
      {dropdownVisible && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border bg-popover shadow-lg overflow-hidden">
          <ul role="listbox" className="py-1 max-h-60 overflow-y-auto">
            {contacts.map((contact) => (
              <li
                key={contact.id}
                role="option"
                aria-selected={false}
                // Prevent blur from firing before click
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => addFromContact(contact)}
                className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                {/* Avatar circle with initial */}
                <div
                  className="flex-shrink-0 flex items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold"
                  style={{ width: 32, height: 32 }}
                  aria-hidden="true"
                >
                  {(contact.displayName ?? contact.email ?? '?')
                    .charAt(0)
                    .toUpperCase()}
                </div>

                {/* Name + email / contact type */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {contact.displayName}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {contact.email
                      ? contact.email
                      : '(no email)'}
                    {contact.contactType && (
                      <span className="ml-1.5 capitalize opacity-70">
                        · {contact.contactType}
                      </span>
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
