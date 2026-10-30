ALTER TABLE selling_units ADD COLUMN archived boolean NOT NULL DEFAULT false;
ALTER TABLE selling_units ADD COLUMN display_order integer NOT NULL DEFAULT 0;
WITH ranked AS (SELECT u.id,row_number() OVER(PARTITION BY u.product_id ORDER BY CASE WHEN NOT u.variation AND lower(u.label)=lower(p.base_unit) AND u.base_quantity=1 THEN 0 WHEN NOT u.variation THEN 1 ELSE 2 END,u.base_quantity,u.label,u.id)-1 AS position FROM selling_units u JOIN products p ON p.id=u.product_id)
UPDATE selling_units u SET display_order=r.position FROM ranked r WHERE r.id=u.id;
DROP INDEX selling_unit_label;
CREATE UNIQUE INDEX selling_unit_label ON selling_units(product_id,lower(label)) WHERE NOT archived;
