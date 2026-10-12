# API-Spezifikation (v0.6)

Alle REST-Endpoints des Backends. Basis-URL: `/api/v1`.

## Globale Konventionen

### Authentifizierung
Session-Cookie (HttpOnly, Secure, SameSite=Lax), Name `marktsync_session`. Wird beim Login gesetzt, beim Logout invalidiert.

### Response-Format
```json
{
  "data": { ... },
  "error": null
}
```
Bei Fehlern:
```json
{
  "data": null,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Klartext-Beschreibung",
    "field": "gln",
    "details": { ... }
  }
}
```

### Zeitstempel
- **Server gibt immer UTC zurück** (ISO 8601, `Z`-Suffix)
- **Reservierungen**: `valid_until` ist „Ende des aktuellen Tages in Europe/Berlin", konvertiert nach UTC. Beispiel 19. Mai 2026 (CEST) → `2026-05-19T21:59:59Z`. Im November (CET) → `2026-11-04T22:59:59Z`.
- **Frontend** zeigt alle Zeiten in Europe/Berlin

### Rate Limits
| Endpoint-Gruppe | Limit |
|-----------------|-------|
| `/auth/login` | 5/min |
| `/auth/reset-request` | 3/min, 10/Tag |
| `/auth/reset-confirm`, `/auth/setup` | 10/min |
| `POST /markets/.../actions` | 30/min pro User |
| Sonstige GET | 120/min |
| Sonstige POST/PATCH | 60/min |

Bei Überschreitung: 429 + Header `Retry-After`.

### Pagination
- Query-Param `limit` (Default 50, Max 200)
- Query-Param `cursor` (opaker String)
- Response enthält `next_cursor` (null bei letzter Seite)

```json
{
  "data": {
    "items": [...],
    "next_cursor": "eyJpZCI6IjEyMyJ9",
    "total": 187
  }
}
```

### Konflikt-Codes (HTTP 409)

**Vollständige Liste in `docs/Reference.md`.** Kurzfassung:

| Code | Bedeutung | Quelle |
|------|-----------|--------|
| `MARKET_HAS_ACTIVE_VORGANG` | Markt hat Vorgang in Gelb/Orange/Rosa | Trigger P0001 |
| `MARKET_IN_COOLDOWN` | Cooldown läuft | Trigger P0002 |
| `MARKET_MERGED` | Markt wurde gemergt (Response enthält `merged_into_id`) | Trigger P0003 |
| `MARKET_INACTIVE` | Markt deaktiviert | Trigger P0004 |
| `MARKET_GREEN_INVALID_ACTION` | Auf Grün nur `visit` oder `manual_override` | Trigger P0005 |
| `USER_DEACTIVATED` | User wurde inzwischen deaktiviert | Trigger P0006 |
| `RESERVATION_EXISTS` | Aktive Reservierung vorhanden (Backend mappt 23505) | Application |
| `RESERVATION_NOT_ALLOWED_FOR_STATUS` | Markt-Status Rot/Grau | Application |
| `GLN_ALREADY_USED` | GLN aktiv vergeben | DB Unique |
| `DUPLICATE_CLIENT_ID` | Schon gesynct (idempotent ignoriert im Batch-Sync) | DB Unique |

`FIELD_USER_NOT_ALLOWED` (HTTP 403): Wenn Field User einen Admin-Endpoint oder `manual_override` versucht.

### Zeitstempel-Helper
Im Backend für „Tagesende Berlin → UTC":

```ts
import { endOfDay } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';

export function endOfTodayBerlinUTC(): Date {
  const berlinNow = new Date();
  const berlinEnd = endOfDay(berlinNow);
  return fromZonedTime(berlinEnd, 'Europe/Berlin');
}
```

---

## Authentifizierung

### POST `/api/v1/auth/login`
**Request:** `{ "email", "password" }`
**Response 200:** Setzt Session-Cookie, gibt User-Profil.
**Response 401:** Falsche Credentials.
**Response 429:** Rate-Limit.

### POST `/api/v1/auth/logout`
**Response 200:** Beendet Session.

### POST `/api/v1/auth/reset-request`
**Request:** `{ "email" }`
**Response 200:** Immer 200 (Anti-Enumeration). Bei Treffer: Reset-Mail mit Token-Gültigkeit **1 Stunde**.

### GET `/api/v1/auth/reset?token=...`
**Response 200:** Token gültig.
**Response 410:** Token abgelaufen oder verbraucht.

