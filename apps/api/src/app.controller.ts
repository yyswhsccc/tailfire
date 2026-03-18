import { Controller, Get } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { AppService } from './app.service'
import { Public } from './auth/decorators/public.decorator'

@ApiTags('Health')
@Controller()
@Public() // Health endpoints are public
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  @ApiOperation({ summary: 'Health check endpoint' })
  getHealth() {
    return this.appService.getHealth()
  }

  @Get()
  @ApiOperation({ summary: 'API info' })
  getInfo() {
    return this.appService.getInfo()
  }

  @Get('debug-sentry')
  @ApiOperation({ summary: 'Test Sentry error reporting' })
  debugSentry() {
    throw new Error('Sentry test error from Tailfire API')
  }
}
