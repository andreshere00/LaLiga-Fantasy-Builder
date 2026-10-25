-- Additive cutover: retain old session rows for an operator-managed rollback.
-- No application code reads them. Restart pending logins after the cutover.
CREATE TABLE IF NOT EXISTS browser_pairings (
    state TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    pairing_id TEXT NOT NULL REFERENCES pairings(id) ON DELETE CASCADE,
    secret TEXT NOT NULL,
    code_verifier TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS browser_pairings_owner ON browser_pairings(user_id);
CREATE INDEX IF NOT EXISTS browser_pairings_expiry ON browser_pairings(expires_at);
