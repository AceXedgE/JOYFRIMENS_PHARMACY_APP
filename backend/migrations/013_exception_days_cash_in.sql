ALTER TABLE manual_days ADD COLUMN summary_only boolean NOT NULL DEFAULT false;
CREATE TABLE exception_day_totals (
 day_id uuid PRIMARY KEY REFERENCES manual_days(id),
 sales_minor integer NOT NULL CHECK(sales_minor BETWEEN 0 AND 100000000),
 actor_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON exception_day_totals
 FOR EACH ROW EXECUTE FUNCTION protect_audit_events();
ALTER TABLE cash_ledger DROP CONSTRAINT cash_ledger_kind_check;
ALTER TABLE cash_ledger ADD CONSTRAINT cash_ledger_kind_check CHECK(kind IN ('opening','sale','refund','expense','advance','withdrawal','transfer_in','transfer_out','handover','retained_out','retained_in','manual_sale','manual_refund','cash_in'));
ALTER TABLE cash_ledger DROP CONSTRAINT cash_ledger_sign;
ALTER TABLE cash_ledger ADD CONSTRAINT cash_ledger_sign CHECK(
 (kind='opening' AND amount_minor>=0 AND sale_id IS NULL AND refund_id IS NULL) OR
 (kind='sale' AND amount_minor>0 AND sale_id IS NOT NULL AND refund_id IS NULL) OR
 (kind='refund' AND amount_minor<0 AND sale_id IS NOT NULL AND refund_id IS NOT NULL) OR
 (kind IN ('transfer_in','retained_in','manual_sale','cash_in') AND amount_minor>0 AND sale_id IS NULL AND refund_id IS NULL) OR
 (kind IN ('expense','advance','withdrawal','transfer_out','handover','retained_out','manual_refund') AND amount_minor<0 AND sale_id IS NULL AND refund_id IS NULL));