### POST `/api/v1/auth/reset-confirm`
**Request:** `{ "token", "newPassword" }`
**Response 200:** Passwort gesetzt + Session-Cookie (direkt eingeloggt).

### GET `/api/v1/auth/setup?token=...`
Wie `reset` – derselbe Token-Mechanismus, andere `purpose`.

### POST `/api/v1/auth/setup`
**Request:** `{ "token", "password" }`
**Response 200:** User aktiviert + Session-Cookie. Setup-Token-Gültigkeit **7 Tage** seit Versand.

### GET `/api/v1/auth/me`
Aktueller User.
**Response 200:** User-Profil + Firma + Rolle.
**Response 401:** Nicht eingeloggt.

---

## Markets

### GET `/api/v1/markets`
Liste aller Märkte mit aktuellem Status (aus View).

**Query-Parameter:** `status`, `chain_id`, `district`, `search`, `near_lat`, `near_lng`, `radius_km`, `limit`, `cursor`

**Response 200:** Items mit allen Markt-Daten + Status + Reservation + last_action.

### GET `/api/v1/markets/:id`
Detailansicht inkl. Historie und Notes.

**Response 200:** Vollständiges Markt-Objekt inkl. `last_action` (Type, Result, User, Timestamp, Payload) für UI-Anzeige bei „Rot ohne Cooldown".

**Response 410 Gone:** Wenn Markt gemergt wurde.
```json
{
  "data": null,
  "error": {
    "code": "MARKET_MERGED",
    "merged_into_id": "uuid-des-primary-markets",
    "message": "Markt wurde am 2026-04-15 mit einem anderen zusammengeführt."
  }
}
```
Frontend leitet zu `/markets/{merged_into_id}` um.

### POST `/api/v1/markets`
Neuen Markt anlegen (Field User + Admin).

**Request:** `{ name, chain_id, gln, street, house_number, postal_code, district?, lat, lng, contact_person?, contact_phone? }`

**Response 201:** Neuer Markt.
**Response 409 `GLN_ALREADY_USED`:** GLN-Konflikt.
**Response 200 mit Warnung:** Bei Adress-Dubletten-Verdacht (kein Konflikt, aber Hinweis).

### PATCH `/api/v1/markets/:id` (Admin)
Bearbeiten eines Marktes.

### POST `/api/v1/markets/:id/deactivate` (Admin)
Soft-Delete via `active=false`. Aktive Reservierungen werden aufgehoben.

### POST `/api/v1/markets/:id/reactivate` (Admin)
Setzt `active=true`. Audit-Log-Event `market_reactivated`.

### POST `/api/v1/markets/merge` (Admin)
**Request:** `{ "primary_id", "duplicate_id" }`

Transaktion:
1. UPDATE note SET market_id = primary
2. UPDATE action SET market_id = primary
3. UPDATE reservation SET active=false WHERE market_id=duplicate AND active=true
4. UPDATE market SET active=false, merged_into_id=primary WHERE id=duplicate
5. INSERT audit_log (event='market_merged')

**Response 200:** Merge-Statistik (Anzahl umgehängter Notes/Actions).

---

## Actions

### POST `/api/v1/markets/:id/actions`
**Request:**
```json
{
  "type": "visit",
  "result": "success",
  "geo_lat": 52.5532,
  "geo_lng": 13.3611,
  "client_timestamp": "2026-05-19T14:23:45Z",
  "payload": { "note": "Optional" }
}
```

`client_timestamp` ist optional bei Online-Actions (Server-Zeit ist Single Source). Pflicht im batch-sync.

Bei `type=manual_override`: payload MUSS `target_status` (nicht 'blau') und `reason` enthalten. **Admin-only:** Field User bekommen 403.
Bei `type=cancel_order`: payload MUSS `reason` enthalten.
Bei `type=control, result=problem`: payload MUSS `problem_description` enthalten.

**Backend-Logik:**
1. Auth-Check, Zod-Validation
2. Distanz zum Markt server-seitig berechnen (Client-Werte ignoriert, falls vorhanden)
3. Transaction BEGIN
4. `pg_advisory_xact_lock(market_id)`
5. `computeResultingStatus()` (TypeScript)
6. `cooldown_until`: aus `cooldown_rule`. `duration_days = 0` → `NULL`. Sonst `NOW + duration_days`.
7. INSERT INTO action (Trigger prüft Regeln)
8. `pg_notify('market_updated', payload)`
9. COMMIT

**Response 201:**
```json
{ "data": { "action_id": "uuid", "new_status": "gelb", "cooldown_until": null } }
```

