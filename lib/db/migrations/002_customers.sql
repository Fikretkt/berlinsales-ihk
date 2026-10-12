CREATE TABLE customer (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id   UUID NOT NULL REFERENCES company(id) ON DELETE RESTRICT,
    name         VARCHAR(200) NOT NULL,
    address      TEXT,
    phone        VARCHAR(50),
    email        CITEXT,
    notes        TEXT,
    blacklist    BOOLEAN NOT NULL DEFAULT FALSE,
    blacklist_reason TEXT,
    assigned_to  UUID REFERENCES "user"(id) ON DELETE SET NULL,
    created_by   UUID REFERENCES "user"(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customer_company_name ON customer (company_id, name);
CREATE INDEX idx_customer_assigned ON customer (assigned_to);
CREATE INDEX idx_customer_name_trgm ON customer USING gin (name gin_trgm_ops);

CREATE TRIGGER set_updated_at_customer
    BEFORE UPDATE ON customer
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();