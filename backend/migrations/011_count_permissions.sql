ALTER TABLE memberships ADD COLUMN can_count_cash boolean NOT NULL DEFAULT false;
ALTER TABLE shop_remittance_counts ADD COLUMN permission_override boolean NOT NULL DEFAULT false;
ALTER TABLE shop_remittances ADD COLUMN permission_override boolean NOT NULL DEFAULT false;

ALTER TABLE shop_day_closings ADD COLUMN permission_override boolean NOT NULL DEFAULT false;
