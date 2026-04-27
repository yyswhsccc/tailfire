/**
 * Portal JWT Strategy
 *
 * Validates Supabase JWT tokens for portal users.
 * Portal users have app_metadata.portal_user === true and no user_profiles row.
 * Reuses the same JWT verification (HS256/ES256) as the admin strategy.
 */

import { Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { ConfigService } from '@nestjs/config'
import JwksRsa from 'jwks-rsa'
import type { PortalAuthContext, PortalJwtPayload } from '../auth.types'

@Injectable()
export class PortalJwtStrategy extends PassportStrategy(Strategy, 'portal-jwt') {
  private readonly logger = new Logger(PortalJwtStrategy.name)

  constructor(configService: ConfigService) {
    const supabaseUrl = configService.get<string>('SUPABASE_URL')
    const jwtSecret = configService.get<string>('SUPABASE_JWT_SECRET')

    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL environment variable is required')
    }
    if (!jwtSecret) {
      throw new Error('SUPABASE_JWT_SECRET environment variable is required')
    }

    const jwksClient = new JwksRsa.JwksClient({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
    })

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['HS256', 'ES256'],
      issuer: `${supabaseUrl}/auth/v1`,
      secretOrKeyProvider: (
        _request: unknown,
        rawJwtToken: string,
        done: (err: Error | null, secret?: string | Buffer) => void,
      ) => {
        const tokenParts = rawJwtToken.split('.')
        if (tokenParts.length !== 3) {
          return done(new Error('Invalid token format'))
        }

        try {
          const headerPart = tokenParts[0]
          if (!headerPart) {
            return done(new Error('Invalid token format'))
          }
          const header = JSON.parse(
            Buffer.from(headerPart, 'base64').toString('utf8'),
          ) as { alg?: string; kid?: string }

          if (header.alg === 'HS256') {
            return done(null, jwtSecret)
          } else if (header.alg === 'ES256') {
            jwksClient
              .getSigningKey(header.kid)
              .then((key) => {
                const publicKey = key.getPublicKey()
                done(null, publicKey)
              })
              .catch((err) => {
                done(err)
              })
          } else {
            return done(new Error(`Unsupported algorithm: ${header.alg}`))
          }
        } catch {
          return done(new Error('Failed to parse token header'))
        }
      },
    })
  }

  async validate(payload: PortalJwtPayload): Promise<PortalAuthContext> {
    const appMetadata = payload.app_metadata || {}

    // Must be a portal user — check role from custom JWT hook or legacy portal_user flag
    const isPortalUser =
      payload.role === 'client_portal' ||
      payload.portal_user ||
      appMetadata.portal_user
    if (!isPortalUser) {
      throw new UnauthorizedException('Not a portal user')
    }

    const contactId = payload.contact_id || appMetadata.contact_id
    const agencyId = payload.agency_id || appMetadata.agency_id

    if (!contactId) {
      throw new UnauthorizedException('Missing contact_id in portal token')
    }

    if (!agencyId) {
      this.logger.warn(`Portal user ${payload.sub} has no agency_id in token`)
      throw new UnauthorizedException('Missing agency_id in portal token')
    }

    return {
      userId: payload.user_id || payload.sub,
      email: payload.email,
      contactId,
      agencyId,
    }
  }
}
