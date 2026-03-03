/**
 * Bull Board Setup
 *
 * Configures the Bull Board dashboard for queue monitoring.
 * Protected by admin authentication and disabled in production by default.
 */

import { INestApplication, Logger } from '@nestjs/common'
import { getQueueToken } from '@nestjs/bullmq'
import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { ExpressAdapter } from '@bull-board/express'
import { Queue } from 'bullmq'
import type { Request, Response, NextFunction } from 'express'
import * as jwt from 'jsonwebtoken'
import JwksRsa from 'jwks-rsa'
import { QUEUE_NAMES } from '../automation.types'

const logger = new Logger('BullBoard')

/**
 * Auth middleware for Bull Board
 * Validates JWT token and checks for admin role in app_metadata
 *
 * Supports both HS256 (older Supabase projects) and ES256 (newer projects)
 */
function bullBoardAuthMiddleware(jwtSecret: string, supabaseUrl: string) {
  // Create JWKS client for ES256 tokens
  const jwksClient = new JwksRsa.JwksClient({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
  })

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Authentication required' })
      }

      const token = authHeader.substring(7)

      // Decode header to check algorithm
      const tokenParts = token.split('.')
      if (tokenParts.length !== 3 || !tokenParts[0]) {
        return res.status(401).json({ message: 'Invalid token format' })
      }

      const header = JSON.parse(Buffer.from(tokenParts[0], 'base64').toString('utf8')) as {
        alg?: string
        kid?: string
      }

      let decoded: { role?: string; app_metadata?: { role?: string } }

      if (header.alg === 'HS256') {
        // Use JWT secret for HS256
        decoded = jwt.verify(token, jwtSecret) as typeof decoded
      } else if (header.alg === 'ES256' && header.kid) {
        // Use JWKS for ES256
        const signingKey = await jwksClient.getSigningKey(header.kid)
        const publicKey = signingKey.getPublicKey()
        decoded = jwt.verify(token, publicKey) as typeof decoded
      } else {
        return res.status(401).json({ message: `Unsupported algorithm: ${header.alg}` })
      }

      // Check app_metadata.role for admin (Supabase stores app roles here)
      const appRole = decoded.app_metadata?.role
      if (appRole !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' })
      }

      next()
    } catch (error) {
      logger.warn('Bull Board auth failed:', error)
      return res.status(401).json({ message: 'Invalid or expired token' })
    }
  }
}

/**
 * Setup Bull Board dashboard at /admin/queues
 *
 * @param app - NestJS application instance
 * @param options - Configuration options
 */
export function setupBullBoard(
  app: INestApplication,
  options: {
    tripAutomationQueue: Queue
    clientCareQueue: Queue
    notificationsQueue: Queue
    documentRenderQueue: Queue
  },
) {
  const enableBullBoard = process.env.ENABLE_BULL_BOARD === 'true'
  const isProduction = process.env.NODE_ENV === 'production'

  // Disabled by default in production unless explicitly enabled
  if (isProduction && !enableBullBoard) {
    logger.log('Bull Board disabled in production (set ENABLE_BULL_BOARD=true to enable)')
    return
  }

  // Don't enable if REDIS_URL is not configured
  if (!process.env.REDIS_URL) {
    logger.warn('Bull Board disabled - REDIS_URL not configured')
    return
  }

  try {
    const serverAdapter = new ExpressAdapter()
    serverAdapter.setBasePath('/admin/queues')

    createBullBoard({
      queues: [
        new BullMQAdapter(options.tripAutomationQueue, { readOnlyMode: isProduction }),
        new BullMQAdapter(options.clientCareQueue, { readOnlyMode: isProduction }),
        new BullMQAdapter(options.notificationsQueue, { readOnlyMode: isProduction }),
        new BullMQAdapter(options.documentRenderQueue, { readOnlyMode: isProduction }),
      ],
      serverAdapter,
      options: {
        uiConfig: {
          boardTitle: 'Tailfire Automation Queues',
          boardLogo: {
            path: '/logo.png',
            width: '40px',
            height: '40px',
          },
        },
      },
    })

    // Get the Express app instance
    const expressApp = app.getHttpAdapter().getInstance()

    // Mount Bull Board at /admin/queues with authentication
    const jwtSecret = process.env.SUPABASE_JWT_SECRET
    const supabaseUrl = process.env.SUPABASE_URL
    if (jwtSecret && supabaseUrl) {
      // Apply auth middleware before Bull Board routes
      expressApp.use('/admin/queues', bullBoardAuthMiddleware(jwtSecret, supabaseUrl), serverAdapter.getRouter())
      logger.log('Bull Board protected with JWT authentication (HS256 + ES256)')
    } else {
      // Fallback: no auth (development only, warn loudly)
      logger.warn('Bull Board mounted WITHOUT authentication - SUPABASE_JWT_SECRET or SUPABASE_URL not set')
      expressApp.use('/admin/queues', serverAdapter.getRouter())
    }

    logger.log(`Bull Board dashboard available at /admin/queues${isProduction ? ' (read-only mode)' : ''}`)
  } catch (error) {
    logger.error('Failed to setup Bull Board:', error)
  }
}

/**
 * Get queue instances from the NestJS application
 */
export async function getQueuesFromApp(app: INestApplication): Promise<{
  tripAutomationQueue: Queue
  clientCareQueue: Queue
  notificationsQueue: Queue
  documentRenderQueue: Queue
} | null> {
  try {
    // Use getQueueToken from @nestjs/bullmq for correct token format
    const tripAutomationQueue = app.get<Queue>(getQueueToken(QUEUE_NAMES.TRIP_AUTOMATION))
    const clientCareQueue = app.get<Queue>(getQueueToken(QUEUE_NAMES.CLIENT_CARE))
    const notificationsQueue = app.get<Queue>(getQueueToken(QUEUE_NAMES.NOTIFICATIONS))
    const documentRenderQueue = app.get<Queue>(getQueueToken(QUEUE_NAMES.DOCUMENT_RENDER))

    logger.log('Queue instances retrieved successfully')
    return {
      tripAutomationQueue,
      clientCareQueue,
      notificationsQueue,
      documentRenderQueue,
    }
  } catch (error) {
    logger.warn(`Could not get queue instances - Bull Board will not be available: ${error}`)
    return null
  }
}
