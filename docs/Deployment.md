# Deployment-Anleitung: MarktSync auf Hetzner

Pragmatische Schritt-für-Schritt-Anleitung. Veranschlagter Zeitaufwand: **3–5 Stunden** beim ersten Mal.

---

## Checkliste (kurz)

- [ ] Hetzner Cloud Account
- [ ] Cloud VM CPX21 (Ubuntu 24.04)
- [ ] Cloud Database (PostgreSQL 16, Managed)
- [ ] Domain bei INWX (oder anderem Registrar)
- [ ] Resend Account + Domain-Verifizierung
- [ ] Sentry Account
- [ ] Better Stack Account
- [ ] GitHub Repo

---

## 1. Hetzner-Infrastruktur (~30 min)

### VM aufsetzen
1. https://console.hetzner.cloud → neues Projekt „MarktSync"
2. Cloud → Server → Server hinzufügen
   - Standort: Falkenstein
   - Image: Ubuntu 24.04
   - Typ: **CPX21** (2 vCPU, 4 GB RAM, ~8 €/Monat)
   - SSH-Key hinterlegen
3. Firewall: nur 22 (SSH), 80 (HTTP), 443 (HTTPS) offen
4. IP notieren

### Managed Postgres
1. Hetzner Cloud → Datenbanken → Postgres erstellen
   - Plan: **Hobby** (~15 €/Monat, reicht für 15 User)
   - Region: gleich wie VM (Falkenstein)
   - Version: PostgreSQL 16
   - PITR aktivieren
2. Verbindungs-Daten notieren (Host, Port, User, Passwort)
3. Datenbank `marktsync` anlegen (über das Hetzner-Web-UI)

---

## 2. Coolify auf der VM installieren (~30 min)

```bash
ssh root@<VM-IP>

# Coolify-Installation (offizielle)
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash

# Coolify ist danach unter http://<VM-IP>:8000 erreichbar
```

Im Coolify-Web-UI:
1. Admin-Account anlegen
2. **Settings → SMTP** (optional) konfigurieren für Notifications
3. **Sources → GitHub** verbinden (App-Repo angebenden)

---

## 3. Domain + DNS (~15 min)

Bei INWX (oder deinem Registrar):
1. DNS-A-Record: `marktsync.dein-domain.de` → `<VM-IP>`
2. TTL kurz halten (300s) für die erste Zeit
3. Bis zur Propagation 5–60 Minuten warten

---

## 4. App in Coolify deployen (~30 min)

1. Coolify → Projects → MarktSync → Neue Resource → Application
2. Source: GitHub-Repo
3. Build:
   - **Buildpack: Node.js**
   - Build Command: `pnpm install --frozen-lockfile && pnpm build`
   - Start Command: `pnpm start`
   - Port: `3000`
4. **Environment-Variablen** (siehe unten)
5. **Domain**: `https://marktsync.dein-domain.de`
6. Coolify holt sich automatisch ein Let's-Encrypt-Zertifikat
7. **Deploy** klicken

### Erforderliche Env-Vars

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HETZNER-DB-HOST:5432/marktsync?sslmode=require

# Generiere mit: openssl rand -base64 32
AUTH_SECRET=<min 32 zufällige Zeichen>
AUTH_URL=https://marktsync.dein-domain.de
NEXTAUTH_URL=https://marktsync.dein-domain.de

# Resend (siehe nächster Abschnitt)
RESEND_API_KEY=re_xxx
EMAIL_FROM=noreply@marktsync.dein-domain.de

# Sentry (siehe weiter unten)
SENTRY_DSN=https://...@sentry.io/...
SENTRY_AUTH_TOKEN=...

# Production-Modus
NODE_ENV=production
ENABLE_CRON=false  # Cron läuft als separater Worker, siehe unten
```

---

## 5. Datenbank initialisieren (~10 min)

Einmalig vom Build-Container aus oder lokal:

```bash
# Lokal mit Production-DATABASE_URL
DATABASE_URL='postgresql://...' pnpm db:migrate

