# Disaster Recovery Runbook: MarktSync (v0.6)

Was tun, wenn was kaputt geht. Mit zwei Pflicht-Drills vor Go-Live.

## Ziele

- **RTO** (Recovery Time Objective): 4 Stunden bei Komplettausfall
- **RPO** (Recovery Point Objective): max. 1 Stunde Datenverlust

## Architektur (Recap)

- **App**: Hetzner Cloud VM CPX21, Next.js via Coolify
- **DB**: Hetzner Cloud Database (Managed Postgres) mit Point-in-Time-Recovery
- **DNS**: Domain bei INWX
- **Backups**:
  - Postgres: automatische PITR durch Hetzner (7 Tage)
  - Code: GitHub-Repo
  - Off-Site Stufe 1: tägliche pg_dumps zu **Hetzner Storage Box in einem anderen Rechenzentrum** (Bsp.: App+DB in Falkenstein, Storage Box in Helsinki). Zu konfigurieren beim Anlegen der Storage Box.
  - Off-Site Stufe 2 (optional, für Komplett-Anbieter-Ausfall): wöchentliche Kopie zu einem nicht-Hetzner-Anbieter (z. B. Wasabi S3, BackBlaze B2, Strato HiDrive). Aufpreis ~3–5 €/Monat. **Empfehlung: aktivieren** wenn Auftraggeber gegen Anbieter-Risiko absichern will.

## Szenarien

### Szenario 1: App-VM down
Symptome: Website nicht erreichbar.
1. Hetzner Console: VM-Status
2. Reboot versuchen
3. Bei Erfolg: Coolify-Login, App neu starten
4. Bei nicht recoverable: neue VM aufbauen

**Erwartete Zeit:** 15–30 Min bei Reboot, 1–2h bei Neuaufbau.

### Szenario 2: Daten beschädigt
1. App-Traffic stoppen
2. Hetzner Cloud Database Console → PITR
3. Restore-Zeitpunkt wählen (max. 7 Tage zurück)
4. Connection-String anpassen
5. App neu starten

**Erwartete Zeit:** 1–3h.

### Szenario 3: Hetzner-Rechenzentrum-Ausfall (Standort)
Einzelnes Hetzner-RZ ist down (z. B. Falkenstein), Hetzner als Anbieter aber funktional.
1. Hetzner-Status überwachen
2. User informieren
3. Bei Ausfall > 2h: Failover zu anderem Hetzner-Standort
4. Off-Site Stufe 1 Backup (anderes RZ) einspielen
5. DNS umstellen

**Erwartete Zeit:** 4h.

### Szenario 4: Hetzner als Anbieter komplett ausgefallen
Sehr seltener Fall (z. B. Cyberangriff auf alle Hetzner-RZ gleichzeitig, Hetzner-Insolvenz mit Datenverlust).
1. Off-Site Stufe 2 Backup (nicht-Hetzner) einspielen — nur möglich wenn vorher konfiguriert
2. Neuen Anbieter aufsetzen (z. B. Cloudways, eigenen Server)
3. Wenn Stufe 2 *nicht* aktiviert war: Datenverlust ab dem Zeitpunkt der letzten Wochen-Kopie zu nicht-Hetzner. RPO-Verletzung wird in dem Fall hingenommen.

**Erwartete Zeit:** 8–24h. Außerhalb des regulären RTO. Auftraggeber wird auf dieses Restrisiko explizit hingewiesen.

### Szenario 5: GitHub-Repo verloren
Quellcode lokal aus Coolify-VM via SSH ziehen. Coolify hat Git-History.

## Tägliche Backup-Routine

```bash
#!/bin/bash
# /etc/cron.daily/marktsync-backup
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR=/var/backups/marktsync

pg_dump $DATABASE_URL | gzip > $BACKUP_DIR/db-$TIMESTAMP.sql.gz
find $BACKUP_DIR -name 'db-*.sql.gz' -mtime +14 -delete

# Off-Site Stufe 1: Hetzner Storage Box in anderem RZ
rsync -avz $BACKUP_DIR/ storagebox:/marktsync-backups/
```

## Wöchentliche Off-Site-Stufe-2-Routine (optional, falls aktiviert)

```bash
#!/bin/bash
# /etc/cron.weekly/marktsync-offsite
TIMESTAMP=$(date +%Y%m%d)
LATEST_DUMP=$(ls -t /var/backups/marktsync/db-*.sql.gz | head -1)

# Beispiel mit Wasabi S3 via rclone
rclone copy "$LATEST_DUMP" wasabi:marktsync-offsite/db-$TIMESTAMP.sql.gz
```

