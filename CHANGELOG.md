# Changelog: MarktSync-Spec

## v0.8 — 21. Mai 2026

**Anlass:** Erste Probe-Läufe der UI haben zwei Punkte aufgedeckt.

### UI-Wording: „Profi" raus

Das Wort „Profi" entwertet die normalen Vertriebler, die täglich mit der App arbeiten — sie fühlen sich dadurch als „Nicht-Profi". Daher wird das Wording im Frontend durchgängig auf **„Persönliches Gespräch"** umgestellt:

| Code-Begriff | Vorher (UI) | Jetzt (UI) |
|---|---|---|
| Status `rosa` | „Profi muss ran" | **„Persönliches Gespräch"** |
| Action `profi_visit` | „Profi-Besuch" | **„Persönliches Gespräch"** |
| Visit-Result `escalation` | „Marktleiter will Profi sehen" | **„Marktleiter will persönliches Gespräch"** |
| `profi_visit/success`-Button | „Profi-Besuch erfolgreich" | **„Gespräch erfolgreich"** |
| `profi_visit/declined`-Button | „Profi-Besuch final abgelehnt" | **„Gespräch abgelehnt (final)"** |

Code, DB-Enums und Variable-Names (`profi_visit`, `rosa`, `escalation`) bleiben unverändert. Es ist ein reines UI-String-Refactor.

### Reservation-Lifecycle: Auto-Aufheben bei eigener Aktion

Bug-Fix: Wenn User A einen Markt reservierte und dann selbst eine Aktion machte (z. B. visit → gelb), blieb die Reservierung weiter aktiv. Andere User sahen den Markt dann als „Gelb + reserviert von A" — irreführend, weil der nächste rein soll (z. B. Liefer-Fahrer).

**Fix:** In `lib/actions/insert.ts` wird im selben Transaktions-Block die aktive Reservierung des Aktierenden auf `active = FALSE` gesetzt. Ausnahme: `manual_override` (Admin-Eingriff, keine reguläre Aktion).

Reference.md erweitert um den Abschnitt „Reservation-Lifecycle: Auto-Aufheben bei eigener Aktion".

### Doku

- Reference.md: UI-Wording-Hinweis bei Status-Edge-Cases ergänzt
- Reference.md: neuer Abschnitt zur Reservation-Auto-Aufhebung
- CHANGELOG mit v0.8

### Was *noch* nicht in v0.8 ist
- Vollständiger Doku-Sweep („Profi"/„Eskalation" raus aus Lastenheft, Domain-Skill, UI-Skill, State-Diagram). Code-Begriffe bleiben — nur die Klartext-Beschreibungen werden noch nachgezogen. Folgt in einem nächsten Commit.

---

## v0.7 — 20. Mai 2026

**Anlass:** Auftraggeber liefert die finalen Markt-Listen. Scope wird konkretisiert und Schema an die Quell-Daten angepasst.

### Scope-Änderung

- **Vorher (v0.6):** „~200 Edeka-Märkte in Berlin"
- **Jetzt (v0.7):** Edeka-Familie + REWE in Berlin und Brandenburg, ca. 737 Märkte aus zwei Excel-Quellen.

**Marken im Scope:** Edeka, Edeka Center, NAH & GUT, NP-Markt, Marktkauf, Reichelt, REWE, REWE Center.

Hosting-Kosten bleiben unverändert (25–30 €/Monat), da Markt-Anzahl nicht der Kostentreiber ist. Bundesweite Erweiterung später ist möglich ohne Code-Refactor — nur weitere Daten-Importe.

### Schema-Änderung

