/**
 * Auth Module
 *
 * Provides JWT-based authentication using Supabase tokens.
 * Registers the JWT strategy, guards, and password reset functionality.
 */

import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'
import { JwtModule } from '@nestjs/jwt'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtStrategy } from './strategies/jwt.strategy'
import { PortalJwtStrategy } from './strategies/portal-jwt.strategy'
import { JwtAuthGuard } from './guards/jwt-auth.guard'
import { PortalAuthGuard } from './guards/portal-auth.guard'
import { RolesGuard } from './guards/roles.guard'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { EmailModule } from '../email/email.module'
import { DatabaseModule } from '../db/database.module'

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('SUPABASE_JWT_SECRET'),
        signOptions: { expiresIn: '1h' },
      }),
    }),
    EmailModule, // Required for password reset emails
    DatabaseModule, // Required for user profile lookup in password reset
  ],
  controllers: [AuthController],
  providers: [JwtStrategy, PortalJwtStrategy, JwtAuthGuard, PortalAuthGuard, RolesGuard, AuthService],
  exports: [JwtStrategy, PortalJwtStrategy, JwtAuthGuard, PortalAuthGuard, RolesGuard, PassportModule, JwtModule, AuthService],
})
export class AuthModule {}
