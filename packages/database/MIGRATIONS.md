# Migration Conventions

Guidelines for creating and managing database migrations in the Tailfire project.

---

## Critical Rules

> **NEVER apply migrations directly to Supabase via MCP `apply_migration` tool.**
>
> This causes schema drift between Drizzle's tracking and the actual database state.

| Tool | Use For | Never Use For |
|------|---------|---------------|
| `pnpm db:migrate` | Applying migrations | - |
| Supabase MCP `execute_sql` | Validation queries, data inspection | DDL changes |
| Supabase MCP `apply_migration` | - | **Any migration** |
| Supabase MCP `list_migrations` | Checking applied migrations | - |

---

## Catalog Schema (FDW-Protected)

> **Golden Rule: Never write unguarded DDL against the `catalog` schema.**
>
> On Dev and Preview, `catalog.*` tables are **foreign tables** (via FDW to Production).
> Unguarded `CREATE TABLE`, `ALTER TABLE`, or `DROP TABLE` statements will either
> silently create local tables (breaking FDW) or fail on foreign tables.

### What Breaks FDW

| DDL Statement | Effect on Dev/Preview |
|---|---|
| `CREATE TABLE catalog.foo (...)` | Creates a local table, shadows foreign table |
| `ALTER TABLE catalog.foo ADD COLUMN ...` | Fails — cannot alter a foreign table |
| `DROP TABLE catalog.foo` | Drops the foreign table, data disappears |

### Environment Guard Template

Wrap any `catalog` DDL in a guard that checks whether the table is a regular (local) table:

```sql
DO $$
BEGIN
  -- Only run on environments where catalog tables are LOCAL (Production)
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'catalog'
      AND c.relname = 'cruise_lines'
      AND c.relkind = 'r'  -- 'r' = ordinary table, 'f' = foreign table
  ) THEN
    -- Safe to run DDL — this is Production with local catalog tables
    -- YOUR DDL HERE
  ELSE
    RAISE NOTICE 'Skipping catalog DDL — foreign tables detected (Dev/Preview)';
  END IF;
END $$;
```

### Companion Migration Pattern

When adding new catalog tables, create **two** pieces:
1. **Production DDL** (guarded): `CREATE TABLE catalog.new_table (...)` inside the guard above
2. **FDW re-import** is automatic — `./scripts/setup-local-fdw.sh` uses `IMPORT FOREIGN SCHEMA` which picks up all tables

### Restoring FDW After Breakage

If local dev FDW is broken (catalog queries fail or return no data):

```bash
./scripts/setup-local-fdw.sh
```

This drops and recreates the entire `catalog` schema as foreign tables from Production.

---

## Naming Format

New migrations must use UTC timestamp format:

```
YYYYMMDDHHMMSS_snake_case_description.sql
```

Example: `20251217143000_add_user_preferences.sql`

Generate timestamp:
```bash
date -u +%Y%m%d%H%M%S
```

## Legacy Migrations

Migrations using the sequential format (`NNNN_name.sql`) are grandfathered. Do not create new migrations with this format.

## Source of Truth

- **Drizzle journal** (`meta/_journal.json`) - Required for Drizzle to discover migrations
- **`drizzle.__drizzle_migrations`** - Database table tracking applied migrations
- Both must be in sync for migrations to work correctly

## Workflow

### Creating a New Migration

```bash
# 1. Generate timestamp
TIMESTAMP=$(date -u +%Y%m%d%H%M%S)
echo "Migration timestamp: $TIMESTAMP"

# 2. Create migration file
touch packages/database/src/migrations/${TIMESTAMP}_your_description.sql

# 3. Write your SQL (use IF NOT EXISTS guards for idempotency)
```

### Registering the Migration

**Important**: Drizzle only runs migrations listed in `meta/_journal.json`.

Add an entry to `packages/database/src/migrations/meta/_journal.json`:

```json
{
  "idx": <next_index>,
  "version": "7",
  "when": <timestamp_ms>,
  "tag": "<filename_without_extension>",
  "breakpoints": true
}
```

### Applying the Migration

```bash
# From apps/api directory
cd apps/api && pnpm db:migrate
```

### Validating (Post-Migration)

Use Supabase MCP to verify changes were applied:

```sql
-- Check column exists
SELECT column_name FROM information_schema.columns
WHERE table_name = 'your_table' AND column_name = 'new_column';

-- Check enum exists
SELECT typname FROM pg_type WHERE typname = 'your_enum';

-- Check migration recorded
SELECT * FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 5;
```

Or use REST API to test the column:
```bash
curl -s "https://<project>.supabase.co/rest/v1/<table>?select=<new_column>&limit=1" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY"
```

## Commands

| Command | Description |
|---------|-------------|
| `cd apps/api && pnpm db:migrate` | Apply pending migrations |
| `pnpm --filter @tailfire/database migrations:validate` | Check naming and duplicates |
| `pnpm --filter @tailfire/database migrations:list` | List migration files |

## Archived Files

The `_archive/` directory contains:

- **Orphaned duplicates**: Files with duplicate prefixes (e.g., multiple `0015_` files)
- **Down migrations**: The `down/` directory (rollback scripts)

These files are preserved for history and audit purposes but are not actively used.

## Validation

The validation script (`pnpm --filter @tailfire/database migrations:validate`) checks:

- File naming matches `YYYYMMDDHHMMSS_name.sql` or legacy `NNNN_name.sql`
- No duplicate prefixes exist
- Timestamp migrations are in chronological order

Run validation before committing new migrations.

---

## Troubleshooting

### Migration runs but nothing happens

**Cause**: Migration file exists but isn't registered in `meta/_journal.json`.

**Fix**: Add the entry to the journal (see "Registering the Migration" above).

### "Migrations completed successfully" but columns don't exist

**Cause**: Journal entry exists but SQL file is missing or has wrong filename.

**Fix**: Ensure the `tag` in journal matches the filename exactly (without `.sql`).

### Schema drift (MCP shows different schema than Drizzle expects)

**Cause**: Someone applied DDL directly via MCP `apply_migration` or SQL editor.

**Fix**:
1. Check what's in the database: `SELECT * FROM drizzle.__drizzle_migrations`
2. Compare with `meta/_journal.json`
3. Manually reconcile by adding missing journal entries or creating corrective migrations

### Column already exists error

**Cause**: Migration ran partially or was applied outside Drizzle.

**Fix**: Use `IF NOT EXISTS` guards in SQL:
```sql
ALTER TABLE foo ADD COLUMN IF NOT EXISTS bar TEXT;
```

### Enum already exists error

**Cause**: Enum was created but migration wasn't tracked.

**Fix**: Wrap enum creation:
```sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'my_enum') THEN
    CREATE TYPE my_enum AS ENUM ('a', 'b', 'c');
  END IF;
END $$;
```
