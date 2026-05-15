#!/usr/bin/env bash
# ─── TES Import Runner ──────────────────────────────────────────────────────
#
# Automates the full TES import cycle: authenticate, clean up previous run,
# reset the ledger, and re-run the import.
#
# Usage:
#   ./scripts/migration/tes-import-runner.sh                  # Full import (all trips)
#   ./scripts/migration/tes-import-runner.sh --limit 50       # Import first 50 trips
#   ./scripts/migration/tes-import-runner.sh --dry-run        # Dry run (no writes)
#   ./scripts/migration/tes-import-runner.sh --skip-cleanup   # Skip cleanup, just import
#   ./scripts/migration/tes-import-runner.sh --cleanup-only   # Only clean up, don't import
#   ./scripts/migration/tes-import-runner.sh --full-reset     # Full reset (clear ALL mappings, no --resume)
#
# Prerequisites:
#   - Local API running on localhost:3101 (turbo dev)
#   - data/migration/ directory with TES JSON files
#   - .env values in tailfire/apps/api/.env (SUPABASE_URL, DATABASE_URL)
#
# Environment:
#   SUPABASE_URL       - Supabase project URL (reads from apps/api/.env if not set)
#   SUPABASE_ANON_KEY  - Supabase anon key (reads from apps/api/.env if not set)
#   TAILFIRE_API       - API base URL (default: http://localhost:3101/api/v1)
#   TES_EMAIL          - Admin email (default: admin@phoenixvoyages.ca)
#   TES_PASSWORD_FILE  - Path to file containing password (avoids shell escaping issues)
#   DATABASE_URL       - PostgreSQL connection string (reads from apps/api/.env if not set)
#
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
API_ENV="$PROJECT_ROOT/tailfire/apps/api/.env"
LEDGER_PATH="$PROJECT_ROOT/data/migration/id-mapping.json"
TAILFIRE_API="${TAILFIRE_API:-http://localhost:3101/api/v1}"
TES_EMAIL="${TES_EMAIL:-admin@phoenixvoyages.ca}"

# ─── Parse flags ─────────────────────────────────────────────────────────────

SKIP_CLEANUP=false
CLEANUP_ONLY=false
FULL_RESET=false
IMPORT_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-cleanup) SKIP_CLEANUP=true; shift ;;
    --cleanup-only) CLEANUP_ONLY=true; shift ;;
    --full-reset) FULL_RESET=true; shift ;;
    *) IMPORT_ARGS+=("$1"); shift ;;
  esac
done

# ─── Load env from apps/api/.env ─────────────────────────────────────────────

load_env_var() {
  local var_name="$1"
  if [[ -z "${!var_name:-}" && -f "$API_ENV" ]]; then
    local val
    val=$(grep "^${var_name}=" "$API_ENV" | head -1 | cut -d= -f2-)
    if [[ -n "$val" ]]; then
      export "$var_name=$val"
    fi
  fi
}

load_env_var SUPABASE_URL
load_env_var SUPABASE_ANON_KEY
load_env_var SUPABASE_SERVICE_ROLE_KEY
load_env_var DATABASE_URL

# ─── Validate ────────────────────────────────────────────────────────────────

if [[ -z "${SUPABASE_URL:-}" ]]; then
  echo "ERROR: SUPABASE_URL not set and not found in $API_ENV" >&2
  exit 1
fi

if [[ -z "${SUPABASE_ANON_KEY:-}" ]]; then
  echo "ERROR: SUPABASE_ANON_KEY not set and not found in $API_ENV" >&2
  exit 1
fi

if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  echo "ERROR: SUPABASE_SERVICE_ROLE_KEY not set and not found in $API_ENV (needed for supplierLinks step)" >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL not set and not found in $API_ENV" >&2
  exit 1
fi

# ─── Password handling ──────────────────────────────────────────────────────
# Use a temp file to avoid shell escaping issues with special characters (!, $, etc.)

TES_PW_FILE=$(mktemp)
trap 'rm -f "$TES_PW_FILE"' EXIT

if [[ -n "${TES_PASSWORD_FILE:-}" && -f "$TES_PASSWORD_FILE" ]]; then
  cp "$TES_PASSWORD_FILE" "$TES_PW_FILE"
