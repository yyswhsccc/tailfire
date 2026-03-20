import {
  Catch,
  ExceptionFilter,
  ArgumentsHost,
  UnauthorizedException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'

@Catch(UnauthorizedException, ForbiddenException)
export class SecurityExceptionFilter implements ExceptionFilter {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const request = ctx.getRequest()
    const response = ctx.getResponse()
    const status = exception.getStatus()

    const event = status === 401 ? 'security.login_failed' : 'security.access_denied'
    this.eventEmitter.emit(event, {
      event,
      userId: request.user?.userId ?? null,
      actorId: request.user?.userId ?? null,
      agencyId: request.user?.agencyId ?? null,
      metadata: {
        endpoint: `${request.method} ${request.url}`,
        reason: exception.message,
        ip: request.ip,
      },
    })

    response.status(status).json(exception.getResponse())
  }
}
