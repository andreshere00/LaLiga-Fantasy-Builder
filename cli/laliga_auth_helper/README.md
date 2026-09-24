# Local LaLiga PKCE helper

The app pairs LaLiga from the browser. See
[Architecture](../../docs/architecture.md#browser-login).

These commands are for developer analysis, not the lineup UI:

```bash
cd backend/auth
uv run pair-laliga
uv run laliga-auth-helper --pairing ID --secret S --nonce N --clipboard
```

Implementation: `backend/auth/src/fantasy_auth/cli/`.
Details: [`backend/auth/README.md`](../../backend/auth/README.md).