elif [[ -n "${TES_PASSWORD:-}" ]]; then
  printf '%s' "$TES_PASSWORD" > "$TES_PW_FILE"
else
  echo -n "Admin password for $TES_EMAIL: "
  read -rs pw_input
  echo
  printf '%s' "$pw_input" > "$TES_PW_FILE"
fi

# ─── Step 1: Authenticate ───────────────────────────────────────────────────

echo "── Step 1: Authenticating as $TES_EMAIL ──"

TOKEN=$(SUPABASE_URL="$SUPABASE_URL" SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
  TES_EMAIL="$TES_EMAIL" TES_PW_FILE="$TES_PW_FILE" \
  python3 -c '
import urllib.request, json, sys, os
pw = open(os.environ["TES_PW_FILE"]).read()
url = os.environ["SUPABASE_URL"] + "/auth/v1/token?grant_type=password"
data = json.dumps({"email": os.environ["TES_EMAIL"], "password": pw}).encode()
req = urllib.request.Request(url, data=data, headers={
    "apikey": os.environ["SUPABASE_ANON_KEY"],
    "Content-Type": "application/json"
})
try:
    resp = urllib.request.urlopen(req)
    result = json.loads(resp.read())
    print(result["access_token"], end="")
except urllib.error.HTTPError as e:
    body = json.loads(e.read())
    print("AUTH_ERROR: " + body.get("msg", str(body)), file=sys.stderr)
    sys.exit(1)
')

# Verify token
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${TAILFIRE_API}/contacts?limit=1" \
  -H "Authorization: Bearer $TOKEN")

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "ERROR: Token verification failed (HTTP $HTTP_CODE). Is the API running?" >&2
  exit 1
fi

echo "  Token verified ✓"

# ─── Step 2: Cleanup previous import ────────────────────────────────────────

if [[ "$SKIP_CLEANUP" == "false" ]]; then
  echo ""
  echo "── Step 2: Cleaning up previous TES import ──"

  # Count existing TES trips
  TRIP_COUNT=$(psql "$DATABASE_URL" -t -A -c \
    "SELECT count(*) FROM trips WHERE external_reference IS NOT NULL AND external_reference <> ''")
  echo "  Found $TRIP_COUNT TES-imported trips"

  if [[ "$TRIP_COUNT" -gt 0 ]]; then
    # Delete commission check items first (FK to activity_pricing blocks cascade)
    echo "  Deleting commission check items for TES trips..."
    psql "$DATABASE_URL" -c \
      "DELETE FROM commission_check_items WHERE activity_pricing_id IN (
        SELECT ap.id FROM activity_pricing ap
        JOIN itinerary_activities ia ON ia.id = ap.activity_id
        JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
        JOIN itineraries itin ON itin.id = iday.itinerary_id
        JOIN trips t ON t.id = itin.trip_id
        WHERE t.external_reference IS NOT NULL AND t.external_reference <> ''
      )" 2>&1 | sed 's/^/  /'

    # Delete trips with external_reference (cascade handles remaining related records)
    echo "  Deleting TES-imported trips (CASCADE)..."
    psql "$DATABASE_URL" -c \
      "DELETE FROM trips WHERE external_reference IS NOT NULL AND external_reference <> ''" \
      2>&1 | sed 's/^/  /'

    # Clean up orphaned commission checks (no items left)
    echo "  Cleaning up orphaned commission checks..."
    psql "$DATABASE_URL" -c \
      "DELETE FROM commission_checks WHERE id NOT IN (SELECT DISTINCT check_id FROM commission_check_items)" \
      2>&1 | sed 's/^/  /'

    echo "  Trips deleted ✓"
  fi

  # Clean up TES-imported trip_groups (identified by description containing 'TraveleSolutions')
  GROUP_COUNT=$(psql "$DATABASE_URL" -t -A -c \
    "SELECT count(*) FROM trip_groups WHERE description LIKE '%TraveleSolutions%'")
  if [[ "$GROUP_COUNT" -gt 0 ]]; then
    echo "  Deleting $GROUP_COUNT TES-imported trip groups..."
    psql "$DATABASE_URL" -c \
      "DELETE FROM trip_groups WHERE description LIKE '%TraveleSolutions%'" \
      2>&1 | sed 's/^/  /'
    echo "  Trip groups deleted ✓"
  fi

  # Reset ledger
  if [[ -f "$LEDGER_PATH" ]]; then
    echo "  Resetting ledger..."
    if [[ "$FULL_RESET" == "true" ]]; then
      # Full reset — clear EVERYTHING for a clean production run
      echo '{"mappings":[],"completedSteps":[],"stats":{}}' > "$LEDGER_PATH"
      echo "  Ledger fully reset (all mappings cleared)"
    else
      # Partial reset — keep suppliers and contacts
      LEDGER_PATH="$LEDGER_PATH" python3 -c '