- `market.street` + `market.house_number` → **`market.street_full`** (eine Spalte, max. 250 Zeichen). Begründung: Excel-Quellen führen Adressen ohnehin als ein Feld; ein automatischer Split bei Sonderformen wie „Ackerstr. 23-26/Invalidenstr. 158" wäre fehleranfällig. Die UI zeigt die Adresse sowieso als eine Zeile.
- `market.city` Default `'Berlin'` entfernt (jetzt explizit beim Import gesetzt, multi-region-fähig).
- Chain-Seeds: Netto Marken-Discount raus, dafür **NAH & GUT, NP-Markt, Marktkauf, Reichelt, REWE, REWE Center** dazu.

### Initial-Import (neu)

- `scripts/import-markets.ts`: liest beide Excel-Quellen, normalisiert Spalten, geocodet via Nominatim (1 Anfrage/Sekunde, kostenlos), schreibt in DB. Idempotent (Upsert über GLN). Skip-Report für nicht-geocodete Adressen.
- Quellen: REWE Ost 2018 (Berlin-Sheet + Brandenburg aus Ostdeutschland-Sheet) und Filialliste BB 2023 (Edeka-Familie in Berlin+Brandenburg).
- Datenstand REWE 2018 wird akzeptiert; Admins pflegen über „Neue Märkte"-Report und Markt-Editor nach.

### Doku

- Lastenheft 1.1, 2.1, 4.11 aktualisiert; Annahmen 49–51 ergänzt.
- README.md neuer Header und Initial-Beschreibung.

---

## v0.6.1 — 20. Mai 2026

**Anlass:** Konsistenz-Review vor Implementierungsstart. 15 Drift-Punkte zwischen Doku und Skills gefunden, alle adressiert.

### Skills nachgezogen

- `marktsync-data-model`: `MANUAL_OVERRIDE_APPLIED` → `MANUAL_OVERRIDE_PERFORMED` (war in v0.6 schon entschieden, aber Skill nicht migriert)
- `marktsync-data-model`: Postgres-Error-Mapping um P0005 (`MARKET_GREEN_INVALID_ACTION`) und P0006 (`USER_DEACTIVATED`) ergänzt, obsoleten P0099-Pfad entfernt
- `marktsync-data-model`: `batch-sync`-Konflikt-Reason auf strukturiertes Objekt umgestellt (`{expected_statuses, actual_status, action_type}`), alte String-Form (`EXPECTED_X_BUT_Y`) entfernt
- `marktsync-data-model`: `batch-sync`-Response-Buckets von drei (`synced`/`alreadySynced`/`conflicts`) auf zwei (`synced` + `conflicts`) reduziert — Idempotenz ist silent success im `synced`-Bucket
- `marktsync-domain`: Übergangs-Tabelle Grün-Verstoß-Code von P0001 auf P0005 korrigiert (war in v0.6 schon kanonisch, Skill noch alt). P0006-Zeile für inaktiven User ergänzt
- `marktsync-domain`: AUDIT_EVENTS-Reihenfolge an Reference.md angeglichen (mit Kategorisierungs-Kommentaren)

### Klarstellungen in Reference.md

- Trigger-Code-Tabelle bekommt eigene HTTP-Status-Spalte: alle Codes sind HTTP 409 beim Action-Insert. `MARKET_MERGED` ist beim `GET /markets/:id` 410 — Sonderfall explizit dokumentiert
- SSE-Event `reservation_changed` aus der Event-Typen-Tabelle gestrichen (war konzeptionell unklar, weil NOTIFY-Payload keine Reservation-Info trägt). Reservation-Änderungen laufen jetzt explizit über `market_updated` + REST-Refetch
- View `v_market_status` liefert **kein** `last_action_payload` — Begründung (Performance bei Listenansicht) und Implementierungs-Hinweis (separater Join im `GET /markets/:id`-Endpoint) ergänzt
- UI-Edge-Case-Tabelle bekommt Zeile für „Frisch reaktivierter Markt"; Reactivate-Verhalten explizit dokumentiert (View nimmt letzte Action vor Deaktivierung, kein Auto-Reset auf Grün)

### Lastenheft

