import {
  Controller,
  Post,
  Body,
  UseInterceptors,
  UploadedFiles,
  UseGuards,
  BadRequestException,
} from '@nestjs/common'
import { FilesInterceptor } from '@nestjs/platform-express'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import { BugReportsService } from './bug-reports.service'
import { CreateBugReportDto } from './dto/create-bug-report.dto'

const MAX_FILE_SIZE = 5 * 1024 * 1024
const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp']

@Controller('bug-reports')
export class BugReportsController {
  constructor(private readonly bugReportsService: BugReportsService) {}

  @Post()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  @UseInterceptors(
    FilesInterceptor('screenshots', 3, {
      limits: { fileSize: MAX_FILE_SIZE, files: 3 },
      fileFilter: (_req, file, callback) => {
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          callback(
            new BadRequestException(
              `Unsupported file type: ${file.mimetype}. Allowed: PNG, JPEG, WebP`,
            ),
            false,
          )
        } else {
          callback(null, true)
        }
      },
    }),
  )
  async create(
    @Body() dto: CreateBugReportDto,
    @UploadedFiles() files: Express.Multer.File[],
    @GetAuthContext() auth: AuthContext,
  ) {
    return this.bugReportsService.createBugReport(dto, files || [], auth)
  }
}
