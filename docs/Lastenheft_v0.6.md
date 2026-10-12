# Lastenheft: Edeka-Koordinations-Tool (MarktSync)

**Projektname:** MarktSync (Arbeitstitel)
**Auftraggeber:** [Kundenname einfügen] + Partnerunternehmen [Name einfügen]
**Auftragnehmer:** vazi Holding UG (i. Gr.), Vullnet Ajvazi
**Dokumentversion:** 0.6 (Entwurf nach dritter Code-Review)
**Datum:** 19. Mai 2026

---

## 1. Ausgangslage und Zielsetzung

### 1.1 Situation heute
Zwei Unternehmen betreuen gemeinsam Lebensmittel-Märkte in Berlin und Brandenburg – beide vertreiben und liefern. Touren werden separat geplant. Bestellungen werden über JTL auf iPads erfasst.

**Marken im Scope:** Edeka, Edeka Center, NAH & GUT, NP-Markt, Marktkauf, Reichelt (Edeka-Familie) sowie REWE und REWE Center. Initialer Bestand ca. 737 Märkte aus zwei Lieferanten-Listen.

Probleme:
- **Doppelbesuche** ohne gegenseitiges Wissen
- **Fehlende Übersicht nach Lieferungen** (Aufstellungs-Kontrolle)
- **Eskalationsfälle nicht koordiniert** – erfahrene Kollegen wissen nicht, dass sie gefragt sind
- **Verlorenes Wissen** über Marktleiter, Lieferzeiten, Besonderheiten

### 1.2 Zielsetzung
Gemeinsames Status-Board, das beide Teams in Echtzeit synchron hält.

### 1.3 Erfolgskriterien
- Reduktion von Doppelbesuchen auf nahezu null
- Höhere Marktabdeckung pro Woche
- Schnellere Kontrolle nach Lieferungen
- Eskalationsfälle werden zuverlässig vom übernehmenden Kollegen erledigt

---

## 2. Geltungsbereich

### 2.1 Im Scope
- Edeka-Familie + REWE in Berlin und Brandenburg als Startbestand (~737, initial via Excel-Import)
- Mehrketten-fähiges Datenmodell (Erweiterung auf bundesweit später nur per Daten-Import, kein Code-Refactor)
- Markt-Anlage durch Admin + Field User (mit Dubletten-Warnung)
- Maximal ~15 Nutzer
- Geteilte Datensicht zwischen beiden Firmen
- Sprache: ausschließlich Deutsch

### 2.2 Nicht im Scope
- Zentrale Tourenplanung
- Bestell-/Auftragserfassung (läuft über JTL)
- Native Mobile Apps
- JTL-Integration
- Reklamationsmanagement
- Fotos
- Mehrsprachigkeit
- Web Push (Phase 2)
- Admin macht für andere User eine Reservierung (Out of Scope MVP)

---

## 3. Nutzer und Rollen

| Rolle | Beschreibung | Geräte |
|-------|--------------|--------|
| Field User | Vertriebler (inkl. Senior) und Liefer-Fahrer beider Firmen | Smartphone primär |
| Admin | Verwaltet User, Märkte, Cooldowns, Reporting | Desktop primär |

**Keine separate technische Senior-Rolle.** Wer Rosa-Märkte (persönliche Gespräche) übernimmt, wird operativ geregelt. Reports nutzen `action.user_id` zur Auswertung.

---

## 4. Funktionale Anforderungen

### 4.1 Status-Modell

7 Status, berechnet aus `action.resulting_status` + `action.cooldown_until` der letzten Aktion. Details siehe `docs/diagrams/state-diagram-market-status.md`.

| Farbe | Bedeutung |
|-------|-----------|
| 🟢 Grün | Frei |
| 🔵 Blau | Reserviert (Parallel-Dimension) |
| 🟡 Gelb | Vertrieb war da, wartet auf Lieferung |
| 🟠 Orange | Geliefert, Kontrolle nötig |
| 🩷 Rosa | Persönliches Gespräch nötig (Eskalation) |
| 🔴 Rot | Cooldown läuft |
| ⚫ Grau | Inaktiv |

