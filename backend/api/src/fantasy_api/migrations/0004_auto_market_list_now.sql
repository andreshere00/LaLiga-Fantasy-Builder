ALTER TABLE auto_market_rules
    DROP CONSTRAINT IF EXISTS auto_market_rules_trigger_kind_check;
ALTER TABLE auto_market_rules
    ADD CONSTRAINT auto_market_rules_trigger_kind_check
        CHECK (trigger_kind IN ('relative','absolute','none')),
    ADD COLUMN list_now BOOLEAN NOT NULL DEFAULT false;