- 4.5 Reporting-Dashboard: „Märkte ohne Aktivität >45 Tage" in Hänger-Liste ergänzt (war in 11.1 und API-Spec, fehlte im Hauptkapitel)
- 4.11 CSV-Import: Header um `contact_person` und `contact_phone` ergänzt, an API-Spec angeglichen
- 5.4 Sicherheit: `bcrypt` → `bcryptjs` (passt zur Package-Liste im Tech-Stack)

### User-Stories

- US-20: 45-Tage-Schwelle in Hänger-Liste ergänzt

### Tech-Stack

- Alert-Liste bereinigt: `P0099` (nie implementiert) raus, stattdessen „Unerwartete Trigger-Fehler außerhalb P0001–P0006" als Catch-All. `email_send_failed` → `user_invited_email_failed` (korrekter AUDIT_EVENT-Name)

### Was *nicht* geändert wurde (bewusst belassen)

- Audit-Event `market_updated` und NOTIFY-Channel `market_updated` heißen gleich. Verwirrend, aber kein technischer Konflikt — Audit-Event ist DB-Tabelle, Channel ist Pub/Sub. Umbenennen würde mehr Drift erzeugen als beheben.
- `next-pwa` + Next.js 15: bekannte Kompatibilitäts-Frage. Verifizierung kommt bei der Implementierung, nicht in der Spec.

---

## v0.6 — 19. Mai 2026 (Abend)

**Anlass:** Dritte externe Code-Review fand 25 Punkte. Großteil davon Doku-Konsistenz-Probleme zwischen 14 Dokumenten.

### Struktureller Fix

Neue Datei `docs/Reference.md` als **Single Source of Truth** für:
- Trigger-Fehler-Codes (P0001–P0006)
- Application-Konflikt-Codes (HTTP 409)
- Konflikt-Reason-Struktur (jetzt Objekt statt String)
- Postgres NOTIFY Channels — genau zwei: `market_updated` + `markets_bulk_updated`
- SSE Event Types
- Audit-Events (Const-Objekt)
- Konflikt-Bericht-Datenmodell (`report_id = audit_log.id`, keine separate Tabelle)
- CSV-Import-Modi
- UI-Anzeige-Edge-Cases
- SSE-Architektur (dedizierte DB-Connection außerhalb des Pools)
- DSGVO-Aufbewahrungsregeln

Andere Dokumente verlinken nur noch dorthin. Reduziert Drift bei zukünftigen Änderungen.

### Major-Entscheidungen

1. **Postgres-Channels einheitlich** — genau zwei: `market_updated` (Einzel) und `markets_bulk_updated` (Job-Bulk). `reservations_expired`, `cooldowns_expired` raus.
2. **AUDIT_EVENTS einheitlich** — `manual_override_performed` ist die Form (Past Participle). Tippfehler-Mismatch zwischen CLAUDE.md und Domain-Skill behoben. CLAUDE.md-Liste komplettiert.
3. **Trigger-Codes präzise** — Grün-Verstoß ist **P0005**, nicht P0001. P0001 nur für aktive Vorgänge (Gelb/Orange/Rosa). Alle Dokumente synchronisiert.
4. **CSV-Import mit zwei Modi** — `insert-only` (Default) + `upsert`. Endpoint + UI + Audit-Event.
5. **Manual Override auf Rot** — bleibt im Wertebereich, aber UI zeigt „Gesperrt durch Admin am `<Datum>` – Grund: `<reason>`" statt Cooldown-Datum. Frontend nutzt `last_action` aus `GET /markets/:id`.
6. **Konflikt-Bericht ohne eigene Tabelle** — `report_id = audit_log.id`. Resolution = zweiter Audit-Eintrag mit `linked_report_id`.
7. **Konflikt-Reason als Objekt** — `{expected_statuses: [...], actual_status, action_type}` statt String-Codes. Erlaubt `visit` mit zwei Vorgängern (Grün ODER Blau) sauber abzubilden.
8. **Inaktiver User → Trigger P0006** — sichert gegen Re-Aktivierungs-Edge-Case.

