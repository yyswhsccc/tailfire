# Release Checklist (Local-First)

## Deployment Flow

```
Local Dev → preview branch → main branch
    ↓             ↓              ↓
 Validate    Dev/Preview     Production
             Environment     Environment
```

| Step | Branch | Environment | CI Workflow |
|------|--------|-------------|-------------|
| Preview | `preview` | Dev (api-dev.tailfire.ca) | `deploy-preview.yml` |
| Production | `main` | Prod (api.tailfire.ca) | `deploy-prod.yml` |

> **Note:** This project uses a shared Dev/Preview database. Treat it as a shared environment: avoid destructive changes, announce migrations, and coordinate with the team before applying them.

## 1) Local Changes

- Update code as needed.
- If schema changes are required:
  - Run `pnpm db:generate` to create a migration.
  - Apply locally: `pnpm db:migrate`.

## 2) Local Validation

- Start apps locally with `pnpm dev`.
- Run smoke tests for critical flows.
- If storage changes are involved, validate buckets/policies manually.

## 3) Commit

- Ensure `git status` is clean except intended changes.
- Commit with a clear message.

## 4) Promote to Preview (preview)

- Push to `preview`.
- Confirm CI passes.
- Verify preview endpoints (health + key pages).

## 5) Promote to Prod (main)

- Merge `preview` into `main`.
- Confirm CI passes.
- Smoke test production (health + key endpoints).
