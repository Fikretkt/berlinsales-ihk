# Reference: kanonische Listen

**Dieses Dokument ist die Wahrheit für alle Codes, Event-Namen, Channels.**
Alle anderen Dokumente verlinken hierher. Bei Drift: dieses Dokument hat recht.

## Trigger-Fehler-Codes (Postgres SQLSTATE)

Erzeugt von `enforce_single_active_vorgang()`. Backend mappt auf HTTP 409 + Konflikt-Code.

| SQLSTATE | Bedeutung | HTTP-Status | Konflikt-Code |
|----------|-----------|-------------|---------------|
| `P0001` | Aktiver Vorgang verhindert Aktion (Markt-Status passt nicht) | 409 | `MARKET_HAS_ACTIVE_VORGANG` |
| `P0002` | Markt im Cooldown, nur `manual_override` erlaubt | 409 | `MARKET_IN_COOLDOWN` |
| `P0003` | Markt wurde gemergt, kein Insert möglich | 409 | `MARKET_MERGED` |
| `P0004` | Markt inaktiv, nur `manual_override` erlaubt | 409 | `MARKET_INACTIVE` |
| `P0005` | Markt effektiv grün, nur `visit` oder `manual_override` erlaubt | 409 | `MARKET_GREEN_INVALID_ACTION` |
| `P0006` | User ist inaktiv, keine Action-Inserts möglich | 409 | `USER_DEACTIVATED` |

**Wichtig:** `P0005` ist der spezifische Code für „Aktion verboten auf grünem Markt" – nicht `P0001`. `P0001` betrifft nur die nicht-grünen Vorgangs-Status (Gelb/Orange/Rosa).

**Sonderfall `MARKET_MERGED`:** Beim Action-Insert (`POST /actions`) ist es HTTP **409** (Konflikt). Beim Lese-Zugriff (`GET /markets/:id`) ist es HTTP **410 Gone**, inkl. `merged_into_id` im Error-Body — die Ressource ist permanent weg, Frontend leitet zum Primary um. Der Konflikt-Code-String (`MARKET_MERGED`) ist identisch, nur der HTTP-Status hängt vom Endpoint ab.

## Application-Konflikt-Codes (HTTP 409)

Erzeugt vom Backend ohne Trigger-Beteiligung.

| Code | Bedeutung |
|------|-----------|
| `RESERVATION_EXISTS` | Markt schon reserviert |
| `RESERVATION_NOT_ALLOWED_FOR_STATUS` | Markt-Status erlaubt keine Reservierung (Rot/Grau) |
| `GLN_ALREADY_USED` | GLN aktiv vergeben (DB Unique → 23505 gemappt) |
| `DUPLICATE_CLIENT_ID` | Offline-Action schon gesynct (idempotent ignoriert in `/batch-sync`) |
| `FIELD_USER_NOT_ALLOWED` | Field User versucht Admin-Aktion (HTTP 403, hier als Konflikt-Code aufgeführt für Vollständigkeit) |

## Offline-Sync-Konflikt-Reasons (strukturiert)

Im Response von `POST /actions/batch-sync` als Objekt, nicht als String:

```json
{
  "expected_statuses": ["gruen", "blau"],
  "actual_status": "gelb",
  "action_type": "visit"
}
```

Statt String-Codes wie `EXPECTED_GRUEN_BUT_GELB` (war v0.5, jetzt obsolet, weil `visit` zwei Vorgänger zulässt).

**Erwartete Vorgänger-Status pro Action-Type:**

| Action-Type | `expected_statuses` |
|-------------|---------------------|
| `visit` | `["gruen", "blau"]` |
| `profi_visit` | `["rosa"]` |
| `delivery` | `["gelb"]` |
| `control` | `["orange"]` |
| `cancel_order` | `["gelb"]` |
| `manual_override` | beliebig (darf immer) |

**Zusätzliche String-Reasons (nicht statusbezogen):**
- `MARKET_MERGED`
- `MARKET_INACTIVE`
- `USER_DEACTIVATED` (Field User wurde inzwischen deaktiviert)

## Postgres NOTIFY Channels

**Exakt zwei Channels. Keine weiteren.**

