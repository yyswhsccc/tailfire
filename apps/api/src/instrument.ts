import * as Sentry from '@sentry/nestjs'

// DSN is safe to embed — it's a public ingestion endpoint, not a secret.
// Env var override allows per-environment control if needed.
const SENTRY_DSN = process.env.SENTRY_DSN_API
  || 'https://16814c455069f41d96888febf1c6e3bf@o4505940620869632.ingest.us.sentry.io/4511065811779584'

Sentry.init({
  dsn: SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT || 'development',
  sendDefaultPii: false,
  tracesSampleRate: process.env.SENTRY_ENVIRONMENT === 'production' ? 0.1 : 1.0,
})
