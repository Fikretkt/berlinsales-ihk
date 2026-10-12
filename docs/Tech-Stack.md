# Tech-Stack: MarktSync (v0.6)

Verbindliche technische Entscheidungen.

## Zielvorgaben

- PWA-tauglich (offline, install-bar)
- Realtime-Updates zwischen Nutzern
- Mobile-first, schnell auf 4G
- Solo-Entwickler-freundlich
- DSGVO-konformes EU-Hosting
- KI-Coding-tauglich

---

## Frontend + Backend: Next.js 15 (App Router)

- Frontend + API in einer Codebasis
- Server Components reduzieren Client-Bundle
- PWA-Support via `next-pwa`

## Sprache: TypeScript (strict)

Type-Safety überall. Bei KI-gestütztem Coden besonders wertvoll.

## Datenbank: PostgreSQL 16 (Hetzner Managed)

Hetzner Cloud Database mit Point-in-Time-Recovery, automatischen Backups, Failover. ~15 €/Monat.

**PostgreSQL-Features:**
- `LISTEN`/`NOTIFY` für Realtime
- `JSONB` für payload-Felder
- Partial Indexes
- Triggers für Übergangs-Regeln
- `pg_advisory_xact_lock` für Race-Condition-Schutz
- Custom Enums
- Views (`v_market_status`)

## ORM: Drizzle ORM

- Type-safe von Schema bis Frontend
- Migrationen mit `drizzle-kit`
- Funktioniert gut mit Postgres-Spezifika (JSONB, Enums, partial unique)

## Realtime: PostgreSQL LISTEN/NOTIFY + Server-Sent Events

**Nicht WebSocket.**

**Architektur:**
1. Backend-Endpoint `GET /api/v1/events/stream` hält pro Client eine SSE-Verbindung
2. Eine dedizierte DB-Connection (außerhalb des Pools) hält permanent `LISTEN market_updated` + `LISTEN markets_bulk_updated` (kanonische Channel-Liste, siehe `Reference.md`)
3. Bei NOTIFY: Server fan-out an alle aktiven SSE-Clients
4. Heartbeat alle 30s gegen Proxy-Timeouts UND Session-Re-Validation
5. Bei abgelaufener Session: `session_expired`-Event, Server schließt Verbindung
6. NOTIFY-Payloads kompakt halten (8KB-Limit von Postgres), Detail via REST-Refetch

## Auth: Auth.js (NextAuth)

- Email + Passwort
- Sessions in der DB
- Setup-Flow via `password_reset_token` Tabelle (`purpose='setup'`, TTL 7d)
- Reset-Flow analog (`purpose='reset'`, TTL 1h)

## Karten: Leaflet + OpenStreetMap

- Kostenlos
- Tiles cachebar für Offline
- Native Map-App-Deep-Links

## Styling: Tailwind CSS 4 + shadcn/ui

## State-Management

- **Zustand** für lokalen UI-State
- **TanStack Query** für Server-State + Caching
- Bei SSE-Events: Query-Invalidation, Detail-Refetch

## Forms: React Hook Form + Zod

Zod-Schemas auch im Backend wiederverwendet.

## E-Mail-Versand: Resend

- Free Tier 3.000 Mails/Monat
- React Email für Templates
- DSGVO-konform
- Bei Versand-Fehler: Audit-Log + UI-Warnung, kein Auto-Retry

## CSV-Parsing

`csv-parse` für Initial-Import von Marktdaten.

## Hosting

- **App-VM**: Hetzner Cloud CPX21, ~8 €/Monat + Coolify
- **Datenbank**: Hetzner Cloud Database, ~15 €/Monat
- **Domain**: ~15 €/Jahr

Gesamt: **25–30 €/Monat** laufend.

## Monitoring

- **Sentry** Free Tier
- **Better Stack** Free Tier
- **Alerts** für:
  - Unerwartete Trigger-Fehler (alle SQLSTATEs außer den dokumentierten P0001–P0006)
  - `user_invited_email_failed`-Häufung
  - SSE-Connection-Drops > Schwellwert

## Tests

- **Vitest**: Unit + Integration
- **Testcontainers**: echte Postgres
- **Playwright**: E2E
- **SSE-Tests** explizit (mehrere Browser-Contexts via Playwright)
- Coverage-Tool: c8

Details in `docs/Test-Strategy.md`.

## CI/CD

- **GitHub Actions**: Lint + Typecheck + Test + Build
- **Coolify Webhook**: Auto-Deploy bei grünem `main`

## Background Jobs

- **node-cron** als Scheduler (in-process, simpel)
- Drei Jobs: expire_reservations (1min), broadcast_cooldown_expiry (5min), anonymize_old_geo (täglich)
- Alle idempotent

## Package-Liste (Production)

```json
{
  "next": "^15.0.0",
  "react": "^19.0.0",
  "react-dom": "^19.0.0",
  "typescript": "^5.6.0",
  "drizzle-orm": "^0.36.0",
  "postgres": "^3.4.0",
  "next-auth": "^5.0.0",
  "bcryptjs": "^2.4.3",
  "@tanstack/react-query": "^5.59.0",
  "zustand": "^5.0.0",
  "react-hook-form": "^7.53.0",
  "zod": "^3.23.0",
  "leaflet": "^1.9.4",
  "react-leaflet": "^4.2.1",
  "tailwindcss": "^4.0.0",
  "lucide-react": "^0.453.0",
  "resend": "^4.0.0",
  "react-email": "^3.0.0",
  "next-pwa": "^5.6.0",
  "@sentry/nextjs": "^8.30.0",
  "date-fns": "^4.0.0",
  "date-fns-tz": "^3.2.0",
  "csv-parse": "^5.5.0",
  "node-cron": "^3.0.0"
}
```

## Wichtige Designprinzipien

1. **Server Components als Default**, Client Components nur wo nötig
2. **Server Actions** statt API-Routes wo möglich
3. **Drizzle-Schema als Single Source of Truth** für die DB-Struktur
4. **Status-Berechnung NUR in TypeScript** — `lib/status/compute.ts` ist die einzige Implementierung
5. **Zod-Schemas** wiederverwendet (Frontend + Backend)
6. **Keine Magic Strings**: Enums als `as const`
7. **Cooldown-Werte** immer aus `cooldown_rule`-Tabelle bei Action-Insert lesen, dann als Snapshot in action speichern
8. **Bei `duration_days = 0`** → `cooldown_until = null` (Backend macht das explizit)
9. **Alle Geo-Distanzen** im Backend berechnen
10. **NOTIFY-Payload klein** halten (IDs + Status), Detail-Refetch via REST
11. **Idempotente Background-Jobs** — Deployments dürfen nicht zu Datenverlust führen

## Voraussetzungen für lokale Entwicklung

- Node.js 22 LTS
- Docker (für lokale Postgres in Integrationstests)
- pnpm 9+
- VS Code mit Claude Code