| Channel | Verwendung | Payload |
|---------|------------|---------|
| `market_updated` | Einzel-Event nach User-Aktion (`POST /actions`) oder Reservation-Insert/Cancel | `{"market_id": "uuid", "status": "gelb"}` |
| `markets_bulk_updated` | Background-Jobs (`expire_reservations`, `broadcast_cooldown_expiry`) | `{"market_ids": ["uuid", "uuid", ...]}` |

SSE-Server `LISTEN`t auf **beide**. Frontend macht Detail-Refetch via REST nach jedem Event.

Payload-Limit: 8000 Bytes inkl. Channel-Name. Daher: nur IDs + minimaler Status, keine Detail-Daten.

## SSE Event Types (an den Browser)

| Event | Trigger | Daten |
|-------|---------|-------|
| `connected` | Bei initialer SSE-Verbindung | `{server_time, heartbeat_interval_s}` |
| `market_updated` | NOTIFY `market_updated` empfangen | `{market_id, status}` |
| `markets_bulk_updated` | NOTIFY `markets_bulk_updated` empfangen | `{market_ids: [...]}` |
| `heartbeat` | Alle 30s + Auth-Validation | `{ts}` |
| `session_expired` | Heartbeat-Auth-Check fehlgeschlagen | `{}` (Client soll Logout machen) |

**Reservation-Änderungen** (Insert/Cancel) werden **nicht** als eigener Event-Typ ausgeliefert. Sie laufen über denselben `market_updated`-Channel/-Event mit Standard-Payload (`market_id` + aktueller `computed_status`). Frontend macht beim Empfang einen REST-Refetch über `GET /markets/:id` und sieht die neue Reservation in der Response. Begründung: NOTIFY-Payload-Limit (8 KB) plus Konsistenz mit dem „nur IDs + minimaler Status"-Prinzip.

## Audit-Events (vollständige Liste)

**Single Source of Truth:** TypeScript-Const-Objekt in `lib/audit/events.ts` im Quellcode. Die DB hat `audit_log.event` als VARCHAR, aber Backend setzt nur Werte aus dieser Liste. Migration bei neuen Events.

```typescript
export const AUDIT_EVENTS = {
  // User-Management
  USER_INVITED: 'user_invited',
  USER_INVITED_EMAIL_FAILED: 'user_invited_email_failed',
  USER_INVITATION_RESENT: 'user_invitation_resent',
  USER_ACTIVATED: 'user_activated',
  USER_DEACTIVATED: 'user_deactivated',
  USER_ROLE_CHANGED: 'user_role_changed',

  // Markt-Management
  MARKET_CREATED: 'market_created',
  MARKET_UPDATED: 'market_updated',
  MARKET_DEACTIVATED: 'market_deactivated',
  MARKET_REACTIVATED: 'market_reactivated',
  MARKET_MERGED: 'market_merged',
  MARKETS_CSV_IMPORTED: 'markets_csv_imported',

  // Konfiguration
  COOLDOWN_RULE_CHANGED: 'cooldown_rule_changed',
  CHAIN_CREATED: 'chain_created',
  CHAIN_DEACTIVATED: 'chain_deactivated',

  // Aktions-Eingriffe (alle Admin)
  MANUAL_OVERRIDE_PERFORMED: 'manual_override_performed',
  RESERVATION_CANCELLED_BY_ADMIN: 'reservation_cancelled_by_admin',

  // System-Jobs
  GEO_ANONYMIZATION_RUN: 'geo_anonymization_run',

  // Konflikt-Berichte (Field User → Admin)
  OFFLINE_CONFLICT_REPORTED: 'offline_conflict_reported',
  OFFLINE_CONFLICT_RESOLVED: 'offline_conflict_resolved',
} as const;
```

DB-Check-Constraint hält diese Liste synchron.

## Konflikt-Berichte: Datenmodell

`audit_log.id` **ist** die `report_id`. Es gibt **keine** separate `conflict_report`-Tabelle. Begründung:
- Audit-Log ist sowieso append-only und unveränderlich → passt zum „Bericht"-Konzept
- Resolution wird als zweiter Audit-Log-Eintrag (`OFFLINE_CONFLICT_RESOLVED`) angehängt, der den ursprünglichen Bericht via `payload.linked_report_id` referenziert
- `linked_action_id` im Resolution-Eintrag referenziert die Action, die der Admin als Reaktion gemacht hat (typischerweise `manual_override`)