**Status nie nur über Farbe** – immer mit Icon + Text.

### 4.2 Aktionstypen

Siehe `docs/diagrams/state-diagram-market-status.md` und `docs/database-schema.sql`. Trigger-Regeln dort vollständig tabelliert.

### 4.3 Cooldown-Regeln (Admin-konfigurierbar)

- Snapshot pro Action in `action.cooldown_until`
- `duration_days = 0` → `cooldown_until = NULL` (Konvention)
- Spätere Änderungen wirken nur auf neue Aktionen

### 4.4 Geschäftsregel: Ein Vorgang pro Markt

Durchgesetzt durch:
1. DB-Trigger `enforce_single_active_vorgang` (nimmt selbst Advisory Lock)
2. Backend nutzt `pg_advisory_xact_lock(market_id)` zusätzlich

Insert auf gemergte Märkte wird blockiert. Manual Override darf immer.

### 4.5 Hauptansichten

#### Karten-Übersicht
- Alle Märkte als farbige Marker (OpenStreetMap/Leaflet)
- Filter: Status, Kette, eigene Aktivität, Rosa-Only

#### Listen-Übersicht
- Suche (Name, Adresse, PLZ, GLN)
- Sortierung: Entfernung, zuletzt angefasst, Status
- Cursor-basierte Pagination

#### Markt-Detailansicht
- Name, Adresse, Kette, GLN, Telefon
- Aktueller Status + Icon + Text
- Button „Navigieren" (Deep-Link zu Maps-App)
- Aktions-Buttons je nach Status
- Bei Gelb: Button „Bestellung storniert" mit Pflicht-Notiz
- Notizen + Historie
- Bei gemergtem Markt (alte URL): Redirect zum Primary

