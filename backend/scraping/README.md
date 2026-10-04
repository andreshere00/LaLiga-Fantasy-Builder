# Scraping

Private Compose process and the offline FutbolFantasy parser. The process
listens on port 8002 and answers `/health/live` and `/health/ready`. It does
not download pages. `fantasy-parse` reads a saved HTML file and writes JSON or
Markdown.

```bash
cd backend/scraping
uv run pytest --cov=src --cov-report=term-missing --cov-fail-under=80
uv run fantasy-parse page.html --url URL --slug SLUG --season 2026-27 \
  --fetched-at 2026-10-04T12:00:00+00:00 --json
```

From the repo root, `uv run poe up` builds this image with the rest of the
`apps` profile. That command copies `backend/scraping/.env.example` to
`backend/scraping/.env` when the env file is missing. The API container
receives `SCRAPING_BASE_URL` and `SCRAPING_SERVICE_TOKEN`.

See [docs/scraping/parser.md](../../docs/scraping/parser.md).
