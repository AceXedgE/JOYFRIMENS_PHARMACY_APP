ALTER TABLE unit_prices DROP CONSTRAINT unit_prices_price_minor_check;
ALTER TABLE unit_prices ADD CONSTRAINT unit_prices_price_minor_check CHECK(price_minor BETWEEN 0 AND 100000000);
ALTER TABLE price_history DROP CONSTRAINT price_history_price_minor_check;
ALTER TABLE price_history ADD CONSTRAINT price_history_price_minor_check CHECK(price_minor BETWEEN 0 AND 100000000);
CREATE TABLE business_dataset (id integer PRIMARY KEY CHECK(id=1), revision text NOT NULL);
INSERT INTO business_dataset(id,revision) VALUES(1,'initial');
