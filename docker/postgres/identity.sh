#!/bin/sh
# Runs only when initializing a new cluster. Existing volumes require the documented provisioning step.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=identity_password="$IDENTITY_DB_PASSWORD" \
  --set=vault_password="$VAULT_DB_PASSWORD" --set=vault_database="$POSTGRES_DB" <<'SQL'
CREATE ROLE fantasy_vault LOGIN PASSWORD :'vault_password';
ALTER DATABASE :"vault_database" OWNER TO fantasy_vault;
REVOKE ALL ON DATABASE :"vault_database" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"vault_database" TO fantasy_vault;
CREATE ROLE fantasy_identity LOGIN PASSWORD :'identity_password';
CREATE DATABASE fantasy_identity OWNER fantasy_identity;
REVOKE ALL ON DATABASE fantasy_identity FROM PUBLIC;
GRANT CONNECT ON DATABASE fantasy_identity TO fantasy_identity;
SQL
