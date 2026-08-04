# Checkpoint — Meta Tech Provider / App Review (ClientOn)

**Atualizado:** 2026-08-04  
**App:** ClientOn appmessage  
**App ID:** `4498853590386621`  
**Business Portfolio:** ClientOn (RPS NEGOCIOS DIGITAIS LTDA) — **verificada**

Não versionar neste arquivo: App Secret, verify token, senhas, access tokens `EAA…`.

---

## Status atual

| Item | Status |
|------|--------|
| BM ClientOn verificada | Feito |
| App criado + caso de uso WhatsApp | Feito |
| Independent Tech Provider (iniciou integração) | Feito |
| Verify token + App Secret no ClientOn (Admin → WhatsApp) | Feito |
| Domínios / OAuth / JS SDK (`app.clienton.com.br`) | Feito |
| Webhook Meta → `https://api.clienton.com.br/webhooks/whatsapp` | Feito (confirmar se verificado) |
| Mensagem de teste Cloud API (Configuração da API) | Feito (200 / toast sucesso) |
| Postman `GET /{WABA-ID}/phone_numbers` | Feito (**200**) — WABA `1783017749546414` |
| Contador App Review `whatsapp_business_management` 0→1 | **Aguardando até 24h** |
| Screencasts messaging + management | Enviados (conforme sessão) |
| Formulário tratamento de dados / operadores | Em preenchimento / feito nesta sessão |
| Instruções para analista (web) | Em ajuste — precisa **e-mail real** de login (não o nome “Meta App Review”) |
| URLs Termos / exclusão de dados | **Corrigir** se ainda apontam para `facebook.com` |
| Config ID Embedded Signup | **Pendente** (após Advanced Access) |
| Deploy código Embedded Signup na VPS | Conferir no retomada (commit `2f80c0b` local; deploy sob demanda) |
| App Review enviado / aprovado | **Pendente** |

---

## IDs úteis (não secretos)

| Campo | Valor |
|--------|--------|
| App ID | `4498853590386621` |
| WABA ID (teste API) | `1783017749546414` |
| Phone number ID (teste) | `1342470392272768` |
| Número de teste Meta (display) | `+1 555-637-6798` (Test Number) |

---

## Operadores de dados cadastrados (App Review)

Categoria usada: **Soluções e serviços de TI, incluindo o armazenamento e processamento na nuvem**

1. **RPS NEGOCIOS DIGITAIS LTDA** — Brasil  
2. **Twilio Inc.** — Estados Unidos  
3. **Interserver** — Estados Unidos  
4. **OpenAI, LLC** — Estados Unidos  
5. **Google LLC** (Gemini) — Estados Unidos  

Controlador (`responsible-1`): **RPS NEGOCIOS DIGITAIS LTDA** — país **Brasil**.

`requests-3` (segurança nacional 12 meses): **Não**  
`requests-4` (políticas para autoridades): **Nenhuma das opções acima** (sem política formal documentada)

---

## Usuário de teste para analista Meta

- Criar em Admin → Usuários (tenant com inbox/WhatsApp ok)  
- Nome de exibição: Meta App Review  
- **Login = e-mail real** (não o nome)  
- Senha: gerar forte e guardar no **cofre da empresa** (não commitár no git)  
- Manter ativo ≥ 1 ano  

Modelo de instruções: ver seção no chat / abaixo.

```text
1. Acesse https://app.clienton.com.br/
2. Faça login com e-mail REAL + senha do usuário de teste
3. Login do app é e-mail/senha (não Facebook Login para entrar)
4. Abra Agente / conversas (inbox)
5. Envie mensagem de teste pelo ClientOn e confirme no WhatsApp
6. APIs: WhatsApp Cloud API; public_profile só no Embedded Signup futuro
7. Sem assinatura paga para o teste
```

Facebook Login integrado à plataforma (pergunta da Meta): **Não** (login diário do ClientOn).

---

## Textos prontos (App Review — permissões)

### Descrição do negócio (1 frase)
Somos a ClientOn (RPS Negócios Digitais), plataforma multi-tenant de atendimento e automação no WhatsApp para empresas (pesquisas, suporte e campanhas).

### whatsapp_business_messaging
The ClientOn appmessage app (RPS Negócios Digitais LTDA) is a multi-tenant WhatsApp platform for business messaging: automated flows/bots, human agent inbox, and template campaigns. We request whatsapp_business_messaging to send and receive Cloud API messages on behalf of onboarded client WABAs/phone numbers (routed by phone_number_id), including text/media and delivery status handling. Access is limited to WhatsApp business assets that each client authorizes to our app.

### whatsapp_business_management
The ClientOn appmessage app uses whatsapp_business_management to manage WhatsApp Business assets that clients authorize after onboarding: read WABA and phone metadata, list/create/update message templates for campaigns and flows, and keep accounts ready for Cloud API. Access is limited to client-authorized assets.

### public_profile
Usamos public_profile apenas no Facebook Login for Business / Embedded Signup, para identificar o usuário de negócio que autoriza a WABA. Não usamos para marketing a consumidores finais.

---

## Chamada Postman que deu 200

```http
GET https://graph.facebook.com/v21.0/1783017749546414/phone_numbers
Authorization: Bearer <token temporário da Configuração da API>
```

Token `EAA…` usado no chat foi **exposto** → **regenerar** na Configuração da API e não reutilizar.

---

## Próximos passos (quando retomar)

1. Esperar contador **1 de 1** em `whatsapp_business_management` (até 24h); se não, repetir GET.  
2. Corrigir URLs de **Termos** e **Exclusão de dados** no app (não usar `facebook.com`).  
3. Finalizar instruções do analista com **e-mail real** + senha no cofre.  
4. **Enviar** App Review completo.  
5. Após Advanced Access: criar **Config ID** Embedded Signup → colar App ID + Config ID no ClientOn → deploy se faltar → testar botão **Conectar WhatsApp (Meta)**.  

Docs relacionados:
- [`GUIA-META-TECH-PROVIDER.md`](GUIA-META-TECH-PROVIDER.md)
- [`META-EMBEDDED-SIGNUP.md`](META-EMBEDDED-SIGNUP.md)
- Código: commit `2f80c0b` (`feat(whatsapp): Embedded Signup Meta`)
