# Backend services (LaLiga Fantasy Builder)

Deployable backend services live here as **sibling packages**, each with its
own `pyproject.toml` / Docker image.

| Path | Role | Deploy |
| --- | --- | --- |
| [`auth/`](auth/) | Authentication & LaLiga pairing BFF | Separate service (port 8000) |
| `api/` *(future)* | Main Fantasy Builder API | Separate service |

Auth is intentionally isolated so you can scale, version, and release it
without the main application.

Do **not** nest a second `.git` here unless you explicitly want a submodule;
this monorepo already supports independent deploys per folder.
