CREATE TABLE products (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  generic_name text NOT NULL CHECK (length(btrim(generic_name)) BETWEEN 1 AND 160),
  strength text NOT NULL CHECK (length(btrim(strength)) BETWEEN 1 AND 80),
  dosage_form text NOT NULL CHECK (length(btrim(dosage_form)) BETWEEN 1 AND 80),
  base_unit text NOT NULL CHECK (length(btrim(base_unit)) BETWEEN 1 AND 40),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX products_identity ON products
  (lower(name), lower(generic_name), lower(strength), lower(dosage_form), lower(base_unit));
CREATE TABLE selling_units (
  id uuid PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES products(id),
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 40),
  base_quantity integer NOT NULL CHECK (base_quantity BETWEEN 1 AND 100000),
  barcode text UNIQUE CHECK (barcode IS NULL OR length(barcode) BETWEEN 1 AND 80)
);
CREATE UNIQUE INDEX selling_unit_label ON selling_units(product_id, lower(label));
CREATE TABLE unit_prices (
  unit_id uuid PRIMARY KEY REFERENCES selling_units(id),
  price_minor integer NOT NULL CHECK (price_minor BETWEEN 1 AND 100000000),
  version integer NOT NULL CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE shop_listings (
  shop_id uuid NOT NULL REFERENCES shops(id),
  unit_id uuid NOT NULL REFERENCES selling_units(id),
  available boolean NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  PRIMARY KEY(shop_id, unit_id)
);
CREATE TABLE price_history (
  unit_id uuid NOT NULL REFERENCES selling_units(id),
  version integer NOT NULL CHECK (version > 0),
  old_price_minor integer,
  price_minor integer NOT NULL CHECK (price_minor BETWEEN 1 AND 100000000),
  initiating_shop_id uuid NOT NULL REFERENCES shops(id),
  changed_by uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 300),
  changed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(unit_id, version)
);
CREATE TRIGGER price_history_immutable BEFORE UPDATE OR DELETE ON price_history
FOR EACH ROW EXECUTE FUNCTION protect_audit_events();

-- Identity and conversions are immutable so historical receipts can reference them safely.
CREATE FUNCTION protect_catalogue_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Catalogue identity and unit conversions are immutable; create a corrected product';
END;
$$;
CREATE TRIGGER products_immutable BEFORE UPDATE OR DELETE ON products
FOR EACH ROW EXECUTE FUNCTION protect_catalogue_identity();
CREATE TRIGGER units_immutable BEFORE UPDATE OR DELETE ON selling_units
FOR EACH ROW EXECUTE FUNCTION protect_catalogue_identity();