**Response 409:** mit einem der Konflikt-Codes oben.
**Response 400:** `INVALID_TYPE_RESULT_COMBO`, `MISSING_PAYLOAD_FIELD`, `INVALID_TARGET_STATUS`.

### POST `/api/v1/actions/batch-sync`
Offline-Aktionen synchronisieren.

**Request:**
```json
{
  "actions": [
    {
      "client_id": "550e8400-e29b-41d4-a716-446655440000",
      "market_id": "uuid",
      "type": "delivery",
      "geo_lat": 52.5, "geo_lng": 13.4,
      "client_timestamp": "2026-05-19T10:15:00Z"
    }
  ]
}
```

`client_id` ist Pflicht und muss UUID-Format haben. Idempotenz-Key.

**Backend-Logik pro Action:**
- Prüfen, ob `client_id` für diesen User schon existiert → idempotent ignorieren (silent success)
- Erwarteten Vorgänger-Status prüfen
- Bei Match: INSERT mit `offline_recorded=true`
- Bei Mismatch oder Markt-Problem: in `conflicts` zurückgeben

**Response 207 Multi-Status:**
```json
{
  "data": {
    "synced": [
      { "client_id": "...", "action_id": "uuid", "new_status": "orange" }
    ],
    "conflicts": [
      {
        "client_id": "...",
        "conflict": {
          "expected_statuses": ["gelb"],
          "actual_status": "gruen",
          "action_type": "delivery"
        },
        "current_status": "gruen",
        "last_action_by_other": {
          "type": "cancel_order",
          "user_name": "Anna",
          "created_at": "..."
        }
      }
    ]
  }
}
```

**Konflikt-Struktur:** `conflict` ist ein Objekt mit `expected_statuses` (Array), `actual_status` (String) und `action_type`. Erlaubt visit-Konflikte korrekt darzustellen (zwei zulässige Vorgänger). Falls Markt-Problem statt Status-Mismatch:
```json
"conflict": { "code": "MARKET_MERGED", "merged_into_id": "uuid" }
"conflict": { "code": "MARKET_INACTIVE" }
"conflict": { "code": "USER_DEACTIVATED" }
```

Erwartete Vorgänger-Status pro Action-Type: siehe `docs/Reference.md`.

### POST `/api/v1/actions/report-conflict`
Field User meldet einen Offline-Konflikt an den Admin. Field User dürfen kein `manual_override` selbst durchführen – diese Route ist der Eskalationsweg.

**Request:**
```json
{
  "client_id": "550e8400-e29b-41d4-a716-446655440000",
  "market_id": "uuid",
  "intended_type": "delivery",
  "intended_result": null,
  "client_timestamp": "2026-05-19T10:15:00Z",
  "conflict": {
    "expected_statuses": ["gelb"],
    "actual_status": "gruen",
    "action_type": "delivery"
  },
  "geo_lat": 52.5,
  "geo_lng": 13.4,
  "user_comment": "War auf der Rampe, habe abgeladen"
}
```

**Backend-Logik:**
1. Auth-Check (alle eingeloggten User dürfen melden, nicht nur Field User)
2. Idempotenz über `client_id`: zweiter Bericht zur gleichen `client_id` ignoriert (gibt gleiche Response wie der erste)
3. INSERT `audit_log` mit `event='offline_conflict_reported'` und vollständigem Payload. **`audit_log.id` ist die `report_id`** – es gibt keine separate Tabelle.
4. Optional: Admin-Notification (Phase 2)

**Response 201:**
```json
{
  "data": {
    "report_id": "uuid",
    "received_at": "2026-05-19T14:50:12Z"
  }
}
```

**Response 200 (idempotent):** Wenn `client_id` schon gemeldet, gleiche Antwort wie 201.

**Wichtig:** Dieser Endpoint legt **keine** Action an. Er erzeugt nur einen Audit-Log-Eintrag, den der Admin im Dashboard sieht und auf den er mit `manual_override` reagieren kann.

### GET `/api/v1/admin/conflict-reports`
Admin sieht Konflikt-Berichte.

**Query:** `resolved` (Bool, Default `false`), `limit`, `cursor`

**Backend-Logik:** Filtert `audit_log` auf `event='offline_conflict_reported'`. Joined optional auf `audit_log`-Einträge mit `event='offline_conflict_resolved'` und `payload->>'linked_report_id' = report.id` um Resolution-Status zu bestimmen.

