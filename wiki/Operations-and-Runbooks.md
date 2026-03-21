# Operations And Runbooks

This page groups the most important operational references for running and maintaining the platform.

## Core Runbooks

- local setup and startup expectations
- environments and deployment mapping
- CI/CD workflow behavior
- monitoring and release checklists
- repository review issues and known gaps

## Use These First

- [Local Development](https://github.com/Systemsaholic/tailfire/blob/main/docs/LOCAL_DEV.md)
- [CI/CD](https://github.com/Systemsaholic/tailfire/blob/main/docs/CI_CD.md)
- [Environments](https://github.com/Systemsaholic/tailfire/blob/main/docs/ENVIRONMENTS.md)
- [Monitoring](https://github.com/Systemsaholic/tailfire/blob/main/docs/MONITORING.md)
- [Release Checklist](https://github.com/Systemsaholic/tailfire/blob/main/docs/RELEASE_CHECKLIST.md)

## Current Operational Caveats

- The repo currently has deploy workflows but no dedicated pre-merge validation workflow.
- Redis expectations in local development are stricter than the runtime `REDIS_URL` support.
- OTA remains partially mock-backed.
- The trip lifecycle and booking model is being clarified and still requires code alignment.

## Issue Tracking

Current audit findings and implementation gaps:

- [Repository Review Issues](https://github.com/Systemsaholic/tailfire/blob/main/docs/REPOSITORY_REVIEW_ISSUES.md)
- [Known Issues](https://github.com/Systemsaholic/tailfire/blob/main/docs/KNOWN_ISSUES.md)
