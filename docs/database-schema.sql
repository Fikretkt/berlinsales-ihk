-- ============================================================================
-- MarktSync Datenbank-Schema (v0.6)
-- PostgreSQL 16+
-- ============================================================================
-- Aenderungen ggü. v0.4:
-- - SQL-Funktion compute_resulting_status entfernt (nur TS im Backend)
-- - Trigger enforce_single_active_vorgang verschaerft:
--     * eigene pg_advisory_xact_lock zur Race-Sicherheit
--     * explizite Gruen-Regeln (nur visit, cancel_order auf Gelb, manual_override)
--     * Insert auf gemergten Markt geblockt
--     * profi_visit nur auf Rosa erlaubt
--     * cancel_order nur auf Gelb erlaubt
-- - cooldown_until = NULL als Konvention bei duration_days = 0
-- - Audit-Events als Kommentar-Liste am Ende
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ============================================================================
-- COMPANY
-- ============================================================================
CREATE TABLE company (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(200) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- USER
-- ============================================================================
CREATE TYPE user_role AS ENUM ('field_user', 'admin');

CREATE TABLE "user" (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID NOT NULL REFERENCES company(id) ON DELETE RESTRICT,
    email           CITEXT NOT NULL UNIQUE,
    password_hash   VARCHAR(255),
    name            VARCHAR(200) NOT NULL,
    role            user_role NOT NULL DEFAULT 'field_user',
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at   TIMESTAMPTZ,

    CONSTRAINT email_format CHECK (email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$')
);

CREATE INDEX idx_user_email ON "user" (email);
CREATE INDEX idx_user_company ON "user" (company_id) WHERE active = TRUE;

-- ============================================================================
-- PASSWORD_RESET_TOKEN
-- ============================================================================
CREATE TYPE token_purpose AS ENUM ('reset', 'setup');

CREATE TABLE password_reset_token (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    token_hash  VARCHAR(255) NOT NULL UNIQUE,
    purpose     token_purpose NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- TTL-Konvention (Backend): purpose='setup' → expires_at = NOW + 7 days
--                          purpose='reset' → expires_at = NOW + 1 hour

CREATE INDEX idx_password_reset_token_user ON password_reset_token (user_id);
CREATE INDEX idx_password_reset_token_expires ON password_reset_token (expires_at)
    WHERE consumed_at IS NULL;

-- ============================================================================
-- CHAIN
-- ============================================================================
CREATE TABLE chain (
    id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name    VARCHAR(100) NOT NULL UNIQUE,
    active  BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO chain (name) VALUES
    ('Edeka'),
    ('Edeka Center'),
    ('Netto Marken-Discount');

-- ============================================================================
-- MARKET
-- ============================================================================
CREATE TABLE market (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chain_id            UUID NOT NULL REFERENCES chain(id) ON DELETE RESTRICT,
    name                VARCHAR(200) NOT NULL,
    gln                 CHAR(13) NOT NULL,
    street              VARCHAR(200) NOT NULL,
    house_number        VARCHAR(20) NOT NULL,
    postal_code         CHAR(5) NOT NULL,
    city                VARCHAR(100) NOT NULL DEFAULT 'Berlin',
    district            VARCHAR(100),
    lat                 DECIMAL(10, 7) NOT NULL,
    lng                 DECIMAL(10, 7) NOT NULL,
    contact_person      VARCHAR(200),
    contact_phone       VARCHAR(50),
    active              BOOLEAN NOT NULL DEFAULT TRUE,
    merged_into_id      UUID REFERENCES market(id),
    created_by_user_id  UUID REFERENCES "user"(id) ON DELETE SET NULL,
    external_id         VARCHAR(100),
    synced_at           TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT gln_format CHECK (gln ~ '^[0-9]{13}$'),
    CONSTRAINT postal_code_format CHECK (postal_code ~ '^[0-9]{5}$'),
    CONSTRAINT merged_into_not_self CHECK (merged_into_id IS NULL OR merged_into_id != id)
);

CREATE UNIQUE INDEX idx_market_gln_active
    ON market (gln)
    WHERE active = TRUE AND merged_into_id IS NULL;

CREATE INDEX idx_market_chain ON market (chain_id) WHERE active = TRUE;
CREATE INDEX idx_market_name_trgm ON market USING gin (name gin_trgm_ops);
CREATE INDEX idx_market_district ON market (district) WHERE active = TRUE;
CREATE INDEX idx_market_postal ON market (postal_code);
CREATE INDEX idx_market_created_at ON market (created_at DESC);  -- fuer "neue Maerkte"-Report

-- ============================================================================
-- ACTION
-- ============================================================================
CREATE TYPE action_type AS ENUM (
    'visit',
    'profi_visit',
    'delivery',
    'control',
    'cancel_order',
    'manual_override'
);

CREATE TYPE action_result AS ENUM (
    'success',
    'escalation',
    'declined',
    'no_contact',
    'ok',
    'problem'
);

CREATE TYPE market_status AS ENUM (
    'gruen', 'blau', 'gelb', 'orange', 'rosa', 'rot', 'grau'
);

CREATE TABLE action (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    market_id                   UUID NOT NULL REFERENCES market(id) ON DELETE RESTRICT,
    user_id                     UUID NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
    type                        action_type NOT NULL,
    result                      action_result,

    resulting_status            market_status NOT NULL,

    -- Cooldown-Snapshot. NULL bedeutet: kein Cooldown (Konvention bei duration_days = 0)
    cooldown_until              TIMESTAMPTZ,

    geo_lat                     DECIMAL(10, 7),
    geo_lng                     DECIMAL(10, 7),
    distance_to_market_meters   INTEGER,  -- BACKEND berechnet das
    geo_anonymized_at           TIMESTAMPTZ,

    offline_recorded            BOOLEAN NOT NULL DEFAULT FALSE,
    client_timestamp            TIMESTAMPTZ,  -- bei batch-sync Pflicht, bei Online optional
    client_id                   VARCHAR(64),  -- Idempotenz-Key bei batch-sync (UUID vom Client)

    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payload                     JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT valid_type_result CHECK (
        (type = 'visit' AND result IN ('success', 'escalation', 'declined', 'no_contact'))
        OR (type = 'profi_visit' AND result IN ('success', 'declined'))
        OR (type = 'delivery' AND result IS NULL)
        OR (type = 'control' AND result IN ('ok', 'problem'))
        OR (type = 'cancel_order' AND result IS NULL)
        OR (type = 'manual_override' AND result IS NULL)
    ),

    CONSTRAINT manual_override_payload CHECK (
        type != 'manual_override'
        OR (
            payload ? 'target_status'
            AND payload->>'target_status' IN ('gruen','gelb','orange','rosa','rot','grau')
            AND payload ? 'reason'
            AND length(payload->>'reason') > 0
        )
    ),

    CONSTRAINT cancel_order_has_reason CHECK (
        type != 'cancel_order'
        OR (payload ? 'reason' AND length(payload->>'reason') > 0)
    ),

    CONSTRAINT control_problem_has_description CHECK (
        NOT (type = 'control' AND result = 'problem')
        OR (payload ? 'problem_description' AND length(payload->>'problem_description') > 0)
    )
);

-- client_id ist Idempotenz-Key fuer offline batch-sync.
-- Wenn gesetzt, darf er nur einmal pro User vorkommen.
CREATE UNIQUE INDEX idx_action_client_id
    ON action (user_id, client_id)
    WHERE client_id IS NOT NULL;

CREATE INDEX idx_action_market_created ON action (market_id, created_at DESC);
CREATE INDEX idx_action_user_created ON action (user_id, created_at DESC);
CREATE INDEX idx_action_type ON action (type, created_at);
CREATE INDEX idx_action_created_at ON action (created_at);
CREATE INDEX idx_action_cooldown_until ON action (cooldown_until) WHERE cooldown_until IS NOT NULL;
CREATE INDEX idx_action_geo_anonymize ON action (created_at) WHERE geo_anonymized_at IS NULL;

-- ============================================================================
-- TRIGGER: 1 aktiver Vorgang pro Markt + alle Uebergangsregeln zentral
-- ============================================================================
-- Der Trigger nimmt selbst einen Advisory Lock pro market_id. Das Backend nimmt
-- denselben Lock zusaetzlich, sodass parallele Sessions sauber serialisiert
-- werden, BEVOR sie ueberhaupt INSERT versuchen.
-- Damit ist die "1-Vorgang-pro-Markt"-Regel race-safe gegen:
--   - parallele Backend-Requests
--   - direkte SQL-Inserts (Migrations, Bugfixes, manuelles psql)
-- Solange jeder Insert durch diesen Trigger geht.

CREATE OR REPLACE FUNCTION enforce_single_active_vorgang()
RETURNS TRIGGER AS $$
DECLARE
    market_active BOOLEAN;
    market_merged UUID;
    user_active BOOLEAN;
    last_resulting_status market_status;
    last_cooldown_until TIMESTAMPTZ;
BEGIN
    -- Advisory Lock auf Markt-Ebene. Wird beim COMMIT/ROLLBACK automatisch
    -- freigegeben. Gleicher Schluessel wie Backend nutzt.
    PERFORM pg_advisory_xact_lock(hashtext(NEW.market_id::TEXT));

    -- Inaktive User duerfen keine Actions inserten
    SELECT active INTO user_active FROM "user" WHERE id = NEW.user_id;
    IF user_active IS NOT TRUE THEN
        RAISE EXCEPTION 'User ist inaktiv - keine Actions moeglich'
            USING ERRCODE = 'P0006';
    END IF;

    -- Markt existiert + nicht gemergt?
    SELECT active, merged_into_id INTO market_active, market_merged
    FROM market WHERE id = NEW.market_id;

    IF market_merged IS NOT NULL THEN
        RAISE EXCEPTION 'Markt wurde gemergt in % - kein Insert moeglich', market_merged
            USING ERRCODE = 'P0003';
    END IF;

    -- manual_override darf immer (auch auf inaktive Maerkte, fuer Wiederaktivierung)
    IF NEW.type = 'manual_override' THEN
        RETURN NEW;
    END IF;

    -- Inaktiver Markt: keine normalen Aktionen
    IF market_active = FALSE THEN
        RAISE EXCEPTION 'Markt ist inaktiv (grau) - nur manual_override moeglich'
            USING ERRCODE = 'P0004';
    END IF;

    -- Letzte vorherige Action holen
    SELECT resulting_status, cooldown_until
    INTO last_resulting_status, last_cooldown_until
    FROM action
    WHERE market_id = NEW.market_id
      AND created_at < NEW.created_at
    ORDER BY created_at DESC
    LIMIT 1;

    -- Effektiven Status berechnen (selbe Logik wie View)
    -- Wichtig: cooldown_until = NULL gilt als "kein Cooldown"
    IF last_cooldown_until IS NOT NULL AND last_cooldown_until > NOW() THEN
        -- Cooldown laeuft: alles ausser manual_override blockiert
        RAISE EXCEPTION 'Markt im Cooldown bis %', last_cooldown_until
            USING ERRCODE = 'P0002';
    END IF;

    -- Aktiver Vorgang: nur erlaubte Folge-Aktionen
    IF last_resulting_status IN ('gelb', 'orange', 'rosa') THEN

        IF last_resulting_status = 'gelb' AND NEW.type IN ('delivery', 'cancel_order') THEN
            RETURN NEW;
        END IF;

        IF last_resulting_status = 'orange' AND NEW.type = 'control' THEN
            RETURN NEW;
        END IF;

        IF last_resulting_status = 'rosa' AND NEW.type = 'profi_visit' THEN
            RETURN NEW;
        END IF;

        RAISE EXCEPTION 'Markt hat aktiven Vorgang (Status %), Aktion % nicht erlaubt',
            last_resulting_status, NEW.type
            USING ERRCODE = 'P0001';
    END IF;

    -- Markt ist effektiv gruen (keine vorherige Action ODER letzte war gruen/rot-abgelaufen)
    -- Erlaubt: visit
    -- Verboten: profi_visit (nur auf Rosa), delivery (nur auf Gelb),
    --           control (nur auf Orange), cancel_order (nur auf Gelb)
    IF NEW.type = 'visit' THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Markt ist gruen, Aktion % nicht erlaubt (nur visit oder manual_override)',
        NEW.type
        USING ERRCODE = 'P0005';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_single_active_vorgang
    BEFORE INSERT ON action
    FOR EACH ROW
    EXECUTE FUNCTION enforce_single_active_vorgang();

-- ============================================================================
-- NOTE
-- ============================================================================
CREATE TABLE note (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    market_id       UUID NOT NULL REFERENCES market(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
    content         TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    editable_until  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),

    CONSTRAINT content_not_empty CHECK (LENGTH(TRIM(content)) > 0)
);

CREATE INDEX idx_note_market_created ON note (market_id, created_at DESC);

-- ============================================================================
-- RESERVATION
-- ============================================================================
-- Reservierung ist Parallel-Dimension. Erlaubt auf Status:
--   gruen, gelb, orange, rosa
-- Verboten auf:
--   blau (gibt es nur als Reservierungs-Anzeige), rot, grau
-- Wird im Backend erzwungen (nicht im Trigger, da reservation eigene Tabelle)

CREATE TABLE reservation (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    market_id             UUID NOT NULL REFERENCES market(id) ON DELETE CASCADE,
    user_id               UUID NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
    valid_until           TIMESTAMPTZ NOT NULL,
    active                BOOLEAN NOT NULL DEFAULT TRUE,
    cancelled_at          TIMESTAMPTZ,
    cancelled_by_user_id  UUID REFERENCES "user"(id) ON DELETE SET NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_reservation_one_active_per_market
    ON reservation (market_id)
    WHERE active = TRUE;

CREATE INDEX idx_reservation_user_active ON reservation (user_id) WHERE active = TRUE;
CREATE INDEX idx_reservation_expires ON reservation (valid_until) WHERE active = TRUE;

-- ============================================================================
-- COOLDOWN_RULE
-- ============================================================================
CREATE TABLE cooldown_rule (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action_type         action_type NOT NULL,
    result              action_result,
    duration_days       INTEGER NOT NULL,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by_user_id  UUID REFERENCES "user"(id) ON DELETE SET NULL,

    CONSTRAINT duration_non_negative CHECK (duration_days >= 0)
);

CREATE UNIQUE INDEX idx_cooldown_rule_unique
    ON cooldown_rule (action_type, COALESCE(result::TEXT, '_null'));

-- Konvention im Backend:
--   duration_days = 0  =>  action.cooldown_until = NULL
--   duration_days > 0  =>  action.cooldown_until = NOW() + duration_days

INSERT INTO cooldown_rule (action_type, result, duration_days) VALUES
    ('visit', 'success', 0),
    ('visit', 'no_contact', 3),
    ('visit', 'declined', 30),
    ('visit', 'escalation', 0),
    ('profi_visit', 'success', 0),
    ('profi_visit', 'declined', 60),
    ('delivery', NULL, 0),
    ('control', 'ok', 21),
    ('control', 'problem', 0);

-- ============================================================================
-- AUDIT_LOG
-- ============================================================================
-- Erlaubte Event-Namen — Single Source of Truth: docs/Reference.md
-- Diese Liste MUSS synchron mit AUDIT_EVENTS in lib/audit/events.ts sein.
CREATE TABLE audit_log (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID REFERENCES "user"(id) ON DELETE SET NULL,
    event       VARCHAR(100) NOT NULL,
    payload     JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT audit_event_in_allowed_list CHECK (event IN (
        'user_invited', 'user_invited_email_failed', 'user_invitation_resent',
        'user_activated', 'user_deactivated', 'user_role_changed',
        'market_created', 'market_updated', 'market_deactivated',
        'market_reactivated', 'market_merged', 'markets_csv_imported',
        'cooldown_rule_changed', 'chain_created', 'chain_deactivated',
        'manual_override_performed', 'reservation_cancelled_by_admin',
        'geo_anonymization_run',
        'offline_conflict_reported', 'offline_conflict_resolved'
    ))
);

CREATE INDEX idx_audit_log_event ON audit_log (event, created_at DESC);
CREATE INDEX idx_audit_log_user ON audit_log (user_id, created_at DESC);

-- ============================================================================
-- TRIGGER: updated_at automatisch
-- ============================================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_market
    BEFORE UPDATE ON market
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================================
-- VIEW: berechneter Markt-Status
-- ============================================================================
-- 1. market.active = false             -> grau
-- 2. cooldown_until > NOW (nicht NULL) -> rot
-- 3. Sonst: resulting_status der letzten Action (oder gruen wenn keine)
--
-- Reservation kommt zusaetzlich als Spalten, beeinflusst computed_status nicht.

CREATE OR REPLACE VIEW v_market_status AS
WITH last_action AS (
    SELECT DISTINCT ON (a.market_id)
        a.market_id,
        a.resulting_status,
        a.cooldown_until,
        a.type AS last_action_type,
        a.result AS last_action_result,
        a.created_at AS last_action_at,
        a.user_id AS last_action_user_id
    FROM action a
    ORDER BY a.market_id, a.created_at DESC
),
active_reservation AS (
    SELECT DISTINCT ON (market_id)
        market_id,
        user_id AS reserved_by_user_id,
        valid_until AS reservation_valid_until
    FROM reservation
    WHERE active = TRUE AND valid_until > NOW()
)
SELECT
    m.id AS market_id,
    m.name,
    m.gln,
    CASE
        WHEN m.active = FALSE THEN 'grau'::market_status
        WHEN la.cooldown_until IS NOT NULL AND la.cooldown_until > NOW() THEN 'rot'::market_status
        WHEN la.resulting_status IS NOT NULL THEN la.resulting_status
        ELSE 'gruen'::market_status
    END AS computed_status,
    ar.reserved_by_user_id,
    ar.reservation_valid_until,
    la.cooldown_until,
    la.last_action_type,
    la.last_action_result,
    la.last_action_user_id,
    la.last_action_at
FROM market m
LEFT JOIN last_action la ON la.market_id = m.id
LEFT JOIN active_reservation ar ON ar.market_id = m.id
WHERE m.merged_into_id IS NULL;

-- ============================================================================
-- BACKEND-INSERT-ABLAUF (Pseudo-SQL)
-- ============================================================================
-- BEGIN;
--   -- 1. Advisory Lock pro Markt (gleicher Hash wie Trigger). Verhindert,
--   --    dass parallele Backend-Pfade ueberhaupt erst INSERT versuchen.
--   SELECT pg_advisory_xact_lock(hashtext(:market_id::TEXT));
--
--   -- 2. resulting_status im Backend berechnen (TypeScript)
--   --    (computeResultingStatus(type, result, target_status))
--
--   -- 3. cooldown_until aus aktueller Regel berechnen
--   --    duration_days = 0 -> NULL
--   --    duration_days > 0 -> NOW() + interval 'X days'
--
--   -- 4. INSERT. Trigger prueft Vorgangs-Regel.
--   INSERT INTO action (...) VALUES (...);
--
--   -- 5. NOTIFY. Payload klein halten (Markt-ID + neuer Status).
--   --    Frontend macht Detail-Refetch ueber REST.
--   --    NOTIFY-Payload-Limit: 8000 Bytes inkl. Channel-Name.
--   SELECT pg_notify('market_updated',
--                    json_build_object('market_id', :market_id, 'status', :status)::TEXT);
-- COMMIT;

-- ============================================================================
-- BACKEND-RESERVATION-INSERT-ABLAUF (Pseudo-SQL)
-- ============================================================================
-- BEGIN;
--   -- 1. Advisory Lock pro Markt
--   SELECT pg_advisory_xact_lock(hashtext(:market_id::TEXT));
--
--   -- 2. Aktuellen Status holen (View)
--   SELECT computed_status FROM v_market_status WHERE market_id = :market_id;
--
--   -- 3. Status-Check im Backend: nur gruen/gelb/orange/rosa
--   --    Bei verbotenem Status: RESERVATION_NOT_ALLOWED_FOR_STATUS (409)
--
--   -- 4. INSERT versuchen
--   INSERT INTO reservation (...) VALUES (..., active=true);
--   --    Bei unique violation (23505): Backend mappt auf RESERVATION_EXISTS (409)
--
--   -- 5. NOTIFY market_updated (gleicher Channel wie Action-Insert)
--   SELECT pg_notify('market_updated',
--                    json_build_object('market_id', :market_id,
--                                      'status', :current_status)::TEXT);
-- COMMIT;
