/**
 * Client Portal Auth Guard
 *
 * Validates Supabase JWT tokens for client portal users.
 * NOT global - applied per-controller via @UseGuards(ClientPortalAuthGuard).
 *
 * Flow:
 * 1. Extract Bearer token from Authorization header
 * 2. Verify JWT using Supabase JWKS or HS256 secret
 * 3. Check app_metadata.role === 'client_portal'
 * 4. Look up client_portal_users by supabase_user_id (must be active)
 * 5. Attach ClientAuthContext to request
 */

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { eq, and } from 'drizzle-orm'
import * as jwt from 'jsonwebtoken'
import JwksRsa from 'jwks-rsa'
import { DatabaseService } from '../db/database.service'
import type { ClientAuthContext } from './client-portal-auth.types'

interface ClientJwtPayload {
  sub: string
  email: string
  agency_id?: string
  role?: string
  contact_id?: string
  user_id?: string
  app_metadata?: {
    agency_id?: string
    role?: string
    contact_id?: string
  }
  iat: number
  exp: number
  aud: string
  iss: string
}

@Injectable()
export class ClientPortalAuthGuard implements CanActivate {
  private readonly jwtSecret: string
  private readonly jwksClient: JwksRsa.JwksClient
  private readonly supabaseIssuer: string

  constructor(
    private readonly configService: ConfigService,
    private readonly db: DatabaseService,
  ) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL')!
    this.jwtSecret = this.configService.get<string>('SUPABASE_JWT_SECRET')!
    this.supabaseIssuer = `${supabaseUrl}/auth/v1`
    this.jwksClient = new JwksRsa.JwksClient({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
    })
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const authHeader = request.headers.authorization

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing authorization token')
    }

    const token = authHeader.substring(7)
    const payload = await this.verifyToken(token)

    // Extract claims from app_metadata
    const appMetadata = payload.app_metadata || {}
    const role = payload.role === 'client_portal' ? 'client_portal' : appMetadata.role

    if (role !== 'client_portal') {
      throw new UnauthorizedException('Invalid token: not a client portal user')
    }

    const supabaseUserId = payload.user_id || payload.sub

    // Look up active client_portal_users record
    const [clientUser] = await this.db.client
      .select()
      .from(this.db.schema.clientPortalUsers)
      .where(
        and(
          eq(this.db.schema.clientPortalUsers.supabaseUserId, supabaseUserId),
          eq(this.db.schema.clientPortalUsers.status, 'active'),
        ),
      )
      .limit(1)

    if (!clientUser) {
      throw new UnauthorizedException('Client portal user not found or inactive')
    }

    // Verify agency_id matches
    const tokenAgencyId = payload.agency_id || appMetadata.agency_id
    if (tokenAgencyId && tokenAgencyId !== clientUser.agencyId) {
      throw new UnauthorizedException('Agency mismatch')
    }

    // Attach ClientAuthContext to request
    const clientAuth: ClientAuthContext = {
      supabaseUserId,
      clientPortalUserId: clientUser.id,
      contactId: clientUser.contactId,
      agencyId: clientUser.agencyId,
      email: clientUser.email,
    }

    request.clientAuth = clientAuth
    return true
  }

  private async verifyToken(token: string): Promise<ClientJwtPayload> {
    // Decode header to determine algorithm
    const parts = token.split('.')
    if (parts.length !== 3 || !parts[0]) {
      throw new UnauthorizedException('Invalid token format')
    }

    const header = JSON.parse(
      Buffer.from(parts[0], 'base64').toString('utf8'),
    ) as { alg?: string; kid?: string }

    return new Promise((resolve, reject) => {
      const options: jwt.VerifyOptions = {
        algorithms: [header.alg as jwt.Algorithm],
        issuer: this.supabaseIssuer,
      }

      if (header.alg === 'HS256') {
        jwt.verify(token, this.jwtSecret, options, (err, decoded) => {
          if (err) reject(new UnauthorizedException(err.message))
          else resolve(decoded as ClientJwtPayload)
        })
      } else if (header.alg === 'ES256') {
        this.jwksClient
          .getSigningKey(header.kid)
          .then((key) => {
            jwt.verify(token, key.getPublicKey(), options, (err, decoded) => {
              if (err) reject(new UnauthorizedException(err.message))
              else resolve(decoded as ClientJwtPayload)
            })
          })
          .catch(() => reject(new UnauthorizedException('Failed to verify token')))
      } else {
        reject(new UnauthorizedException(`Unsupported algorithm: ${header.alg}`))
      }
    })
  }
}
