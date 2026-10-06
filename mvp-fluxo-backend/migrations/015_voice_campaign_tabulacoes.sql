-- Tabulações por campanha de voz, resultado técnico da ligação e retorno agendado.
CREATE TABLE IF NOT EXISTS voice_campaign_tabulacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  campaign_id uuid NOT NULL REFERENCES voice_campaigns(id) ON DELETE CASCADE,
  label text NOT NULL,
  description text,
  outcome text NOT NULL DEFAULT 'done',
  is_success boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_voice_campaign_tabulacoes_outcome CHECK (outcome IN ('done', 'retry', 'do_not_call', 'callback'))
);

CREATE INDEX IF NOT EXISTS idx_voice_campaign_tabulacoes_campaign
  ON voice_campaign_tabulacoes (campaign_id, active, sort_order);

ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS result text;
ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS tabulacao_is_success boolean;
ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS callback_at timestamptz;

ALTER TABLE voice_campaign_contacts ADD COLUMN IF NOT EXISTS callback_user_id uuid;
ALTER TABLE voice_campaign_contacts ADD COLUMN IF NOT EXISTS last_call_result text;

ALTER TABLE voice_campaign_contacts DROP CONSTRAINT IF EXISTS chk_voice_campaign_contacts_status;
ALTER TABLE voice_campaign_contacts ADD CONSTRAINT chk_voice_campaign_contacts_status
  CHECK (status IN ('pending', 'in_call', 'retry', 'done', 'exhausted', 'do_not_call', 'invalid'));

-- Resultado das ligações já feitas, a partir da sinalização gravada.
UPDATE voice_calls SET result = CASE
    WHEN dial_status = 'ANSWER' THEN 'answered'
    WHEN dial_status = 'CANCEL' THEN 'cancelled'
    WHEN hangup_cause IN ('1', '22', '28') THEN 'invalid_number'
    WHEN dial_status = 'BUSY' OR hangup_cause = '17' THEN 'busy'
    WHEN hangup_cause IN ('20', '27') THEN 'unavailable'
    WHEN dial_status = 'NOANSWER' OR hangup_cause IN ('18', '19') THEN 'no_answer'
    ELSE 'carrier_failure'
  END
WHERE result IS NULL AND ended_at IS NOT NULL AND dial_status IS NOT NULL;
