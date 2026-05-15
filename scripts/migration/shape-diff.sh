#!/usr/bin/env bash
# B14 / TES cutover shape-fidelity audit.
#
# Read-only. Connects to whatever DATABASE_URL is set and reports on
# data-shape invariants the TES import script must honour so imported
# rows are indistinguishable from natively-created TF data.
#
# Usage:
#   DATABASE_URL='postgresql://...' bash scripts/migration/shape-diff.sh
#
# Output: markdown report to stdout. Pipe to a file if you want to archive it.
#   bash scripts/migration/shape-diff.sh > /tmp/shape-diff-$(date +%s).md

set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL not set" >&2
  exit 2
fi

# Helper: run SQL, print as markdown table row.
psql_query() {
  PGPASSWORD="" psql "$DATABASE_URL" --no-psqlrc -At -F '|' -c "$1" 2>&1
}

heading() { echo ""; echo "## $1"; echo ""; }
subheading() { echo ""; echo "### $1"; echo ""; }
note() { echo "_$1_"; echo ""; }

date_iso=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
echo "# TES → TF Shape Fidelity Audit"
echo ""
echo "**Generated:** $date_iso"
echo "**Database:** $(psql_query 'SELECT current_database() || ''@'' || inet_server_addr()')"
echo ""
note "Purpose: confirm imported data is indistinguishable from natively-created TF data. Each section reports invariant violations; an empty 'violations' row means clean."

# ---------------------------------------------------------------------------
# 1. Row counts (orientation)
# ---------------------------------------------------------------------------
heading "1. Row counts (orientation)"
echo "| Table | Rows |"
echo "|---|---|"
for t in trips contacts itineraries itinerary_activities itinerary_days activity_pricing trip_travelers trip_collaborators payment_transactions payment_schedule_config commission_checks commission_tracking commission_check_items user_profiles agencies suppliers; do
  count=$(psql_query "SELECT count(*) FROM public.$t" 2>/dev/null || echo "—")
  echo "| $t | $count |"
done

# ---------------------------------------------------------------------------
# 2. Trips: required fields, status enum, agency scoping
# ---------------------------------------------------------------------------
heading "2. Trips"

subheading "2.1 Required-field NULLs"
echo "| Field | NULL count | OK if 0 |"
echo "|---|---|---|"
for col in owner_id agency_id name status; do
  n=$(psql_query "SELECT count(*) FROM public.trips WHERE $col IS NULL")
  echo "| $col | $n | ✓ |"
done

subheading "2.2 Trip status distribution"
echo "| status | count |"
echo "|---|---|"
psql_query "SELECT status::text || '|' || count(*) FROM public.trips GROUP BY status ORDER BY count(*) DESC" \
  | sed 's|^|\| |;s|$| \||'

subheading "2.3 Legacy status values (should be 0 after the 2026-03-22 migration)"
echo "| legacy status | count |"
echo "|---|---|"
for st in draft quoted booked in_progress completed; do
  n=$(psql_query "SELECT count(*) FROM public.trips WHERE status::text = '$st'")
  echo "| $st | $n |"
done

subheading "2.4 Trips with no collaborators (invisible to agents)"
n=$(psql_query "SELECT count(*) FROM public.trips t WHERE NOT EXISTS (SELECT 1 FROM public.trip_collaborators tc WHERE tc.trip_id = t.id)")
echo "Trips with **zero** \`trip_collaborators\` rows: **$n**"
echo ""
note "If non-zero: those trips are only visible to admins via owner_id. Agents will not see them on /trips/mine."

subheading "2.5 Trips owned by admin-fixture user (W1-W5 territory)"
echo "Per project memory, the 2026-03-23 import set owner_id to a single admin fixture. Check distribution by owner:"
echo "| owner_id | trip count |"
echo "|---|---|"
psql_query "SELECT owner_id::text || '|' || count(*) FROM public.trips GROUP BY owner_id ORDER BY count(*) DESC LIMIT 5" \
  | sed 's|^|\| |;s|$| \||'

# ---------------------------------------------------------------------------
# 3. Contacts: PII, agency scoping
# ---------------------------------------------------------------------------
heading "3. Contacts"

subheading "3.1 Required-field NULLs"
echo "| Field | NULL count | OK if 0 |"
echo "|---|---|---|"
for col in agency_id contact_type contact_status; do
  n=$(psql_query "SELECT count(*) FROM public.contacts WHERE $col IS NULL")
  echo "| $col | $n | ✓ |"
done

subheading "3.2 Contacts without first_name AND legal_first_name AND preferred_name"
n=$(psql_query "SELECT count(*) FROM public.contacts WHERE (first_name IS NULL OR first_name = '') AND (legal_first_name IS NULL OR legal_first_name = '') AND (preferred_name IS NULL OR preferred_name = '')")
echo "Contacts with no name variant populated: **$n**"
note "DB has check_has_name constraint requiring first_name OR legal_first_name OR preferred_name to be NOT NULL. If this count is non-zero, the constraint is broken."

