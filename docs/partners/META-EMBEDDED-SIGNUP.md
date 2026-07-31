# Meta Embedded Signup (Tech Provider) — ClientOn

Onboarding self-service de números WhatsApp Cloud API via popup da Meta, sem colar token manualmente (Opção B continua como fallback).

## Retomada (fazer depois)

**Código:** implementado no repo (UI `/admin/whatsapp` + APIs). Falta **deploy** se ainda não foi para a VPS.

**Manual na Meta (obrigatório antes de usar o botão):**

1. App Meta ClientOn + App Secret  
2. Allowlist `app.clienton.com.br` (+ OAuth redirect URIs)  
3. Login for Business → Config ID (Embedded Signup WhatsApp)  
4. Colar App ID / Config ID / Secret no admin WhatsApp (ou `.env`)  
5. App Review: `whatsapp_business_management` + `whatsapp_business_messaging`  
6. Webhook app: `https://api.clienton.com.br/webhooks/whatsapp` (`messages`, `account_update`)  
7. Testar **Conectar WhatsApp (Meta)** num tenant piloto  

Relacionado: brief Hyperflow em [`BRIEF-HYPERFLOW-BSP.md`](BRIEF-HYPERFLOW-BSP.md) (BSP adicional, paralelo).

## O que o ClientOn faz

1. Admin clica **Conectar WhatsApp (Meta)** em `/admin/whatsapp`
2. Facebook JS SDK abre o Embedded Signup (`config_id`)
3. Cliente autentica, escolhe/cria BM + WABA, verifica número (OTP)
4. Frontend recebe `waba_id`, `phone_number_id` e `code` (TTL ~30s)
5. Backend (`POST /api/whatsapp/channels/embedded-signup`):
   - troca `code` → business token
   - `POST /{waba-id}/subscribed_apps`
   - `POST /{phone-number-id}/register` (PIN 6 dígitos gerado e cifrado)
   - persiste canal `whatsapp_cloud_api` (mesmo modelo da Opção B)
6. Mensagens entram no webhook único `https://api.clienton.com.br/webhooks/whatsapp` (tenant por `phone_number_id`)

## Configuração no ClientOn

| Variável / setting | Uso |
|--------------------|-----|
| `META_APP_ID` ou UI **Meta App ID** | App Meta da ClientOn |
| `META_EMBEDDED_SIGNUP_CONFIG_ID` ou UI **Config ID** | Login for Business (WhatsApp) |
| `WHATSAPP_APP_SECRET` / `META_APP_SECRET` ou UI **App Secret** | Troca do code + assinatura webhook |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | GET de verificação do webhook |

`GET /api/whatsapp/embedded-signup/config` retorna `{ enabled, appId, configId, graphVersion }` — `enabled` só se os três (App ID, Config ID, Secret) estiverem presentes.

## Checklist no Meta App Dashboard

1. **App** da ClientOn (Business) com produto WhatsApp
2. **Allowed domains**: `app.clienton.com.br` (+ `localhost` em dev)
3. **Valid OAuth Redirect URIs** conforme Login for Business
4. **Facebook Login for Business** → criar configuração Embedded Signup WhatsApp → anotar **Config ID**
5. Permissões: `whatsapp_business_management`, `whatsapp_business_messaging` → **App Review**
6. Webhook do app: Callback `https://api.clienton.com.br/webhooks/whatsapp`, verify token alinhado; campos `messages` e `account_update`
7. (Recomendado) candidatura ao programa **Tech Provider** da Meta para limites e governança

## Operação do cliente final

- Como Tech Provider, o **cliente** adiciona método de pagamento na própria WABA (cartão Meta)
- Display name / qualidade do número seguem regras Meta
- Após conectar, criar rota inbound em `/admin/inbound` apontando o `source_key` Meta para o fluxo desejado

## Referências

- [Embedded Signup](https://developers.facebook.com/docs/whatsapp/embedded-signup/)
- [Onboarding as Tech Provider](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-customers-as-a-tech-provider)
- Opção B manual: `DEPLOY_WHATSAPP_VPS_COMPLETO.md`
