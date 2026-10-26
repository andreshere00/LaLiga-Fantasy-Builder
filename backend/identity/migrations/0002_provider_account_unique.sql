-- One external provider account may belong to only one application account.
-- A conflicting historical row must be resolved before this migration can apply.
CREATE UNIQUE INDEX account_provider_account_unique
    ON "account" ("providerId", "accountId");
