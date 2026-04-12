import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common'
import type { Response } from 'express'
import { ApiTags } from '@nestjs/swagger'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import { EmailAccountsService } from './email-accounts.service'
import { ImapSyncService } from './imap-sync.service'
import { SmtpSendService } from './smtp-send.service'
import { CreateEmailAccountDto } from './dto/create-email-account.dto'
import { UpdateEmailAccountDto } from './dto/update-email-account.dto'
import { TestConnectionDto } from './dto/test-connection.dto'
import { SendEmailDto } from './dto/send-email.dto'
import { EmailFilterDto } from './dto/email-filter.dto'
import type {
  EmailAccountResponseDto,
  SyncedEmailResponseDto,
  SyncedEmailDetailDto,
  TestConnectionResultDto,
  EmailFolderDto,
  SyncResultDto,
} from '@tailfire/shared-types'

@ApiTags('Email Accounts')
@Controller('email-accounts')
export class EmailAccountsController {
  constructor(
    private readonly emailAccountsService: EmailAccountsService,
    private readonly imapSyncService: ImapSyncService,
    private readonly smtpSendService: SmtpSendService,
  ) {}

  /**
   * Create a new email account
   * POST /email-accounts
   */
  @Post()
  async create(
    @GetAuthContext() auth: AuthContext,
    @Body() dto: CreateEmailAccountDto,
  ): Promise<EmailAccountResponseDto> {
    return this.emailAccountsService.create(auth.userId, auth.agencyId, dto)
  }

  /**
   * List my email accounts
   * GET /email-accounts
   */
  @Get()
  async findAll(
    @GetAuthContext() auth: AuthContext,
  ): Promise<EmailAccountResponseDto[]> {
    return this.emailAccountsService.findAllForUser(auth.userId)
  }

