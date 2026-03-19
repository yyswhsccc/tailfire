import * as Sentry from '@sentry/nextjs'

// DSN is safe to embed — it's a public ingestion endpoint, not a secret.
const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN
  || 'https://e836e15728389c5315b0ddb2c920a78b@o4505940620869632.ingest.us.sentry.io/4511065814859776'

Sentry.init({
  dsn: SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || 'development',
  tracesSampleRate: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT === 'production' ? 0.1 : 1.0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
})
