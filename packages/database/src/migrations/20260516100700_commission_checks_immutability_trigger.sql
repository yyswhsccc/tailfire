-- PR-1 Commission Foundation: immutability trigger on accepted checks
--
-- Once a commission_check transitions to status='accepted', the financial
-- identity (amount, currency, counterparty, dates, type) is locked. Edits
-- after acceptance require an explicit recall (status accepted → pending)
-- and produce a history row via CommissionAuditService.
--
-- Status transitions accepted → cancelled / pending remain allowed (recall
-- flow). updated_at, updated_by, notes, payroll_id, reconciliation_date,
-- reconciled_by, accounting_transaction_id, file_url, file_name are NOT
-- locked — these are operational metadata that may change post-acceptance.

CREATE OR REPLACE FUNCTION commission_checks_block_locked_field_edits()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only enforce when status was AND remains 'accepted'. Status itself may
  -- still be changed (recall/cancel) — that path is the explicit unlock.
  IF OLD.status = 'accepted' AND NEW.status = 'accepted' THEN
    IF NEW.check_number IS DISTINCT FROM OLD.check_number
       OR NEW.check_type IS DISTINCT FROM OLD.check_type
       OR NEW.check_date IS DISTINCT FROM OLD.check_date
       OR NEW.check_amount_cents IS DISTINCT FROM OLD.check_amount_cents
       OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.sender_supplier_id IS DISTINCT FROM OLD.sender_supplier_id
       OR NEW.sender_name IS DISTINCT FROM OLD.sender_name
       OR NEW.recipient_user_id IS DISTINCT FROM OLD.recipient_user_id
       OR NEW.recipient_name IS DISTINCT FROM OLD.recipient_name
       OR NEW.group_check IS DISTINCT FROM OLD.group_check
       OR NEW.parent_check_id IS DISTINCT FROM OLD.parent_check_id
    THEN
      RAISE EXCEPTION
        'commission_checks % is accepted and locked; recall before editing financial fields. Mutable fields: notes, payroll_id, reconciliation_date, reconciled_by, accounting_transaction_id, file_url, file_name, updated_at, updated_by.',
        OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS commission_checks_immutability_guard ON commission_checks;
CREATE TRIGGER commission_checks_immutability_guard
  BEFORE UPDATE ON commission_checks
  FOR EACH ROW
  EXECUTE FUNCTION commission_checks_block_locked_field_edits();

COMMENT ON FUNCTION commission_checks_block_locked_field_edits IS
  'PR-1 audit pillar #1: prevents financial-field edits on accepted commission_checks. Recall flow (status → pending or cancelled) is the only way to unlock.';
