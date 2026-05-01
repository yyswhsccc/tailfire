import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import { Response } from 'express'

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR

    // For 5xx errors, never leak internal details to the client
    if (status >= 500) {
      this.logger.error(
        `Unhandled ${status} error: ${exception instanceof Error ? exception.message : 'Unknown'}`,
        exception instanceof Error ? exception.stack : undefined,
      )
      response.status(status).json({
        statusCode: status,
        timestamp: new Date().toISOString(),
        message: 'Internal server error',
      })
      return
    }

    // For 4xx, return the controlled error message
    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'An error occurred'

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      message:
        typeof message === 'string'
          ? message
          : (message as any).message || 'An error occurred',
    })
  }
}
