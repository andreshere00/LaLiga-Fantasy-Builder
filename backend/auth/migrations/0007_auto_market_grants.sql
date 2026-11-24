-- Write delegations for armed auto-market rules; separate from read-only scouting grants.
CREATE TABLE auto_market_grants (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES connections(user_id) ON DELETE CASCADE,
    league_id TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    UNIQUE (user_id, league_id)
);
CREATE FUNCTION revoke_auto_market_on_pairing() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.profile_json IS DISTINCT FROM OLD.profile_json THEN
        DELETE FROM auto_market_grants WHERE user_id = OLD.user_id;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER auto_market_connection_changed BEFORE UPDATE ON connections
FOR EACH ROW EXECUTE FUNCTION revoke_auto_market_on_pairing();
