-- Templates e jobs de insights gerados por IA (Sprint 3).

CREATE TABLE IF NOT EXISTS ai_insight_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  system_prompt text NOT NULL,
  output_schema jsonb NOT NULL DEFAULT '{"fields":["summary","highlights","risks","opportunities","metrics"]}'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_insight_templates_tenant_active
  ON ai_insight_templates (tenant_id, is_active);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_insight_template_default_per_tenant
  ON ai_insight_templates (tenant_id) WHERE is_default = true;

CREATE TABLE IF NOT EXISTS ai_insight_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  requested_by uuid,
  template_id uuid REFERENCES ai_insight_templates(id) ON DELETE SET NULL,
  prompt_override text,
  resolved_prompt text,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'done', 'failed')),
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_insight_jobs_tenant_created
  ON ai_insight_jobs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_insight_jobs_status
  ON ai_insight_jobs (status, created_at);

CREATE TABLE IF NOT EXISTS ai_insight_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES ai_insight_jobs(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  summary text,
  highlights jsonb NOT NULL DEFAULT '[]'::jsonb,
  risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  opportunities jsonb NOT NULL DEFAULT '[]'::jsonb,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_response text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_insight_results_job
  ON ai_insight_results (job_id);