subheading "3.3 Contact-type distribution"
echo "| contact_type | count |"
echo "|---|---|"
psql_query "SELECT contact_type::text || '|' || count(*) FROM public.contacts GROUP BY contact_type ORDER BY count(*) DESC" \
  | sed 's|^|\| |;s|$| \||'

subheading "3.4 Contact-status distribution"
echo "| contact_status | count |"
echo "|---|---|"
psql_query "SELECT contact_status::text || '|' || count(*) FROM public.contacts GROUP BY contact_status ORDER BY count(*) DESC" \
  | sed 's|^|\| |;s|$| \||'

# ---------------------------------------------------------------------------
# 4. Activities + pricing (B4 §38 readiness)
# ---------------------------------------------------------------------------
heading "4. Activities + pricing (B4 §38 finalize() readiness)"

subheading "4.1 itinerary_activities required fields"
echo "| Field | NULL count | OK if 0 |"
echo "|---|---|---|"
for col in trip_id itinerary_id activity_type proposal_status booking_status; do
  n=$(psql_query "SELECT count(*) FROM public.itinerary_activities WHERE $col IS NULL" 2>/dev/null || echo "—")
  echo "| $col | $n | ✓ |"
done

subheading "4.2 activity_pricing: cancellation_policy missing"
n=$(psql_query "SELECT count(*) FROM public.activity_pricing WHERE cancellation_policy IS NULL OR cancellation_policy = '' OR trim(cancellation_policy) = ''")
total=$(psql_query "SELECT count(*) FROM public.activity_pricing")
echo "Activities missing cancellation_policy: **$n** of $total"
note "Per B4 §38: finalize() rejects trip orders with empty cancellation_policy on any booking. Imported activities should inherit supplier default or have explicit policy."

subheading "4.3 activity_pricing: non_refundable=true but cancellation_policy doesn't say so"
n=$(psql_query "SELECT count(*) FROM public.activity_pricing WHERE non_refundable_deposit = true AND (cancellation_policy IS NULL OR (lower(cancellation_policy) !~ 'non.refundable'))")
echo "Activities flagged non_refundable but text doesn't disclose it: **$n**"
note "Per B4 §38: finalize() rejects when non_refundable=true and the text doesn't mention 'non-refundable' or 'non refundable'."

subheading "4.4 activity_pricing: total_price_cents NULL or 0"
n=$(psql_query "SELECT count(*) FROM public.activity_pricing WHERE total_price_cents IS NULL OR total_price_cents = 0")
echo "Activities with no price: **$n**"
note "If high, suggests TES had no pricing OR the import lost it. Either way, TICO §38 §38(5) requires total price."

subheading "4.5 activity_pricing: currency NULL"
n=$(psql_query "SELECT count(*) FROM public.activity_pricing WHERE currency IS NULL OR currency = ''")
echo "Activities missing currency: **$n**"

# ---------------------------------------------------------------------------
# 5. Payments
# ---------------------------------------------------------------------------
heading "5. Payment transactions"

subheading "5.1 Required-field NULLs"
echo "| Field | NULL count | OK if 0 |"
echo "|---|---|---|"
for col in expected_payment_item_id agency_id amount_cents transaction_type; do
  n=$(psql_query "SELECT count(*) FROM public.payment_transactions WHERE $col IS NULL" 2>/dev/null || echo "—")
  echo "| $col | $n | ✓ |"
done

subheading "5.2 contact_id presence"
n=$(psql_query "SELECT count(*) FROM public.payment_transactions WHERE contact_id IS NULL")
total=$(psql_query "SELECT count(*) FROM public.payment_transactions")
echo "Transactions with NULL contact_id: **$n** of $total"
note "Native TF should always link a transaction to a contact for accounts-receivable. NULL is acceptable for system-level adjustments but should be rare on imported data."

subheading "5.3 Transactions with dangling expected_payment_item_id"
n=$(psql_query "SELECT count(*) FROM public.payment_transactions pt WHERE pt.expected_payment_item_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.expected_payment_items epi WHERE epi.id = pt.expected_payment_item_id)" 2>/dev/null || echo "—")
echo "Transactions pointing at non-existent expected_payment_items: **$n** (should be 0)"

