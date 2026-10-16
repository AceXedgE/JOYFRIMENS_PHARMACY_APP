CREATE TABLE supplier_reference_locks (
  supplier text NOT NULL,
  reference text NOT NULL,
  PRIMARY KEY(supplier, reference)
);
CREATE TABLE supplier_documents (
  id uuid PRIMARY KEY,
  supplier text NOT NULL,
  reference text NOT NULL,
  reason text NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(supplier, reference)
);
CREATE TABLE supplier_document_lines (
  document_id uuid NOT NULL REFERENCES supplier_documents(id),
  receipt_id uuid NOT NULL UNIQUE REFERENCES stock_receipts(id),
  line_number integer NOT NULL CHECK(line_number BETWEEN 1 AND 100),
  PRIMARY KEY(document_id, line_number)
);
CREATE TRIGGER supplier_documents_immutable BEFORE UPDATE OR DELETE ON supplier_documents FOR EACH ROW EXECUTE FUNCTION protect_audit_events();
CREATE TRIGGER supplier_document_lines_immutable BEFORE UPDATE OR DELETE ON supplier_document_lines FOR EACH ROW EXECUTE FUNCTION protect_audit_events();