## Backup-Verification (monatlich)

1. Aktuellsten Off-Site-Backup auf lokale Test-DB
2. Schema vorhanden? Markt-Anzahl plausibel? Login funktioniert?
3. Restore-Zeit messen, dokumentieren

## Coolify-Config-Export

```bash
coolify export-config > /var/backups/coolify-config-$(date +%Y%m%d).yaml
```
Wöchentlich in Off-Site-Backup.

## VM-Neuaufbau

1. Neue Hetzner VM (CPX21, Ubuntu 24.04 LTS)
2. DNS A-Record noch nicht umstellen
3. Coolify installieren: `curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash`
4. Config importieren
5. App-Repo in Coolify (GitHub-Webhook)
6. DB-Connection-String in Env-File
7. Erstes Deployment
8. Smoke-Test
9. DNS umstellen (kleine TTL vorher setzen)
10. Sentry + Better Stack auf neuen Server

## Sofortmaßnahmen-Checkliste

```
[ ] Problem identifizieren (Sentry, Better Stack, User-Meldung)
[ ] Auftraggeber kurz informieren
[ ] Maintenance-Banner (falls möglich)
[ ] Hetzner Status checken
[ ] Runbook-Szenario durchgehen
[ ] Nach Wiederherstellung: Smoke-Test
[ ] Auftraggeber-Update + Post-Mortem
```

## Pflicht-Drills

### Drill 1: Pre-Pilot (vor 5-User-Pilotbetrieb)

**Wann:** Spätestens 1 Woche vor Pilot-Start.
**Wer:** Auftragnehmer.
**Dauer:** ~2h.

**Schritte:**
1. Produktionsähnliche Testdaten in DB
2. Simulieren: bestimmte Tabelle „kaputt" markieren (z. B. 10 Actions versehentlich gelöscht)
3. PITR auf 5 Min vorher
4. App-Funktionalität verifizieren
5. **Zeit dokumentieren** in `disaster-recovery-log.md`
6. Wenn länger als 4h: Setup überdenken

**Bestanden:** Recovery < 4h, App nach Restore funktional, alle Funktionen verifiziert.

### Drill 2: Pre-Rollout (vor Full-Rollout)

**Wann:** Nach Pilot, vor Rollout an alle ~15 User.
**Wer:** Auftragnehmer + (optional) Auftraggeber-IT.
**Dauer:** ~3h.

**Schritte:**
1. Aktueller Pilot-Stand der DB als Ausgangsbasis
2. Vollständiges Szenario 1 durchspielen (App-VM down + Neuaufbau)
3. Vollständiges Szenario 2 durchspielen (PITR)
4. **Wenn Off-Site Stufe 2 aktiviert:** Probe-Restore aus Stufe-2-Backup
5. Smoke-Test mit Pilot-User-Accounts
6. **Zeit dokumentieren** in `disaster-recovery-log.md`
7. Bei Auffälligkeiten: Bugfix vor Rollout

**Bestanden:** Beide Szenarien < 4h, keine Datenverluste über RPO hinaus.

## Logging-Vorlage `disaster-recovery-log.md`

```
## Drill-Lauf [Datum]
- Typ: Pre-Pilot / Pre-Rollout / Real
- Szenario: 1/2/3/4/5
- Start: [Zeit]
- Recovery komplett: [Zeit]
- Dauer: [X Stunden]
- Datenverlust: [Y Minuten / keine]
- Auffälligkeiten:
- Verbesserungen:
```

## Restrisiko: Anbieter-Komplettausfall

Falls Off-Site Stufe 2 nicht aktiviert wurde, akzeptiert der Auftraggeber das Restrisiko eines Hetzner-Anbieter-Komplettausfalls. Dies sollte beim Vertragsabschluss schriftlich festgehalten werden:

> *Der Auftraggeber wurde auf das Restrisiko eines Hetzner-Anbieter-Komplettausfalls hingewiesen. Eine Off-Site-Datensicherung bei einem unabhängigen Cloud-Anbieter (zusätzlicher Kostenpunkt ~3–5 €/Monat) ist [aktiviert / nicht aktiviert]. Bei Nicht-Aktivierung trägt der Auftraggeber das Risiko des Datenverlusts in diesem Szenario.*

## Kontakte

- **Hetzner Support**: support@hetzner.com, 24/7
- **Coolify Discord**: https://coollabs.io
- **Auftragnehmer (Vullnet)**: vullnet@vazi.dev, [Telefon]
- **Auftraggeber Notfall-Kontakt**: [eintragen]
