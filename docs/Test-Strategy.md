# Test-Strategie: MarktSync (v0.6)

Drei Ebenen, klare Pflicht-Szenarien, CI-integriert.

## Ziele und Coverage

| Ebene | Tool | Coverage-Ziel | Wann läuft |
|-------|------|---------------|------------|
| Unit | Vitest | 75 % für Geschäftslogik | Watch + CI |
| Integration | Vitest + Testcontainers | Alle API-Endpoints, kritische DB-Constraints | Pre-Push + CI |
| E2E | Playwright | 8–10 kritische User-Flows | CI vor Deployment |
| SSE | Playwright (Multi-Context) | Reconnect, Heartbeat, Session-Validation | CI vor Deployment |

## Test-Pyramide

```
        SSE (~4–6 Tests)
        E2E (~8–10 Tests)
      ───────────────────
    Integration (~40–60 Tests)
  ─────────────────────────────────
Unit Tests (~150–250 Tests)
─────────────────────────────────
```

## Unit-Tests (Vitest)

### Status- und Cooldown-Logik (Pflicht)

**computeResultingStatus() — alle Pfade:**
- visit/success → gelb
- visit/escalation → rosa
- visit/no_contact → rot
- visit/declined → rot
- profi_visit/success → gelb
- profi_visit/declined → rot
- delivery → orange
- control/ok → rot
- control/problem → gelb
- cancel_order → grün
- manual_override mit target_status → target_status
- manual_override ohne target_status → Error
- visit ohne result → Error
- Invalid Kombinationen → Error

**Cooldown-Snapshot-Berechnung:**
- duration_days = 0 → cooldown_until = null
- duration_days > 0 → cooldown_until = NOW + duration_days
- Verschiedene Zeitzonen-Edge-Cases

**Tagesende-Berechnung Europe/Berlin:**
- CEST: 19. Mai → 21:59:59Z
- CET: 19. November → 22:59:59Z
- Sommerzeit-Umstellung
- Winterzeit-Umstellung

### Validation (Zod-Schemas)

- GLN-Validierung
- Action-Input für alle types
- target_status nicht 'blau' bei manual_override
- payload.reason Pflicht bei cancel_order und manual_override
- **payload.problem_description Pflicht bei control/problem** (neu in v0.6)
- CSV-Row-Validierung

### Auth-Helpers

- Token-Generierung + Hashing
- Token-Expiry-Logik
- bcrypt-Wrapper

### Utility

- Entfernungs-Berechnung (Haversine)
- CSV-Parsing-Edge-Cases

## Integration-Tests (Vitest + Testcontainers)

Echte PostgreSQL-Container.

### Action-Übergangs-Tests (kritisch, alle Pflicht)

**Erlaubte Übergänge:**
- visit/success auf grün → gelb, cooldown=NULL
- visit/escalation auf grün → rosa
- visit/no_contact auf grün → rot, cooldown=NOW+3d
- visit/declined auf grün → rot, cooldown=NOW+30d
- delivery auf gelb → orange
- cancel_order auf gelb → grün (mit reason)
- control/ok auf orange → rot, cooldown=NOW+21d
- control/problem auf orange → gelb
- profi_visit/success auf rosa → gelb
- profi_visit/declined auf rosa → rot, cooldown=NOW+60d
- visit auf rot mit abgelaufenem Cooldown → gelb (Cooldown vorbei)
- manual_override auf jeden Status (außer blau) → target_status

**Verbotene Übergänge (Trigger muss blocken — Codes laut `docs/Reference.md`):**
- visit auf gelb → P0001
- visit auf orange → P0001
- visit auf rosa → P0001
- profi_visit auf grün → **P0005**
- profi_visit auf gelb → P0001
- profi_visit auf orange → P0001
- delivery auf grün → **P0005**
- delivery auf orange → P0001
- delivery auf rosa → P0001
- control auf grün → **P0005**
- control auf gelb → P0001
- control auf rosa → P0001
- cancel_order auf grün → **P0005**
- cancel_order auf orange → P0001
- cancel_order auf rosa → P0001
- visit auf rot mit aktivem Cooldown → P0002
- visit auf grau (außer manual_override) → P0004
- Action auf gemergten Markt → P0003
- **Action durch inaktiven User → P0006** (neu in v0.6)

### Auth/Authz-Tests (neu in v0.6)

- Field User schickt `POST /actions` mit `type='manual_override'` → 403 + Code `FIELD_USER_NOT_ALLOWED`
- Field User schickt `POST /admin/users` → 403
- Field User schickt `POST /admin/markets/import-csv` → 403
- Field User schickt `POST /admin/conflict-reports/:id/resolve` → 403
- Inaktiver User schickt `POST /actions` → 403 (oder 401, je nach Session-Behandlung)

