-- Agendamentos genéricos por tenant (exames, visitas, pesquisas, etc.)
-- Modelo: um "service" é o que pode ser agendado (duração fixa); pode operar em
-- modo 'pool' (N vagas simultâneas, sem recurso nomeado) ou 'resource' (precisa
-- reservar um recurso específico com agenda própria: profissional, sala, imóvel...).

CREATE TABLE IF NOT EXISTS appointment_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  duration_minutes integer NOT NULL DEFAULT 30,
  capacity_mode text NOT NULL DEFAULT 'pool',
  pool_capacity integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_appointment_services_capacity_mode
    CHECK (capacity_mode IN ('pool', 'resource'))
);

CREATE INDEX IF NOT EXISTS idx_appointment_services_tenant
  ON appointment_services (tenant_id, active, name);

CREATE TABLE IF NOT EXISTS appointment_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  service_id uuid NOT NULL REFERENCES appointment_services(id) ON DELETE CASCADE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointment_resources_service
  ON appointment_resources (tenant_id, service_id, active);

-- Expediente/disponibilidade recorrente. owner_type indica se a regra é do
-- service (modo pool) ou de um resource específico (modo resource).
CREATE TABLE IF NOT EXISTS appointment_availability_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  service_id uuid NOT NULL REFERENCES appointment_services(id) ON DELETE CASCADE,
  resource_id uuid REFERENCES appointment_resources(id) ON DELETE CASCADE,
  weekday integer NOT NULL,
  start_time text NOT NULL,
  end_time text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_appointment_availability_weekday CHECK (weekday BETWEEN 0 AND 6)
);

CREATE INDEX IF NOT EXISTS idx_appointment_availability_service
  ON appointment_availability_rules (tenant_id, service_id, resource_id, weekday);

-- Bloqueios pontuais (feriado, manutenção, folga) que reduzem a disponibilidade.
CREATE TABLE IF NOT EXISTS appointment_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  service_id uuid REFERENCES appointment_services(id) ON DELETE CASCADE,
  resource_id uuid REFERENCES appointment_resources(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointment_blocks_window
  ON appointment_blocks (tenant_id, service_id, resource_id, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  service_id uuid NOT NULL REFERENCES appointment_services(id) ON DELETE RESTRICT,
  resource_id uuid REFERENCES appointment_resources(id) ON DELETE SET NULL,
  client_id uuid,
  client_name text,
  phone_e164 text,
  scheduled_start timestamptz NOT NULL,
  scheduled_end timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'booked',
  reminder_sent_at timestamptz,
  external_calendar_event_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_appointments_status
    CHECK (status IN ('booked', 'cancelled', 'completed', 'no_show'))
);

CREATE INDEX IF NOT EXISTS idx_appointments_tenant_service_time
  ON appointments (tenant_id, service_id, scheduled_start);

CREATE INDEX IF NOT EXISTS idx_appointments_tenant_resource_time
  ON appointments (tenant_id, resource_id, scheduled_start);

CREATE INDEX IF NOT EXISTS idx_appointments_tenant_status
  ON appointments (tenant_id, status, scheduled_start);
