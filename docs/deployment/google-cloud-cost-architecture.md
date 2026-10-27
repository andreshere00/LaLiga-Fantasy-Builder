# Google Cloud deployment for four concurrent users

Assessed on 27 October 2026. Scope: the current repository, `fantasybuilder.es`,
and at most four people using the application simultaneously. Prices below are
public USD list prices before tax; estimates assume 730 running hours per month.
They are planning estimates, not a quote for the user's billing account.

Implementation is now available in [the Terraform deployment template](../../infra/gcp/README.md).
The root [architecture overview](../../ARCHITECTURE.md) describes its backend,
frontend, and cloud boundaries. The preparation list below records the needs
identified during assessment; the template implements the host/runtime portions.

## Recommendation

Start with **one Compute Engine `e2-small` VM, 2 GiB RAM, in `us-central1`**, running
the existing application containers with Docker Compose. Use Caddy for HTTPS,
Nginx for the React app and API routing, and containerized PostgreSQL and Redis.
Plan for **about $16–20/month after promotional credits**, assuming small storage,
modest traffic, and the allowances described below. During a qualifying trial,
eligible charges consume the trial credit.

This is the best balance of ongoing cost, implementation effort, and fit with the
current code. The microservices stay separate processes with their existing
responsibilities and private interfaces; they do not need separate VMs.

Use the trial to measure the complete production stack under four-user load.
Then test a downgrade to the free-tier-eligible `e2-micro` if there is enough
memory and CPU headroom. Do not promise a free permanent deployment before that
test. A public IPv4 address also has an ongoing charge even on a free VM.

![Recommended deployment architecture](google-cloud-architecture.png)

The [editable Mermaid diagram](google-cloud-architecture.mmd) and
[vector diagram](google-cloud-architecture.svg) are included alongside this document.

## Evidence from the current application

| Finding | Deployment implication |
| --- | --- |
| `docker-compose.yml` already defines the frontend, identity, auth, API, scraper, PostgreSQL, and Redis. | A single Compose host needs little architectural change. |
| `docker-compose.https.yml` and `docker/Caddyfile` already define an HTTPS ingress. | Reuse Caddy directly; a Google load balancer is unnecessary at this scale. |
| The frontend uses `/auth`, `/laliga`, and `/api` on one origin. | Keep `https://fantasybuilder.es` as the shared origin for cookies, callbacks, and JWT calls. |
| Identity always needs PostgreSQL. Production auth needs PostgreSQL and Redis. | These dependencies continue running even when nobody is using the UI. |
| Production pairing, vault data, and refresh locks use PostgreSQL; auth rate limits use Redis. | Redis is not just an optional page cache in the current production wiring. |
| Identity and vault use separate database roles and databases within one PostgreSQL server. | Preserve that separation when sharing one database container. |
| The scraper has a process-local page cache and rate limiter and is documented to use one worker. | Keep one scraper instance; replicas would multiply upstream activity and lose shared throttling. |
| Lineup building can occupy a request for up to 120 seconds and currently permits two builds per API process. | Test builder activity as well as ordinary navigation; retain the existing bounded concurrency. |
| Nginx's API proxy timeout is 130 seconds. | Preserve long requests and progress streaming through the public ingress. |
| Only PostgreSQL and Redis were running in local Docker during this assessment. | Their observed memory use, about 46.5 MiB and 19 MiB, is not a full application sizing result. |

The choice of 2 GiB is an initial engineering estimate. Four users reduces the
need for scaling, but does not establish peak memory use: a user can trigger many
parallel requests, cold scraper caches, or lineup calculations.

Relevant implementation: [Compose](../../docker-compose.yml),
[HTTPS overlay](../../docker-compose.https.yml),
[Nginx](../../frontend/nginx.conf),
[auth dependencies](../../backend/auth/src/fantasy_auth/api/deps.py),
[lineup orchestration](../../backend/api/src/fantasy_api/services/lineup_builder.py),
and [scraper cache](../../backend/scraping/src/fantasy_scraping/scraper/cache.py).

## Cost model

Use `us-central1` for the cost-first baseline. All components stay in the same VM
and region. A European region may improve latency for users in Spain, but needs
a separate regional estimate and loses the US-only Compute Engine free-tier
eligibility. Region choice also determines where account and vault data reside.

