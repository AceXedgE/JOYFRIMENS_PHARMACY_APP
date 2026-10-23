-- Shelf sales use availability, never a counted inventory batch.
ALTER TABLE sale_lines ALTER COLUMN batch_id DROP NOT NULL;
ALTER TABLE sale_lines ALTER COLUMN batch_number DROP NOT NULL;
ALTER TABLE sale_lines ALTER COLUMN expiry DROP NOT NULL;
ALTER TABLE sale_lines ADD CONSTRAINT sale_source_batch CHECK ((batch_id IS NULL AND batch_number IS NULL AND expiry IS NULL) OR (batch_id IS NOT NULL AND batch_number IS NOT NULL AND expiry IS NOT NULL));
-- New medicines are shelf-available by default; preserve explicit unavailable flags.
INSERT INTO shop_listings(shop_id,unit_id,available,version)
SELECT s.id,u.id,true,1 FROM shops s CROSS JOIN selling_units u
ON CONFLICT(shop_id,unit_id) DO NOTHING;
