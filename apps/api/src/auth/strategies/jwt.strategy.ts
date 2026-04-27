/**
 * JWT Strategy
 *
 * Validates Supabase JWT tokens and extracts auth context.
 * Supports both HS256 (older projects) and ES256 (newer projects) algorithms.
 *
 * - HS256: Uses SUPABASE_JWT_SECRET for verification
 * - ES256: Uses JWKS endpoint for public key verification
 */

import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { ConfigService } from '@nestjs/config'
import JwksRsa from 'jwks-rsa'
import type { AuthContext, JwtPayload } from '../auth.types'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(configService: ConfigService) {
    const supabaseUrl = configService.get<string>('SUPABASE_URL')
    const jwtSecret = configService.get<string>('SUPABASE_JWT_SECRET')

    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL environment variable is required')
    }
    if (!jwtSecret) {
      throw new Error('SUPABASE_JWT_SECRET environment variable is required')
    }

    // Create JWKS client for ES256 tokens (newer Supabase projects)
    const jwksClient = new JwksRsa.JwksClient({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
    })

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // Support both HS256 (older projects) and ES256 (newer projects)
      algorithms: ['HS256', 'ES256'],
      issuer: `${supabaseUrl}/auth/v1`,
      // Dynamic secret resolution based on token algorithm
      secretOrKeyProvider: (
        _request: unknown,
        rawJwtToken: string,
        done: (err: Error | null, secret?: string | Buffer) => void,
      ) => {
        // Decode the token header to check the algorithm
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
            // Use the static secret for HS256 tokens
            return done(null, jwtSecret)
          } else if (header.alg === 'ES256') {
            // Use JWKS for ES256 tokens - fetch signing key by kid
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

  /**
   * Validate the JWT payload and return the auth context.
   * This is called after the token signature is verified.
   */
  async validate(payload: JwtPayload): Promise<AuthContext> {
    // Extract claims from app_metadata (Supabase standard location)
    const appMetadata = payload.app_metadata || {}
    const agencyId = payload.agency_id || appMetadata.agency_id

    // Supabase uses 'authenticated' as default role, actual role is in app_metadata
    let role: 'admin' | 'user' | undefined
    if (payload.role === 'admin' || payload.role === 'user') {
      role = payload.role
    } else {
      role = appMetadata.role
    }

    // Check for required custom claims
    if (!agencyId) {
      throw new UnauthorizedException('Missing agency_id in token')
    }

    if (!role) {
      throw new UnauthorizedException('Missing role in token')
    }

    return {
      userId: payload.user_id || payload.sub,
      email: payload.email,
      agencyId: agencyId,
      role: role,
      userStatus: payload.user_status || appMetadata.user_status || 'active',
      aal: payload.aal || 'aal1',
    }
  }
}