#### Admin-Bereich
- Nutzerverwaltung (Einladungs-Mail, „Einladung nicht zugestellt"-Anzeige bei Mail-Fehler)
- Marktstammdaten
- Cooldown-Konfiguration
- Reporting-Dashboard

#### Reporting-Dashboard
- Wochenübersicht
- Coverage pro Bezirk
- „Hänger"-Liste: Rosa >14 Tage, Gelb >21 Tage, Märkte ohne Aktivität >45 Tage
- **„Neue Märkte"-Liste**: Märkte der letzten 30 Tage, sortiert nach Datum, mit Dubletten-Hinweis

### 4.6 Realtime-Sync
- PostgreSQL LISTEN/NOTIFY + Server-Sent Events
- Latenz-Ziel: **< 5 Sekunden für User-getriggerte Aktionen** (visit, delivery, control, cancel_order, manual_override)
- Für **System-Updates** (Reservation-Ablauf, Cooldown-Ablauf): Toleranz bis zu 1 Min (Reservation) bzw. 5 Min (Cooldown)
- Browser-Auto-Reconnect via EventSource
- Heartbeat alle 30s, inkl. Auth-Validierung
- NOTIFY-Payload klein, Frontend refetcht Details über REST
- Bulk-Updates (Reservierungs-Ablauf um 23:59) als ein Batch-Event statt N Einzelevents

### 4.7 Geolokation
- Browser holt Position
- **Backend** berechnet Entfernung (nicht der Client)
- Bei >300m: Warnung (nicht Block)
- DSGVO-Anonymisierung nach 90 Tagen (Background-Job, idempotent)

### 4.8 Offline-Fähigkeit (PWA)
- Aktionen offline möglich, IndexedDB
- `client_id` als Idempotenz-Key (UUID vom Client)
- Sync via `POST /actions/batch-sync` bei Wiederverbindung
- Konflikt-Behandlung: Backend prüft erwarteten Vorgänger-Status
- Konflikt-Codes pro Action-Type definiert (siehe API-Spec)
- Doppel-Sync gleicher `client_id`: idempotent ignoriert

### 4.9 Benachrichtigungen
**MVP:**
- E-Mail (Resend): Setup-Einladung, Passwort-Reset
- Bei Mail-Fehler: Audit-Log-Eintrag, Admin sieht „Nicht zugestellt"
- SSE für aktive Sessions

**Phase 2:** Web Push für Vertriebler bei `delivery`

### 4.10 Background-Jobs
Drei idempotente Cron-Jobs:
1. **expire_reservations** (jede Minute): Reservierungen ablaufen lassen. Bei Skip → beim nächsten Lauf nachgeholt. Max. 1 Min Verzögerung.
2. **broadcast_cooldown_expiry** (alle 5 Minuten): NOTIFY für Märkte mit gerade abgelaufenem Cooldown. Idempotent.
3. **anonymize_old_geo** (täglich nachts): Geo älter als 90 Tage nullen. Idempotent.

### 4.11 Initialer Datenbestand und Updates
~737 Märkte (Edeka-Familie + REWE in Berlin und Brandenburg) werden initial via **Excel-Import-Skript** (`scripts/import-markets.ts`) eingespielt. Quellen: zwei vom Auftraggeber gelieferte Excel-Listen (REWE Ost 2018 + Filialliste BB 2023).

**Daten-Felder:** `chain`, `name`, `gln`, `street_full` (Straße + Hausnummer in einem Feld), `postal_code`, `city`, `district`, `lat`, `lng`, `contact_person`, `contact_phone`. Adresse als ein Feld, weil die Quell-Listen sie so führen und ein automatischer Split fehleranfällig wäre (z. B. „Ackerstr. 23-26/Invalidenstr. 158").

**Geo-Koordinaten:** Werden beim Import per Nominatim/OpenStreetMap aus Adresse + PLZ + Ort geocodet (gratis, ~1 Anfrage/Sekunde). Adressen ohne Treffer landen im Skip-Report und werden vom Admin manuell nachgepflegt.

**Zwei Modi:**
- `insert-only` (Default): GLN-Konflikte werden geskippt. Sicher für Erst-Befüllung.
- `upsert`: Bestehende Märkte werden über GLN als Key aktualisiert. Geeignet für regelmäßige Datenpflege-Updates aus Kunden-Excel.

Admin wählt den Modus im Upload-UI. CLI-Skript hat Parameter `--mode=insert-only|upsert`.

---

## 5. Nicht-funktionale Anforderungen

### 5.1 Benutzerfreundlichkeit
- Max. 2 Taps zur häufigsten Aktion
- Buttons ≥ 48×48 px
- Klartext statt Fachbegriffe
- Status: Icon + Text + Farbe
- Rückgängig-Funktion 30s nach Aktion
- Onboarding-Tutorial beim ersten Login
- Deutsch only

### 5.2 Performance
- LCP < 2 Sekunden auf 4G
- User-Aktion → Sichtbarkeit < 5 Sek bei anderen
- Karte mit ~200 Markern flüssig
- Cursor-Pagination bei allen Listen

### 5.3 Verfügbarkeit
99 % Uptime. Wartungsfenster außerhalb Geschäftszeiten.

### 5.4 Sicherheit
- HTTPS via Let's Encrypt
- Passwörter: bcryptjs (pure-JS-Implementierung, vereinfacht Deployment ohne native Module)
- Sessions: HttpOnly + Secure + SameSite=Lax
- Token-Hashing in DB (SHA-256)
- **Token-TTLs:** Setup 7 Tage, Reset 1 Stunde
- Rate Limits siehe API-Spec
- SSE-Auth-Validation bei jedem Heartbeat

### 5.5 Datenschutz / DSGVO
- Server-Standort Deutschland (Hetzner)
- Verschlüsselte Backups
- Datensparsamkeit

**Aufbewahrungsregeln** (Details in `docs/Reference.md` → DSGVO):
- **Geo-Daten** (`geo_lat`, `geo_lng`, `distance_to_market_meters`): nach 90 Tagen anonymisiert (auf NULL gesetzt) durch täglichen Job
- **Action-Zeitstempel** (`client_timestamp`, `created_at`) und **`user_id`**: unbegrenzt aufbewahrt als Geschäftsdokumentation („Wer hat wann was gemacht"). Diese sind im engeren DSGVO-Sinne *Geschäftsdaten*, kein Bewegungsprofil – das ist die mit dem Geo-Anonymisierungs-Schritt klar abgegrenzte sensitive Datenklasse
- **Audit-Log**: unbegrenzt aufbewahrt (Compliance/Nachvollziehbarkeit)

Bei Auskunftsanfrage Betroffener: Geo-Daten sind nach 90 Tagen weg, Action-Daten bleiben als Geschäftsdokumentation. Begründung dokumentierbar.

**Pflichten Auftraggeber vor Pilot:**
- Mitarbeiter über Geo-Erfassung informieren
- Bei Betriebsrat: Mitbestimmung
- Datenschutzbeauftragte abstimmen
- Joint-Controller-Agreement mit Partner

**Haftungsklausel** (Vertragsbestandteil):
> *Der Auftraggeber stellt sicher, dass alle datenschutzrechtlichen und mitbestimmungsrechtlichen Voraussetzungen für den Einsatz des Tools – insbesondere zur Erfassung von Standortdaten der Nutzer sowie zur Datenteilung mit dem Partnerunternehmen – erfüllt sind. Der Auftragnehmer übernimmt hierfür keine Haftung.*

### 5.6 Test-Strategie
Siehe `docs/Test-Strategy.md`. Kurzfassung: Unit + Integration + E2E. Coverage-Ziel 75 % auf Geschäftslogik. SSE-Tests als eigene Gruppe (Reconnect, Heartbeat, Multi-Tab, LISTEN-Cleanup).

### 5.7 Disaster Recovery
Siehe `docs/Disaster-Recovery.md`. RTO 4h, RPO 1h.
- Drill **vor Pilotbetrieb** (5 User): Pflicht
- Drill **vor Full-Rollout**: Pflicht
- Hetzner Managed Postgres mit PITR

### 5.8 Zeitstempel-Konvention
- DB speichert `TIMESTAMPTZ` in UTC
- API gibt UTC zurück mit `Z`-Suffix
- Frontend zeigt Europe/Berlin
- „Tagesende Berlin" berechnet via `date-fns-tz`

### 5.9 Browser-Support
Aktuelle Chrome, Firefox, Safari, Edge. iOS Safari ab 15, Android Chrome ab 100.

---

## 6. Technische Rahmenbedingungen

### 6.1 Plattform
Progressive Web App, mobile-first.

### 6.2 Stack
Siehe `docs/Tech-Stack.md`.

### 6.3 Hosting
- **App**: Hetzner Cloud CPX21 + Coolify (~8 €/Monat)
- **DB**: Hetzner Cloud Database mit PITR (~15 €/Monat)
- **Domain**: ~15 €/Jahr
- **E-Mail**: Resend (Free Tier)
- **Gesamt**: ~25–30 €/Monat

### 6.4 Authentifizierung
- Auth.js mit Email-Provider
- Setup- und Reset-Flow über `password_reset_token`-Tabelle

### 6.5 Monitoring
- Sentry für Frontend + Backend
- Better Stack für Uptime
- Alarme an Auftragnehmer

### 6.6 Schnittstellen
- Keine externen Schnittstellen im MVP
- Felder für zukünftige Anbindungen: `external_id`, `synced_at`
- JTL-Integration nicht im Scope

---

## 7. Datenmodell

Siehe `docs/diagrams/er-diagram.md` und `docs/database-schema.sql`. Kerntabellen:
- `company`, `user`, `password_reset_token`
- `chain`, `market` (Soft-Delete, Merge-Unterstützung)
- `action` (mit `resulting_status`, `cooldown_until`, `client_id` als Idempotenz-Key)
- `note`, `reservation`, `cooldown_rule`, `audit_log`

**Wichtige Regeln:**
- Status berechnet, nicht gespeichert
- `resulting_status` und `cooldown_until` als Snapshots
- `cooldown_until = NULL` = kein Cooldown (Konvention)
- 1 Vorgang pro Markt via Trigger + Advisory Lock
- Status-Berechnung **nur in TypeScript** (`computeResultingStatus`), keine SQL-Funktion
- Audit-Events aus TypeScript-Const-Liste

---

## 8. User Stories
Siehe `docs/User-Stories.md`. 21 Stories mit Akzeptanzkriterien.

---

## 9. Lieferumfang
- Vollständiger Quellcode
- Drizzle-Schema + Migrations
- CSV-Import-Skript für initiale Marktdaten (~200 Berliner Edeka)
- Deployment-Anleitung
- Bedienungsanleitung (PDF) für Endnutzer
- Admin-Handbuch (PDF)
- Test-Suite (Unit + Integration + E2E)
- Disaster-Recovery-Runbook
- 30 Tage kostenlose Bug-Behebung nach Go-Live

---

## 10. Pricing & Vertragsmodell

- **Einmalige Entwicklung**: Festpreis nach Angebot
- **Hosting**: Auftraggeber, ~25–30 €/Monat
- **Wartung**: Retainer 150 €/Monat für 2h inkl., darüber 100 €/h. Alternativ ad-hoc.
- **Quellcode**: Übergabe nach Schlussrechnung

---

## 11. Geklärte Annahmen und offene Punkte

### 11.1 Geklärte Annahmen

| # | Punkt | Entscheidung |
|---|-------|--------------|
| 1 | Marktstammdaten | CSV-Import-Skript, Auftragnehmer pflegt initial ein |
| 2 | Mehrketten | Unterstützt im Datenmodell |
| 3 | Markt-Anlage durch Field User | Erlaubt, mit Dubletten-Warnung |
| 4 | Liefer-Fahrer | Eigene Mitarbeiter beider Firmen |
| 5 | Initialer Admin | Pilot: Auftragnehmer; danach Kunde |
| 6 | Farbe „Kontrolle" / „Eskalation" | Orange / Rosa |
| 7 | Bestellungen | Über JTL, nicht in der App |
| 8 | JTL-Integration | Nicht im Scope |
| 9 | Nutzerzahl | Max. ~15 |
| 10 | Sprache | Deutsch only |
| 11 | Fotos | Nicht im Scope |
| 12 | Cooldown-Regeln | Admin-editierbar, Snapshot pro Action |
| 13 | Stale-Reporting | Rosa >14d, Gelb >21d, Untouched >45d |
| 14 | Storno-Funktion | Button mit Pflicht-Notiz, nur auf Gelb |
| 15 | 1 Vorgang pro Markt | Trigger + Advisory Lock (beide Schichten) |
| 16 | Beziehungspflege-Besuche | Nur als Notiz |
| 17 | GLN | Pflichtfeld, partial unique |
| 18 | Realtime | SSE + LISTEN/NOTIFY |
| 19 | Web Push | Phase 2 |
| 20 | Geo-Anonymisierung | Job nach 90 Tagen, idempotent |
| 21 | Markt-Merge | Notes + Actions umhängen, merged_into_id |
| 22 | Senior-Tracking | Operativ, kein Schema-Change |
| 23 | Test-Strategie | Mittel: Unit + Integration + E2E |
| 24 | Hosting-DB | Hetzner Managed Postgres mit PITR |
| 25 | Zeitstempel | UTC im Backend, Berlin im Frontend |
| 26 | Status-Berechnung | Ausschließlich TypeScript (keine SQL-Funktion) |
| 27 | Reservierung auf Gelb | **Erlaubt** (wie Orange/Rosa) |
| 28 | Reservierung auf Rot/Grau/Blau | Verboten |
| 29 | `cooldown_until = NULL` bei `duration_days = 0` | Konvention |
| 30 | `profi_visit` auf grünem Markt | Verboten (nur `visit`) |
| 31 | `cancel_order` auf Nicht-Gelb | Verboten |
| 32 | Token-TTLs | Setup 7d, Reset 1h |
| 33 | Drill-Zeitpunkte | Vor Pilot UND vor Full-Rollout |
| 34 | E-Mail-Versand-Fehler | Audit-Log + Admin-UI „nicht zugestellt" |
| 35 | Cooldown-Latenz-Toleranz | Bis 5 Min (vs. <5s für User-Aktionen) |
| 36 | Reservation-Ablauf-Latenz | Bis 1 Min |
| 37 | NOTIFY bei Bulk-Updates | Batch-Event statt N Einzel-Events |
| 38 | Audit-Events | TypeScript-Const, dokumentierte Liste, DB-Check-Constraint |
| 39 | CSV-Import-Modi (v0.6) | `insert-only` (Default) + `upsert`-Toggle |
| 49 | Scope (v0.7) | Edeka-Familie + REWE in Berlin + Brandenburg, ca. 737 Märkte |
| 50 | Adress-Schema (v0.7) | `street_full` als ein Feld statt `street` + `house_number` (passt zu Excel-Quellen, robusterer Import) |
| 51 | Initial-Import (v0.7) | Über `scripts/import-markets.ts` aus zwei Excel-Quellen, mit Nominatim-Geocoding |
| 40 | Manual Override auf Rot (v0.6) | Erlaubt, UI zeigt „Gesperrt durch Admin" statt Cooldown-Datum |
| 41 | Konflikt-Berichte (v0.6) | Im `audit_log` (kein separates Schema), `report_id = audit_log.id` |
| 42 | Field User Manual Override (v0.6) | Verboten (403), Eskalation per Konflikt-Bericht an Admin |
| 43 | Postgres-Channels (v0.6) | Genau zwei: `market_updated`, `markets_bulk_updated` |
| 44 | SSE-LISTEN-Connection (v0.6) | Dedizierte `pg.Client`-Instanz außerhalb des Pools |
| 45 | Konflikt-Reason-Format (v0.6) | Strukturiertes Objekt (`expected_statuses`, `actual_status`) statt String-Code |
| 46 | Inaktive User (v0.6) | Trigger P0006 blockt Action-Inserts |
| 47 | Geschäftsdaten-Aufbewahrung (v0.6) | Geo 90d, Action-Timestamps + user_id unbegrenzt (Geschäftsdokumentation) |
| 48 | Single Source of Truth (v0.6) | `docs/Reference.md` für kanonische Listen |

### 11.2 Verbleibende Klärungen durch Auftraggeber

| # | Punkt | Verantwortlich |
|---|-------|----------------|
| A | Mitarbeiter über Geo-Erfassung informieren | Auftraggeber + Partner |
| B | Betriebsrat-Zustimmung (falls vorhanden) | Auftraggeber + Partner |
| C | Datenschutzbeauftragte abstimmen | Auftraggeber + Partner |
| D | Joint-Controller-Agreement | Auftraggeber + Partner |
| E | Zentrale Admin-Person nach Pilot | Auftraggeber |

---

## 12. Nächste Schritte

1. Lastenheft v0.6 finalisieren mit Auftraggeber
2. Festpreis-Angebot
3. Vertragsabschluss inkl. Haftungsklausel
4. Entwicklung iterativ
5. CSV-Import-Skript früh fertigstellen, mit Kundendaten testen
6. Pre-Pilot Disaster-Recovery-Drill
7. Pilotbetrieb (~5 Nutzer, 2 Wochen)
8. Pre-Rollout Disaster-Recovery-Drill
9. Full Roll-out
10. 30 Tage Garantie + Quellcode-Übergabe

---

*Version 0.6 – nach dritter Code-Review angepasst. Siehe `CHANGELOG.md`.*

---

*Version 0.5 – nach zweiter Code-Review angepasst. Siehe `CHANGELOG.md`.*