| Item | Monthly estimate | Assumption |
| --- | ---: | --- |
| `e2-small` compute | $12.23 | $0.016752855/hour × 730 hours. |
| One attached external IPv4 address | $3.65 | Approximately $0.005/hour; reserve it for stable DNS. |
| 30 GiB `pd-standard` disk | $0 if eligible | Stay within the account's unused standard-disk free allowance; the allowance is shared, not per VM. |
| Small backup bucket | $0 if eligible, otherwise usage charges | Regional Standard storage in an eligible US region; retained backups and operations must fit the account's allowance. |
| Internet traffic | $0 within the selected tier's allowance | Explicitly choose Standard Network Tier for the VM's address; its first 200 GiB/month per account are free. Premium Tier has different rates. |
| Container image storage | Small usage-dependent charge | Artifact Registry has only 0.5 GB free; multiple application images and retained revisions can exceed it. Use cleanup policies. |
| DNS | No additional GCP charge | Keep the registrar's existing DNS service; Cloud DNS is unnecessary. |
| SMTP | Existing provider's allowance | Use the configured Resend SMTP service within its plan. |
| Expected total | **About $16–20** | Low traffic, small backups/images, unused eligible allowances; excludes domain renewal, taxes, optional model calls, and paid upstream plans. |

Compute rates are from [Google's E2 pricing](https://cloud.google.com/products/compute/pricing/general-purpose?hl=en).
Network assumptions and IPv4 charges are from [Google's network pricing](https://cloud.google.com/vpc/network-pricing).
Storage and registry allowances are described in the [Free Tier table](https://docs.cloud.google.com/free/docs/free-cloud-features).

The Free Tier VM is **`e2-micro`, not `e2-small`**. It has 1 GiB RAM and fractional
CPU capacity. Its compute allowance applies only in `us-west1`, `us-central1`, or
`us-east1`. Do not subtract a free micro VM's compute price from the small VM's
price. Machine resources are documented in the
[E2 machine guide](https://docs.cloud.google.com/compute/docs/general-purpose-machines).

## Alternatives

| Setup | Ongoing planning cost | Assessment for this app |
| --- | ---: | --- |
| One `e2-micro`, all containers | About $4–6/month if allowances suffice | Cheapest architecture to test. Only 1 GiB RAM; full-stack suitability is unverified. IPv4 prevents a zero bill in this topology. |
| One `e2-small`, all containers | **About $16–20/month** | Recommended initial deployment; limited migration work and more memory headroom. |
| One `e2-medium`, all containers | About $28–33/month | 4 GiB fallback if measurements show that the smaller host is constrained. |
| Cloud Run + Cloud SQL + Memorystore | At least roughly $45/month before application usage and additional routing/storage | The always-running managed data services dominate the cost. |
| Cloud Run + a free-tier VM for PostgreSQL/Redis | Potentially lower than the recommended VM; needs a complete usage and ingress model | Viable later if lowest cash spend outweighs implementation effort. Requires custom deployment/networking, persistent state management, and cold-start testing. |

The managed-state example uses Cloud SQL `db-f1-micro` at $0.0105/hour, or about
$7.67/month before storage, and Memorystore Basic 1 GiB at $0.049/GiB-hour, or about
$35.77/month. Those alone total about $43.44/month in the reference region.
Sources: [Cloud SQL pricing](https://cloud.google.com/sql/pricing?hl=en) and
[Memorystore pricing](https://cloud.google.com/memorystore/docs/redis/pricing).

Cloud Run itself can be economical at this traffic level. Its request-based
allowances include CPU, memory, and requests, aggregated across the billing
account. However, zero application compute charges do not remove the database,
registry, networking, or ingress costs. Cold starts also discard the current
process-local caches. A multi-container Cloud Run service can preserve local
service communication, but PostgreSQL data cannot live on its disposable local
filesystem. See [pricing](https://cloud.google.com/run/pricing),
[sidecar deployments](https://docs.cloud.google.com/run/docs/deploying), and
[the container contract](https://docs.cloud.google.com/run/docs/container-contract).

Firebase Hosting in front of Cloud Run needs particular care: Hosting's
60-second request timeout is shorter than the application's 120-second builder
budget. Simply replacing Nginx with Hosting rewrites can break valid requests.
See [Hosting with Cloud Run](https://firebase.google.com/docs/hosting/cloud-run?hl=en).

GKE, a VM per microservice, an external load balancer, Cloud NAT, and managed Redis
add fixed costs and operational work that four users do not justify. Spot VMs
are a poor default for this single stateful host because interruption stops both
the application and its databases.

## Proposed resource configuration

| Resource | Initial choice |
| --- | --- |
| VM | One regular, non-Spot `e2-small`; Debian or Ubuntu LTS without a paid OS subscription. |
| Region | `us-central1`; reconsider an EU region if measured latency or data-location preferences justify it. |
| Disk | One 30 GiB standard persistent disk, initially for OS, images, database volume, and Caddy data. Monitor capacity; do not let old images fill it. |
| Public networking | One reserved Standard Tier IPv4; DNS A record for `fantasybuilder.es`. |
| TLS and routing | Caddy on 80/443; `/auth/*` directly to identity with the actual client IP; other paths through frontend/Nginx. |
| Runtime | Docker Compose `apps` profile, one worker/instance per backend. Optional OTEL collector stays disabled initially. |
| Storage isolation | PostgreSQL identity/vault databases and roles remain separate; durable PostgreSQL and Caddy volumes. Redis stays private. |
| Backups | Daily logical backups of both databases to a private regional Cloud Storage bucket. Bound retention; rehearse restoring them. Back up vault and identity secrets separately. |
| Access | SSH through IAP with OS Login; restrict SSH to IAP's required source range rather than opening it to everyone. |
| Build/release | Build immutable images in CI; pull them onto the VM. Avoid TypeScript/Python image builds competing with the app on the small host. |
| Monitoring | Container health checks, bounded Docker logs, disk/memory/OOM checks, and a billing budget. Add larger observability services only if needed. |

Standard disk is chosen for low cost, not maximum database I/O. If database
latency becomes a real bottleneck, price a balanced disk and measure the effect
before changing compute size. Splitting disks may help operations later but can
consume more than the initial free storage allowance.

## Deployment preparation still needed

1. Create a production Compose overlay that removes the scraper's host port
   mapping and unnecessary application/database host ports. Identity and
   `/internal/*` remain private; service tokens are still required internally.
2. Add container restart policies and bounded log rotation. The current Compose
   file does not supply restart policies for an unattended production host.
   Arrange automatic Compose startup after host reboots.
3. Configure `APP_DOMAIN=fantasybuilder.es`, the matching HTTPS frontend origin,
   `BETTER_AUTH_URL`, and JWT issuer. Set persistent auth mode and stable vault,
   identity, internal-service, scraping, and database secrets. Do not put secrets
   in frontend build variables or image layers.
4. Run identity and vault migrations in a controlled sequence before accepting
   traffic; preserve database roles and existing encryption keys when migrating
   real data. Review the existing release runbook.
5. Verify SMTP from the VM. The repository uses TLS SMTP on 465, which Google
   permits; port 25 has different restrictions. See
   [Compute Engine mail networking](https://docs.cloud.google.com/compute/docs/tutorials/sending-mail?hl=en).
6. Register any enabled social-provider callbacks on the chosen HTTPS origin.
   The current LaLiga capability record still reports no approved browser web
   client/callback; hosting does not resolve that separate dependency. Existing
   authenticated pairing remains the available connection flow.
7. Configure backups, restore verification, limited image retention, disk alerts,
   and the four-user sizing exercise before treating the deployment as ready.

If the domain uses a proxy/CDN, configure trusted proxy handling before relying
on client-IP rate limits. The existing Caddy setup expects the actual network
client address. Keeping DNS in DNS-only mode initially avoids that extra proxy.

Release references: [identity configuration](../../backend/identity/README.md),
[cutover and release checks](../authentication/better-auth-cutover.md), and
[LaLiga capability record](../authentication/laliga-sso-capability.md).

## Trial, budget, and sizing decision

The published new-customer offer is $300 credit for 90 days; the user's actual
remaining credit and expiry were not inspected. Continuing resources after the
trial requires an active paid billing account even when usage qualifies for free
allowances. See [trial terms and lifecycle](https://docs.cloud.google.com/free/docs/free-cloud-features).

Set a monthly budget around $20 for this project and monitor usage before credits
hide the underlying cost. An alerts-only budget does not stop spending; use
service limits and avoid provisioning fixed-cost products casually. See
[Google's budget documentation](https://docs.cloud.google.com/billing/docs/how-to/budgets).

Measure cold startup, warm browsing, and four separate signed-in sessions with
representative data. Include two concurrent lineup previews while the other
users navigate and inspect player profiles. Use read-only flows and synthetic
data for writes. Confirm mail, sign-in, scraper throttling, and progress streaming
through the real HTTPS ingress without executing Fantasy transactions.

Proposed acceptance criteria, to be validated rather than treated as measured facts:

- Keep the small VM if it has stable response times, no OOM kills, useful memory
  headroom, and no sustained swap activity under the representative workload.
- Trial the micro VM only after observed full-system peak memory is comfortably
  below its 1 GiB limit, for example around 650–700 MiB including the OS and
  containers, and CPU/latency tests also pass. Small swap can absorb transients;
  it does not turn a 1 GiB host into a 2 GiB host.
- Move to `e2-medium` if memory pressure or sustained CPU contention persists on
  the small VM. Change one resource at a time and repeat the affected workload.

This assessment did not provision cloud resources or change application code.
The local Google Cloud CLI had no project selected; no billing-account inventory,
remaining-credit check, or production load test was performed. A single VM is
one failure domain: application and data access stop together during downtime.
That tradeoff is reasonable for four users if brief outages and restore-based
recovery are acceptable.
