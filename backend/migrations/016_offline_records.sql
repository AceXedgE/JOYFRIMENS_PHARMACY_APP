CREATE TABLE offline_events (
 actor_id uuid NOT NULL REFERENCES users(id), request_key uuid NOT NULL,
 shop_id uuid NOT NULL REFERENCES shops(id), path text NOT NULL, payload jsonb NOT NULL,
 recorded_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(actor_id,request_key)
);
CREATE TABLE offline_event_resolutions (
 actor_id uuid NOT NULL, request_key uuid NOT NULL,
 resolved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(actor_id,request_key),
 FOREIGN KEY(actor_id,request_key) REFERENCES offline_events(actor_id,request_key)
);
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON offline_events FOR EACH ROW EXECUTE FUNCTION protect_audit_events();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON offline_event_resolutions FOR EACH ROW EXECUTE FUNCTION protect_audit_events();
CREATE INDEX audit_events_date_page ON audit_events(occurred_at,id);
CREATE INDEX price_history_date_page ON price_history(changed_at,unit_id,version);
