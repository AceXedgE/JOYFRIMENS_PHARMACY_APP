ALTER TABLE drawer_sessions DROP CONSTRAINT drawer_sessions_status_check;
ALTER TABLE drawer_sessions ADD CONSTRAINT drawer_sessions_status_check CHECK(status IN ('open','counting','submitted','reviewed','closed'));
DROP INDEX drawer_open;
CREATE UNIQUE INDEX drawer_active ON drawer_sessions(shop_id,code) WHERE status<>'closed';
CREATE OR REPLACE FUNCTION protect_drawer_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') OR
    NOT ((OLD.status='open' AND NEW.status='counting') OR (OLD.status='counting' AND NEW.status='submitted') OR
         (OLD.status='submitted' AND NEW.status='reviewed') OR (OLD.status='reviewed' AND NEW.status='closed')) THEN
    RAISE EXCEPTION 'Drawer identity is immutable and lifecycle transitions must be sequential';
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE cash_ledger DROP CONSTRAINT cash_ledger_kind_check;
ALTER TABLE cash_ledger DROP CONSTRAINT cash_ledger_check;
ALTER TABLE cash_ledger ADD CONSTRAINT cash_ledger_kind_check CHECK(kind IN ('opening','sale','refund','expense','advance','withdrawal','transfer_in','transfer_out','handover','retained_out','retained_in','manual_sale','manual_refund'));
ALTER TABLE cash_ledger ADD CONSTRAINT cash_ledger_sign CHECK(
 (kind='opening' AND amount_minor>=0 AND sale_id IS NULL AND refund_id IS NULL) OR
 (kind='sale' AND amount_minor>0 AND sale_id IS NOT NULL AND refund_id IS NULL) OR
 (kind='refund' AND amount_minor<0 AND sale_id IS NOT NULL AND refund_id IS NOT NULL) OR
 (kind IN ('transfer_in','retained_in','manual_sale') AND amount_minor>0 AND sale_id IS NULL AND refund_id IS NULL) OR
 (kind IN ('expense','advance','withdrawal','transfer_out','handover','retained_out','manual_refund') AND amount_minor<0 AND sale_id IS NULL AND refund_id IS NULL));
CREATE INDEX cash_drawer_sequence ON cash_ledger(drawer_id,id);

CREATE TABLE cash_requests (
 id uuid PRIMARY KEY, shop_id uuid NOT NULL REFERENCES shops(id), kind text NOT NULL CHECK(kind IN ('expense','advance','withdrawal')),
 amount_minor integer NOT NULL CHECK(amount_minor BETWEEN 1 AND 100000000), payee text NOT NULL, reason text NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE cash_decisions (
 request_id uuid PRIMARY KEY REFERENCES cash_requests(id), approved boolean NOT NULL, actor_id uuid NOT NULL REFERENCES users(id), reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE cash_disbursements (
 request_id uuid PRIMARY KEY REFERENCES cash_requests(id), drawer_id uuid NOT NULL REFERENCES drawer_sessions(id),
 emergency boolean NOT NULL, actor_id uuid NOT NULL REFERENCES users(id), reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE drawer_counts (
 id uuid PRIMARY KEY, drawer_id uuid NOT NULL UNIQUE REFERENCES drawer_sessions(id), actor_id uuid NOT NULL REFERENCES users(id),
 cutoff_at timestamptz NOT NULL DEFAULT clock_timestamp(), cutoff_sequence bigint NOT NULL, expected_minor bigint NOT NULL,
 alternate_drawer_id uuid REFERENCES drawer_sessions(id), reason text NOT NULL
);
CREATE TABLE cash_count_submissions (
 count_id uuid PRIMARY KEY REFERENCES drawer_counts(id), actor_id uuid NOT NULL REFERENCES users(id), denominations jsonb NOT NULL,
 counted_minor integer NOT NULL CHECK(counted_minor BETWEEN 0 AND 100000000), reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE cash_count_reviews (
 count_id uuid PRIMARY KEY REFERENCES drawer_counts(id), actor_id uuid NOT NULL REFERENCES users(id), resolution text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE cash_settlements (
 id uuid PRIMARY KEY, count_id uuid NOT NULL UNIQUE REFERENCES drawer_counts(id), handover_minor integer NOT NULL CHECK(handover_minor>=0),
 retained_minor integer NOT NULL CHECK(retained_minor>=0), recipient_id uuid REFERENCES users(id), actor_id uuid NOT NULL REFERENCES users(id), reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE cash_handover_acknowledgments (
 settlement_id uuid PRIMARY KEY REFERENCES cash_settlements(id), actor_id uuid NOT NULL REFERENCES users(id), reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE retained_float_claims (
 settlement_id uuid PRIMARY KEY REFERENCES cash_settlements(id), drawer_id uuid NOT NULL UNIQUE REFERENCES drawer_sessions(id), actor_id uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE financial_categories (id uuid PRIMARY KEY, name text NOT NULL UNIQUE, actor_id uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE product_financial_categories (product_id uuid PRIMARY KEY REFERENCES products(id), category_id uuid REFERENCES financial_categories(id), version integer NOT NULL DEFAULT 1);
ALTER TABLE sale_lines ADD COLUMN category_name text NOT NULL DEFAULT 'General';
ALTER TABLE sales ALTER COLUMN created_at SET DEFAULT clock_timestamp();
ALTER TABLE sale_refunds ALTER COLUMN created_at SET DEFAULT clock_timestamp();
ALTER TABLE cash_ledger ALTER COLUMN created_at SET DEFAULT clock_timestamp();

CREATE TABLE manual_days (
 id uuid PRIMARY KEY, shop_id uuid NOT NULL REFERENCES shops(id), business_date date NOT NULL, actor_id uuid NOT NULL REFERENCES users(id), reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(shop_id,business_date)
);
CREATE TABLE manual_receipts (
 id uuid PRIMARY KEY, day_id uuid NOT NULL REFERENCES manual_days(id), drawer_id uuid NOT NULL REFERENCES drawer_sessions(id), reference text NOT NULL,
 sales_minor integer NOT NULL CHECK(sales_minor BETWEEN 1 AND 100000000), refunds_minor integer NOT NULL CHECK(refunds_minor BETWEEN 0 AND sales_minor),
 actor_id uuid NOT NULL REFERENCES users(id), reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(day_id,reference)
);
CREATE TABLE manual_day_reviews (
 day_id uuid PRIMARY KEY REFERENCES manual_days(id), actor_id uuid NOT NULL REFERENCES users(id), evidence text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['cash_requests','cash_decisions','cash_disbursements','drawer_counts','cash_count_submissions','cash_count_reviews','cash_settlements','cash_handover_acknowledgments','retained_float_claims','financial_categories','manual_days','manual_receipts','manual_day_reviews'] LOOP
 EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION protect_audit_events()',tab||'_immutable',tab);
 END LOOP;
END $$;