### Schema-Änderungen

- `audit_log` bekommt `CHECK`-Constraint auf erlaubte Event-Namen (statt nur Backend-Convention)
- Trigger `enforce_single_active_vorgang` prüft jetzt zusätzlich `user.active = true` (P0006)
- Reservation-Insert-Pattern als Pseudo-SQL-Block dokumentiert (Advisory Lock + Status-Check + Unique-Violation-Mapping)

### API-Änderungen

- `POST /actions/batch-sync` Response: `conflict` ist jetzt strukturiertes Objekt mit `expected_statuses[]`, `actual_status`, `action_type`. Bei Markt-Problemen: `{code: "MARKET_MERGED" | "MARKET_INACTIVE" | "USER_DEACTIVATED"}`.
- `POST /actions/report-conflict` Request-Body: `conflict_reason` → `conflict` (Objekt).
- `POST /admin/markets/import-csv` mit `mode`-Parameter (`insert-only` / `upsert`). Response: `imported`, `updated`, `skipped_duplicates`, `errors`.
- `GET /admin/markets/import-csv/template` für Download der CSV-Vorlage.
- `GET /markets/:id` 410-Response-Format spezifiziert: `error.code = MARKET_MERGED` + `error.merged_into_id` (UUID).
- `GET /markets/:id` liefert immer `last_action` mit (Type, Result, User, Timestamp, Payload) für UI-Edge-Cases.
- SSE: Auth-Validation auch bei Heartbeat, Event `session_expired` bei Ablauf.

### Test-Strategie

- Trigger-Codes pro verbotenem Übergang präzisiert (P0001 vs P0005)
- Auth/Authz-Test-Block neu: Field User → 403 für Admin-Endpoints und manual_override
- CSV-Import-Tests für beide Modi inkl. Idempotenz
- E2E-11: Admin löst Konflikt-Bericht auf
- E2E-12: Field User versucht manual_override → 403
- E2E-13: CSV-Upsert vs. insert-only
- E2E-14: UI bei „Rot ohne Cooldown"
- Pflicht-Test für `payload.problem_description` bei `control/problem`
- Pflicht-Test für P0006 (inaktiver User)

### Disaster Recovery

- **Off-Site Stufe 1 vs. Stufe 2 unterschieden:**
  - Stufe 1: Hetzner Storage Box in anderem Rechenzentrum (schützt gegen RZ-Ausfall)
  - Stufe 2 (optional): nicht-Hetzner-Backup (Wasabi/BackBlaze/Strato, ~3–5 €/Monat, schützt gegen Anbieter-Komplettausfall)
- Szenario 4 explizit: Hetzner-Anbieter-Komplettausfall, mit Vertragsklausel zum Restrisiko
- Drill 2 testet jetzt auch Stufe-2-Restore (falls aktiviert)

### Doku-Konsistenz

- CLAUDE.md komplett überarbeitet, verweist auf Reference.md
- Alle Dokumente: Channel-Namen einheitlich
- AUDIT_EVENTS-Liste in CLAUDE.md komplettiert
- State-Diagramm: Reservierung-Parallel-Dimension explizit erklärt
- Sequence-Diagramme: `pg_notify`-Stil bereinigt (kein `SELECT` mehr)
- API-Spec: alle Konflikt-Codes mit Trigger-Quelle in Tabelle
- Lastenheft: DSGVO-Aufbewahrungs­regelung explizit (Geo 90d, Action-Daten unbegrenzt als Geschäftsdokumentation)

### User-Stories

- US-19: Hinweis für „Rot ohne Cooldown"-UI + Event-Name fix
- US-23: erweitert um `insert-only`/`upsert`-Modi
- US-24: Konflikt-Inbox (Admin)

### Reviewer-Punkte einzeln (Mapping)

