# Sentry MCP Server + Skill — Design Spec

**Date:** 2026-03-19
**Status:** Approved

## Overview

Python MCP server wrapping the Sentry API, plus a `/sentry` skill for monitoring workflows. Follows the same pattern as the existing `cpanel-mcp` server.

## MCP Server

**Location:** `~/mcp-servers/sentry-mcp/`

### Tools

| Tool | Parameters | Returns |
|------|-----------|---------|
| `sentry_list_issues` | `project?`, `level?` (error/warning/info), `time_period?` (24h/7d/30d), `query?`, `limit?` (default 15) | Array of issues with id, title, count, level, firstSeen, lastSeen, permalink |
| `sentry_get_issue` | `issue_id` | Issue details + latest event stack trace (function, file, line) |
| `sentry_resolve_issue` | `issue_id` | Confirmation |
| `sentry_resolve_many` | `issue_ids` (array) | Confirmation with count |
| `sentry_ignore_issue` | `issue_id`, `duration?` (hours) | Confirmation |
| `sentry_list_projects` | none | Array of project slugs |

### Config

| Env Var | Description | Default |
|---------|-------------|---------|
| `SENTRY_USER_TOKEN` | User-scoped API token with project:read/write | Required |
| `SENTRY_ORG` | Organization slug | `systemsaholic` |
| `SENTRY_BASE_URL` | API base URL | `https://us.sentry.io` |

### File Structure

```
~/mcp-servers/sentry-mcp/
├── pyproject.toml
├── src/sentry_mcp/
│   ├── __init__.py
│   ├── __main__.py        # Entry point: python -m sentry_mcp
│   ├── server.py          # MCP server with @tool decorators
│   ├── client.py          # Async Sentry API client (aiohttp)
│   └── config.py          # pydantic-settings config
```

### Dependencies

```
mcp>=1.0.0
pydantic>=2.0.0
pydantic-settings>=2.0.0
aiohttp>=3.9.0
```

### Claude Code Registration

Add to `~/.claude/settings.json` mcpServers:
```json
"sentry-mcp": {
  "command": "python3",
  "args": ["-m", "sentry_mcp"],
  "cwd": "/Users/alguertin/mcp-servers/sentry-mcp/src",
  "env": {
    "SENTRY_USER_TOKEN": "sntryu_..."
  }
}
```

## Skill

**Location:** `~/.claude/skills/sentry-monitor/SKILL.md`

### Commands

| Command | Action |
|---------|--------|
| `/sentry` | Health check — unresolved count per project, top 5 errors |
| `/sentry triage` | List all unresolved, classify transient vs real, auto-resolve transient |
| `/sentry <issue-id>` | Deep dive — full stack trace, tags, affected transactions |

### Triage Logic

Transient (auto-resolve):
- `MaxClientsInSessionMode` / connection pool errors
- `ECONNREFUSED` / `ETIMEDOUT` network errors
- `504 Gateway Timeout` from upstream services

Real (create GH issue):
- Application errors (TypeError, ReferenceError, etc.)
- Failed queries with schema mismatches
- Unhandled rejections in business logic
- Recurring errors (>10 occurrences)

### Integration with Issue Tracker

When triage finds a real issue, the skill creates a GitHub issue via `gh issue create` with:
- Title: `[Sentry] {error title}`
- Body: stack trace, affected transaction, occurrence count, Sentry link
- Label: `bug`
