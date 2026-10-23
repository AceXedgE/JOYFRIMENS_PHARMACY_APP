-- New final submissions record cash left once, in shop_day_closings.
-- Preserve earlier observations without inventing values for new counts.
ALTER TABLE shop_remittances ALTER COLUMN left_at_count_minor DROP NOT NULL;