  /**
   * Get a single email account
   * GET /email-accounts/:id
   */
  @Get(':id')
  async findOne(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<EmailAccountResponseDto> {
    return this.emailAccountsService.findOne(id, auth.userId)
  }

  /**
   * Update an email account
   * PUT /email-accounts/:id
   */
  @Put(':id')
  async update(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateEmailAccountDto,
  ): Promise<EmailAccountResponseDto> {
    return this.emailAccountsService.update(id, auth.userId, dto)
  }

  /**
   * Deactivate an email account (soft delete)
   * DELETE /email-accounts/:id
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<void> {
    return this.emailAccountsService.remove(id, auth.userId)
  }

  /**
   * Test IMAP connection
   * POST /email-accounts/test-connection
   */
  @Post('test-connection')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async testConnection(
    @Body() dto: TestConnectionDto,
  ): Promise<TestConnectionResultDto> {
    return this.imapSyncService.testConnection(dto)
  }

  /**
   * Trigger on-demand sync for an account
   * POST /email-accounts/:id/sync
   */
  @Post(':id/sync')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async triggerSync(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<SyncResultDto> {
    await this.emailAccountsService.findOne(id, auth.userId)
    return this.imapSyncService.syncAccount(id)
  }

  /**
   * List IMAP folders
   * GET /email-accounts/:id/folders
   */
  @Get(':id/folders')
  async listFolders(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<EmailFolderDto[]> {
    await this.emailAccountsService.findOne(id, auth.userId)
    return this.imapSyncService.listFolders(id)
  }

  /**
   * Create an IMAP folder
   * POST /email-accounts/:id/folders
   */
  @Post(':id/folders')
  async createFolder(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() body: { path: string },
  ): Promise<void> {
    await this.emailAccountsService.findOne(id, auth.userId)
    return this.imapSyncService.createFolder(id, body.path)
  }

  /**
   * Rename an IMAP folder
   * PATCH /email-accounts/:id/folders/rename
   */
  @Patch(':id/folders/rename')
  async renameFolder(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() body: { path: string; newPath: string },
  ): Promise<void> {
    await this.emailAccountsService.findOne(id, auth.userId)
    return this.imapSyncService.renameFolder(id, body.path, body.newPath)
  }

  /**
   * Delete an IMAP folder
   * DELETE /email-accounts/:id/folders?path=FolderName
   */
  @Delete(':id/folders')
  async deleteFolder(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Query('path') path: string,
  ): Promise<void> {
    await this.emailAccountsService.findOne(id, auth.userId)
    return this.imapSyncService.deleteFolder(id, path)
  }

  /**
   * Move an email to a different folder
   * POST /email-accounts/:id/emails/:emailId/move
   */
  @Post(':id/emails/:emailId/move')
  async moveEmail(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Param('emailId') emailId: string,
    @Body() body: { folder: string },
  ): Promise<void> {
    return this.emailAccountsService.moveEmail(id, emailId, auth.userId, body.folder)
  }

  /**
   * List synced emails (filtered)
   * GET /email-accounts/:id/emails
   */
  @Get(':id/emails')
  async listEmails(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Query() filters: EmailFilterDto,
  ): Promise<{ emails: SyncedEmailResponseDto[]; total: number }> {
    return this.emailAccountsService.listEmails(id, auth.userId, filters)
  }

  /**
   * Batch update email flags
   * PATCH /email-accounts/:id/emails/batch-flags
   */
  @Patch(':id/emails/batch-flags')
  async batchUpdateFlags(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() body: { emailIds: string[]; isSeen?: boolean; isFlagged?: boolean },
  ): Promise<void> {
    return this.emailAccountsService.batchUpdateFlags(id, auth.userId, body.emailIds, {
      isSeen: body.isSeen,
      isFlagged: body.isFlagged,
    })
  }

  /**
   * Get full email detail (triggers lazy body fetch if needed)
   * GET /email-accounts/:id/emails/:emailId
   */
  @Get(':id/emails/:emailId')
  async getEmailDetail(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Param('emailId') emailId: string,
  ): Promise<SyncedEmailDetailDto> {
    const detail = await this.emailAccountsService.getEmailDetail(id, emailId, auth.userId)

    // Lazy body fetch: if body is null, fetch it now
    if (detail.bodyHtml === null && detail.bodyText === null) {
      const body = await this.imapSyncService.fetchEmailBody(id, emailId)
      detail.bodyHtml = body.bodyHtml
      detail.bodyText = body.bodyText
      if (body.snippet) detail.snippet = body.snippet
    }

    return detail
  }

  /**
   * Download attachment (fetches from IMAP on first access, then caches)
   * GET /email-accounts/:id/emails/:emailId/attachments/:attachmentId
   */
  @Get(':id/emails/:emailId/attachments/:attachmentId')
  async downloadAttachment(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Param('emailId') emailId: string,
    @Param('attachmentId') attachmentId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    await this.emailAccountsService.findOne(id, auth.userId)
    const { buffer, contentType, filename } = await this.imapSyncService.fetchAttachment(id, emailId, attachmentId)
    res.set({
      'Content-Type': contentType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${(filename || 'attachment').replace(/"/g, '\\"')}"`,
    })
    return new StreamableFile(buffer)
  }

  /**
   * Update email flags (read/unread, flagged)
   * PATCH /email-accounts/:id/emails/:emailId/flags
   */
  @Patch(':id/emails/:emailId/flags')
  async updateEmailFlags(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Param('emailId') emailId: string,
    @Body() flags: { isSeen?: boolean; isFlagged?: boolean },
  ): Promise<SyncedEmailResponseDto> {
    return this.emailAccountsService.updateEmailFlags(id, emailId, auth.userId, flags)
  }

  /**
   * Delete an email
   * DELETE /email-accounts/:id/emails/:emailId
   */
  @Delete(':id/emails/:emailId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteEmail(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Param('emailId') emailId: string,
  ): Promise<void> {
    return this.emailAccountsService.deleteEmail(id, emailId, auth.userId)
  }

  /**
   * Send email via SMTP
   * POST /email-accounts/:id/send
   */
  @Post(':id/send')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async sendEmail(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: SendEmailDto,
  ) {
    await this.emailAccountsService.findOne(id, auth.userId)
    return this.smtpSendService.send(id, dto, auth.userId)
  }
}
