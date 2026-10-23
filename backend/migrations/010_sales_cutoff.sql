-- Keep physical cash dates separate from the owner's sales reporting dates.
-- Historical counts retain their original drawer-based meaning.
ALTER TABLE shop_remittance_counts ADD COLUMN sales_cutoff boolean NOT NULL DEFAULT false;
CREATE TABLE sale_reporting_dates (
 sale_id uuid PRIMARY KEY REFERENCES sales(id),
 reporting_date date NOT NULL,
 cutoff_id uuid REFERENCES shop_remittance_counts(id)
);
INSERT INTO sale_reporting_dates(sale_id,reporting_date) SELECT id,business_date FROM sales;
CREATE INDEX sale_reporting_date_idx ON sale_reporting_dates(reporting_date);
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON sale_reporting_dates
 FOR EACH ROW EXECUTE FUNCTION protect_audit_events();
