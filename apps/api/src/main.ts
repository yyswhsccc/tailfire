import './instrument'
import { NestFactory, Reflector } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import helmet from 'helmet'
import { AppModule } from './app.module'
import { runMigrations } from '@tailfire/database'
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard'
import { ImpersonationGuard } from './auth/guards/impersonation.guard'
import { RolesGuard } from './auth/guards/roles.guard'
import { DatabaseService } from './db/database.service'
import { setupBullBoard, getQueuesFromApp } from './automation/admin/bull-board.setup'
import { StripEmptyStringsInterceptor } from './common/interceptors/strip-empty-strings.interceptor'

async function bootstrap() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required')
  }

  // Only run migrations when explicitly enabled via environment variable
  // CI/CD handles migrations for deployed environments (dev, staging, prod)
  const shouldRunMigrations = process.env.RUN_MIGRATIONS_ON_STARTUP === 'true'

  if (shouldRunMigrations) {
    console.info('🔄 Running database migrations...')
    try {
      await runMigrations(databaseUrl)
      console.info('✅ Database migrations completed')
    } catch (error) {
      console.error('❌ Migration failed:', error)
      process.exit(1)
    }
  } else {
    console.info('⏭️  Skipping migrations (CI/CD handles production migrations)')
  }

  const app = await NestFactory.create(AppModule, {
    // Enable raw body for Stripe webhook signature verification
    // The raw body is needed to validate webhook signatures
    rawBody: true,
  })

  // Security
  app.use(helmet())

  // CORS
  const corsOrigins = process.env.CORS_ORIGINS?.split(',') || [
    'http://localhost:3100',
    'http://localhost:3101',
    'http://localhost:3102',
    'http://localhost:3103',
  ]
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) {
        return callback(null, true)
      }
      // Check static origins
      if (corsOrigins.includes(origin)) {
        return callback(null, true)
      }
      // Allow Vercel preview deployments (tailfire-admin-*.vercel.app, tailfire-client-*.vercel.app, etc.)
      if (/^https:\/\/tailfire-[\w-]+-systemsaholic-[\w]+\.vercel\.app$/.test(origin)) {
        return callback(null, true)
      }
      // Allow all phoenixvoyages.ca subdomains (admin, client, ota, tf-demo, etc.)
      if (/^https:\/\/[\w-]+\.phoenixvoyages\.ca$/.test(origin)) {
        return callback(null, true)
      }
      // Allow tailfire.ca subdomains (api-dev, etc.)
      if (/^https:\/\/[\w-]+\.tailfire\.ca$/.test(origin)) {
        return callback(null, true)
      }
      callback(new Error('Not allowed by CORS'))
    },
    credentials: true,
  })

  // Global prefix
  const apiPrefix = process.env.API_PREFIX || 'api/v1'
  app.setGlobalPrefix(apiPrefix)

  // Normalize empty strings before validation ('' -> null in body, '' -> undefined in query)
  app.useGlobalInterceptors(new StripEmptyStringsInterceptor())

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    })
  )

  // Global auth guards
  const reflector = app.get(Reflector)
  const dbService = app.get(DatabaseService)
  app.useGlobalGuards(
    new JwtAuthGuard(reflector),
    new ImpersonationGuard(reflector, dbService),
    new RolesGuard(reflector),
  )

  // Swagger documentation
  if (process.env.ENABLE_SWAGGER_DOCS === 'true') {
    const config = new DocumentBuilder()
      .setTitle('Tailfire Beta API')
      .setDescription('Next-generation travel agency management system')
      .setVersion('1.0')
      .addBearerAuth()
      .build()

    const document = SwaggerModule.createDocument(app, config)
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document)
  }

  // Bull Board setup (queue monitoring dashboard)
  console.info('🔧 Setting up Bull Board...')
  const queues = await getQueuesFromApp(app)
  if (queues) {
    console.info('🔧 Queues found, initializing Bull Board...')
    setupBullBoard(app, queues)
  } else {
    console.warn('⚠️ Could not get queues - Bull Board will not be available')
  }

  const port = process.env.PORT || 3101
  await app.listen(port)

  console.info(`🚀 Tailfire Beta API running on: http://localhost:${port}/${apiPrefix}`)
  if (process.env.ENABLE_SWAGGER_DOCS === 'true') {
    console.info(`📚 API Documentation: http://localhost:${port}/${apiPrefix}/docs`)
  }
}

bootstrap()
