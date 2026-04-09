# Operations And Runbooks

This page groups the main operational entry points for the current repo.

## Use These First

- [Local Development](https://github.com/Systemsaholic/tailfire/blob/main/docs/LOCAL_DEV.md)
- [Environments](https://github.com/Systemsaholic/tailfire/blob/main/docs/ENVIRONMENTS.md)
- [CI/CD](https://github.com/Systemsaholic/tailfire/blob/main/docs/CI_CD.md)
- [API Deployment](https://github.com/Systemsaholic/tailfire/blob/main/docs/DEPLOYMENT_API.md)
- [Testing](https://github.com/Systemsaholic/tailfire/blob/main/docs/TESTING.md)
- [Repository Review Issues](https://github.com/Systemsaholic/tailfire/blob/main/docs/REPOSITORY_REVIEW_ISSUES.md)

## Current Operational Caveats

- The repo has deploy workflows but no dedicated PR validation workflow.
- Preview API health checks depend on a generated Railway URL.
- Root `pnpm dev` still assumes local Redis tooling.
- OTA discovery is API-backed, but public forms and legal pages are still partial.
