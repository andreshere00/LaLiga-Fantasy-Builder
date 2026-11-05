-- Opaque delegations are invalidated when a connection is removed or replaced.
CREATE TABLE scouting_grants (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES connections(user_id) ON DELETE CASCADE,
    league_id TEXT NOT NULL,
    UNIQUE (user_id, league_id)
);
CREATE FUNCTION revoke_scouting_on_pairing() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.profile_json IS DISTINCT FROM OLD.profile_json THEN
        DELETE FROM scouting_grants WHERE user_id = OLD.user_id;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER scouting_connection_changed BEFORE UPDATE ON connections
FOR EACH ROW EXECUTE FUNCTION revoke_scouting_on_pairing();
