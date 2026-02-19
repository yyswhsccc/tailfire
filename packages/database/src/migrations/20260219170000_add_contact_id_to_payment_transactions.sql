-- Add contact_id to payment_transactions
-- Records which contact ("Paid By") made each payment transaction
ALTER TABLE payment_transactions
  ADD COLUMN contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL;

-- Backfill: prefer existing expected_payment_item contact, then trip primary contact
UPDATE payment_transactions pt
SET contact_id = COALESCE(epi.contact_id, t.primary_contact_id)
FROM expected_payment_items epi
JOIN payment_schedule_config psc ON psc.id = epi.payment_schedule_config_id
JOIN activity_pricing ap ON ap.id = psc.component_pricing_id
JOIN itinerary_activities ia ON ia.id = ap.activity_id
LEFT JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
LEFT JOIN itineraries it ON it.id = iday.itinerary_id
JOIN trips t ON t.id = COALESCE(it.trip_id, ia.trip_id)
WHERE pt.expected_payment_item_id = epi.id
  AND pt.contact_id IS NULL;

-- Partial index for efficient lookups
CREATE INDEX idx_payment_transactions_contact_id
  ON payment_transactions(contact_id)
  WHERE contact_id IS NOT NULL;
