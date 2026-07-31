# Brief — Hyperflow como BSP adicional (ClientOn)

**De:** ClientOn (plataforma multi-tenant de fluxos, atendimento e campanhas WhatsApp)  
**Para:** Customer Success / Comercial Hyperflow  
**Assunto:** Uso da **WhatsApp API Hyperflow** (somente API) como broker Meta  
**Data:** 2026-07-30  

---

## 1. Contexto

O ClientOn já opera WhatsApp com **dois providers em paralelo**:

- Meta Cloud API (direto)
- Twilio WhatsApp

A Hyperflow entra como **terceiro BSP**, **sem substituir** Meta nem Twilio.  
Motivo principal: **reduzir a burocracia e o tempo de onboarding de números** que a Twilio impõe aos nossos clientes (ex.: empresas de pesquisa).

Não usaremos o produto de atendimento/builder da Hyperflow (Hyper Conversas). Queremos **apenas o acesso à API oficial do WhatsApp**, com inbox, fluxos, agentes e campanhas rodando no ClientOn.

---

## 2. Modelo desejado

| Item | Requisito |
|------|-----------|
| Produto | **WhatsApp API Hyperflow** (integração técnica) |
| Escopo | Envio (texto, template, mídia) + webhooks (mensagem + status) |
| Multi-tenant | Vários clientes ClientOn; **cada cliente** com 1+ números próprios |
| Isolamento | Credencial/número por conta; webhook resolvido por número ou chave |
| Webhook | URL HTTPS nossa, ex.: `https://api.clienton.com.br/webhooks/hyperflow/...` |
| Produção | Números **próprios do cliente final** (não só número de teste compartilhado) |

Referência pública que já avaliamos:  
`https://messaging.hyperflowapis.global/whatsapp/send-message` (header `apikey`).

---

## 3. Perguntas para o CS

### Onboarding e operação
1. Qual o **prazo típico** para liberar WABA + número próprio do cliente final (CNPJ BR)?  
2. Quais **documentos / etapas** são obrigatórios vs. opcionais?  
3. Quem opera o **display name** e a qualidade do número — Hyperflow, Meta ou o cliente?  
4. É possível **migrar** um número já em Twilio/Meta Cloud para a Hyperflow? Com que impacto?

### Produto técnico (API)
5. Confirma liberação da **WhatsApp API Hyperflow** (não Hyper Conversas) para nosso CNPJ?  
6. Podem compartilhar a **coleção Postman** completa (envio texto/template/imagem/áudio, listagem de templates, webhooks)?  
7. O payload de webhook é **compatível com Cloud API Meta**, ou é formato proprietário Hyperflow?  
8. Como autentica o webhook (assinatura HMAC, token, IP allowlist)?  
9. Limites de **rate limit**, tamanho de mídia e retentativas de webhook?  
10. Ambiente de **sandbox** com número de teste + apikey para POC em 1–2 semanas?

### Templates e compliance
11. Templates: cadastro/aprovação via **painel Hyperflow**, Graph API Meta, ou ambos?  
12. Há restrições a **campanhas / disparos em massa** (opt-in, volume/dia)?  
13. Suporte a **janela 24h**, botões/listas interativas e status (sent/delivered/read/failed + error code)?

### Comercial
14. Modelo de preço: **setup**, **mensalidade por número**, markup sobre Meta, mínimo?  
15. Faturamento Meta (conversas) é **pass-through** na carteira do cliente ou embutido na Hyperflow?  
16. Contrato permite uso da API por **plataforma SaaS multi-tenant** (ClientOn) atendendo N clientes finais?  
17. SLA de suporte (incidente webhook/envio) e canal técnico (e-mail/Slack)?

---

## 4. Critérios de sucesso da POC (sugestão)

1. Número de teste (ou número piloto) enviando texto via API → ClientOn.  
2. Mensagem inbound do WhatsApp → webhook → inbox ClientOn.  
3. Status de entrega/falha refletido no ClientOn.  
4. Envio de **1 template** aprovado ponta a ponta.  

Com isso validamos o adapter técnico antes de onboarding comercial em escala.

---

## 5. Contato / retorno

Pedimos: retorno por escrito nas perguntas acima + indicação de **CS técnico** e link/doc Postman.  
POC desejada: **sandbox em até 14 dias** após liberação da conta.

**ClientOn** — `api.clienton.com.br` / `app.clienton.com.br`
