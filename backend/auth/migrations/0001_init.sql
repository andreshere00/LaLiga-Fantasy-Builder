-- Fantasy Auth initial schema (Postgres).
-- Used when USE_MEMORY_STORE=false; memory adapters ignore this file.

CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    user_id TEXT,
    email TEXT,
    name TEXT,
    csrf_token TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    oidc_state TEXT,
    oidc_nonce TEXT,
    oidc_code_verifier TEXT
);

CREATE TABLE IF NOT EXISTS pairings (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    secret_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed BOOLEAN NOT NULL DEFAULT FALSE,
    nonce TEXT
);

CREATE INDEX IF NOT EXISTS pairings_user_id_idx ON pairings (user_id);

CREATE TABLE IF NOT EXISTS connections (
    user_id TEXT PRIMARY KEY,
    sealed_blob BYTEA NOT NULL,
    policy TEXT NOT NULL,
    client_id TEXT NOT NULL,
    scope TEXT NOT NULL,
    needs_reauth BOOLEAN NOT NULL DEFAULT FALSE,
    profile_json JSONB
);
