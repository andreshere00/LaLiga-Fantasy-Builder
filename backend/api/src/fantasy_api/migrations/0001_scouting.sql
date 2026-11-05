CREATE TABLE scouting_favorites (
    owner_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (owner_id, player_id)
);
CREATE TABLE scouting_leagues (
    owner_id TEXT NOT NULL,
    league_id TEXT NOT NULL,
    league_name TEXT NOT NULL,
    grant_id TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    checked_at TIMESTAMPTZ,
    next_check TIMESTAMPTZ NOT NULL DEFAULT now(),
    failures INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(owner_id, league_id)
);
CREATE INDEX scouting_due ON scouting_leagues(next_check) WHERE status = 'active';
CREATE TABLE scouting_watches (
    owner_id TEXT NOT NULL,
    league_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    market_alert BOOLEAN NOT NULL,
    clause_alert BOOLEAN NOT NULL,
    lead_hours INTEGER NOT NULL CHECK (lead_hours IN (1,6,24)),
    observation JSONB,
    PRIMARY KEY(owner_id, league_id, player_id),
    FOREIGN KEY(owner_id, player_id) REFERENCES scouting_favorites ON DELETE CASCADE,
    FOREIGN KEY(owner_id, league_id) REFERENCES scouting_leagues ON DELETE CASCADE
);
CREATE TABLE scouting_notifications (
    id BIGSERIAL PRIMARY KEY,
    owner_id TEXT NOT NULL,
    league_id TEXT NOT NULL,
    league_name TEXT NOT NULL,
    player_id TEXT NOT NULL,
    player_name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('market','clause_soon','clause_available')),
    event_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    read_at TIMESTAMPTZ,
    UNIQUE(owner_id, league_id, player_id, kind, event_key)
);
CREATE INDEX scouting_inbox ON scouting_notifications(owner_id,id DESC);
