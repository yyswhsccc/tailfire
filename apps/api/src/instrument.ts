import * as Sentry from '@sentry/nestjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN_API,
  environment: process.env.SENTRY_ENVIRONMENT || 'development',
  sendDefaultPii: true,
  tracesSampleRate: process.env.SENTRY_ENVIRONMENT === 'production' ? 0.1 : 1.0,
})