subheading "5.4 Transactions reachable to a trip via expected_payment_items"
n=$(psql_query "
SELECT count(*) FROM public.payment_transactions pt
LEFT JOIN public.expected_payment_items epi ON epi.id = pt.expected_payment_item_id
LEFT JOIN public.payment_schedule_config psc ON psc.id = epi.payment_schedule_config_id
LEFT JOIN public.activity_pricing ap ON ap.id = psc.activity_pricing_id
LEFT JOIN public.itinerary_activities ia ON ia.id = ap.itinerary_activity_id
WHERE pt.expected_payment_item_id IS NOT NULL AND ia.trip_id IS NULL" 2>/dev/null || echo "—")
echo "Transactions with payment_item but no reachable trip: **$n** (should be 0 — broken chain)"

subheading "5.4 Transaction-type distribution"
echo "| transaction_type | count |"
echo "|---|---|"
psql_query "SELECT transaction_type::text || '|' || count(*) FROM public.payment_transactions GROUP BY transaction_type ORDER BY count(*) DESC" \
  | sed 's|^|\| |;s|$| \||'

# ---------------------------------------------------------------------------
# 6. Trip collaborators (W1-W5 / agent scoping)
# ---------------------------------------------------------------------------
heading "6. Trip collaborators (W1-W5)"

subheading "6.1 Collaborator coverage per trip"
echo "| collaborators per trip | trip count |"
echo "|---|---|"
psql_query "SELECT counts.cnt::text || '|' || count(*) FROM (SELECT t.id, count(tc.id) AS cnt FROM public.trips t LEFT JOIN public.trip_collaborators tc ON tc.trip_id = t.id GROUP BY t.id) counts GROUP BY counts.cnt ORDER BY counts.cnt" \
  | sed 's|^|\| |;s|$| \||'

subheading "6.2 Distinct user_ids that own trips via trip_collaborators"
echo "| user_id | trips covered |"
echo "|---|---|"
psql_query "SELECT user_id::text || '|' || count(DISTINCT trip_id) FROM public.trip_collaborators GROUP BY user_id ORDER BY count(DISTINCT trip_id) DESC LIMIT 10" \
  | sed 's|^|\| |;s|$| \||'

# ---------------------------------------------------------------------------
# 7. Commissions
# ---------------------------------------------------------------------------
heading "7. Commissions"

subheading "7.1 commission_tracking required fields"
echo "| Field | NULL count | OK if 0 |"
echo "|---|---|---|"
for col in trip_id agency_id; do
  n=$(psql_query "SELECT count(*) FROM public.commission_tracking WHERE $col IS NULL" 2>/dev/null || echo "—")
  echo "| $col | $n | ✓ |"
done

subheading "7.2 commission_tracking status distribution"
echo "| status | count |"
echo "|---|---|"
psql_query "SELECT status::text || '|' || count(*) FROM public.commission_tracking GROUP BY status ORDER BY count(*) DESC LIMIT 10" 2>/dev/null \
  | sed 's|^|\| |;s|$| \||' || echo "| — | (no status column or query failed) |"

subheading "7.3 commission_checks status distribution"
echo "| status | count |"
echo "|---|---|"
psql_query "SELECT status::text || '|' || count(*) FROM public.commission_checks GROUP BY status ORDER BY count(*) DESC LIMIT 10" 2>/dev/null \
  | sed 's|^|\| |;s|$| \||' || echo "| — | (no status column or query failed) |"

# ---------------------------------------------------------------------------
# 8. Itineraries
# ---------------------------------------------------------------------------
heading "8. Itineraries"

subheading "8.1 Trips without any itinerary"
n=$(psql_query "SELECT count(*) FROM public.trips t WHERE NOT EXISTS (SELECT 1 FROM public.itineraries i WHERE i.trip_id = t.id)")
echo "Trips with **zero** itineraries: **$n**"
note "Native TF creates an itinerary per trip. If non-zero, those imported trips look 'empty' to agents in the UI."

subheading "8.2 Itinerary status distribution (should be: draft / proposing / approved / archived)"
echo "| status | count |"
echo "|---|---|"
psql_query "SELECT status::text || '|' || count(*) FROM public.itineraries GROUP BY status ORDER BY count(*) DESC" 2>/dev/null \
  | sed 's|^|\| |;s|$| \||' || echo "| — | (no rows) |"

# ---------------------------------------------------------------------------
# 9. User profiles (agent mapping universe)
# ---------------------------------------------------------------------------
heading "9. User profiles (agent universe)"

subheading "9.1 Available users that could be mapped as agents"
echo "| user_id | email | full_name |"
echo "|---|---|---|"
psql_query "SELECT id::text || '|' || COALESCE(email, '—') || '|' || COALESCE(full_name, first_name || ' ' || last_name, '—') FROM public.user_profiles WHERE deleted_at IS NULL ORDER BY email LIMIT 20" 2>/dev/null \
  | sed 's|^|\| |;s|$| \||' || echo "| — | (no rows) |"

# ---------------------------------------------------------------------------
# 10. Summary
# ---------------------------------------------------------------------------
heading "10. Summary"
echo ""
echo "Audit complete. Key questions to answer from the report above:"
echo ""
echo "1. Are any trips owned by an admin-fixture user instead of real agents? (§2.5)"
echo "2. Does every trip have at least one trip_collaborators row? (§6.1)"
echo "3. Are activity_pricing.cancellation_policy fields populated everywhere? (§4.2)"
echo "4. Do non_refundable=true rows correctly disclose that in the policy text? (§4.3)"
echo "5. Are there any legacy status values left over? (§2.3, §8.2)"
echo "6. Does every trip have an itinerary? (§8.1)"
echo ""
echo "Each \`No\` answer is a backfill candidate."