**Response 200:**
```json
{
  "data": {
    "items": [
      {
        "report_id": "uuid",
        "created_at": "...",
        "market": { "id": "...", "name": "...", "current_status": "gruen" },
        "reporter": { "user_id": "...", "name": "..." },
        "intended_type": "delivery",
        "conflict": { "expected_statuses": ["gelb"], "actual_status": "gruen", "action_type": "delivery" },
        "client_timestamp": "...",
        "user_comment": "...",
        "resolved": false,
        "resolved_action_id": null,
        "resolved_at": null,
        "resolution_note": null
      }
    ]
  }
}
```

### POST `/api/v1/admin/conflict-reports/:id/resolve`
Admin markiert einen Konflikt-Bericht als bearbeitet (üblicherweise nachdem er per `manual_override` reagiert hat).

**Request:**
```json
{
  "resolution_note": "Lieferung als Override akzeptiert, da Stornierung erst nach Lieferung kam",
  "linked_action_id": "uuid"
}
```

**Backend-Logik:** INSERT `audit_log` mit `event='offline_conflict_resolved'`, `payload.linked_report_id = :id`, `payload.linked_action_id`, `payload.resolution_note`.

**Response 200**.

---

## Reservations

### POST `/api/v1/markets/:id/reserve`
Markt für heute reservieren.

**Erlaubt auf Status:** Grün, Gelb, Orange, Rosa.
**Verboten auf:** Blau (eigene Reservierung), Rot, Grau.

**Response 201:**
```json
{
  "data": {
    "reservation_id": "uuid",
    "valid_until": "2026-05-19T21:59:59Z",
    "valid_until_local": "2026-05-19T23:59:59+02:00"
  }
}
```

**Response 409 `RESERVATION_EXISTS`:** Markt schon reserviert.
**Response 409 `RESERVATION_NOT_ALLOWED_FOR_STATUS`:** Rot/Grau.

### DELETE `/api/v1/markets/:id/reserve`
Eigene aktive Reservierung aufheben. Admin kann fremde aufheben (Audit-Log: `reservation_cancelled_by_admin`).

---

## Notes

### POST `/api/v1/markets/:id/notes`
**Request:** `{ "content" }`

### PATCH `/api/v1/notes/:id`
**Response 403:** Wenn `editable_until` überschritten.

---

## Admin: Users

### GET `/api/v1/admin/users`
Liste, paginiert.

### POST `/api/v1/admin/users`
Einladung.

**Request:** `{ "email", "name", "role", "company_id" }`

**Backend-Logik:**
1. INSERT user mit `password_hash = NULL`
2. Token generieren, hashen, in `password_reset_token` mit `purpose='setup'`, expires +7 Tage
3. Setup-Mail via Resend versuchen
4. Bei Erfolg: audit_log `user_invited`
5. Bei Fehler (Resend down etc.): audit_log `user_invited_email_failed` mit Fehlertext, User existiert trotzdem

**Response 201:** `{ user_id, email_sent: true|false, email_error?: string }`

### PATCH `/api/v1/admin/users/:id`
Rolle, Aktivität, Firmen-Zugehörigkeit. Audit-Events: `user_role_changed`, `user_activated`, `user_deactivated`.

### POST `/api/v1/admin/users/:id/resend-invitation`
Token regenerieren (alten konsumieren), neue Mail. Audit: `user_invitation_resent`.

---

## Admin: Cooldowns

### GET `/api/v1/admin/cooldown-rules`
Liste aller Regeln.

### PATCH `/api/v1/admin/cooldown-rules/:id`
**Request:** `{ "duration_days" }`

**Wichtig:** Wirkt NUR auf zukünftige Aktionen. Bestehende `action.cooldown_until`-Snapshots bleiben unverändert.

`duration_days = 0` ist erlaubt (kein Cooldown). Backend setzt entsprechend `cooldown_until = NULL` für zukünftige Actions.

Audit-Event: `cooldown_rule_changed` mit Vorher/Nachher.

---

## Admin: Chains

### GET, POST, PATCH `/api/v1/admin/chains`

---

## Admin: Markets CSV-Import

### POST `/api/v1/admin/markets/import-csv`
Bulk-Import von Märkten.

**Request:** `multipart/form-data` mit:
- `file`: CSV-Datei. Spalten: `chain`, `name`, `gln`, `street`, `house_number`, `postal_code`, `district`, `lat`, `lng`, `contact_person`, `contact_phone`. Trennzeichen `,`, UTF-8.
- `mode`: `insert-only` (Default) oder `upsert`

**Mode-Verhalten:**
- `insert-only`: GLN-Konflikte werden geskippt und im Report aufgeführt. Sicher (verändert keine bestehenden Daten).
- `upsert`: Bestehende Märkte werden über GLN als Key aktualisiert. Trigger updated_at greift. Im Report wird zwischen `imported` und `updated` unterschieden.

