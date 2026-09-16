# Fantasy Builder API documentation

Application API docs for `backend/api` (`fantasy_api`).

- [OpenAPI / Swagger](openapi.md) — schema generation, Swagger UI, committed
  `openapi.json`
- [Leagues](leagues/README.md) — league routes, ranking, activity, teams
- [Adding leagues endpoints](leagues/adding-leagues-endpoints.md) — CRS
  checklist for new league reads
- [Players](players/README.md) — catalog, market value, league-scoped card
- [Adding players endpoints](players/adding-players-endpoints.md) — CRS
  checklist for public and authenticated player reads

Auth and pairing live under [Authentication](../authentication/authentication.md).
Cross-cutting endpoint patterns:
[Developing authenticated endpoints](../authentication/developing-authenticated-endpoints.md).

## Quick links

| Resource | URL / path |
|----------|------------|
| Swagger UI | http://localhost:8001/docs |
| ReDoc | http://localhost:8001/redoc |
| Live OpenAPI | http://localhost:8001/openapi.json |
| Committed schema | [`backend/api/openapi.json`](../../backend/api/openapi.json) |
| Service README | [`backend/api/README.md`](../../backend/api/README.md) |

## Layout in code

```text
backend/api/src/fantasy_api/
├── api/            # FastAPI controllers (routes)
├── services/       # use cases (JWT → LaLiga bearer → repository)
├── repositories/   # Fantasy path construction
├── clients/        # auth credentials + LaligaFantasyClient
├── schemas/        # Pydantic request/response models (OpenAPI source)
├── openapi.py      # generate_openapi / build_openapi_schema
└── cli/            # fantasy-leagues / fantasy-players helper CLIs
```

## Authentication for API calls

1. Log in at auth (`POST /auth/token` with session + CSRF) to get an internal JWT.
2. Call protected API routes with `Authorization: Bearer <internal JWT>`.
3. LaLiga-backed **private** routes fetch a short-lived Fantasy bearer from auth
   (`GET /internal/laliga/bearer`); the bearer is never returned to clients.
   Public `/players` and `/player/{id}/market-value` skip this step.