### CSV-Import-Tests (neu in v0.6)

- `insert-only`: 100 Zeilen mit 5 GLN-Duplikaten → `imported=95, updated=0, skipped_duplicates=5`
- `upsert`: 100 Zeilen mit 5 GLN-Duplikaten → `imported=95, updated=5, skipped_duplicates=0`
- Idempotenz `insert-only`: gleiche CSV zweimal → zweites Mal `imported=0, skipped=100`
- Idempotenz `upsert`: gleiche CSV zweimal → zweites Mal `updated=100`
- Validation-Fehler in Zeile 5: Rest wird importiert, Zeile 5 im `errors[]`
- Audit-Event `markets_csv_imported` wird mit `mode` im Payload geschrieben

### Konflikt-Bericht-Flow (neu in v0.6)

- Field User schickt `report-conflict` → Audit-Eintrag entsteht mit `event='offline_conflict_reported'`, `report_id = audit_log.id`
- Zweiter Aufruf mit gleicher `client_id` → 200, gleicher `report_id` zurück, kein neuer Audit-Eintrag
- Admin liest `GET /admin/conflict-reports?resolved=false` → sieht den Bericht
- Admin schickt `POST /admin/conflict-reports/:id/resolve` mit `linked_action_id` → neuer Audit-Eintrag `event='offline_conflict_resolved'`
- `GET /admin/conflict-reports?resolved=true` → sieht jetzt aufgelösten Bericht mit `resolved_action_id` gesetzt

### Cooldown-Snapshot-Verhalten (Pflicht)

- Action erstellt mit duration=14 → cooldown_until = NOW+14d
- Cooldown-Regel auf 7 ändern
- Alte Action.cooldown_until unverändert
- Neue Action mit gleichem Type → cooldown_until = NOW+7d

### Concurrency-Schutz (Pflicht)

- Zwei parallele Inserts auf denselben Markt: einer geht durch, anderer P0001
- Mit Advisory Lock im Backend simuliert
- Trigger ohne Advisory Lock im Backend → trotzdem nur ein Insert

### View v_market_status

- Markt ohne Actions → grün
- Markt mit visit/success → gelb
- Markt mit visit/no_contact + Cooldown abgelaufen → grün
- Markt mit visit/no_contact + Cooldown läuft → rot
- Markt mit aktiver Reservation → reserved_by_user_id gesetzt
- Markt deaktiviert → grau
- Gemergter Markt → NICHT in View

### GLN-Konflikte

- Zwei aktive Märkte gleiche GLN: zweites Insert → unique violation
- Inaktiver alter Markt + neuer aktiver gleiche GLN: erlaubt
- Gemergter Markt mit GLN X + neuer aktiver mit X: erlaubt

### Markt-Merge

- Notes umgehängt
- Actions umgehängt
- Aktive Reservation aufgehoben
- merged_into_id gesetzt
- Audit-Log
- Insert auf duplicate_id → P0003

### Offline-Idempotenz

- Erster Sync mit client_id → Insert
- Zweiter Sync mit derselben client_id → already_synced, kein Doppel-Insert
- Verschiedene User mit gleicher client_id → beide Inserts

### Offline-Konflikt-Detection

- Action erwartet gelb, Markt ist grün → conflict
- Action erwartet grün, Markt ist grün → insert
- Mehrere Actions im Batch: gemischtes Ergebnis korrekt

### Auth-Flow

- Login OK / Falsch / Rate-Limit
- Reset-Token-Lifecycle (TTL 1h, single-use)
- Setup-Token-Lifecycle (TTL 7d, single-use)
- User erst nach Setup einloggbar

### CSV-Import

- 100 Zeilen, alle valide → 100 imported
- 100 Zeilen mit 5 GLN-Duplikaten → 95 imported, 5 skipped
- Format-Fehler in Zeile 23 → 99 imported, 1 error
- Idempotent: zweimal laufen lassen → kein Schaden

## E2E-Tests (Playwright)

Mobile-Viewport (iPhone 12). Echte App + DB.

**E2E-1: Setup → Check-in** Admin lädt ein, User aktiviert via E-Mail, macht ersten visit.

**E2E-2: Liefer-Fahrer-Workflow + SSE-Sync** Fahrer macht delivery, zweiter Browser-Context sieht Update.

**E2E-3: Kontrolle mit Problem**

**E2E-4: Reservierung + Auto-Reset**

**E2E-5: Bestellung stornieren**

**E2E-6: Eskalation + persönliches Gespräch**

