# Sequenzdiagramme

Technische Abläufe zwischen den Komponenten. **Realtime läuft über PostgreSQL LISTEN/NOTIFY + Server-Sent Events (SSE), nicht über WebSockets.** Begründung siehe `Tech-Stack.md`.

## 1. Realtime-Sync: Status-Änderung an aktive User

```mermaid
sequenceDiagram
    autonumber
    actor UserA as User A (Vertriebler)
    participant AppA as Browser/PWA A
    participant API as Next.js Server Action
    participant DB as PostgreSQL
    participant Notify as Postgres NOTIFY
    participant SSE as SSE Endpoint<br/>(GET /api/events/stream)
    participant AppB as Browser/PWA B
    actor UserB as User B (Partner)

    Note over AppB,SSE: User B hält offene SSE-Verbindung<br/>seit Login (EventSource)

    UserA->>AppA: Tippt "Ich bin im Markt"
    AppA->>AppA: Geo-Position via Browser-API
    AppA->>API: POST /actions { market_id, type:visit, result, geo }
    API->>API: Zod-Validation, Auth-Check
    API->>API: Distanz zum Markt berechnen
    API->>DB: BEGIN
    API->>DB: pg_advisory_xact_lock(hashtext(market_id))
    API->>API: resulting_status = computeResultingStatus(visit, success) = 'gelb'
    API->>API: cooldown_until = NULL (duration_days = 0)
    API->>DB: INSERT INTO action (...)
    Note over DB: Trigger enforce_single_active_vorgang<br/>nimmt eigenen Advisory Lock,<br/>prueft Vorgangs-Regeln
    DB-->>API: action_id
    API->>DB: pg_notify('market_updated',<br/>'{"market_id":"...", "status":"gelb"}')
    Note over DB,Notify: Payload klein gehalten<br/>(Markt-ID + Status)<br/>Limit: 8000 Bytes
    API->>DB: COMMIT
    DB-->>API: ok
    API-->>AppA: 201 {action_id, new_status: 'gelb'}
    AppA->>UserA: UI zeigt Gelb, Toast "Gespeichert"

    Note over DB,Notify: Postgres feuert NOTIFY beim COMMIT<br/>(nicht bei ROLLBACK)

    DB->>Notify: NOTIFY event
    Notify->>SSE: SSE-Server (LISTEN aktiv) bekommt Event
    SSE->>SSE: Auth-Check der SSE-Session noch valide?
    SSE->>AppB: SSE: event=market_updated<br/>data={market_id, status: gelb}
    AppB->>AppB: TanStack Query invalidate(['markets', market_id])
    AppB->>API: GET /markets/:id (Refetch fuer Details)
    API-->>AppB: Vollstaendige Markt-Daten
    AppB->>UserB: Marker färbt sich gelb,<br/>Detail-Seite (falls offen) aktualisiert sich

    Note over AppA,AppB: Latenz-Ziel: < 5 Sekunden bei User-Aktionen
```

**Hinweis zur NOTIFY-Payload:** Postgres NOTIFY hat ein 8000-Byte-Limit (inkl. Channel-Name). Daher senden wir nur Markt-ID und neuen Status. Frontend macht für Details einen REST-Refetch über TanStack Query. Bei großen Updates (z. B. Bulk-Reservierungs-Ablauf) bündeln wir mehrere Markt-IDs in einem Event statt viele Einzel-Events zu feuern.

**Postgres-Channels (kanonische Liste, siehe `docs/Reference.md`):**
- `market_updated` für Einzel-Events nach User-Aktionen und Reservation-Insert/Cancel
- `markets_bulk_updated` für Background-Job-Bulk-Events (Reservierungs-Ablauf, Cooldown-Ablauf)

Genau diese zwei. SSE-Server `LISTEN`t auf beide.

