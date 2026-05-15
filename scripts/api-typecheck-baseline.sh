#!/usr/bin/env bash
# B12: API typecheck regression guard.
#
# Runs `pnpm --filter @tailfire/api typecheck`, normalizes the diagnostics
# into stable keys (file + TS code + normalized first-line message), and
# compares against the committed baseline at scripts/api-typecheck-baseline.txt.
#
# Per Codex B12 verdict (2026-05-15): a count-only check is too weak — one
# serious new auth/payment error could replace one unused import and slip
# through. We track the SET of error keys instead. Any new key fails CI;
# disappearing keys are allowed (cleanup is rewarded).
#
# Usage:
#   scripts/api-typecheck-baseline.sh check     # default; CI mode
#   scripts/api-typecheck-baseline.sh update    # regenerate baseline
#
# Exit codes: 0 = no new errors (or unchanged); 1 = new error keys appeared.

set -euo pipefail

MODE="${1:-check}"
BASELINE_FILE="scripts/api-typecheck-baseline.txt"

# Locate repo root by looking for the file we expect to be relative to it.
if [[ ! -d "apps/api" ]]; then
  echo "ERROR: must run from repo root (no apps/api/ found here)" >&2
  exit 2
fi

# Run typecheck. tsc exits non-zero on errors; we want the output regardless.
TYPECHECK_RAW="$(pnpm --filter @tailfire/api typecheck 2>&1 || true)"

# Parse error lines like:
#   src/foo/bar.ts(123,45): error TS2305: Module 'baz' has no exported member 'qux'.
# Normalize to:
#   src/foo/bar.ts::TS2305::Module '...' has no exported member '...'.
#
# Identifier-quoted things (`'foo'`, `"bar"`) get collapsed to '...' so a
# rename in one place doesn't churn the baseline.
CURRENT_KEYS="$(
  echo "$TYPECHECK_RAW" \
    | grep -E '^[a-z][^:]*\([0-9]+,[0-9]+\): error TS[0-9]+:' \
    | sed -E 's|^([^(]+)\([0-9]+,[0-9]+\): error (TS[0-9]+): (.+)$|\1::\2::\3|' \
    | sed -E "s/'[^']*'/'\\.\\.\\.'/g" \
    | sed -E 's/"[^"]*"/"\.\.\."/g' \
    | sort -u
)"

if [[ "$MODE" == "update" ]]; then
  if [[ -z "$CURRENT_KEYS" ]]; then
    echo "# No errors — baseline cleared." > "$BASELINE_FILE"
  else
    {
      echo "# B12 baseline — normalized API typecheck diagnostic keys."
      echo "# Format: <file>::<TS code>::<first-line message with quoted identifiers collapsed>"
      echo "# Updated $(date -u +%Y-%m-%d) by $(basename "$0") update."
      echo "# CI script: scripts/api-typecheck-baseline.sh check"
      echo ""
      echo "$CURRENT_KEYS"
    } > "$BASELINE_FILE"
  fi
  echo "✅ Baseline updated: $BASELINE_FILE ($(echo "$CURRENT_KEYS" | grep -c . || true) keys)"
  exit 0
fi

# Check mode (default): diff current keys against baseline.
if [[ ! -f "$BASELINE_FILE" ]]; then
  echo "ERROR: baseline file missing at $BASELINE_FILE" >&2
  echo "Run: $0 update" >&2
  exit 2
fi

BASELINE_KEYS="$(grep -v '^#' "$BASELINE_FILE" | grep -v '^$' || true)"

# Find keys in CURRENT but NOT in BASELINE.
NEW_KEYS="$(comm -23 \
  <(echo "$CURRENT_KEYS") \
  <(echo "$BASELINE_KEYS"))"

# Find keys in BASELINE but NOT in CURRENT (disappeared = good, just a hint).
DISAPPEARED="$(comm -13 \
  <(echo "$CURRENT_KEYS") \
  <(echo "$BASELINE_KEYS"))"

if [[ -n "$DISAPPEARED" ]]; then
  echo "ℹ️  $(echo "$DISAPPEARED" | grep -c . || true) baseline error(s) no longer present — consider running '$0 update' to lock in the cleanup."
fi

if [[ -n "$NEW_KEYS" ]]; then
  echo ""
  echo "❌ NEW typecheck error key(s) introduced (B12 regression):"
  echo "------------------------------------------------------------"
  echo "$NEW_KEYS"
  echo "------------------------------------------------------------"
  echo ""
  echo "Either fix the underlying type error, or — if it's intentional and"
  echo "must ship — run '$0 update' to re-baseline. Get a maintainer to"
  echo "review the baseline diff in that case."
  exit 1
fi

echo "✅ No new typecheck error keys (baseline holds at $(echo "$BASELINE_KEYS" | grep -c . || true) keys)"
