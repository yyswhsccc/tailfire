/**
 * Email Accounts API DTOs
 *
 * Types for agent personal email (IMAP/SMTP) integration.
 * Part of EmailAccountsModule — separate from EmailModule (transactional emails).
 */

// ============================================================================
// EMAIL ADDRESS
// ============================================================================

export interface EmailAddressDto {
  address: string
  name?: string
}

// ============================================================================
// EMAIL ACCOUNT CRUD
// ============================================================================

export interface CreateEmailAccountDto {
  emailAddress: string
  displayName?: string
  imapHost: string
  imapPort?: number // default 993
  imapTls?: boolean // default true
  smtpHost: string
  smtpPort?: number // default 465
  smtpTls?: boolean // default true
  username: string
  password: string
}

export interface UpdateEmailAccountDto {
  displayName?: string
  imapHost?: string
  imapPort?: number
  imapTls?: boolean
  smtpHost?: string
  smtpPort?: number
  smtpTls?: boolean
  username?: string
  password?: string
  isActive?: boolean
}

export interface EmailAccountResponseDto {
  id: string
  userId: string
  emailAddress: string
  displayName: string | null
  imapHost: string
  imapPort: number
  imapTls: boolean
  smtpHost: string
  smtpPort: number
  smtpTls: boolean
  isActive: boolean
  lastSyncAt: string | null
  lastSyncError: string | null
  createdAt: string
  updatedAt: string
}

// ============================================================================
// CONNECTION TEST
// ============================================================================

export interface TestConnectionDto {
  imapHost: string
  imapPort: number
  imapTls: boolean
  username: string
  password: string
}

export interface TestConnectionResultDto {
  success: boolean
  error?: string
}

// ============================================================================
// SYNCED EMAILS
// ============================================================================

export interface SyncedEmailResponseDto {
  id: string
  emailAccountId: string
  messageId: string | null
  folder: string
  fromAddress: string | null
  fromName: string | null
  toAddresses: EmailAddressDto[]
  ccAddresses: EmailAddressDto[]
  subject: string | null
  date: string | null
  snippet: string | null
  isSeen: boolean
  isFlagged: boolean
  isAnswered: boolean
  isDraft: boolean
  isOutbound: boolean
  hasAttachments: boolean
  matchedContactIds: string[]
  threadId: string | null
  syncedAt: string
}

export interface SyncedEmailDetailDto extends SyncedEmailResponseDto {
  bccAddresses: EmailAddressDto[]
  bodyHtml: string | null
  bodyText: string | null
  inReplyTo: string | null
  referencesHeader: string | null
  sizeBytes: number | null
  attachments: EmailAttachmentDto[]
}

// ============================================================================
// ATTACHMENTS
// ============================================================================

export interface EmailAttachmentDto {
  id: string
  filename: string | null
  contentType: string | null
  sizeBytes: number | null
  isInline: boolean
  storageUrl: string | null
  isCached: boolean
}

// ============================================================================
// SEND / COMPOSE
// ============================================================================

export interface SendEmailDto {
  to: EmailAddressDto[]
  cc?: EmailAddressDto[]
  bcc?: EmailAddressDto[]
  subject: string
  bodyHtml: string
  inReplyToEmailId?: string // for reply threading
}

// ============================================================================
// FOLDERS
// ============================================================================

export interface EmailFolderDto {
  name: string
  path: string
  specialUse?: string // e.g., '\\Inbox', '\\Sent', '\\Drafts', '\\Trash'
  totalMessages: number
  unseenMessages: number
}

// ============================================================================
// LIST FILTERS
// ============================================================================

export interface EmailListFilterDto {
  folder?: string // default INBOX
  search?: string
  contactId?: string
  page?: number // default 1
  limit?: number // default 50
}

// ============================================================================
// SYNC RESULT
// ============================================================================

export interface SyncResultDto {
  newMessages: number
  errors: string[]
}
