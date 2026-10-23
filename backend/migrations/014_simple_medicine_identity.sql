-- Preserve existing medicine identities while allowing simple names for new entries.
ALTER TABLE products DROP CONSTRAINT products_generic_name_check;
ALTER TABLE products DROP CONSTRAINT products_strength_check;
ALTER TABLE products DROP CONSTRAINT products_dosage_form_check;
ALTER TABLE products ADD CONSTRAINT products_generic_name_check CHECK (length(btrim(generic_name)) BETWEEN 0 AND 160);
ALTER TABLE products ADD CONSTRAINT products_strength_check CHECK (length(btrim(strength)) BETWEEN 0 AND 80);
ALTER TABLE products ADD CONSTRAINT products_dosage_form_check CHECK (length(btrim(dosage_form)) BETWEEN 0 AND 80);
