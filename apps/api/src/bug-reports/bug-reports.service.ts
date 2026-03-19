import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Octokit } from '@octokit/rest'
import { randomUUID } from 'crypto'
import { StorageService } from '../trips/storage.service'
import type { AuthContext } from '../auth/auth.types'
import { BugReportType } from './dto/create-bug-report.dto'

interface ConsoleLogEntry {
  level: 'error' | 'warn'
  timestamp: string
  message: string
}

const SENSITIVE_PATTERNS = /bearer|token=|password|secret|apikey|authorization/i

const LABEL_MAP: Record<BugReportType, { name: string; color: string }> = {
  [BugReportType.BUG]: { name: 'bug', color: 'd73a4a' },
  [BugReportType.FEATURE]: { name: 'enhancement', color: 'a2eeef' },
  [BugReportType.QUESTION]: { name: 'question', color: 'd876e3' },
}

const PREFIX_MAP: Record<BugReportType, string> = {
  [BugReportType.BUG]: '[Bug]',
  [BugReportType.FEATURE]: '[Feature]',
  [BugReportType.QUESTION]: '[Question]',
}

@Injectable()
export class BugReportsService {
  private readonly logger = new Logger(BugReportsService.name)
  private readonly octokit: Octokit
  private readonly repoOwner: string
  private readonly repoName: string

  constructor(
    private readonly configService: ConfigService,
    private readonly storageService: StorageService,
  ) {
    const token = this.configService.get<string>('GITHUB_TOKEN')
    this.repoOwner = this.configService.get<string>('GITHUB_REPO_OWNER', 'Systemsaholic')
    this.repoName = this.configService.get<string>('GITHUB_REPO_NAME', 'tailfire')
    this.octokit = new Octokit({ auth: token })
  }

  async createBugReport(
    dto: {
      title: string
      description: string
      type: BugReportType
      pageUrl: string
      userAgent: string
      consoleLogs?: string
    },
    files: Express.Multer.File[],
    auth: AuthContext,
  ): Promise<{ issueUrl: string; issueNumber: number }> {
    const screenshotUrls = await this.uploadScreenshots(files)
    const sanitizedLogs = this.sanitizeConsoleLogs(dto.consoleLogs)
    const label = LABEL_MAP[dto.type]
    await this.ensureLabelExists(label.name, label.color)

    const body = this.buildIssueBody({
      type: dto.type,
      description: dto.description,
      pageUrl: dto.pageUrl,
      userAgent: dto.userAgent,
      reporterEmail: auth.email,
      reporterUserId: auth.userId,
      screenshotUrls,
      consoleLogs: sanitizedLogs,
    })

    const prefix = PREFIX_MAP[dto.type]
    const sanitizedTitle = dto.title.slice(0, 200)

    const { data: issue } = await this.octokit.issues.create({
      owner: this.repoOwner,
      repo: this.repoName,
      title: `${prefix} ${sanitizedTitle}`,
      body,
      labels: [label.name],
    })

    this.logger.log(
      `Bug report created: #${issue.number} by ${auth.email} — ${issue.html_url}`,
    )

    return { issueUrl: issue.html_url, issueNumber: issue.number }
  }

  private async uploadScreenshots(
    files: Express.Multer.File[],
  ): Promise<string[]> {
    if (!files?.length) return []

    const urls: string[] = []
    for (const file of files) {
      try {
        if (file.size > 5 * 1024 * 1024) continue
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)) continue

        const folder = `bug-reports/${randomUUID()}`
        const { url } = await this.storageService.uploadMediaFile(
          file.buffer,
          folder,
          `${randomUUID()}.${file.mimetype.split('/')[1]}`,
          file.mimetype,
        )
        urls.push(url)
      } catch (err) {
        this.logger.warn(`Failed to upload screenshot: ${err}`)
      }
    }
    return urls
  }

  private sanitizeConsoleLogs(rawLogs?: string): string {
    if (!rawLogs) return ''

    let entries: ConsoleLogEntry[]
    try {
      entries = JSON.parse(rawLogs)
      if (!Array.isArray(entries)) return ''
    } catch {
      return ''
    }

    return entries
      .slice(-50)
      .filter((e) => !SENSITIVE_PATTERNS.test(e.message))
      .map((e) => {
        const tag = e.level === 'error' ? 'ERROR' : 'WARN'
        const time = e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : '??:??:??'
        const msg = e.message.slice(0, 500)
        return `[${tag}] ${time} - ${msg}`
      })
      .join('\n')
  }

  private buildIssueBody(params: {
    type: BugReportType
    description: string
    pageUrl: string
    userAgent: string
    reporterEmail: string
    reporterUserId: string
    screenshotUrls: string[]
    consoleLogs: string
  }): string {
    const typeLabel =
      params.type === BugReportType.BUG ? 'Bug' :
      params.type === BugReportType.FEATURE ? 'Feature Request' : 'Question'

    const screenshotSection = params.screenshotUrls.length
      ? params.screenshotUrls.map((url, i) => `![Screenshot ${i + 1}](${url})`).join('\n')
      : '_No screenshots attached_'

    const consoleSection = params.consoleLogs
      ? '```\n' + params.consoleLogs + '\n```'
      : '_No console logs captured_'

    return `## ${typeLabel} Report

**Type:** ${typeLabel}
**Page:** ${params.pageUrl}
**Reporter:** ${params.reporterEmail} (ID: ${params.reporterUserId})
**Browser:** ${params.userAgent}
**Timestamp:** ${new Date().toISOString()}

### Description

${params.description.slice(0, 5000)}

### Screenshots

${screenshotSection}

### Console Logs

${consoleSection}

---
_Reported via Tailfire Bug Reporter_`
  }

  private async ensureLabelExists(name: string, color: string): Promise<void> {
    try {
      await this.octokit.issues.getLabel({
        owner: this.repoOwner,
        repo: this.repoName,
        name,
      })
    } catch {
      try {
        await this.octokit.issues.createLabel({
          owner: this.repoOwner,
          repo: this.repoName,
          name,
          color,
        })
      } catch (err) {
        this.logger.warn(`Failed to create label "${name}": ${err}`)
      }
    }
  }
}
