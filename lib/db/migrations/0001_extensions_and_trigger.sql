-- =============================================================================
-- 0001: Trigger-Funktion, View, updated_at-Trigger, Seed-Daten
-- =============================================================================
-- Wird NACH den Drizzle-Schema-Migrations (0000_*) ausgeführt.
-- Postgres-Extensions (citext, pg_trgm, uuid-ossp) werden vom Migrate-Runner
-- VOR allen Migrations installiert (siehe scripts/migrate.ts).
--
-- Enthält alles, was Drizzle nicht selbst kann:
--  - PL/pgSQL-Trigger-Funktion enforce_single_active_vorgang (P0001-P0006)
--  - updated_at-Trigger für market
--  - View v_market_status
--  - Seed-Daten: chain + cooldown_rule
-- =============================================================================

-- =============================================================================
-- TRIGGER: enforce_single_active_vorgang
-- =============================================================================
-- Logik 1:1 aus docs/database-schema.sql. Codes P0001-P0006.
-- Eigener Advisory Lock pro market_id (Doppel-Schutz zusätzlich zum Backend).

CREATE OR REPLACE FUNCTION enforce_single_active_vorgang()
RETURNS TRIGGER AS $$
DECLARE
    market_active BOOLEAN;
    market_merged UUID;
    user_active BOOLEAN;
    last_resulting_status market_status;
    last_cooldown_until TIMESTAMPTZ;
BEGIN
    -- 1. Advisory Lock pro market_id. Wird beim COMMIT/ROLLBACK freigegeben.
    PERFORM pg_advisory_xact_lock(hashtext(NEW.market_id::TEXT));

    -- 2. User aktiv?
    SELECT active INTO user_active FROM "user" WHERE id = NEW.user_id;
    IF user_active IS NOT TRUE THEN
        RAISE EXCEPTION 'User ist inaktiv - keine Actions moeglich'
            USING ERRCODE = 'P0006';
    END IF;

    -- 3. Markt gemergt? (alle Aktionen geblockt, auch manual_override)
    SELECT active, merged_into_id INTO market_active, market_merged
    FROM market WHERE id = NEW.market_id;

    IF market_merged IS NOT NULL THEN
        RAISE EXCEPTION 'Markt wurde gemergt in % - kein Insert moeglich', market_merged
            USING ERRCODE = 'P0003';
    END IF;

    -- 4. manual_override darf immer (auch auf inaktive Maerkte - Wiederaktivierung)
    IF NEW.type = 'manual_override' THEN
        RETURN NEW;
    END IF;

    -- 5. Inaktiver Markt: nur manual_override (siehe oben)
    IF market_active = FALSE THEN
        RAISE EXCEPTION 'Markt ist inaktiv (grau) - nur manual_override moeglich'
            USING ERRCODE = 'P0004';
    END IF;

    -- 6. Letzte vorherige Action holen
    SELECT resulting_status, cooldown_until
    INTO last_resulting_status, last_cooldown_until
    FROM action
    WHERE market_id = NEW.market_id
      AND created_at < NEW.created_at
    ORDER BY created_at DESC
    LIMIT 1;

    -- 7. Cooldown laeuft? (cooldown_until IS NULL = kein Cooldown, Konvention)
    IF last_cooldown_until IS NOT NULL AND last_cooldown_until > NOW() THEN
        RAISE EXCEPTION 'Markt im Cooldown bis %', last_cooldown_until
            USING ERRCODE = 'P0002';
    END IF;

    -- 8. Aktiver Vorgang (Gelb/Orange/Rosa): nur passende Folge-Aktion erlaubt
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

    -- 9. Markt effektiv gruen: nur visit erlaubt (manual_override schon oben durch)
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

-- =============================================================================
-- TRIGGER: updated_at automatisch für market
-- =============================================================================
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

-- =============================================================================
-- VIEW: v_market_status
-- =============================================================================
-- Berechneter Status:
--   1. market.active = FALSE                          -> grau
--   2. cooldown_until IS NOT NULL AND > NOW           -> rot
--   3. Sonst: resulting_status der letzten Action
--   4. Keine Actions                                  -> gruen
--
-- Liefert KEIN last_action_payload (Performance bei Listenansicht).
-- Detail-Endpoint macht separaten Join für payload.

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

-- =============================================================================
-- SEED: chain (Berlin+Brandenburg Edeka-Familie + REWE)
-- =============================================================================
-- Reichelt + Marktkauf gehören geschäftlich zur Edeka-Familie, sind aber als
-- eigene Marken im Frontend sichtbar (Außendienstler kennen die Marken-Namen).
-- NP-MARKT = Edeka-Discounter, NAH & GUT = Edeka-Nahversorger.
INSERT INTO chain (name) VALUES
    ('Edeka'),
    ('Edeka Center'),
    ('NAH & GUT'),
    ('NP-Markt'),
    ('Marktkauf'),
    ('Reichelt'),
    ('REWE'),
    ('REWE Center')
ON CONFLICT (name) DO NOTHING;

-- =============================================================================
-- SEED: cooldown_rule (Defaults, Admin-konfigurierbar)
-- =============================================================================
INSERT INTO cooldown_rule (action_type, result, duration_days) VALUES
    ('visit', 'success', 0),
    ('visit', 'no_contact', 3),
    ('visit', 'declined', 30),
    ('visit', 'escalation', 0),
    ('profi_visit', 'success', 0),
    ('profi_visit', 'declined', 60),
    ('delivery', NULL, 0),
    ('control', 'ok', 21),
    ('control', 'problem', 0)
ON CONFLICT DO NOTHING;
