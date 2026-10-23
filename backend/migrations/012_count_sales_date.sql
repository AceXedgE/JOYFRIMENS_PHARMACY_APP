-- The selected sales date describes the count; created_at remains the actual submission time.
ALTER TABLE shop_remittances ADD COLUMN sales_date date;
ALTER TABLE shop_remittances ALTER COLUMN recipient DROP NOT NULL;
