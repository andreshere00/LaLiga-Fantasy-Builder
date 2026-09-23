# Backend services

Sibling packages. Each has its own `pyproject.toml` and Docker image.
The system map is [Architecture](../docs/architecture.md).

| Path | Role | Port |
| --- | --- | --- |
| [`auth/`](auth/) | Sessions, Keycloak login, LaLiga vault, internal JWT | 8000 |
| [`api/`](api/) | Fantasy routes | 8001 |

Do not nest a second `.git` here. Feature routes:
[API docs](../docs/api/README.md).
