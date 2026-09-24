-- Pending LaLiga browser pairing secrets live on the application session.
-- The browser never receives these values.

ALTER TABLE sessions
    ADD COLUMN IF NOT EXISTS laliga_pairing_id TEXT,
    ADD COLUMN IF NOT EXISTS laliga_pairing_secret TEXT,
    ADD COLUMN IF NOT EXISTS laliga_code_verifier TEXT,
    ADD COLUMN IF NOT EXISTS laliga_b2c_state TEXT;

CREATE INDEX IF NOT EXISTS sessions_laliga_b2c_state_idx
    ON sessions (laliga_b2c_state)
    WHERE laliga_b2c_state IS NOT NULL;
