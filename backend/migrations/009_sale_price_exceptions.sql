ALTER TABLE sale_lines ADD COLUMN price_exception_reason text CHECK(price_exception_reason IN ('shortfall','no_change'));
CREATE TABLE sale_price_exceptions (
 sale_id uuid PRIMARY KEY REFERENCES sales(id), catalogue_total_minor integer NOT NULL CHECK(catalogue_total_minor>0),
 charged_total_minor integer NOT NULL CHECK(charged_total_minor>0), actor_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER sale_price_exceptions_immutable BEFORE UPDATE OR DELETE ON sale_price_exceptions FOR EACH ROW EXECUTE FUNCTION protect_audit_events();
