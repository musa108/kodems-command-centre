CREATE EXTENSION IF NOT EXISTS postgis;

-- Spatial columns: generated from lat/lng so there is ONE source of truth; GiST indexes for spatial queries.
ALTER TABLE incidents          ADD COLUMN geom geography(Point,4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography) STORED;
ALTER TABLE incident_reports   ADD COLUMN geom geography(Point,4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography) STORED;
ALTER TABLE shelters           ADD COLUMN geom geography(Point,4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography) STORED;
ALTER TABLE warehouses         ADD COLUMN geom geography(Point,4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography) STORED;
ALTER TABLE response_teams     ADD COLUMN geom geography(Point,4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(COALESCE("lastLng","baseLng"), COALESCE("lastLat","baseLat")), 4326)::geography) STORED;
ALTER TABLE geographic_boundaries ADD COLUMN geom geometry(MultiPolygon,4326);
CREATE INDEX incidents_geom_gix        ON incidents USING GIST (geom);
CREATE INDEX incident_reports_geom_gix ON incident_reports USING GIST (geom);
CREATE INDEX shelters_geom_gix         ON shelters USING GIST (geom);
CREATE INDEX warehouses_geom_gix       ON warehouses USING GIST (geom);
CREATE INDEX response_teams_geom_gix   ON response_teams USING GIST (geom);
CREATE INDEX geographic_boundaries_geom_gix ON geographic_boundaries USING GIST (geom);

-- Immutability: audit log and inventory ledger are append-only at the database level.
CREATE OR REPLACE FUNCTION kodems_forbid_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION '% is append-only: % is not permitted', TG_TABLE_NAME, TG_OP USING ERRCODE = 'restrict_violation'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER audit_logs_immutable BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION kodems_forbid_mutation();
CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON audit_logs FOR EACH STATEMENT EXECUTE FUNCTION kodems_forbid_mutation();
CREATE TRIGGER inventory_tx_immutable BEFORE UPDATE OR DELETE ON inventory_transactions FOR EACH ROW EXECUTE FUNCTION kodems_forbid_mutation();
CREATE TRIGGER inventory_tx_no_truncate BEFORE TRUNCATE ON inventory_transactions FOR EACH STATEMENT EXECUTE FUNCTION kodems_forbid_mutation();
-- Status-history tables are also append-only.
CREATE TRIGGER report_hist_immutable   BEFORE UPDATE OR DELETE ON report_status_history FOR EACH ROW EXECUTE FUNCTION kodems_forbid_mutation();
CREATE TRIGGER incident_hist_immutable BEFORE UPDATE OR DELETE ON incident_status_history FOR EACH ROW EXECUTE FUNCTION kodems_forbid_mutation();
CREATE TRIGGER deploy_hist_immutable   BEFORE UPDATE OR DELETE ON deployment_status_history FOR EACH ROW EXECUTE FUNCTION kodems_forbid_mutation();
CREATE TRIGGER incident_upd_immutable  BEFORE UPDATE OR DELETE ON incident_updates FOR EACH ROW EXECUTE FUNCTION kodems_forbid_mutation();
-- Sanity constraints
ALTER TABLE shelters ADD CONSTRAINT shelters_capacity_positive CHECK (capacity > 0);
ALTER TABLE allocation_items ADD CONSTRAINT allocation_qty_positive CHECK (quantity > 0);
ALTER TABLE distribution_items ADD CONSTRAINT distribution_qty_positive CHECK (quantity > 0);
ALTER TABLE affected_households ADD CONSTRAINT household_size_positive CHECK (size > 0);
