-- Regras de roteamento: origem de entrada -> fluxo

CREATE TABLE IF NOT EXISTS inbound_entry_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  label text NOT NULL,
  source_type text NOT NULL,
  source_key text NOT NULL,
  flow_id uuid NOT NULL,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inbound_route_tenant_source
  ON inbound_entry_routes (tenant_id, source_type, source_key);

CREATE INDEX IF NOT EXISTS idx_inbound_route_tenant_flow
  ON inbound_entry_routes (tenant_id, flow_id);

CREATE INDEX IF NOT EXISTS idx_inbound_route_active
  ON inbound_entry_routes (tenant_id, active)
  WHERE active = true;
