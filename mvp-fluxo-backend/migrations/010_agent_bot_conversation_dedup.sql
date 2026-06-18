-- Encerra conversas bot_only duplicadas (mesmo telefone aberto) e impede novas duplicatas.

WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id, regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')
      ORDER BY updated_at DESC
    ) AS rn
  FROM agent_conversations
  WHERE lifecycle_status = 'open'
    AND COALESCE(metadata->>'bot_only', 'false') = 'true'
    AND regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') <> ''
)
UPDATE agent_conversations c
SET lifecycle_status = 'closed_manual',
    status = 'historico',
    closed_at = now(),
    closed_by = 'system:bot_dedup',
    updated_at = now()
FROM ranked r
WHERE c.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_conv_open_bot_phone
ON agent_conversations (
  tenant_id,
  (regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'))
)
WHERE lifecycle_status = 'open'
  AND COALESCE(metadata->>'bot_only', 'false') = 'true'
  AND regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') <> '';