```sql
-- Bericht
INSERT INTO audit_log (user_id, event, payload) VALUES (
  '<field_user_id>',
  'offline_conflict_reported',
  '{
    "client_id": "uuid",
    "market_id": "uuid",
    "intended_type": "delivery",
    "client_timestamp": "...",
    "conflict_reason": { "expected_statuses": ["gelb"], "actual_status": "gruen" },
    "geo_lat": ..., "geo_lng": ...,
    "user_comment": "..."
  }'
);

-- Auflösung (vom Admin)
INSERT INTO audit_log (user_id, event, payload) VALUES (
  '<admin_id>',
  'offline_conflict_resolved',
  '{
    "linked_report_id": "<audit_log.id des Reports>",
    "linked_action_id": "<action.id falls Override>",
    "resolution_note": "..."
  }'
);
```

Endpoint `GET /admin/conflict-reports` filtert auf `event='offline_conflict_reported'` und joined optional auf `offline_conflict_resolved` über `payload->>'linked_report_id'`.

## CSV-Import-Modi

CLI- und API-Parameter `mode`:

| Mode | Verhalten bei GLN-Konflikt | Default |
|------|----------------------------|---------|
| `insert-only` | Skippen, in Skip-Report listen | **Ja** |
| `upsert` | Bestehenden Markt aktualisieren (über GLN als Key), in Update-Report listen | Nein |

Response zählt jeweils: `imported`, `updated`, `skipped_duplicates`, `errors`.

Audit-Event `markets_csv_imported` mit `payload: {mode, imported, updated, skipped, errors_count}`.

## UI-Anzeige: Status-Edge-Cases

| Markt-Zustand | UI-Anzeige |
|---------------|-----------|
| Rot mit `cooldown_until > NOW` | „Wieder anfahren ab `<Datum lokal>`" |
| Rot mit `cooldown_until = NULL` (manual_override auf rot) | „Gesperrt durch Admin am `<Datum>` – Grund: `<reason>`" |
| Grau | „Markt inaktiv" + ggf. Hinweis ob gemergt |
| Grün mit aktiver Reservation | UI zeigt Blau-Marker, Detail-Seite „Reserviert von `<Name>` bis 23:59" |
| Gelb/Orange/Rosa mit Reservation | Status-Farbe + Reservierungs-Badge, Detail-Seite „Reserviert von `<Name>` bis 23:59" |
| Markt gemergt (alte URL) | Frontend-Redirect zum Primary (Backend liefert 410 + `merged_into_id`) |
| Frisch reaktivierter Markt | Status = letzte Action vor Deaktivierung (View-Logik). Falls Cooldown abgelaufen → effektiv grün. Falls Vorgang lief → der alte Status (Gelb/Orange/Rosa). |

**UI-Wording für Status `rosa` und Action `profi_visit`:** Im Frontend werden diese Code-Begriffe niemals so angezeigt. Das DB-Enum heißt weiterhin `profi_visit`, in der UI wird durchgängig **„Persönliches Gespräch"** verwendet. Begründung (v0.8): Das Wort „Profi" entwertet die normalen Vertriebler, die täglich mit der App arbeiten. Status-Label = „Persönliches Gespräch", Aktions-Buttons = „Gespräch erfolgreich" / „Gespräch abgelehnt".

**Reactivate-Verhalten:** `POST /markets/:id/reactivate` setzt nur `market.active = TRUE`. Es macht **keine** automatische Status-Bereinigung — die View nimmt einfach wieder die letzte Action vor der Deaktivierung. Wenn der Admin den Markt auf Grün starten möchte, muss er zusätzlich ein `manual_override` mit `target_status = 'gruen'` machen. Diese Trennung ist bewusst: Reactivate ist ein reiner Sichtbarkeits-Toggle, keine Geschäftslogik.

Backend liefert auf `GET /markets/:id` immer `last_action` mit (Type, Result, User, Timestamp, Payload), damit Frontend die richtige Detail-Anzeige machen kann – insbesondere für den „Rot ohne Cooldown"-Fall.