| # | Punkt | Status |
|---|-------|--------|
| 1 | AUDIT_EVENTS Inkonsistenz Skill vs CLAUDE.md | ✅ Behoben (`manual_override_performed`) |
| 2 | CLAUDE.md AUDIT_EVENTS-Liste unvollständig | ✅ Komplettiert |
| 3 | report-conflict Reason-Struktur unsauber | ✅ Strukturiertes Objekt |
| 4 | manual_override auf Rot ohne Cooldown UX-Loch | ✅ UI-Anzeige spezifiziert |
| 5 | pg_notify-Diagramm-Stil | ✅ `SELECT` raus |
| 6 | Trigger-Codes P0001 vs P0005 | ✅ Einheitlich P0005 für Grün |
| 7 | cancel_order auf Orange (Geschäftsregel) | ✅ Geht nur über manual_override, dokumentiert |
| 8 | Reservierung im State-Diagramm | ✅ Hinweis ergänzt |
| 9 | Reservation auf Gelb + delivery durch anderen | ✅ Dokumentiert: Reservation blockt keine Aktionen |
| 10 | Doppel-Reservierung Race | ✅ Reservation-Insert-Pattern spezifiziert |
| 11 | Resend-Mail mehrfach | ✅ Akzeptiert für 15 User, dokumentiert |
| 12 | DSGVO client_timestamp-Aufbewahrung | ✅ Lastenheft 5.5 ergänzt |
| 13 | report_id = audit_log.id | ✅ Explizit dokumentiert |
| 14 | CSV: Skip oder Upsert | ✅ Beide Modi |
| 15 | idx_market_postal | ✅ Drin (war Übersehen des Reviewers) |
| 16 | E2E-9 unvollständig | ✅ E2E-11 ergänzt |
| 17 | 410-Format spezifizieren | ✅ `merged_into_id` im Error-Body |
| 18 | SSE-Connection im Pool? | ✅ Außerhalb, einheitlich |
| 19 | Reconnect-Storm + Architektur | ✅ Reference.md → SSE-Architektur |
| 20 | Channel-Namen Wildwuchs | ✅ Genau zwei, kanonisch |
| 21 | „NUR TypeScript" widerspricht View | ✅ Formulierung präzisiert |
| 22 | DR: pg_dump auf Hetzner | ✅ Stufe 1 + Stufe 2 unterschieden |
| 23 | Validation: problem_description, Field-User-403 | ✅ Tests ergänzt |
| 24 | Inaktiver User + Offline-Actions | ✅ Trigger P0006 |
| 25 | UI „Rot ohne Cooldown" | ✅ US-19 + Reference.md spezifiziert |

---

## v0.5 — 19. Mai 2026

**Anlass:** Zweite externe Code-Review fand 24 Detail-Punkte. Alle adressiert.

### Major-Entscheidungen

1. **Gelb ist reservierbar** — Liefer-Fahrer kann gelben Markt für morgige Lieferung reservieren. Drei Dokumente hatten sich widersprochen; jetzt einheitlich.
2. **Status-Berechnung nur in TypeScript** — die SQL-Funktion `compute_resulting_status` wurde **entfernt**. War Doppel-Implementierung und damit Bug-Magnet. Backend ist Single Source of Truth.
3. **`cooldown_until = NULL` bei 0-Tage-Cooldowns** — verhindert Mikrosekunden-Race-Conditions. Backend setzt explizit NULL, nicht `NOW + 0`.
4. **manual_override `target_status` weiterhin Pflicht** — entweder Status explizit setzen oder gar nicht overriden. Kein „nur Cooldown abbrechen"-Sonderweg.
5. **Field User dürfen kein manual_override** — Admin-only. Field User-Workflow im Offline-Konflikt: „Verwerfen" oder „An Admin melden".

### Schema-Änderungen

