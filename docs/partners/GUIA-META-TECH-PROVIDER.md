# Guia operacional — Meta Tech Provider (ClientOn)

Siga **na ordem**. Ao terminar cada etapa, anote os valores na tabela do final.

Links úteis:
- [Business Suite / portfolios](https://business.facebook.com/)
- [Meta for Developers](https://developers.facebook.com/apps/)
- [Become a Tech Provider](https://developers.facebook.com/docs/whatsapp/solution-providers/get-started-for-tech-providers/)
- Código ClientOn: [`META-EMBEDDED-SIGNUP.md`](META-EMBEDDED-SIGNUP.md)

---

## Etapa 0 — Conta e Business Portfolio (BM da ClientOn)

**Objetivo:** ter a “empresa dona” do app (não é a BM do Fox).

1. Entre com um Facebook pessoal que será **admin** da ClientOn (de preferência e-mail corporativo).
2. Abra [business.facebook.com](https://business.facebook.com/).
3. Crie um **Business Portfolio** (ou use um existente da ClientOn):
   - Nome: ex. `ClientOn`
   - País / fuso / moeda coerentes com o CNPJ
4. Em **Configurações do negócio → Informações do negócio**, preencha:
   - Nome legal, endereço, telefone, site (`https://clienton.com.br` ou o oficial)
5. Inicie **Verificação do negócio** (Business Verification) assim que possível — **obrigatória** antes do App Review avançado. Pode levar dias; comece cedo.

**Pronto quando:** você vê o portfolio ClientOn e é admin dele.

---

## Etapa 1 — Criar o App Meta

1. Abra [developers.facebook.com/apps](https://developers.facebook.com/apps/) → **Criar app**.
2. Tipo: use o fluxo atual com caso de uso **WhatsApp** / Business (não “Consumer” puro).
3. **Vincule o Business Portfolio** da ClientOn (Etapa 0) — não pule isso.
4. Nome do app: ex. `ClientOn WhatsApp`
5. Contato de suporte: e-mail da operação.

**Anote:**
- **App ID** (topo do dashboard)
- Em **Configurações do app → Básico**: **App Secret** (mostrar / copiar — guardar em local seguro)

---

## Etapa 2 — Produto WhatsApp + webhook do app

1. No app, adicione o produto / caso de uso **WhatsApp**.
2. Em **WhatsApp → Configuração** (ou Configuration):
   - **Callback URL:** `https://api.clienton.com.br/webhooks/whatsapp`
   - **Verify token:** o mesmo valor que está (ou vai estar) no ClientOn em Admin → WhatsApp → verify token / `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
3. Inscreva os campos de webhook:
   - `messages`
   - `account_update` (importante para Embedded Signup)
4. Se a Meta pedir assinatura / App Secret: use o App Secret da Etapa 1 (o ClientOn já valida `X-Hub-Signature-256`).

**Pronto quando:** o GET de verificação do webhook responde OK (Meta mostra webhook verificado).  
Se falhar: confirme deploy do backend, URL pública HTTPS e verify token idêntico.

---

## Etapa 3 — Domínios e OAuth (Embedded Signup)

No app → **Facebook Login** / **Login for Business** → Configurações:

1. **Allowed domains / Domínios permitidos:**  
   - `app.clienton.com.br`  
   - (dev) `localhost`
2. **Valid OAuth Redirect URIs:**  
   - Inclua o que a tela do Login for Business sugerir; em geral algo ligado ao domínio do app  
   - Também `https://app.clienton.com.br/` se pedido  
3. App em modo **Live** só depois do Review; em Development o Embedded Signup só funciona para usuários/roles de teste do app.

---

## Etapa 4 — Config ID do Embedded Signup

1. No app, abra **Facebook Login for Business** (ou “Configurations”).
2. **Criar configuração** para **WhatsApp** / Embedded Signup (não use config genérica de login de consumidor).
3. Permissões da config devem incluir (nomes podem variar levemente na UI):
   - `whatsapp_business_management`
   - `whatsapp_business_messaging`
   - (conforme o builder) assets WhatsApp necessários
4. Salve e **anote o Config ID** (número longo).

Esse ID é o `META_EMBEDDED_SIGNUP_CONFIG_ID` / campo na UI ClientOn.

---

## Etapa 5 — Colar credenciais no ClientOn

1. Faça **deploy** do commit Embedded Signup se ainda não estiver em produção.
2. Login platform admin → **Abrir ambiente** do tenant piloto (ou plataforma) → **Admin → WhatsApp**.
3. Em configuração global, preencha:
   - Meta App ID  
   - Embedded Signup Config ID  
   - App Secret (se ainda não estiver)  
   - Verify token (igual ao da Meta)
4. Salve. O botão **Conectar WhatsApp (Meta)** só habilita com App ID + Config ID + Secret.

---

## Etapa 6 — App Review + Tech Provider (escala)

Sem Advanced Access, o fluxo completo para **clientes externos** (BM do Fox) **não fecha**.

1. No dashboard do app / trilha **Tech Provider**, complete:
   - Business Verification (Etapa 0)
   - App Review pedindo Advanced Access a:
     - `whatsapp_business_messaging`
     - `whatsapp_business_management`
2. Prepare screencast / texto: ClientOn onboarding WhatsApp para clientes de pesquisa/atendimento, uso de mensagens e gestão de WABA via API.
3. Após aprovação, siga os passos restantes da trilha Tech Provider no painel Meta.

**Enquanto Review não sai:** use **Opção B** (colar token) só em números/WABAs que **você** controla, ou roles de teste no app em Development.

---

## Etapa 7 — Teste ponta a ponta

1. Usuário admin do app (ou test user) em `app.clienton.com.br` → WhatsApp → **Conectar WhatsApp (Meta)**.
2. Complete o popup (BM de teste, WABA, OTP do número).
3. Confira canal na lista ClientOn (WABA + phone number id).
4. Envie mensagem WhatsApp → inbox / fluxo.
5. Crie rota inbound se necessário (`/admin/inbound`).

---

## Tabela de valores (preencha)

| Item | Valor |
|------|--------|
| Business Portfolio ID / nome | |
| App ID | |
| App Secret | *(só cofre / settings ClientOn)* |
| Verify token | |
| Config ID (Embedded Signup) | |
| Webhook verificado? (sim/não) | |
| Business Verification (status) | |
| App Review (status) | |

---

## Ordem mental (1 frase)

**BM ClientOn → App WhatsApp nesse BM → webhook + domínios → Config ID → credenciais no ClientOn → Verification + App Review → botão Embedded Signup para clientes.**
