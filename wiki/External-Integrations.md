# External Integrations

This page is the quick reference for third-party providers and external platform dependencies. Use the canonical repo doc for full route, credential, and implementation detail.

## Major Providers

- Traveltek
- Globus
- Amadeus
- AeroDataBox
- Google Places
- Booking.com
- Unsplash
- OpenAI

## What To Use As Source Of Truth

For each provider, the canonical external API doc tracks:

- where the integration lives in the codebase
- which routes exist
- which app surfaces consume it
- whether credentials come from env or another source
- current maturity and caveats

## Why This Matters

Several providers already have known operational caveats, including env-example drift and inconsistent provider-status reporting in admin surfaces. Check the issue log before treating an integration as fully production-ready.

## Canonical References

- [External APIs](https://github.com/Systemsaholic/tailfire/blob/main/docs/EXTERNAL_APIS.md)
- [Environments](https://github.com/Systemsaholic/tailfire/blob/main/docs/ENVIRONMENTS.md)
- [Repository Review Issues](https://github.com/Systemsaholic/tailfire/blob/main/docs/REPOSITORY_REVIEW_ISSUES.md)