**SSE-Architektur** (siehe `docs/Reference.md` → „SSE-Architektur"): Eine dedizierte DB-Connection außerhalb des Pools hält permanent die LISTEN-Aufrufe. Beim Server-Start instanziiert, beim Shutdown sauber beendet. Browser-Reconnect bei Server-Restart wird über EventSource-Default-Backoff abgefangen.

**SSE-Auth:** Session-Cookie wird automatisch mitgeschickt (HttpOnly, SameSite=Lax). SSE-Server prüft bei jedem Heartbeat (alle 30s) ob die Session noch valide ist. Bei Ablauf: SSE-Connection wird geschlossen, Client-EventSource macht Auto-Reconnect → der nächste Reconnect schlägt mit 401 fehl → Frontend leitet zum Login-Screen.

## 2. Login + Setup für eingeladene User

```mermaid
sequenceDiagram
    autonumber
    actor Admin
    participant App as Browser/PWA
    participant API as Backend
    participant DB as PostgreSQL
    participant Mail as Resend (E-Mail)
    actor NewUser as Neuer User

    Note over Admin,API: Admin lädt neuen Mitarbeiter ein

    Admin->>App: Formular: E-Mail, Name, Rolle, Firma
    App->>API: POST /admin/users { email, name, role, company_id }
    API->>DB: INSERT INTO "user" (password_hash=NULL, active=true)
    DB-->>API: user_id
    API->>API: Token generieren (32 bytes random)
    API->>DB: INSERT INTO password_reset_token<br/>(user_id, token_hash=sha256(token),<br/>purpose='setup', expires_at=NOW()+7d)

    API->>Mail: Send "Willkommen bei MarktSync"<br/>mit Link /auth/setup?token=...
    alt E-Mail-Versand erfolgreich
        Mail-->>NewUser: E-Mail kommt an
        API->>DB: INSERT INTO audit_log<br/>(event='user_invited')
    else E-Mail-Versand fehlgeschlagen
        API->>DB: INSERT INTO audit_log<br/>(event='user_invited_email_failed', payload: error)
        Note over API,Admin: Admin sieht im User-Detail:<br/>"Einladung nicht zugestellt"<br/>+ Button "Erneut senden"
    end

    API-->>App: 201 { user_id, email_sent: true/false }
    App->>Admin: "Einladung gesendet" oder Hinweis bei Fehler

    Note over NewUser,App: Mitarbeiter klickt Link

    NewUser->>App: Öffnet Setup-Link
    App->>API: GET /auth/setup?token=...
    API->>DB: SELECT FROM password_reset_token<br/>WHERE token_hash=sha256(token)<br/>AND consumed_at IS NULL<br/>AND expires_at > NOW
    DB-->>API: user_id ODER nichts

    alt Token gueltig
        API-->>App: 200 + Formular: Passwort waehlen
        NewUser->>App: Neues Passwort eingeben
        App->>API: POST /auth/setup { token, password }
        API->>API: bcrypt.hash(password)
        API->>DB: BEGIN
        API->>DB: UPDATE "user" SET password_hash=...
        API->>DB: UPDATE password_reset_token SET consumed_at=NOW()
        API->>DB: INSERT INTO audit_log (event='user_activated')
        API->>DB: COMMIT
        API->>API: Session-Cookie setzen
        API-->>App: 200 + Session-Cookie
        App->>NewUser: Direkt zur Karten-Uebersicht
    else Token ungueltig/abgelaufen
        API-->>App: 410 Gone
        App->>NewUser: Hinweis + Link "Neue Einladung anfordern" (kontaktiert Admin)
    end
```

## 3. Passwort-Reset (vergessen)

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant App as Browser
    participant API as Backend
    participant DB as PostgreSQL
    participant Mail as Resend

    User->>App: Klick "Passwort vergessen"
    App->>User: E-Mail-Eingabemaske
    User->>App: E-Mail
    App->>API: POST /auth/reset-request { email }
    API->>DB: SELECT id FROM "user" WHERE email=? AND active=true
    DB-->>API: user_id ODER null

    alt User existiert
        API->>API: Token generieren
        API->>DB: INSERT INTO password_reset_token<br/>(purpose='reset', expires_at=NOW()+1h)
        API->>Mail: Send Reset-Mail
    end

    Note over API: Antwort IMMER 200 OK<br/>(Anti-Enumeration)

    API-->>App: 200 "Wenn die E-Mail existiert,<br/>haben wir einen Link gesendet"

    Note over User,App: Spaeter...

    User->>App: Klick Link in Mail
    App->>API: GET /auth/reset?token=...
    API->>DB: Token gueltig?
    API-->>App: 200 + Formular
    User->>App: Neues Passwort
    App->>API: POST /auth/reset-confirm { token, password }
    API->>DB: BEGIN
    API->>DB: UPDATE "user" SET password_hash
    API->>DB: UPDATE token SET consumed_at
    API->>DB: COMMIT
    API-->>App: 200 + Session-Cookie
    App->>User: Direkt eingeloggt
```

**Token-TTLs:** Setup-Token 7 Tage, Reset-Token 1 Stunde.

## 4. Offline-Sync mit Konflikt-Behandlung

```mermaid
sequenceDiagram
    autonumber
    actor Driver as Liefer-Fahrer
    participant App as PWA (Offline)
    participant Local as IndexedDB
    participant API as Backend
    participant DB as PostgreSQL
    actor Other as Anderer User

    Driver->>App: Im Markt, kein Internet
    App->>App: navigator.onLine = false → Banner
    Driver->>App: Tippt "Lieferung erfolgt"
    App->>App: Geo-Position offline holen
    App->>Local: Speichert pending_action<br/>{ client_id: UUID, market_id, type:delivery, geo, client_timestamp }
    App->>Driver: "Offline gespeichert, sync sobald online"

    Note over Other,DB: Inzwischen passiert was anderes:<br/>Anderer User storniert Bestellung

    Other->>API: POST /actions { type:cancel_order, payload.reason: 'Stornierung' }
    API->>DB: INSERT action (cancel_order)<br/>resulting_status: 'gruen'

    Note over Driver,App: Fahrer kommt zurueck in Empfang

    App->>App: navigator.onLine = true
    App->>API: POST /actions/batch-sync<br/>[{client_id, market_id, type:delivery, ...}]
    API->>DB: BEGIN

    loop fuer jede pending_action
        API->>DB: pg_advisory_xact_lock(market_id)
        API->>DB: SELECT computed_status FROM v_market_status WHERE market_id=?

        alt Markt gemergt
            API->>API: Konflikt: MARKET_MERGED
            API->>API: action verwerfen → conflicts
        else Status passt zum erwarteten Vorgaenger
            API->>DB: INSERT action (offline_recorded=true, client_id=...)
            Note over API,DB: client_id unique pro user_id → idempotent.<br/>Doppel-Sync wirft 23505 (unique violation),<br/>Backend ignoriert das stillschweigend.
        else Status passt NICHT
            API->>API: Konflikt erkannt
            API->>API: action verwerfen → conflicts
        end
    end

    API->>DB: COMMIT
    API-->>App: 207 Multi-Status<br/>{synced: [...], conflicts: [...]}
    App->>Local: Loesche synced actions
    App->>Local: Behalte conflicting actions mit Marker

    App->>Driver: Modal:<br/>"1 Aktion uebersprungen, weil der Markt sich geaendert hat.<br/>Details ansehen?"
    Driver->>App: Klick "Details"
    App->>Driver: Zeigt: "Du hast geliefert um 10:15.<br/>Inzwischen wurde die Bestellung um 11:22 von Anna storniert.<br/>Bitte mit Anna abstimmen."
    Driver->>App: Option: "An Admin melden"<br/>oder "Verwerfen"

    alt An Admin melden
        Driver->>App: An Admin melden
        Note over App,API: Field User darf NICHT selbst manual_override.<br/>Stattdessen: Konflikt-Eintrag im Audit-Log,<br/>Admin sieht ihn im Admin-Dashboard.
        App->>API: POST /actions/report-conflict<br/>{ client_id, market_id, intended_type,<br/>conflict: { expected_statuses, actual_status, action_type },<br/>client_timestamp, ... }
        API->>DB: INSERT audit_log<br/>(event='offline_conflict_reported',<br/>payload: alle Details)
        API-->>App: 200
        App->>Local: Loescht aus pending
        Note over Driver,App: Admin sieht den Konflikt, kann via<br/>manual_override entscheiden (mit gesamtem Kontext).
    else Verwerfen
        Driver->>App: Verwerfen
        App->>Local: Loesche aus pending
    end
```

**Wichtig zu Berechtigungen:** `manual_override` ist Admin-only (API gibt 403 für Field User). Field User können in Offline-Konflikten die Aktion verwerfen oder über einen Konflikt-Bericht an den Admin eskalieren. Der Admin sieht alle Konflikt-Berichte im Dashboard und kann mit vollem Kontext entscheiden.

### Erwartete Vorgänger-Status pro Action-Type

Vom Backend für Offline-Sync verwendet:

| Action-Type | Erwarteter Vorgänger-Status |
|-------------|----------------------------|
| `visit` (alle results) | Grün oder Blau |
| `profi_visit` | Rosa |
| `delivery` | Gelb |
| `control` | Orange |
| `cancel_order` | Gelb |
| `manual_override` | beliebig (darf immer) |

**Zusätzliche Konflikt-Gründe** (im strukturierten `conflict`-Objekt oder als `code`-Feld):
- Status-Mismatch: `{ expected_statuses: [...], actual_status, action_type }` (siehe `docs/Reference.md` für die erwarteten Vorgänger pro Action-Type)
- `MARKET_MERGED` – Markt wurde inzwischen gemergt
- `MARKET_INACTIVE` – Markt wurde inzwischen deaktiviert
- `USER_DEACTIVATED` – User wurde inzwischen deaktiviert
- `DUPLICATE_CLIENT_ID` – Action wurde schon einmal gesynct (idempotent ignoriert, nicht als Fehler)

## 5. Background-Jobs

Drei wiederkehrende Jobs, alle idempotent.

```mermaid
sequenceDiagram
    autonumber
    participant Cron
    participant Job as Background-Worker
    participant DB as PostgreSQL
    participant Notify as Postgres NOTIFY

    Note over Cron: Job 1: Reservierungen abräumen<br/>(jede Minute)

    Cron->>Job: trigger expire_reservations
    Job->>DB: BEGIN
    Job->>DB: UPDATE reservation SET active=false<br/>WHERE active=true AND valid_until <= NOW()<br/>RETURNING market_id
    DB-->>Job: market_ids: [uuid, uuid, ...]
    Note over Job,DB: Batch-NOTIFY: ein Event mit allen IDs,<br/>NICHT N einzelne Events
    Job->>DB: pg_notify('markets_bulk_updated',<br/>json_build_object('market_ids', array[...]))
    Job->>DB: COMMIT

    Note over Cron: Job 2: Cooldown-Ablauf signalisieren<br/>(alle 5 Minuten)

    Cron->>Job: trigger broadcast_cooldown_expiry
    Job->>DB: SELECT DISTINCT market_id FROM action a<br/>WHERE a.cooldown_until BETWEEN now-5min AND now<br/>AND NOT EXISTS (SELECT 1 FROM action a2<br/>  WHERE a2.market_id = a.market_id AND a2.created_at > a.created_at)
    DB-->>Job: market_ids
    Job->>DB: pg_notify('markets_bulk_updated', {market_ids: [...]})

    Note over Cron: Job 3: Geo-Anonymisierung<br/>(taeglich nachts)

    Cron->>Job: trigger anonymize_old_geo
    Job->>DB: UPDATE action<br/>SET geo_lat=NULL, geo_lng=NULL,<br/>distance_to_market_meters=NULL,<br/>geo_anonymized_at=NOW()<br/>WHERE created_at < NOW() - INTERVAL '90 days'<br/>AND geo_anonymized_at IS NULL
    DB-->>Job: rows affected
    Job->>DB: INSERT audit_log<br/>(event='geo_anonymization_run', payload: {count: N})
```

**Idempotenz-Garantien:**
- Job 1 (`expire_reservations`) ist idempotent: filtert auf `active=true AND valid_until <= NOW`. Mehrfache Aufrufe sind unschädlich. Wenn der Job während eines Deployments einen Lauf verpasst (z. B. 23:58–00:01), holt er die abgelaufenen Reservierungen beim nächsten Lauf nach. Max. zusätzliche Verzögerung: 1 Minute.
- Job 2 (`broadcast_cooldown_expiry`) feuert nur informativ – bei Skip einfach Skip. Worst Case: User sieht den Markt bis zu 5 Minuten verzögert als „nicht mehr rot".
- Job 3 (`anonymize_old_geo`) filtert auf `geo_anonymized_at IS NULL`. Bei Skip einfach Skip, beim nächsten Lauf nachgeholt.

**Hinweis zur Latenz-Vorgabe:** Die „< 5 Sekunden"-Vorgabe aus dem Lastenheft gilt für **User-getriggerte Aktionen** (visit, delivery, control, cancel_order, manual_override). Für **systemgetriggerte Status-Wechsel** (Reservierungs-Ablauf, Cooldown-Ablauf) gilt eine entspanntere Toleranz: bis zu 1 Minute für Reservierungs-Ablauf, bis zu 5 Minuten für Cooldown-Ablauf.
