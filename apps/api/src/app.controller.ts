import { Controller, Get } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { AppService } from './app.service'
import { Public } from './auth/decorators/public.decorator'
import { AdminOnly } from './auth/decorators/admin-only.decorator'

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  @Public()
  @ApiOperation({ summary: 'Health check endpoint' })
  getHealth() {
    return this.appService.getHealth()
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'API info' })
  getInfo() {
    return this.appService.getInfo()
  }

  @Get('debug-sentry')
  @AdminOnly()
  @ApiOperation({ summary: 'Test Sentry error reporting' })
  debugSentry() {
    throw new Error('Sentry test error from Tailfire API')
  }
}
