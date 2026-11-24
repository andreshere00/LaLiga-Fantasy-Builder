ALTER TABLE auto_market_rules
    ADD COLUMN listed_price BIGINT CHECK (listed_price > 0),
    ADD COLUMN accept_floor BIGINT CHECK (accept_floor > 0),
    ADD COLUMN listed_at TIMESTAMPTZ,
    ADD COLUMN claimed_at TIMESTAMPTZ;
