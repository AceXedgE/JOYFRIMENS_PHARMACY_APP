CREATE TABLE supplier_invites (
 id uuid PRIMARY KEY,
 token_hash text NOT NULL UNIQUE,
 supplier text NOT NULL,
 location_id uuid NOT NULL REFERENCES locations(id),
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',
 revoked_at timestamptz
);
CREATE TABLE supplier_submissions (
 id uuid PRIMARY KEY,
 invite_id uuid NOT NULL UNIQUE REFERENCES supplier_invites(id),
 request_key uuid NOT NULL,
 reference text NOT NULL,
 lines jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE supplier_submission_receipts (
 submission_id uuid PRIMARY KEY REFERENCES supplier_submissions(id),
 document_id uuid NOT NULL UNIQUE REFERENCES supplier_documents(id)
);
CREATE TRIGGER supplier_submission_immutable BEFORE UPDATE OR DELETE ON supplier_submissions FOR EACH ROW EXECUTE FUNCTION protect_audit_events();
CREATE TRIGGER supplier_submission_receipt_immutable BEFORE UPDATE OR DELETE ON supplier_submission_receipts FOR EACH ROW EXECUTE FUNCTION protect_audit_events();
CREATE INDEX supplier_invites_location ON supplier_invites(location_id,created_at DESC);
