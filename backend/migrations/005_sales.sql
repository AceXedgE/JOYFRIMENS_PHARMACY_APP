CREATE TABLE drawer_sessions (
  id uuid PRIMARY KEY,
  shop_id uuid NOT NULL REFERENCES shops(id),
  code text NOT NULL CHECK(code IN ('A','B')),
  business_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Etc/GMT')::date,
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
  opening_minor integer NOT NULL CHECK(opening_minor BETWEEN 0 AND 100000000),
  opening_source text NOT NULL,
  opened_by uuid NOT NULL REFERENCES users(id),
  opened_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX drawer_open ON drawer_sessions(shop_id,code) WHERE status='open';
CREATE TABLE sale_drafts (
  id uuid PRIMARY KEY,
  shop_id uuid NOT NULL REFERENCES shops(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','parked','completed','discarded')),
  version integer NOT NULL DEFAULT 1,
  lines jsonb NOT NULL DEFAULT '[]',
  location_status text NOT NULL CHECK(location_status IN ('available','unavailable')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sales (
  id uuid PRIMARY KEY,
  receipt_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  shop_id uuid NOT NULL REFERENCES shops(id),
  drawer_id uuid NOT NULL REFERENCES drawer_sessions(id),
  draft_id uuid NOT NULL UNIQUE REFERENCES sale_drafts(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  business_date date NOT NULL,
  total_minor integer NOT NULL CHECK(total_minor BETWEEN 1 AND 100000000),
  tender_minor integer NOT NULL CHECK(tender_minor BETWEEN total_minor AND 100000000),
  change_minor integer NOT NULL CHECK(change_minor=tender_minor-total_minor),
  currency text NOT NULL CHECK(currency='GHS'),
  payment_method text NOT NULL CHECK(payment_method='cash'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sale_lines (
  id uuid PRIMARY KEY,
  sale_id uuid NOT NULL REFERENCES sales(id),
  unit_id uuid NOT NULL REFERENCES selling_units(id),
  batch_id uuid NOT NULL REFERENCES stock_batches(id),
  location_id uuid NOT NULL REFERENCES locations(id),
  quantity integer NOT NULL CHECK(quantity>0),
  base_quantity integer NOT NULL CHECK(base_quantity>0),
  price_minor integer NOT NULL CHECK(price_minor>0),
  price_version integer NOT NULL CHECK(price_version>0),
  total_minor integer NOT NULL CHECK(total_minor>0),
  description text NOT NULL,
  unit_label text NOT NULL,
  batch_number text NOT NULL,
  expiry date NOT NULL,
  FOREIGN KEY(unit_id,price_version) REFERENCES price_history(unit_id,version)
);
CREATE TABLE sale_refunds (
  id uuid PRIMARY KEY,
  sale_id uuid NOT NULL REFERENCES sales(id),
  drawer_id uuid NOT NULL REFERENCES drawer_sessions(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  amount_minor integer NOT NULL CHECK(amount_minor>0),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sale_refund_lines (
  id uuid PRIMARY KEY,
  refund_id uuid NOT NULL REFERENCES sale_refunds(id),
  sale_line_id uuid NOT NULL REFERENCES sale_lines(id),
  quantity integer NOT NULL CHECK(quantity>0),
  amount_minor integer NOT NULL CHECK(amount_minor>0),
  disposition text NOT NULL CHECK(disposition IN ('quarantine','restock')),
  UNIQUE(refund_id,sale_line_id)
);
CREATE TABLE cash_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operation_id uuid NOT NULL REFERENCES stock_operations(id) DEFERRABLE INITIALLY DEFERRED,
  drawer_id uuid NOT NULL REFERENCES drawer_sessions(id),
  sale_id uuid REFERENCES sales(id),
  refund_id uuid REFERENCES sale_refunds(id),
  kind text NOT NULL CHECK(kind IN ('opening','sale','refund')),
  amount_minor integer NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK((kind='opening' AND amount_minor>=0 AND sale_id IS NULL AND refund_id IS NULL)
    OR (kind='sale' AND amount_minor>0 AND sale_id IS NOT NULL AND refund_id IS NULL)
    OR (kind='refund' AND amount_minor<0 AND sale_id IS NOT NULL AND refund_id IS NOT NULL))
);
CREATE UNIQUE INDEX cash_sale_once ON cash_ledger(sale_id) WHERE kind='sale';
CREATE UNIQUE INDEX cash_refund_once ON cash_ledger(refund_id) WHERE kind='refund';
CREATE UNIQUE INDEX cash_open_once ON cash_ledger(drawer_id) WHERE kind='opening';
ALTER TABLE stock_ledger DROP CONSTRAINT stock_ledger_kind_check;
ALTER TABLE stock_ledger ADD CONSTRAINT stock_ledger_kind_check CHECK(kind IN ('delivery','dispatch','receive','count','transit_loss','sale','refund_return'));
ALTER TABLE stock_ledger ADD COLUMN sale_id uuid REFERENCES sales(id);
ALTER TABLE stock_ledger ADD COLUMN refund_id uuid REFERENCES sale_refunds(id);
CREATE INDEX sales_shop_time ON sales(shop_id,created_at DESC);
CREATE INDEX drafts_actor_shop ON sale_drafts(actor_id,shop_id,status);
CREATE FUNCTION protect_draft_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.shop_id<>OLD.shop_id OR NEW.actor_id<>OLD.actor_id OR NEW.id<>OLD.id OR OLD.status IN ('completed','discarded') THEN
    RAISE EXCEPTION 'Draft identity and finalized drafts cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER draft_identity BEFORE UPDATE ON sale_drafts FOR EACH ROW EXECUTE FUNCTION protect_draft_identity();
CREATE TRIGGER draft_no_delete BEFORE DELETE ON sale_drafts FOR EACH ROW EXECUTE FUNCTION protect_audit_events();
CREATE TRIGGER sales_immutable BEFORE UPDATE OR DELETE ON sales FOR EACH ROW EXECUTE FUNCTION protect_audit_events();
CREATE TRIGGER sale_lines_immutable BEFORE UPDATE OR DELETE ON sale_lines FOR EACH ROW EXECUTE FUNCTION protect_audit_events();
CREATE TRIGGER refunds_immutable BEFORE UPDATE OR DELETE ON sale_refunds FOR EACH ROW EXECUTE FUNCTION protect_audit_events();
CREATE TRIGGER refund_lines_immutable BEFORE UPDATE OR DELETE ON sale_refund_lines FOR EACH ROW EXECUTE FUNCTION protect_audit_events();
CREATE TRIGGER cash_immutable BEFORE UPDATE OR DELETE ON cash_ledger FOR EACH ROW EXECUTE FUNCTION protect_audit_events();
CREATE FUNCTION protect_drawer_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') OR OLD.status='closed' THEN
    RAISE EXCEPTION 'Drawer identity, opening float and closed sessions cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER drawer_identity BEFORE UPDATE ON drawer_sessions FOR EACH ROW EXECUTE FUNCTION protect_drawer_identity();
CREATE TRIGGER drawer_no_delete BEFORE DELETE ON drawer_sessions FOR EACH ROW EXECUTE FUNCTION protect_audit_events();
