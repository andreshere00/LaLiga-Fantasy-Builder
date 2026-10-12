# Schema validation fixtures

`schema-validation-fixtures.json` is consumed by API Python tests, independently
packaged auth browser-session tests and frontend Zod tests. Each case identifies
its request, response or query contract and expected acceptance. Valid response
cases also pin the actual Pydantic wire serialization; Python checks this output
and Zod parses it. Dynamic maps retain their keys; declared aliases reject collisions.

Run backend checks with `uv run poe test` and frontend checks with
`cd frontend && bun run test && bun run build`. CI runs both. Expand the corpus
when changing a field type, bound, alias, union, sparse-body policy or query rule.
Fixtures represent supported examples and regressions, not exhaustive schema proof.
