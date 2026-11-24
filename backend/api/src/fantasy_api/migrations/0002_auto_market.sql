CREATE TABLE auto_market_leagues (
    owner_id TEXT NOT NULL,
    league_id TEXT NOT NULL,
    league_name TEXT NOT NULL,
    grant_id TEXT,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active','degraded','needs_reauth','not_member','inactive')),
    checked_at TIMESTAMPTZ,
    next_check TIMESTAMPTZ NOT NULL DEFAULT now(),
    failures INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (owner_id, league_id)
);
CREATE INDEX auto_market_due ON auto_market_leagues(next_check)
    WHERE status IN ('active','degraded');
CREATE TABLE auto_market_rules (
    id BIGSERIAL PRIMARY KEY,
    owner_id TEXT NOT NULL,
    league_id TEXT NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('sell','buy')),
    target TEXT NOT NULL CHECK (target IN ('market','clause')),
    player_id TEXT NOT NULL,
    player_team_id TEXT,
    player_name TEXT NOT NULL,
    trigger_kind TEXT NOT NULL CHECK (trigger_kind IN ('relative','absolute')),
    trigger_bps INTEGER CHECK (trigger_bps > 0),
    trigger_amount BIGINT CHECK (trigger_amount > 0),
    baseline_value BIGINT NOT NULL CHECK (baseline_value > 0),
    price_mode TEXT NOT NULL CHECK (price_mode IN ('threshold','market_value')),
    bid_amount BIGINT CHECK (bid_amount > 0),
    max_spend BIGINT CHECK (max_spend > 0),
    state TEXT NOT NULL DEFAULT 'armed'
        CHECK (state IN ('armed','listed','executing','executed','failed','cancelled','expired')),
    version INTEGER NOT NULL DEFAULT 1,
    armed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,
    FOREIGN KEY (owner_id, league_id) REFERENCES auto_market_leagues ON DELETE CASCADE
);
CREATE UNIQUE INDEX auto_market_one_live_rule
    ON auto_market_rules(owner_id, league_id, player_id, side)
    WHERE state IN ('armed','listed','executing');
CREATE INDEX auto_market_rules_owner ON auto_market_rules(owner_id, league_id, id DESC);
CREATE TABLE auto_market_executions (
    id BIGSERIAL PRIMARY KEY,
    rule_id BIGINT NOT NULL REFERENCES auto_market_rules ON DELETE CASCADE,
    owner_id TEXT NOT NULL,
    action TEXT NOT NULL
        CHECK (action IN ('list','accept_offer','bid','pay_clause','expire','skip')),
    amount BIGINT,
    outcome TEXT NOT NULL CHECK (outcome IN ('ok','failed','skipped')),
    reason TEXT,
    idempotency_key TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX auto_market_executions_owner ON auto_market_executions(owner_id, id DESC);