- SQL-Funktion `compute_resulting_status()` ENTFERNT
- Trigger `enforce_single_active_vorgang` erweitert:
  - Eigener `pg_advisory_xact_lock` als Doppel-Schutz
  - Explizite Grün-Übergangs-Regeln (nur visit + manual_override)
  - Block auf gemergte Märkte → P0003
  - Block für `profi_visit` außer auf Rosa
  - Block für `cancel_order` außer auf Gelb
  - Block für `delivery` außer auf Gelb
  - Block für `control` außer auf Orange
  - Inaktiver Markt → P0004 (außer manual_override)
- `audit_log.event`: Check-Constraint auf bekannte Liste
- `action.client_id` für Offline-Idempotenz (unique pro user_id)
- `cooldown_until` explizit nullable, NULL bei 0 Tagen

### API-Änderungen

- Token-TTLs explizit: Setup 7d, Reset 1h
- `POST /api/v1/admin/markets/import-csv` für CSV-Import
- `GET /api/v1/reports/new-markets` für Admin-Dubletten-Kontrolle
- `client_timestamp` bei normalem Action-Endpoint optional, im batch-sync Pflicht
- HTTP 410 für `MARKET_MERGED` mit `merged_into_id` in Response
- HTTP 403 wenn Field User `manual_override` versucht
- HTTP 207 Multi-Status im batch-sync mit synced/already_synced/conflicts
- SSE: `session_expired`-Event bei Heartbeat mit abgelaufener Session
- NOTIFY-Payload klein halten (8KB-Limit, nur IDs + Status)
- Bulk-NOTIFY für Background-Jobs (statt N Einzel-NOTIFYs)

### Job-Änderungen

- `broadcast_cooldown_expiry`: stündlich → **alle 5 Minuten** (Latenz max 5min ist akzeptabel)
- `expire_reservations`: idempotent, holt alle `valid_until <= NOW`, Bulk-NOTIFY
- Latenz-Konvention klargestellt: <5s nur für User-Aktionen, Cooldown-Ablauf max 5min OK

### Test-Strategie

- SSE-Tests als eigene Suite (Reconnect, Heartbeat, Multi-Tab, Session-Expiry, Bulk-Events)
- Trigger-Übergangs-Tests vollständig (alle erlaubten + verbotenen Übergänge)
- Konkurrenz-Tests mit parallelen Action-Inserts
- CSV-Import-Tests inkl. Idempotenz

### Disaster Recovery

- **Zwei Pflicht-Drills:** Pre-Pilot (vor 5-User-Pilot) und Pre-Rollout (vor 15-User-Full)
- Drill-Log-Vorlage in Runbook
- Off-Site-Backup zu Hetzner Storage Box

### Doku-Änderungen

- Lastenheft v0.4 → v0.5
- State-Diagramm: Grün-Übergänge explizit, Reservierbarkeits-Spalte
- Activity-Diagramme: cooldown_until=NULL bei 0 Tagen sichtbar
- ER-Diagramm: client_id, Token-TTLs, Audit-Event-Liste
- Sequence-Diagramme: SSE-Auth-Flow, Bulk-NOTIFY, Job-Frequenzen
- API-Spec: alle Fehler-Codes, neue Endpoints
- User-Stories: US-22 (Neue-Märkte-Reporting), US-23 (CSV-Import), US-10 erweitert (Gelb reservierbar)
- CLAUDE.md vollständig überarbeitet
- Skills `marktsync-domain` und `marktsync-data-model` aktualisiert
- Test-Strategy mit SSE-Block und Übergangs-Block
- Disaster-Recovery mit Drill-Spec

### Reviewer-Punkte einzeln (Mapping)