**Wichtig zur Implementierung:** Die View `v_market_status` liefert aus Performance-Gründen **nur** die schmalen `last_action_*`-Felder (Type, Result, User, Timestamp) – **kein** `payload`. Für die Detail-Seite macht das Backend einen separaten Join auf die letzte Action und nimmt deren `payload` mit. Die Listen-Ansicht (`GET /markets`) braucht das `payload` nicht und liest weiter aus der View ohne Extra-Join.

## Reservation-Lifecycle: Auto-Aufheben bei eigener Aktion

Wenn ein User einen Markt reserviert hat und dann selbst eine Aktion durchführt (`visit`, `delivery`, `control`, `cancel_order`, `profi_visit`), wird die Reservierung **im selben Transaktions-Block** auf `active = FALSE` gesetzt. Begründung: Eine Reservierung bedeutet „ich nehme mir den Markt heute vor". Sobald die Aktion erledigt ist, ist die Reservierung obsolet — sonst sehen andere User den Markt weiter als „reserviert", obwohl der nächste rein soll (z. B. der Liefer-Fahrer für die Lieferung am gelben Markt).

**Ausnahmen:**
- `manual_override`: hebt die Reservierung **nicht** auf. Das ist ein Admin-Eingriff, kein regulärer Workflow-Schritt.
- Fremde Aktionen: Wenn User A reserviert und User B macht eine Aktion, bleibt A's Reservierung aktiv (sie gehört A, nicht B).

Implementiert in `lib/actions/insert.ts`:
```sql
UPDATE reservation
SET active = FALSE, cancelled_at = NOW(), cancelled_by_user_id = :user_id
WHERE market_id = :market_id AND user_id = :user_id AND active = TRUE
```

Der Background-Job `expire_reservations` (jede Minute) bleibt für den 23:59-Auto-Reset zuständig — er fängt die Fälle ab, in denen User reserviert hat, dann aber den Markt doch nicht angefahren ist.

## SSE-Architektur: LISTEN-Connection

**Eine dedizierte DB-Connection außerhalb des Pools.**

Begründung: LISTEN ist ein blockierender Aufruf, die Connection muss permanent offen bleiben. Im Pool wäre sie für andere Requests verloren. Daher: ein dedizierter `pg.Client` (nicht `pg.Pool`), beim Server-Start instanziiert.

Lebenszyklus:
1. Server startet
2. `lib/sse/listen-client.ts` baut Connection auf, ruft `LISTEN market_updated` und `LISTEN markets_bulk_updated`
3. SSE-Endpoint `/api/v1/events/stream` nimmt Browser-Clients an, registriert sie in interner Subscriber-Map
4. Eingehende NOTIFY → listen-client emittiert internes Node-Event → Endpoint pusht an alle registrierten SSE-Clients
5. Bei Disconnect: Client aus Subscriber-Map entfernen
6. Bei Server-Shutdown: `UNLISTEN *`, Connection schließen

Reconnect-Verhalten bei Server-Restart: Browser-EventSource macht automatischen Reconnect (Default ~3s Backoff). Bei 15 Clients = max. 15 parallele Reconnect-Versuche in der ersten Sekunde – unkritisch. `Last-Event-ID`-Header wird vom Server ignoriert (wir resumen nicht, Frontend macht beim Reconnect einfach einen Detail-Refetch der sichtbaren Märkte).

## Was wird wo aufbewahrt (DSGVO)

| Datum | Aufbewahrung | Begründung |
|-------|--------------|------------|
| `action.geo_lat`, `geo_lng`, `distance_to_market_meters` | 90 Tage, dann NULL via Job | Ortungs-Bewegungsprofil ist sensitiv |
| `action.client_timestamp`, `action.created_at` | Unbegrenzt | Geschäftsdokumentation (Wann wurde was gemacht?) |
| `action.user_id` | Unbegrenzt | Geschäftsdokumentation (Wer hat was gemacht?) |
| `audit_log` insgesamt | Unbegrenzt | Compliance/Nachvollziehbarkeit |
| `user.last_login_at` | Unbegrenzt während User aktiv | Account-Sicherheit |

Begründung im Lastenheft 5.5 dokumentiert. Bei Auskunfts­anfrage: Geschäftsdokumentation gilt nicht als personenbezogenes Bewegungsprofil im DSGVO-engeren Sinne.
