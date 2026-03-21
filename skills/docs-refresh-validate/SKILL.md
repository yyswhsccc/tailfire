---
name: docs-refresh-validate
description: Refresh and validate repository documentation and user guides against the current codebase. Use when features, routes, packages, scripts, environments, migrations, CI/CD, platform behavior, or agent-facing workflows changed and Codex needs to audit docs drift, update canonical docs and help content, and produce a prioritized issues file with evidence.
---

# Docs Refresh Validate

## Overview

Audit the codebase first, then update the canonical docs so they match the repository as it exists now. When product or operational behavior changed, also refresh the user-guide layer that teaches agents or end users how to use the platform. Keep unresolved platform or product problems in a separate prioritized issues file instead of hiding them inside documentation edits.

## Workflow

1. Inventory reality.
   - Read the repo entry docs and any repo-local guidance files.
   - Inspect manifests, env examples, workflows, and the active source tree.
   - Treat code, scripts, and config as source of truth over stale docs.
2. Pick the canonical docs to refresh first.
   - Start with the docs people actually use:
     - root or workspace `README.md`
     - docs index
     - architecture / local dev / testing / CI docs
     - app and package READMEs
   - Do not rewrite historical plan/spec files unless explicitly asked.
   - If the change affects agent workflows, settings, booking flows, proposal steps, or other UI-driven operations, identify the user-guide surfaces too:
     - repo wiki
     - help-center or agent-guide markdown
     - product usage docs
3. Compare docs to code.
   - Verify documented commands against `package.json` scripts.
   - Verify route, module, and package claims against the actual tree.
   - Verify env/setup claims against `.env.example`, bootstrap code, and workflows.
   - Verify user-guide steps against the current UI, routes, forms, and operational flow.
   - Record placeholders, mock data, missing tests, and partial rollouts as issues.
4. Update docs.
   - Keep docs concise, factual, and current.
   - Add missing README or reference docs for active apps/packages if needed.
   - If the repo has a user guide or wiki, update the affected help articles in the same pass when user-facing behavior changed.
   - Keep technical docs and user-facing help distinct: architecture belongs in canonical docs; task walkthroughs belong in the user guide.
   - Mark maturity honestly; do not present scaffolded or mock-backed features as complete.
   - Do not change product code unless the user explicitly asks.
5. Create or update the issues file.
   - Use a dedicated issues file such as `docs/REPOSITORY_REVIEW_ISSUES.md` unless the repo already has an agreed location.
   - Order issues by priority.
   - Include evidence, impact, and a suggested next step for each issue.
6. Validate the doc pass.
   - Search for stale repo names, removed paths, and legacy app names.
   - Validate wiki/help-guide links too if those files were touched.
   - Verify referenced files still exist.
   - State what you validated and what you did not validate.

## Validation Rules

- Never document a script, route, module, env var, or workflow you did not verify locally.
- Never write user-guide steps from intent or planned UX. Verify the actual current UI and flow first.
- Never describe mock or placeholder behavior as production-ready.
- When docs and code disagree, update the docs unless the user also asked for code changes.
- When canonical docs and historical design notes coexist, add or update a docs index that explains which files are current.
- Prefer `rg`, `find`, `sed`, and manifest inspection over memory.

## Use The Bundled Checklist

For a full refresh, read [`references/checklist.md`](./references/checklist.md). It contains:

- a discovery checklist
- command patterns for inventory and drift checks
- recommended canonical doc and user-guide targets
- a reusable issues-file format
- a validation checklist for the closeout

## Final Output Expectations

Report:

- which docs were updated
- whether the user guide/wiki was updated or intentionally left unchanged
- where the issues file lives
- what validation was performed
- any remaining gaps or assumptions
