# Post-Deploy Rollback Runbook

What to do when `.github/workflows/deploy-prod.yml` smoke checks fail (B10).

The current workflow does NOT auto-revert. When a smoke check fails:
1. The workflow exits non-zero (visible in GitHub Actions UI)
2. The deploys are already live (Vercel + Railway promoted before smoke runs)
3. **Manual rollback is required, fast.**

Auto-revert is a follow-up scope item (alias-based blue/green or canary).

---

## Triage decision tree

| Smoke check that failed | Likely cause | First fix attempt |
|---|---|---|
| API health (`api.tailfire.ca/api/v1/health`) | API container not up; bad env / failed migration | Check Railway logs for the API service. If migration error, see `docs/runbooks/migration-recovery.md`. |
| CORS regression | `CORS_ORIGINS` env or regex changed | Verify `CORS_ORIGINS` in Doppler `prd` and Railway `production` → `api-prod`. Compare regex to `apps/api/src/main.ts`. |
| OTA homepage | OTA Vercel deploy crashed | Vercel dashboard → tailfire-ota → recent deployment → "Promote previous". |
| Admin /login | Admin Vercel deploy crashed | Vercel dashboard → tailfire-admin → "Promote previous". |
| Client / | Client Vercel deploy crashed | Vercel dashboard → tailfire-client → "Promote previous". |
| Bad-JWT does NOT 401 | `JwtAuthGuard` wiring broke; auth disabled | Roll API back via Railway → previous deployment. **Do not let this stay live.** |

---

## Vercel rollback

Each frontend (admin, ota, client) has its own Vercel project. Promotion is alias-based.

```bash
# List recent deployments for the project
vercel list --token=$VERCEL_TOKEN \
  --scope=systemsaholic-5e0024de \
  tailfire-ota                    # or tailfire-admin / tailfire-client

# Promote a specific previous deployment to the production alias
vercel promote <deployment-url> --token=$VERCEL_TOKEN \
  --scope=systemsaholic-5e0024de
```

The alias swap happens in seconds. Smoke the relevant URL again.

## Railway (API) rollback

Railway has no `promote` CLI; the rollback is via dashboard.

1. https://railway.app → tailfire project → `production` env → `api-prod` service.
2. Deployments tab → find the last known-good deployment.
3. Click "Redeploy" on it.
4. Wait for the new pod to be healthy (Railway shows ✅).
5. Re-run smoke from the workflow page (`Re-run failed jobs`).

If migrations were applied as part of the bad deploy, check whether they're
reversible. See `docs/runbooks/migration-recovery.md`. Drizzle migrations are
generally forward-only — schema changes may need a manual rollback migration.

## Sentry watch

After any rollback, watch Sentry for the next ~30 minutes:
- https://systemsaholic.sentry.io
- Filter to `environment:production`
- Look for new-issue alerts from the rolled-back commit
- Confirm error rate returns to baseline

---

## Communicate

Drop a Slack note (or whatever channel Phoenix Voyages uses) once rollback
is complete: time, what failed, action taken, current state.

Document the failure in the next punchlist update so the same trap doesn't
catch the next deploy.
