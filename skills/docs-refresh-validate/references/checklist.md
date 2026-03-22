# Documentation Refresh Checklist

Use this checklist when running a full docs refresh pass.

## 1. Inventory The Repo

Start by verifying what is actually in the repo now.

Suggested command patterns:

```bash
rg --files -g 'README*' -g '*.md'
rg --files -g 'package.json' -g 'pnpm-workspace.yaml' -g 'turbo.json'
find .github/workflows -maxdepth 1 -type f | sort
find apps -maxdepth 2 -name package.json | sort
find packages -maxdepth 2 -name package.json | sort
```

For runtime truth:

```bash
find apps/*/src/app -maxdepth 2 -type d | sort
find apps/api/src -maxdepth 1 -type d | sort
sed -n '1,220p' apps/api/src/app.module.ts
sed -n '1,220p' apps/api/src/main.ts
find . -maxdepth 3 \( -name '.env.example' -o -name '.env.local.example' \) | sort
find wiki -maxdepth 2 -name '*.md' 2>/dev/null | sort
```

## 2. Decide Which Docs Are Canonical

Refresh these first if they exist:

- repo `README.md`
- repo or workspace `AGENTS.md`
- `docs/README.md` or docs index
- `docs/ARCHITECTURE.md`
- `docs/LOCAL_DEV.md`
- `docs/TESTING.md`
- `docs/CI_CD.md`
- app README files
- package README files

Do not spend time rewriting historical plan/spec files unless the user explicitly asks.

## 3. Decide Whether The User Guide Also Needs Refresh

Update the user-guide layer in the same pass when the change affects:

- UI labels, navigation, or settings paths
- agent operating steps
- proposal, approval, booking, payment, or service-fee workflows
- library/template usage
- user-visible limitations or troubleshooting steps

Common user-guide targets:

- `wiki/Home.md`
- `wiki/_Sidebar.md`
- `wiki/Agent-Guide-*.md`
- `docs/help/*`
- any repo-local help-center markdown

## 4. Compare Docs To Code

Check these areas explicitly:

- scripts documented in markdown vs scripts present in `package.json`
- routes documented in READMEs vs folders in `src/app`
- API module claims vs `app.module.ts` and feature directories
- env/setup claims vs `.env.example` and bootstrap code
- deployment claims vs `.github/workflows`
- test claims vs actual `test`, `typecheck`, `playwright`, and `vitest` scripts
- user-guide steps vs the current screens, forms, and routes

Useful drift checks:

```bash
rg -n 'old-repo-name|old-app-name|legacy-folder'
rg -n 'Coming soon|In development|placeholder|TODO' apps
rg --files | rg '\.spec\.|\.test\.|playwright|vitest|jest-e2e'
```

If user-guide content is in scope, also check for:

- stale menu names or route names
- old workflow/state terminology
- help articles that no longer match the actual UI

## 5. Keep Issues Separate From Docs

If you find real platform problems, record them in a separate issues file rather than softening the docs.

Recommended structure:

```md
# Repository Review Issues

Review date: YYYY-MM-DD

Scope: what was reviewed and what was not.

## Priority 1

### 1. Short issue title

Evidence:

- path/to/file

Why it matters:

- concrete impact

Suggested next step:

- concrete next action
```

## 6. Validate Before Closing

Before finishing:

- scan updated docs for stale repo/app names
- scan updated help/wiki files for stale screen names or outdated workflow terms
- make sure newly referenced files exist
- make sure commands in docs exist in package scripts or workflows
- if user-guide files changed, make sure local wiki/help links still resolve
- note any assumptions you had to make

Recommended closing summary:

- docs updated
- whether user-guide/wiki docs were updated
- issues file path
- validation performed
- anything not validated
