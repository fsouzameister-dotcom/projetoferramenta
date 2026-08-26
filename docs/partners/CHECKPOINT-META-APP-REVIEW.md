# Checkpoint — Meta Tech Provider / App Review (ClientOn)

**Atualizado:** 2026-08-26  
**App:** ClientOn appmessage  
**App ID:** `4498853590386621`  
**Business Portfolio:** ClientOn (RPS NEGOCIOS DIGITAIS LTDA) — **verificada** (ID `1254823106416280`)

Não versionar neste arquivo: App Secret, verify token, senhas, access tokens `EAA…`.

---

## Status atual (2026-08-26)

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
| URL Termos de Serviço | **Corrigido** 2026-08-26 (`facebook.com` → `https://www.clienton.com.br/`) |
| URL Exclusão de dados do usuário | **Corrigido** 2026-08-26 (`facebook.com` → `https://www.clienton.com.br/`) |
| URL Política de Privacidade | Já estava correta (`https://www.clienton.com.br/`) |
| Instruções para analista (web) | Já estava correta desde 2026-08-04 (e-mail real `meta-review@clienton.com.br` + senha) — **trocar a senha** por ter sido exposta em print nesta sessão |
| Screencasts messaging + management | Enviados (conforme sessão 2026-08-04) |
| Formulário tratamento de dados / operadores | Feito |
| **Verificação do acesso** (empresa provedora de tecnologia) | **Enviada 2026-08-26** — status "Em análise", prazo ~5 dias. Prazo limite da Meta para concluir: **25/10/2026** (senão gera restrição no app) |
| **App Review enviado** (`whatsapp_business_messaging`, `whatsapp_business_management`, `public_profile`) | **Enviado 2026-08-26** — status "Análise em andamento", prazo ~20 dias |
| Config ID Embedded Signup | **Pendente** (só depois do Advanced Access ser aprovado) |
| Deploy código Embedded Signup na VPS | Feito (2026-08-04, deploy local + push `91d8fae`) |
| App em modo Live (hoje: "Em desenvolvimento") | **Pendente** — só após aprovação do App Review |

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

1. **Aguardar** resultado da Verificação do acesso (~5 dias) e do App Review (~20 dias) — ambos enviados em 2026-08-26. A Meta avisa por e-mail se aprovar, rejeitar ou pedir mais informação.
2. Trocar a senha do usuário de teste `meta-review@clienton.com.br` (exposta em print durante a sessão de ajuste das instruções).
3. Se a Verificação do acesso pedir mais dados (empresa provedora de tecnologia / SaaS), responder com base no modelo multi-tenant da ClientOn — respostas já registradas na sessão (site `https://clienton.com.br`, descrição do serviço SaaS de atendimento/automação WhatsApp).
4. Após Advanced Access aprovado: criar **Config ID** Embedded Signup (Facebook Login for Business) → colar App ID + Config ID no ClientOn (Admin → WhatsApp) → deploy se faltar → testar botão **Conectar WhatsApp (Meta)**.
5. Só depois disso promover o app de "Em desenvolvimento" para **Live**.
6. Teste ponta a ponta (Etapa 7 do guia) com um tenant piloto real.

Docs relacionados:
- [`GUIA-META-TECH-PROVIDER.md`](GUIA-META-TECH-PROVIDER.md)
- [`META-EMBEDDED-SIGNUP.md`](META-EMBEDDED-SIGNUP.md)
- Código: commit `2f80c0b` (`feat(whatsapp): Embedded Signup Meta`)
