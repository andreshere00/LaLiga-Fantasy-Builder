# Backend services

Sibling packages. Python services have a `pyproject.toml`; identity has a TypeScript package. Each has a Docker image.
The system map is [Architecture](../docs/architecture.md).

| Path | Role | Port |
| --- | --- | --- |
| [`auth/`](auth/) | LaLiga pairing, vault and external JWT verification | 8000 |
| [`identity/`](identity/) | Better Auth login, recovery, sessions, JWTs | 8003 |
| [`api/`](api/) | Fantasy routes | 8001 |
| [`scraping/`](scraping/) | Private FutbolFantasy scraper and profile parser | 8002 |

Do not nest a second `.git` here. Feature routes:
[API docs](../docs/api/README.md).
