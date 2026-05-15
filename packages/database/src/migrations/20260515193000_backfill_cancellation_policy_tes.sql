-- ============================================================================
-- Backfill activity_pricing.cancellation_policy for 2026-03-23 TES import
-- ============================================================================
--
-- Per-activity-type boilerplate UPDATE for the 1583 activity_pricing rows that
-- have cancellation_policy IS NULL after the TES import. The original importer
-- did not pass cancellationPolicy at activity create time, leaving B4 §38
-- finalize() unable to pass on every imported trip order.
--
-- P2.A (PR #409) fixes this for future imports. This migration is the
-- safety net for tf-demo's existing data and for any prod rows that slip
-- through at cutover.
--
-- See docs/runbooks/tes-cutover-backfill-plan.md (P5.A item 2 / #25)
--
-- Idempotent: only touches rows where cancellation_policy IS NULL.
-- TICO P1.D legal review of these boilerplate strings still pending.
-- ============================================================================

UPDATE activity_pricing AS ap
SET
  cancellation_policy = CASE ia.activity_type::text
    WHEN 'flight'         THEN 'Per airline fare rules. See booking confirmation for details.'
    WHEN 'lodging'        THEN 'Per hotel cancellation policy in booking confirmation.'
    WHEN 'cruise'         THEN 'Per cruise line standard cancellation schedule.'
    WHEN 'custom_cruise'  THEN 'Per cruise line standard cancellation schedule.'
    WHEN 'tour'           THEN 'Per tour operator terms. See booking confirmation.'
    WHEN 'custom_tour'    THEN 'Per tour operator terms. See booking confirmation.'
    WHEN 'tour_day'       THEN 'Per tour operator terms. See booking confirmation.'
    WHEN 'transportation' THEN 'Non-refundable within 48 hours of service.'
    WHEN 'insurance'      THEN 'Per policy terms and conditions.'
    WHEN 'package'        THEN 'Per tour operator terms; subject to bundle restrictions.'
    WHEN 'options'        THEN 'See booking confirmation.'
    WHEN 'dining'         THEN 'Per restaurant cancellation policy. See booking confirmation.'
    WHEN 'port_info'      THEN 'Informational item — no cancellation policy applies.'
    WHEN 'activity'       THEN 'Per supplier terms. See booking confirmation.'
    ELSE 'Per supplier terms. See booking confirmation.'
  END,
  updated_at = NOW()
FROM itinerary_activities ia
WHERE ap.activity_id = ia.id
  AND ap.cancellation_policy IS NULL;
