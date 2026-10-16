CREATE TABLE stock_batches (
  id uuid PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES products(id),
  batch_number text NOT NULL CHECK(length(batch_number) BETWEEN 1 AND 100),
  expiry date NOT NULL,
  UNIQUE(product_id,batch_number,expiry)
);
CREATE TABLE stock_balances (
  location_id uuid NOT NULL REFERENCES locations(id),
  batch_id uuid NOT NULL REFERENCES stock_batches(id),
  quantity integer NOT NULL DEFAULT 0 CHECK(quantity BETWEEN 0 AND 100000000),
  reserved integer NOT NULL DEFAULT 0 CHECK(reserved BETWEEN 0 AND quantity),
  version integer NOT NULL DEFAULT 1,
  PRIMARY KEY(location_id,batch_id)
);
CREATE TABLE stock_operations (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES users(id),
  request_key uuid NOT NULL,
  payload text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(actor_id,request_key)
);
CREATE TABLE stock_receipts (
  id uuid PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES stock_batches(id),
  unit_id uuid NOT NULL REFERENCES selling_units(id),
  supplier text NOT NULL,
  reference text NOT NULL,
  expected_quantity integer NOT NULL CHECK(expected_quantity > 0),
  received_quantity integer NOT NULL CHECK(received_quantity >= 0),
  reason text NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(supplier,reference,batch_id)
);
CREATE TABLE stock_transfers (
  id uuid PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES stock_batches(id),
  source_id uuid NOT NULL REFERENCES locations(id),
  destination_id uuid NOT NULL REFERENCES locations(id),
  quantity integer NOT NULL CHECK(quantity > 0),
  received integer NOT NULL DEFAULT 0 CHECK(received >= 0),
  lost integer NOT NULL DEFAULT 0 CHECK(lost >= 0),
  dispatched_by uuid NOT NULL REFERENCES users(id),
  dispatched_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL,
  CHECK(source_id <> destination_id),
  CHECK(received + lost <= quantity)
);
CREATE TABLE stock_receipt_approvals (
  receipt_id uuid PRIMARY KEY REFERENCES stock_receipts(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE stock_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operation_id uuid NOT NULL REFERENCES stock_operations(id) DEFERRABLE INITIALLY DEFERRED,
  location_id uuid REFERENCES locations(id),
  batch_id uuid NOT NULL REFERENCES stock_batches(id),
  transfer_id uuid REFERENCES stock_transfers(id),
  receipt_id uuid REFERENCES stock_receipts(id),
  delta integer NOT NULL,
  kind text NOT NULL CHECK(kind IN ('delivery','dispatch','receive','count','transit_loss')),
  actor_id uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(location_id IS NOT NULL OR kind = 'transit_loss')
);
CREATE INDEX stock_ledger_location ON stock_ledger(location_id,id DESC);
CREATE INDEX stock_transfers_destination ON stock_transfers(destination_id);
CREATE TRIGGER stock_ledger_immutable BEFORE UPDATE OR DELETE ON stock_ledger FOR EACH ROW EXECUTE FUNCTION protect_audit_events();
CREATE TRIGGER stock_operations_immutable BEFORE UPDATE OR DELETE ON stock_operations FOR EACH ROW EXECUTE FUNCTION protect_audit_events();
CREATE TRIGGER stock_receipts_immutable BEFORE UPDATE OR DELETE ON stock_receipts FOR EACH ROW EXECUTE FUNCTION protect_audit_events();
CREATE TRIGGER stock_batches_immutable BEFORE UPDATE OR DELETE ON stock_batches FOR EACH ROW EXECUTE FUNCTION protect_audit_events();
CREATE TRIGGER stock_receipt_approvals_immutable BEFORE UPDATE OR DELETE ON stock_receipt_approvals FOR EACH ROW EXECUTE FUNCTION protect_audit_events();
