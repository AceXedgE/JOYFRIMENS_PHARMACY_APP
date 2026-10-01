CREATE TABLE setup_lock (id integer PRIMARY KEY CHECK (id = 1));
INSERT INTO setup_lock VALUES (1);

CREATE TABLE users (
  id uuid PRIMARY KEY,
  username text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9._-]{3,64}$'),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 100),
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'employee')),
  active boolean NOT NULL DEFAULT true,
  shared_storage_access boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE shops (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  currency text CHECK (currency ~ '^[A-Z]{3}$'),
  timezone text,
  CHECK ((currency IS NULL) = (timezone IS NULL))
);
CREATE TABLE locations (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  shop_id uuid REFERENCES shops(id),
  kind text NOT NULL CHECK (kind IN ('shelf', 'storeroom', 'shared')),
  CHECK ((kind = 'shared' AND shop_id IS NULL) OR (kind <> 'shared' AND shop_id IS NOT NULL)),
  UNIQUE(shop_id, kind)
);
CREATE TABLE memberships (
  user_id uuid NOT NULL REFERENCES users(id),
  shop_id uuid NOT NULL REFERENCES shops(id),
  can_change_prices boolean NOT NULL DEFAULT false,
  PRIMARY KEY(user_id, shop_id)
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  csrf_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE login_limits (
  key text PRIMARY KEY,
  attempts integer NOT NULL,
  reset_at timestamptz NOT NULL
);
CREATE TABLE audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  target_id uuid,
  details jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION protect_audit_events() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit events are append-only';
END;
$$;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION protect_audit_events();
