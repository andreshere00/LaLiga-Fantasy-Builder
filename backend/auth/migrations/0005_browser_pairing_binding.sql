-- Browser callbacks must come from the browser that started the flow.
-- Challenges created before this migration keep an empty binding and fail browser callbacks.
ALTER TABLE browser_pairings ADD COLUMN IF NOT EXISTS binding_hash TEXT NOT NULL DEFAULT '';
