CREATE TABLE medicine_notifications (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 shop_id uuid REFERENCES shops(id),
 unit_id uuid NOT NULL REFERENCES selling_units(id),
 kind text NOT NULL CHECK(kind IN ('added','price','availability')),
 medicine text NOT NULL, unit_label text NOT NULL, price_minor integer NOT NULL,
 available boolean, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE medicine_notification_reads (
 user_id uuid NOT NULL REFERENCES users(id),
 notification_id bigint NOT NULL REFERENCES medicine_notifications(id),
 read_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(user_id,notification_id)
);
CREATE INDEX medicine_notifications_shop ON medicine_notifications(shop_id,id);
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON medicine_notifications FOR EACH ROW EXECUTE FUNCTION protect_audit_events();
