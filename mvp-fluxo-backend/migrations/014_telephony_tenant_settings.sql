-- Configurações de telefonia por tenant (gravação das ligações manuais; campanhas têm a própria opção).
CREATE TABLE IF NOT EXISTS telephony_tenant_settings (
  tenant_id uuid PRIMARY KEY,
  record_manual_calls boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