# Test-Admin anlegen (optional, sonst über Admin-Einladung später)
DATABASE_URL='postgresql://...' pnpm exec tsx scripts/create-test-admin.ts
```

Markt-Daten importieren (einmalig):
```bash
DATABASE_URL='postgresql://...' pnpm exec tsx scripts/import-markets.ts
```

---

## 6. Background-Jobs als separater Worker (~15 min)

In Coolify:
1. Neue Resource → Application (gleiches Repo)
2. Name: „MarktSync-Jobs"
3. Build Command: `pnpm install --frozen-lockfile`
4. Start Command: `pnpm jobs`
5. Port: nichts exposen (kein HTTP)
6. **Gleiche Environment-Vars** wie die App (vor allem DATABASE_URL)
7. Deploy

---

## 7. Resend-E-Mail (~20 min)

1. https://resend.com → Account anlegen
2. **Domain hinzufügen**: `marktsync.dein-domain.de`
3. DNS-Records (DKIM, SPF) bei INWX eintragen
4. Domain verifizieren lassen (~10 Min)
5. API-Key generieren → in Coolify als `RESEND_API_KEY` setzen
6. `EMAIL_FROM=noreply@marktsync.dein-domain.de`

---

## 8. Sentry + Better Stack (~30 min)

### Sentry
1. https://sentry.io → Account + Projekt „marktsync" (Next.js)
2. DSN kopieren → `SENTRY_DSN` in Coolify
3. Auth-Token generieren → `SENTRY_AUTH_TOKEN`
4. Alerts konfigurieren:
   - Unbekannte Trigger-Codes (alles außer P0001-P0006)
   - `user_invited_email_failed`-Häufung > 3/Stunde
   - SSE-Connection-Drops

### Better Stack
1. https://betterstack.com → Account
2. Uptime-Check auf `https://marktsync.dein-domain.de/auth/login` (alle 60 s)
3. SSL-Cert-Expiry-Alert

---

## 9. Pre-Pilot Disaster-Recovery-Drill (~2 h)

**Pflicht laut Lastenheft 5.7.** Vor dem ersten User-Pilot.

Siehe `docs/Disaster-Recovery.md` → „Drill 1: Pre-Pilot".

Kurz:
1. Test-Daten in Production-DB
2. Simulieren: 10 Aktionen löschen
3. PITR-Restore auf 5 Min vorher
4. Verifizieren: Funktionalität ok, Daten wiederhergestellt
5. **Zeit dokumentieren in `disaster-recovery-log.md`**

---

## 10. Smoke-Test nach Deployment

```bash
# Login
curl -X POST https://marktsync.dein-domain.de/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@dein-domain.de","password":"..."}' \
  -c /tmp/c.txt

# Markt-Liste
curl -b /tmp/c.txt https://marktsync.dein-domain.de/api/v1/markets?limit=3

# SSE
curl -b /tmp/c.txt -N https://marktsync.dein-domain.de/api/v1/events/stream
# sollte "event: connected" zeigen
```

---

## Backup-Strategie

### Stufe 1: Hetzner Storage Box (Pflicht)
```bash
# Auf der App-VM:
#!/bin/bash
TS=$(date +%Y%m%d-%H%M%S)
pg_dump $DATABASE_URL | gzip > /var/backups/marktsync/db-$TS.sql.gz
find /var/backups/marktsync -name 'db-*.sql.gz' -mtime +14 -delete
rsync -avz /var/backups/marktsync/ storagebox:/marktsync-backups/
```
Als `/etc/cron.daily/marktsync-backup`.

### Stufe 2: Off-Site (optional, ~3–5 €/Monat)
Wasabi S3 oder BackBlaze B2 via `rclone`, wöchentlich.

---

## Updates / neue Versionen

Coolify hat einen GitHub-Webhook. Push auf `main` → automatisches Deployment.

Bei Schema-Änderungen vorher manuell:
```bash
DATABASE_URL='postgresql://...' pnpm db:migrate
```

---

## Kostenübersicht (laufend)

| Posten | Kosten/Monat |
|---|---|
| Hetzner CPX21 VM | ~8 € |
| Hetzner Cloud Database Hobby | ~15 € |
| Domain bei INWX | ~1.25 € (15 €/Jahr) |
| Storage Box (Backup) | ~3 € |
| Resend Free Tier | 0 € (3k Mails/Monat) |
| Sentry Free Tier | 0 € |
| Better Stack Free Tier | 0 € |
| **Gesamt** | **~27 €/Monat** |

Optional Stufe-2-Backup (Wasabi/BackBlaze) +3–5 €/Monat.

---

## Wenn was schief geht

- Sentry zeigt Fehler in Echtzeit
- Coolify-Logs unter Applications → MarktSync → Logs
- Postgres-Logs im Hetzner Cloud Database Dashboard
- App-VM SSH-Login: `ssh root@<VM-IP>` → `docker logs <container>` (Coolify nutzt Docker)
- Disaster-Recovery-Runbook: `docs/Disaster-Recovery.md`
