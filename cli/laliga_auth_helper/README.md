# Local LaLiga PKCE helper notes

Prefer the console scripts from the **auth service** package:

```bash
cd backend/auth
uv run pair-laliga
# or:
uv run laliga-auth-helper --pairing ID --secret S --nonce N --clipboard
```

Implementation: `backend/auth/src/fantasy_auth/cli/`.
