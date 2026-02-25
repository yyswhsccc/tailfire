/**
 * Strip Empty Strings Interceptor
 *
 * Normalizes empty strings in request payloads before they reach the ValidationPipe.
 * - Request body: '' -> null  (preserves PATCH clear semantics — null passes @IsOptional
 *   and still triggers field updates in services that use `!== undefined` guards)
 * - Query params: '' -> undefined  (omits empty query params from filtered lists)
 */

import { Injectable, type NestInterceptor, type ExecutionContext, type CallHandler } from '@nestjs/common'
import type { Observable } from 'rxjs'

@Injectable()
export class StripEmptyStringsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest()

    // Normalize request body: '' -> null
    if (request.body && typeof request.body === 'object') {
      request.body = this.normalizeBody(request.body)
    }

    // Normalize query params: '' -> undefined (effectively removes the key)
    if (request.query && typeof request.query === 'object') {
      request.query = this.normalizeQuery(request.query)
    }

    return next.handle()
  }

  private normalizeBody(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map(item => this.normalizeBody(item))
    }
    if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
      return Object.fromEntries(
        Object.entries(obj).map(([key, value]) => [
          key,
          value === '' ? null : this.normalizeBody(value),
        ])
      )
    }
    return obj
  }

  private normalizeQuery(obj: Record<string, any>): Record<string, any> {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([, value]) => value !== '')
        .map(([key, value]) => [key, value])
    )
  }
}
