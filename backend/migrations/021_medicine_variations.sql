ALTER TABLE selling_units ADD COLUMN variation boolean NOT NULL DEFAULT false;
ALTER TABLE selling_units ADD CONSTRAINT variation_quantity CHECK(NOT variation OR base_quantity=1);
ALTER TABLE stock_batches ADD COLUMN variation_unit_id uuid REFERENCES selling_units(id);
ALTER TABLE stock_batches DROP CONSTRAINT stock_batches_product_id_batch_number_expiry_key;
CREATE UNIQUE INDEX stock_batch_variant_identity ON stock_batches(product_id,batch_number,expiry,coalesce(variation_unit_id,'00000000-0000-0000-0000-000000000000'::uuid));
CREATE FUNCTION check_batch_variation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.variation_unit_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM selling_units WHERE id=NEW.variation_unit_id AND product_id=NEW.product_id AND variation) THEN RAISE EXCEPTION 'Batch variation must belong to this medicine'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER batch_variation_guard BEFORE INSERT ON stock_batches FOR EACH ROW EXECUTE FUNCTION check_batch_variation();
CREATE OR REPLACE FUNCTION guard_catalogue_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Remove medicines by archiving them'; END IF;
 IF NEW.id<>OLD.id THEN RAISE EXCEPTION 'Catalogue identifiers are immutable'; END IF;
 IF TG_TABLE_NAME='selling_units' THEN
  IF NEW.product_id<>OLD.product_id THEN RAISE EXCEPTION 'Unit ownership is immutable'; END IF;
  IF (NEW.base_quantity<>OLD.base_quantity OR NEW.variation<>OLD.variation) AND
    (EXISTS(SELECT 1 FROM stock_batches WHERE product_id=OLD.product_id) OR EXISTS(SELECT 1 FROM sale_lines WHERE unit_id=OLD.id))
  THEN RAISE EXCEPTION 'Used unit conversions cannot be rewritten'; END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION snapshot_stock_catalogue() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='stock_receipts' THEN
  SELECT jsonb_build_object('name',concat(p.name,CASE WHEN u.variation THEN ' / '||u.label ELSE '' END),'strength',p.strength,'dosage_form',p.dosage_form,'base_unit',CASE WHEN u.variation THEN u.label ELSE p.base_unit END,'label',u.label,'base_quantity',u.base_quantity)
  INTO NEW.catalogue_snapshot FROM selling_units u JOIN products p ON p.id=u.product_id WHERE u.id=NEW.unit_id;
 ELSE
  SELECT jsonb_build_object('name',concat(p.name,CASE WHEN v.id IS NOT NULL THEN ' / '||v.label ELSE '' END),'strength',p.strength,'base_unit',coalesce(v.label,p.base_unit))
  INTO NEW.catalogue_snapshot FROM stock_batches b JOIN products p ON p.id=b.product_id LEFT JOIN selling_units v ON v.id=b.variation_unit_id WHERE b.id=NEW.batch_id;
 END IF;
 RETURN NEW;
END; $$;
