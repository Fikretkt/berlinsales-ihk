# ZalsoSales v1.0.0 production runbook

This runbook is for the Docker/Caddy deployment on the production host. The
compose and Caddy files are host-managed and are not part of this repository.
The canonical topology after every release is:

```text
GitLab main -> /opt/itmart/app -> docker compose build app -> itmart-app:local
-> itmart-app-1 (network alias: itmart-app) -> Caddy -> itmart.rehbr.dev
```

Temporary GREEN containers are release tools only. After cutover the Caddy
upstream must again be `itmart-app:3000`.

## Roles and release checks

| Capability | Field employee | Admin |
| --- | --- | --- |
| Tenant customer list/map, GPS customer creation, interactions, follow-ups, `/today` | Yes | Yes |
| Management dashboard, assignment, employee drill-down | No | Yes |
| Permanent customer deletion | No | Yes |

All business requests derive the company from the validated server session;
client-provided company ownership is never authoritative.

## Health, readiness and version

```bash
curl -fsS http://itmart-app:3000/api/health
curl -fsS http://itmart-app:3000/api/ready
curl -fsS https://itmart.rehbr.dev/api/health
```

`/api/health` proves the process is alive and returns the running version.
`/api/ready` additionally checks mandatory production configuration and a cheap
PostgreSQL query. It returns HTTP 503 without secrets or connection details when
the app is not ready. Set `APP_VERSION` during image build only when a more
specific non-sensitive build identifier is needed.

## Pre-deploy

1. Ensure the intended `main` revision is present in `/opt/itmart/app`.
2. Record current health/version and retain the current image ID for rollback.
3. Back up the database and validate the compressed file before continuing.
4. Review pending SQL files. Migrations are forward-only and must finish before
   traffic cutover; a failure is non-zero and must stop deployment.
5. Verify production has `DATABASE_URL`, `AUTH_SECRET` (or `NEXTAUTH_SECRET`),
   and `AUTH_URL`/`NEXTAUTH_URL` (or `AUTH_TRUST_HOST=true`).

## Deploy

```bash
cd /opt/itmart/app
git pull origin main
pnpm db:migrate
docker compose build app
```

For a blue/green release, start GREEN with the current image, call its internal
`/api/health` and `/api/ready`, then switch Caddy traffic. Run an internal login,
`/today`, management dashboard and map smoke test before public cutover.

Finalize by recreating the canonical service and restoring Caddy to
`itmart-app:3000`; remove temporary GREEN only after the smoke test. Keep the
previous image until the acceptance window closes.

## Verify after deployment

- Health, readiness and returned version
- Public HTTPS response; no Caddy 502
- Login, logout and a new-tab login
- `/today`, map marker/detail, GPS customer create, interaction and follow-up
- `/admin/dashboard`, assignment, employee drill-down
- Permanent deletion of a disposable test customer only
- Recent container logs contain no repeated server failures

## Recovery and rollback

```bash
docker compose ps
docker compose logs --tail=200 app
docker compose restart app
docker compose up -d --no-deps --force-recreate app
```

`restart` keeps the same container/image. `force-recreate` creates a new
container from the image currently selected by compose; it does not turn changed
source into a new image. Application-image rollback and traffic rollback are
separate from database restore. Never restore the database merely to roll back
application code.

For traffic rollback, return Caddy to the retained prior healthy container. For
an image rollback, select the retained image and recreate the canonical app.
For data recovery, stop writes, choose the recovery point, and use the database
restore process below.

## Backup and restore

```bash
TS=$(date +%Y%m%d-%H%M%S)
pg_dump "$DATABASE_URL" | gzip > "/var/backups/itmart/itmart-$TS.sql.gz"
gzip -t "/var/backups/itmart/itmart-$TS.sql.gz"
```

Use the `itmart-YYYYMMDD-HHMMSS.sql.gz` convention and retain/copy backups
according to the host retention policy. A restore is destructive: stop app
writes, restore into a confirmed target database, then repoint/restart only
after operator approval.

```bash
gzip -dc /path/to/itmart-YYYYMMDD-HHMMSS.sql.gz | psql "$DATABASE_URL"
```

Prefer a restore rehearsal against a separate database first. Database restore
is not an application rollback.

## Migration compatibility

Migrations are ordered SQL files recorded in `__migrations`; do not edit or
squash production history. Deploy migrations before cutover and design future
migrations so old and new application containers can overlap briefly. The audit
event check constraints introduced in S08A/S08B are a historical exception:
`011_audit_event_blue_green_compatibility.sql` accepts both deletion event names
so an older container can finish a request during RC cutover.

## Final release acceptance checklist

- [ ] Health/readiness/version verified internally and publicly
- [ ] Auth: login, logout, stale-session behaviour, protected-route redirect
- [ ] Employee: `/today`, follow-ups, list/map/detail, GPS creation
- [ ] Admin: dashboard, assignment/drill-down, disposable-customer deletion
- [ ] Infrastructure: PostgreSQL readiness, Caddy upstream, no 502, logs checked
- [ ] Backup created and `gzip -t` validated
- [ ] Rollback image retained and temporary GREEN removed after acceptance

## Runtime notes

The application reuses one process-wide PostgreSQL pool. Next.js receives
SIGTERM/SIGINT directly from Docker; avoid adding a competing signal handler in
route code. The migration runner always releases its client and closes its own
pool. CI already gates lint, typecheck, production build, and the unit plus
Docker-in-Docker integration suite.