**Backend-Logik:**
1. CSV parsen (csv-parse)
2. Pro Zeile validieren (Zod)
3. Pro Zeile in eigener Transaktion:
   - `mode='insert-only'`: INSERT, bei `23505` → skip
   - `mode='upsert'`: `INSERT ... ON CONFLICT (gln) WHERE active AND merged_into_id IS NULL DO UPDATE SET ...`
4. Pro Zeile mit Validation-Fehler: skip, in `errors`-Array

**Response 200:**
```json
{
  "data": {
    "mode": "insert-only",
    "total_rows": 200,
    "imported": 195,
    "updated": 0,
    "skipped_duplicates": 3,
    "errors": [
      { "row": 17, "gln": "...", "reason": "GLN invalid: only 12 digits" },
      { "row": 42, "gln": "...", "reason": "chain not found: 'Edekka'" }
    ]
  }
}
```

Audit-Event `markets_csv_imported` mit `payload: {mode, imported, updated, skipped_duplicates, errors_count}`.

### GET `/api/v1/admin/markets/import-csv/template`
Lädt eine CSV-Vorlage mit Beispielzeilen + Spalten-Header.

---

## Reporting

### GET `/api/v1/reports/overview`
**Query:** `from`, `to` (Pflicht), `team_id` (optional)

**Response 200:**
```json
{
  "data": {
    "period": { "from": "...", "to": "..." },
    "visits_total": 156,
    "visits_successful": 120,
    "visits_escalated": 14,
    "deliveries": 89,
    "controls_ok": 75,
    "controls_problem": 12,
    "escalation_rate": 0.09,
    "by_team": { "company_a": {...}, "company_b": {...} },
    "by_district": [
      { "district": "Mitte", "visits": 23, "successful": 18, "coverage_percent": 81 }
    ]
  }
}
```

### GET `/api/v1/reports/stale-markets`
Hänger-Liste: Rosa >14 Tage, Gelb >21 Tage ohne Lieferung, Märkte ohne Aktivität >45 Tage.

### GET `/api/v1/reports/new-markets`
**Query:** `days` (Default 30)

**Response 200:** Liste aller Märkte mit `created_at > NOW - days`, sortiert nach Datum desc. Inkl. `created_by_user_id`. Hilft Admins, neue Anlagen (insbesondere durch Field User) zu reviewen und potenzielle Dubletten zu erkennen.

```json
{
  "data": {
    "items": [
      {
        "market": { "id": "...", "name": "...", ... },
        "created_by": { "user_id": "...", "name": "..." },
        "days_ago": 3,
        "similar_markets": [...]
      }
    ],
    "total": 12
  }
}
```

---

## Realtime (Server-Sent Events)

### GET `/api/v1/events/stream`
Persistente SSE-Verbindung.

**Implementierung:**
- Backend hält pro Browser-Client eine SSE-Connection offen
- **Eine dedizierte DB-Connection außerhalb des Pools** hält permanenten `LISTEN market_updated` und `LISTEN markets_bulk_updated`. Begründung und Lebenszyklus: siehe `docs/Reference.md` → „SSE-Architektur".
- Eingehende NOTIFY-Events werden an alle aktiven SSE-Clients gepusht
- Heartbeat alle 30 Sekunden
- Bei Heartbeat: Auth-Validation. Wenn Session abgelaufen: Event `session_expired` + SSE schließen

**Event-Format:**
```
event: connected
data: {"server_time":"2026-05-19T14:30:00Z","heartbeat_interval_s":30}

event: market_updated
data: {"market_id":"uuid","status":"gelb"}

event: markets_bulk_updated
data: {"market_ids":["uuid1","uuid2","uuid3"]}

event: heartbeat
data: {"ts":"..."}
```

**Payloads klein halten:** Postgres-NOTIFY-Limit 8000 Bytes (Channel + Payload). Frontend refetcht Details über REST.

Client: `new EventSource('/api/v1/events/stream')`. Browser macht Auto-Reconnect bei Connection-Loss. Bei 401 (Session abgelaufen) → Frontend leitet zum Login.

---

## Push-Benachrichtigungen (Web Push)

**Phase 2, nicht MVP.**

Geplante Endpoints:
- `POST /api/v1/push/subscribe`
- `DELETE /api/v1/push/subscribe`
- Backend-Trigger: Bei `delivery`-Action → Push an Vertriebler des Teams
