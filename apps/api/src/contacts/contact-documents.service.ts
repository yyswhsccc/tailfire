/**
 * Contact Documents Service
 *
 * Handles CRUD operations for contact documents.
 * Works with the contact_documents table.
 */

import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { DatabaseService } from '../db/database.service'
import { AuditEvent } from '../activity-logs/events/audit.event'
import { sanitizeForAudit, computeAuditDiff } from '../activity-logs/audit-sanitizer'

export { VALID_CONTACT_DOCUMENT_TYPES, type ContactDocumentType } from '@tailfire/database'

export interface ContactDocumentDto {
  id: string
  contactId: string
  documentType: string | null
  fileUrl: string
  fileName: string
  fileSize: number | null
  uploadedAt: string
  uploadedBy: string | null
}

@Injectable()
export class ContactDocumentsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findByContactId(contactId: string): Promise<ContactDocumentDto[]> {
    const documents = await this.db.client
      .select()
      .from(this.db.schema.contactDocuments)
      .where(eq(this.db.schema.contactDocuments.contactId, contactId))
      .orderBy(this.db.schema.contactDocuments.uploadedAt)

    return documents.map(this.formatDocument)
  }

  async findById(id: string): Promise<ContactDocumentDto | null> {
    const [document] = await this.db.client
      .select()
      .from(this.db.schema.contactDocuments)
      .where(eq(this.db.schema.contactDocuments.id, id))
      .limit(1)

    if (!document) {
      return null
    }

    return this.formatDocument(document)
  }

  async create(
    data: {
      contactId: string
      documentType?: string | null
      fileUrl: string
      fileName: string
      fileSize?: number | null
      uploadedBy?: string | null
    },
    actorId?: string | null,
  ): Promise<ContactDocumentDto> {
    const [document] = await this.db.client
      .insert(this.db.schema.contactDocuments)
      .values({
        contactId: data.contactId,
        documentType: data.documentType || null,
        fileUrl: data.fileUrl,
        fileName: data.fileName,
        fileSize: data.fileSize || null,
        uploadedBy: data.uploadedBy || null,
      })
      .returning()

    if (!document) {
      throw new Error('Failed to create contact document')
    }

    this.eventEmitter.emit(
      'audit.created',
      new AuditEvent(
        'contact_document',
        document.id,
        'created',
        null,
        actorId ?? null,
        `Document - ${document.fileName}`,
        {
          after: sanitizeForAudit('contact_document', document),
          parentId: data.contactId,
        },
      ),
    )

    return this.formatDocument(document)
  }

  async update(
    id: string,
    data: {
      documentType?: string | null
      fileName?: string
    },
    actorId?: string | null,
  ): Promise<ContactDocumentDto | null> {
    const [before] = await this.db.client
      .select()
      .from(this.db.schema.contactDocuments)
      .where(eq(this.db.schema.contactDocuments.id, id))
      .limit(1)

    if (!before) {
      return null
    }

    const [document] = await this.db.client
      .update(this.db.schema.contactDocuments)
      .set({
        ...(data.documentType !== undefined && { documentType: data.documentType }),
        ...(data.fileName !== undefined && { fileName: data.fileName }),
      })
      .where(eq(this.db.schema.contactDocuments.id, id))
      .returning()

    if (!document) {
      return null
    }

    this.eventEmitter.emit(
      'audit.updated',
      new AuditEvent(
        'contact_document',
        document.id,
        'updated',
        null,
        actorId ?? null,
        `Document - ${document.fileName}`,
        computeAuditDiff('contact_document', before, document),
      ),
    )

    return this.formatDocument(document)
  }

  async delete(
    id: string,
    actorId?: string | null,
  ): Promise<ContactDocumentDto | null> {
    const [document] = await this.db.client
      .delete(this.db.schema.contactDocuments)
      .where(eq(this.db.schema.contactDocuments.id, id))
      .returning()

    if (!document) {
      return null
    }

    this.eventEmitter.emit(
      'audit.deleted',
      new AuditEvent(
        'contact_document',
        document.id,
        'deleted',
        null,
        actorId ?? null,
        `Document - ${document.fileName}`,
        {
          before: sanitizeForAudit('contact_document', document),
          parentId: document.contactId,
        },
      ),
    )

    return this.formatDocument(document)
  }

  private formatDocument(doc: any): ContactDocumentDto {
    return {
      id: doc.id,
      contactId: doc.contactId,
      documentType: doc.documentType || null,
      fileUrl: doc.fileUrl,
      fileName: doc.fileName,
      fileSize: doc.fileSize || null,
      uploadedAt: doc.uploadedAt?.toISOString() || new Date().toISOString(),
      uploadedBy: doc.uploadedBy || null,
    }
  }
}