| # | Punkt | Status |
|---|-------|--------|
| 1 | cancel_order in Trigger-Regeln nicht verankert | ✅ Trigger fixt, nur auf Gelb erlaubt |
| 2 | Gelb-Markt reservierbar? Widerspruch | ✅ Ja, durchgängig dokumentiert |
| 3 | client_timestamp Pflicht oder optional? | ✅ Optional bei online, Pflicht in batch-sync |
| 4 | Cooldown-Broadcast-Frequenz vs. Latenz | ✅ Alle 5 Min, Latenz-Konvention klargestellt |
| 5 | expire_reservations Idempotenz | ✅ Dokumentiert |
| 6 | manual_override ohne target_status | ✅ Pflicht beibehalten |
| 7 | Admin setzt fremde Reservierung | ✅ Out of Scope |
| 8 | cooldown_until = 0 vs NULL | ✅ NULL bei 0 Tagen |
| 9 | Grün-Übergänge im Trigger | ✅ Explizit |
| 10 | profi_visit nur auf Rosa | ✅ Im Trigger enforced |
| 11 | Insert auf gemergten Markt | ✅ Trigger blockt, P0003 |
| 12 | Token-TTLs inkonsistent | ✅ Setup 7d, Reset 1h |
| 13 | manual_override auf Rot dauerhaft | ✅ By Design dokumentiert |
| 14 | NOTIFY pro Markt vs Bulk | ✅ Bulk für Job-Events |
| 15 | Doppel-Implementierung Status-Logik | ✅ SQL-Funktion entfernt |
| 16 | Advisory Lock nur im Backend | ✅ Trigger nimmt Lock nochmal |
| 17 | NOTIFY-Payload-Limit | ✅ Konvention dokumentiert |
| 18 | SSE Session-Expiry | ✅ Heartbeat-Validation |
| 19 | SSE-Tests | ✅ Eigene Suite |
| 20 | Pre-Go-Live-Drill | ✅ Zwei Drills (Pre-Pilot + Pre-Rollout) |
| 21 | Initialdatenbestand | ✅ CSV-Import-Endpoint |
| 22 | Neue-Märkte-Übersicht | ✅ Reporting-Endpoint |
| 23 | Audit-Events VARCHAR | ✅ Check-Constraint + Const-Object |
| 24 | Resend-Fehler-Handling | ✅ Audit-Log + UI-Warnung |

---

## v0.4 — 19. Mai 2026 (früher am Tag)

**Anlass:** Erste externe Code-Review fand 22 kritische Inkonsistenzen.

### Status-Modell

- 7 Status (gruen, blau, gelb, orange, rosa, rot, grau) durchgängig konsolidiert
- Bestätigt: Berechnung über letzte Action + Reservation, nicht in `market` gespeichert

### Cooldown als Snapshot

- `action.cooldown_until` einmalig gesetzt
- `cooldown_rule`-Änderungen wirken nur auf neue Aktionen

### Konkurrenz-Schutz

- DB-Trigger `enforce_single_active_vorgang`
- `pg_advisory_xact_lock(market_id)` im Backend

### GLN Partial Unique

- `WHERE active = TRUE AND merged_into_id IS NULL`

### Markt-Merge

- `merged_into_id` Feld
- Notes + Actions umgehängt
- Reservierung aufgehoben

### Realtime

- PostgreSQL LISTEN/NOTIFY + Server-Sent Events
- WebSocket explizit verworfen

### DSGVO

- AV-Vertrag, Joint-Controller-Agreement, Mitarbeiter-Information
- Haftungsklausel im Vertrag
- Geo-Anonymisierung nach 90 Tagen

### Test- und DR-Strategie

- Test-Pyramide mit konkreten Szenarien
- Disaster-Recovery-Runbook mit Drill

### Stack-Wahl

- Hetzner Managed Postgres (statt selbst gehosteter Postgres)

---

## v0.3 — 18. Mai 2026

**Anlass:** Erstkonzeption nach mehreren Gesprächen mit Auftraggeber.

- Initiale Spec
- Tech-Stack-Entscheidung (Next.js + Postgres + Hetzner)
- Erste Datenmodell-Skizze
- 6 Status (vor 7-Status-Refactoring in v0.4)
