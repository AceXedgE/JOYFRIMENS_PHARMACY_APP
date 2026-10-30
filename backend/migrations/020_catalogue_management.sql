ALTER TABLE products ADD COLUMN revision integer NOT NULL DEFAULT 1;
ALTER TABLE products ADD COLUMN archived boolean NOT NULL DEFAULT false;

-- Retain the wording and unit definitions shown on existing stock records.
ALTER TABLE stock_receipts ADD COLUMN catalogue_snapshot jsonb;
ALTER TABLE stock_ledger ADD COLUMN catalogue_snapshot jsonb;
ALTER TABLE stock_transfers ADD COLUMN catalogue_snapshot jsonb;
ALTER TABLE stock_receipts DISABLE TRIGGER stock_receipts_immutable;
ALTER TABLE stock_ledger DISABLE TRIGGER stock_ledger_immutable;
UPDATE stock_receipts r SET catalogue_snapshot=jsonb_build_object('name',p.name,'strength',p.strength,'dosage_form',p.dosage_form,'base_unit',p.base_unit,'label',u.label,'base_quantity',u.base_quantity)
FROM selling_units u JOIN products p ON p.id=u.product_id WHERE u.id=r.unit_id;
UPDATE stock_ledger l SET catalogue_snapshot=jsonb_build_object('name',p.name,'strength',p.strength,'base_unit',p.base_unit)
FROM stock_batches b JOIN products p ON p.id=b.product_id WHERE b.id=l.batch_id;
UPDATE stock_transfers t SET catalogue_snapshot=jsonb_build_object('name',p.name,'strength',p.strength,'base_unit',p.base_unit)
FROM stock_batches b JOIN products p ON p.id=b.product_id WHERE b.id=t.batch_id;
ALTER TABLE stock_receipts ENABLE TRIGGER stock_receipts_immutable;
ALTER TABLE stock_ledger ENABLE TRIGGER stock_ledger_immutable;
CREATE FUNCTION snapshot_stock_catalogue() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='stock_receipts' THEN
  SELECT jsonb_build_object('name',p.name,'strength',p.strength,'dosage_form',p.dosage_form,'base_unit',p.base_unit,'label',u.label,'base_quantity',u.base_quantity)
  INTO NEW.catalogue_snapshot FROM selling_units u JOIN products p ON p.id=u.product_id WHERE u.id=NEW.unit_id;
 ELSE
  SELECT jsonb_build_object('name',p.name,'strength',p.strength,'base_unit',p.base_unit)
  INTO NEW.catalogue_snapshot FROM stock_batches b JOIN products p ON p.id=b.product_id WHERE b.id=NEW.batch_id;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER receipt_catalogue_snapshot BEFORE INSERT ON stock_receipts FOR EACH ROW EXECUTE FUNCTION snapshot_stock_catalogue();
CREATE TRIGGER ledger_catalogue_snapshot BEFORE INSERT ON stock_ledger FOR EACH ROW EXECUTE FUNCTION snapshot_stock_catalogue();
CREATE TRIGGER transfer_catalogue_snapshot BEFORE INSERT ON stock_transfers FOR EACH ROW EXECUTE FUNCTION snapshot_stock_catalogue();

DROP TRIGGER products_immutable ON products;
DROP TRIGGER units_immutable ON selling_units;
CREATE FUNCTION guard_catalogue_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Remove medicines by archiving them'; END IF;
 IF NEW.id<>OLD.id THEN RAISE EXCEPTION 'Catalogue identifiers are immutable'; END IF;
 IF TG_TABLE_NAME='selling_units' THEN
  IF NEW.product_id<>OLD.product_id THEN RAISE EXCEPTION 'Unit ownership is immutable'; END IF;
  IF NEW.base_quantity<>OLD.base_quantity AND
    (EXISTS(SELECT 1 FROM stock_batches WHERE product_id=OLD.product_id) OR EXISTS(SELECT 1 FROM sale_lines WHERE unit_id=OLD.id))
  THEN RAISE EXCEPTION 'Used unit conversions cannot be rewritten'; END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER products_identity_guard BEFORE UPDATE OR DELETE ON products FOR EACH ROW EXECUTE FUNCTION guard_catalogue_identity();
CREATE TRIGGER units_identity_guard BEFORE UPDATE OR DELETE ON selling_units FOR EACH ROW EXECUTE FUNCTION guard_catalogue_identity();
ALTER TABLE medicine_notifications DROP CONSTRAINT medicine_notifications_kind_check;
ALTER TABLE medicine_notifications ADD CONSTRAINT medicine_notifications_kind_check CHECK(kind IN ('added','price','availability','updated','removed','restored'));