**E2E-7: Markt anlegen durch Field User mit Dubletten-Warnung**

**E2E-8: Offline-Aktion mit Sync**

**E2E-9: Offline-Konflikt mit „An Admin melden"** Field User offline, anderer User ändert Status, Sync zeigt Konflikt, Field User wählt „An Admin melden", Audit-Eintrag entsteht.

**E2E-10: Gelb-Markt reservieren (neu in v0.5)** User macht Visit (Markt gelb), zweiter User reserviert den gelben Markt, sieht Badge.

**E2E-11: Admin löst Konflikt-Bericht auf (neu in v0.6)** Aufbauend auf E2E-9: Admin loggt sich ein, navigiert zur Konflikt-Inbox, sieht den offenen Bericht. Klickt „Mit manual_override reagieren", Override-Dialog öffnet mit vorausgefülltem Grund. Admin setzt `target_status='orange'`, bestätigt. Bericht wird als resolved markiert (Audit-Event `offline_conflict_resolved` mit `linked_report_id` und `linked_action_id` entsteht). Frontend zeigt Bericht jetzt im „Aufgelöst"-Filter.

**E2E-12: Field User versucht manual_override direkt (neu in v0.6)** Field User logged in, schickt mit Browser-DevTools/curl einen `POST /actions` mit `type='manual_override'`. Backend antwortet 403, kein Insert. Audit-Log unverändert.

**E2E-13: CSV-Upsert (neu in v0.6)** Admin importiert CSV mit 10 Märkten (insert-only). Erfolgreich. Lädt dieselbe CSV mit geänderten Telefonnummern hoch, Modus `upsert`. Response zeigt `imported=0`, `updated=10`. Stichprobe: ein Markt zeigt die neue Telefonnummer im UI.

**E2E-14: Markt-Detail bei „Rot ohne Cooldown" (neu in v0.6)** Admin macht `manual_override` mit `target_status='rot'`. Field User öffnet Markt-Detail. Statt „Wieder anfahren ab `<Datum>`" zeigt die Seite „Gesperrt durch Admin am `<Datum>` – Grund: `<reason>`". Cooldown-Datum wird nicht angezeigt.

## SSE-Tests (Playwright, Multi-Context)

Eigene Test-Suite weil kritische Infrastruktur:

**SSE-1: Basis-Connection** Login, SSE öffnet, `connected`-Event empfangen.

**SSE-2: Markt-Update-Broadcast** Zwei Sessions, eine macht Action, andere empfängt `market_updated` < 5s.

**SSE-3: Reconnect nach Verbindungsabbruch** Verbindung wird unterbrochen, Browser macht Auto-Reconnect, neue Verbindung empfängt Events.

**SSE-4: Multi-Tab pro User** Ein User, zwei Tabs offen, beide haben SSE, beide empfangen Events.

**SSE-5: Session-Expiry** Session manuell expirieren, nächster Heartbeat → `session_expired`, Client macht Logout.

**SSE-6: Bulk-Events** 50 Reservierungen ablaufen lassen, einmaliger `markets_bulk_updated`-Event mit `market_ids`-Array empfangen (statt 50 Einzel-Events).

## CI-Setup

```yaml
on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - checkout
      - pnpm install
      - pnpm lint
      - pnpm typecheck

  unit:
    runs-on: ubuntu-latest
    steps:
      - checkout
      - pnpm install
      - pnpm test:unit -- --coverage

  integration:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
    steps:
      - checkout
      - pnpm install
      - pnpm test:integration

  e2e:
    runs-on: ubuntu-latest
    steps:
      - checkout
      - pnpm install
      - pnpm exec playwright install
      - pnpm test:e2e
      - pnpm test:sse
```

Deployment nur bei allen Jobs grün auf `main`.

## Lokale Befehle

```bash
pnpm test                # alle Vitest-Tests
pnpm test:unit           # nur Unit
pnpm test:integration    # mit Testcontainers
pnpm test:e2e            # Playwright E2E
pnpm test:sse            # Playwright SSE
pnpm test:watch          # Watch-Mode
pnpm test:coverage       # mit Coverage
```

## Was wir NICHT testen

- Visual Regression
- Performance/Lighthouse automatisiert (manuell vor Go-Live)
- Browser-Kompatibilität automatisiert (manuell auf 2–3 Geräten)
- Accessibility automatisiert

## Update der Testabdeckung

Pro Feature-Branch: Tests für Geschäftslogik sind Pflicht für Merge. UI-Tests nice-to-have.

Bei Änderungen an `computeResultingStatus()` oder am Trigger: alle Übergangs-Tests müssen mit angepasst werden (sind zentrale Logik).
