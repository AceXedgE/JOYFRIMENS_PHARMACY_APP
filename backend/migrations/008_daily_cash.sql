CREATE TABLE shop_remittance_counts (
 id uuid PRIMARY KEY, shop_id uuid NOT NULL REFERENCES shops(id), business_date date NOT NULL,
 drawer_id uuid NOT NULL REFERENCES drawer_sessions(id), alternate_id uuid NOT NULL REFERENCES drawer_sessions(id),
 expected_minor bigint NOT NULL, actor_id uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(shop_id,business_date)
);
CREATE TABLE shop_remittances (
 count_id uuid PRIMARY KEY REFERENCES shop_remittance_counts(id), denominations jsonb NOT NULL,
 sent_minor integer NOT NULL CHECK(sent_minor>=0), left_at_count_minor integer NOT NULL CHECK(left_at_count_minor>=0),
 recipient text NOT NULL, actor_id uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE shop_day_closings (
 id uuid PRIMARY KEY, shop_id uuid NOT NULL REFERENCES shops(id), business_date date NOT NULL,
 expected_minor bigint NOT NULL, left_minor integer NOT NULL CHECK(left_minor>=0),
 actor_id uuid NOT NULL REFERENCES users(id), reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(shop_id,business_date)
);
CREATE TABLE shop_day_reviews (
 closing_id uuid PRIMARY KEY REFERENCES shop_day_closings(id), actor_id uuid NOT NULL REFERENCES users(id),
 reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['shop_remittance_counts','shop_remittances','shop_day_closings','shop_day_reviews'] LOOP
 EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION protect_audit_events()',tab);
 END LOOP;
END $$;
-- Daily lock-up closes both drawers only after an immutable shop closing exists.
CREATE OR REPLACE FUNCTION protect_drawer_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') OR
 NOT ((OLD.status='open' AND NEW.status='counting') OR (OLD.status='counting' AND NEW.status='submitted') OR
      (OLD.status='submitted' AND NEW.status='reviewed') OR (OLD.status='reviewed' AND NEW.status='closed') OR
      (OLD.status IN ('open','counting') AND NEW.status='closed' AND EXISTS(SELECT 1 FROM shop_day_closings WHERE shop_id=OLD.shop_id AND business_date=OLD.business_date))) THEN
 RAISE EXCEPTION 'Drawer identity is immutable and closure requires a recorded count or daily lock-up';
 END IF;
 RETURN NEW;
END;
$$;