import json, os
ledger_path = os.environ["LEDGER_PATH"]
ledger = json.load(open(ledger_path))
# Keep suppliers and contacts (they are shared), only reset trip-related steps
trip_steps = ["trips", "supplierLinks", "commission", "paymentSchedules", "paymentTransactions", "commissionChecks", "commissionCheckItems", "draftFixup"]
ledger["completedSteps"] = [s for s in ledger.get("completedSteps", []) if s not in trip_steps]
# Remove trip-related mappings
trip_types = ["trip", "tripTraveler", "activity", "booking", "travelerBooking", "activityPricing",
              "commission", "paymentSchedule", "paymentTransaction", "commissionCheck", "commissionCheckItem"]
ledger["mappings"] = [m for m in ledger["mappings"] if m["sourceType"] not in trip_types]
# Reset trip-related stats
for t in trip_types:
    ledger["stats"].pop(t, None)
json.dump(ledger, open(ledger_path, "w"), indent=2)
kept = len(ledger["mappings"])
print(f"  Ledger reset (kept {kept} supplier/contact mappings)")
'
    fi
  fi

  echo "  Cleanup complete ✓"
fi

if [[ "$CLEANUP_ONLY" == "true" ]]; then
  echo ""
  echo "── Cleanup-only mode, skipping import ──"
  exit 0
fi

# ─── Step 3: Run import ─────────────────────────────────────────────────────

echo ""
echo "── Step 3: Running TES import ──"
echo "  Args: ${IMPORT_ARGS[*]:-<none>}"
echo ""

IMPORT_MODE=""
if [[ "$FULL_RESET" != "true" ]]; then
  IMPORT_MODE="--resume"
fi

cd "$PROJECT_ROOT"
TAILFIRE_TOKEN="$TOKEN" \
TAILFIRE_API="$TAILFIRE_API" \
SUPABASE_URL="$SUPABASE_URL" \
SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}" \
SUPABASE_EMAIL="$TES_EMAIL" \
SUPABASE_PASSWORD="$(cat "$TES_PW_FILE")" \
  npx tsx scripts/migration/import-to-tailfire.ts $IMPORT_MODE "${IMPORT_ARGS[@]}"

# ─── Step 4: Run group import ──────────────────────────────────────────────

GROUP_IMPORT="$PROJECT_ROOT/data/migration/import-group-trips.mjs"
if [[ -f "$GROUP_IMPORT" ]]; then
  echo ""
  echo "── Step 4: Running GROUP trip import ──"

  TAILFIRE_TOKEN="$TOKEN" \
  TAILFIRE_API="$TAILFIRE_API" \
    node "$GROUP_IMPORT" "${IMPORT_ARGS[@]}"
else
  echo ""
  echo "── Step 4: Skipped (no group import file at $GROUP_IMPORT) ──"
fi

# ─── Step 5: Status summary ─────────────────────────────────────────────────

echo ""
echo "── Step 5: Import results ──"

TAILFIRE_API="$TAILFIRE_API" TOKEN="$TOKEN" python3 -c '
import urllib.request, json, os
url = os.environ["TAILFIRE_API"] + "/trips?limit=100"
req = urllib.request.Request(url, headers={"Authorization": "Bearer " + os.environ["TOKEN"]})
resp = json.loads(urllib.request.urlopen(req).read())
trips = resp.get("data", resp) if isinstance(resp, dict) else resp
tes = [t for t in trips if t.get("externalReference")]
statuses = {}
for t in tes:
    s = t.get("status", "unknown")
    statuses[s] = statuses.get(s, 0) + 1
print(f"  TES-imported trips: {len(tes)}")
print(f"  Status breakdown:")
for s, c in sorted(statuses.items()):
    print(f"    {s}: {c}")
'

echo ""
echo "── Done ──"
