/**
 * OTA Service Key Guard
 *
 * Protects OTA-specific endpoints (lead capture, referral logging) with a
 * service-to-service key. The OTA frontend sends this key via the
 * `x-ota-service-key` header. Bypasses JWT (routes marked @Public) but
 * still requires a valid service key.
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class OtaServiceKeyGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    const key = request.headers['x-ota-service-key']
    const expected = this.configService.get<string>('OTA_SERVICE_KEY')

    if (!key || !expected || key !== expected) {
      throw new UnauthorizedException('Invalid OTA service key')
    }

    return true
  }
}
