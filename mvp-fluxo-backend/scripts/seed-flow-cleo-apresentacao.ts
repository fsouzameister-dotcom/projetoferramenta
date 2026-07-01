/**
 * Recria o Fluxo Cleo (Apresentação + Convite para teste) com todos os ramos do prompt global.
 *
 * Uso:
 *   npm run seed:cleo-flow
 *   SEED_FLOW_ID=<uuid> SEED_PERSONA_ID=<uuid> npm run seed:cleo-flow
 */
import "dotenv/config";
import { pool } from "../src/db";
import { ensureFlowAiSchema } from "../src/flow-ai-settings";
import { CLEO_GLOBAL_PROMPT } from "./data/cleo-global-prompt";

const TENANT_ID =
  process.env.DEFAULT_LOGIN_TENANT_ID?.trim() ||
  "00000000-0000-4000-8000-000000000001";
const FLOW_NAME = process.env.SEED_FLOW_NAME?.trim() || "Fluxo Cleo";
const FLOW_ID_ENV = process.env.SEED_FLOW_ID?.trim() || "";

/** IDs fixos para re-seed idempotente (substitui nodes do fluxo). */
const IDS = {
  inicio: "a1000001-0001-4001-8001-000000000001",
  saudacao: "a1000002-0001-4002-8001-000000000002",
  o_que_e: "a1000003-0001-4003-8001-000000000003",
  beneficios: "a1000004-0001-4004-8001-000000000004",
  historia: "a1000005-0001-4005-8001-000000000005",
  qualif_1: "a1000006-0001-4006-8001-000000000006",
  qualif_2: "a1000007-0001-4007-8001-000000000007",
  qualif_3: "a1000008-0001-4008-8001-000000000008",
  qualif_4: "a1000009-0001-4009-8001-000000000009",
  convite_teste: "a100000a-0001-400a-8001-00000000000a",
  recusa: "a100000b-0001-400b-8001-00000000000b",
  preco: "a100000c-0001-400c-8001-00000000000c",
  ja_cliente: "a100000d-0001-400d-8001-00000000000d",
  global_atalhos: "a100000e-0001-400e-8001-00000000000e",
  msg_intro_dados: "a100000f-0001-400f-8001-00000000000f",
  recv_nome: "a1000010-0001-4010-8001-000000000010",
  recv_empresa: "a1000011-0001-4011-8001-000000000011",
  recv_email: "a1000012-0001-4012-8001-000000000012",
  recv_tel: "a1000013-0001-4013-8001-000000000013",
  msg_confirmacao: "a1000014-0001-4014-8001-000000000014",
  tab_lead: "a1000015-0001-4015-8001-000000000015",
  enc_lead: "a1000016-0001-4016-8001-000000000016",
  tab_recusa: "a1000017-0001-4017-8001-000000000017",
  enc_recusa: "a1000018-0001-4018-8001-000000000018",
  tab_geral: "a1000019-0001-4019-8001-000000000019",
  enc_geral: "a100001a-0001-401a-8001-00000000001a",
  transf_geral: "a1000020-0001-4020-8001-000000000020",
  transf_comercial: "a1000021-0001-4021-8001-000000000021",
  transf_suporte: "a1000022-0001-4022-8001-000000000022",
  msg_resumo: "a1000023-0001-4023-8001-000000000023",
} as const;

type TabSeed = { key: string; label: string; description: string };

const TABULACOES: TabSeed[] = [
  {
    key: "lead_teste_clienton",
    label: "Lead teste ClientOn",
    description: "Lead aceitou teste e dados foram coletados",
  },
  {
    key: "sem_interesse_teste",
    label: "Sem interesse no teste",
    description: "Lead não quis testar agora",
  },
  {
    key: "encerramento_geral",
    label: "Encerrado",
    description: "Atendimento encerrado pelo fluxo",
  },
  {
    key: "encaminhado_comercial",
    label: "Encaminhado comercial",
    description: "Lead encaminhado ao time comercial",
  },
];

function pos(x: number, y: number) {
  return { ui: { position: { x, y } } };
}

function escapeTransitions(targets: {
  humano: string;
  preco: string;
  encerrar: string;
  cliente: string;
}) {
  return [
    {
      id: "esc_humano",
      label: "Pediu humano",
      condition:
        "Cliente pede atendente humano, falar com pessoa, suporte humano, ou demonstra insatisfação ou confusão forte",
      next_node_id: targets.humano,
    },
    {
      id: "esc_preco",
      label: "Preço ou prazo",
      condition:
        "Cliente pergunta preço, valor, plano, desconto, prazo de implantação ou condição comercial",
      next_node_id: targets.preco,
    },
    {
      id: "esc_encerrar",
      label: "Encerrar",
      condition:
        "Cliente quer encerrar, disse obrigado e não quer continuar, tchau, pode encerrar, ou despedida final",
      next_node_id: targets.encerrar,
    },
    {
      id: "esc_cliente",
      label: "Já é cliente",
      condition:
        "Cliente diz que já é cliente, já usa ClientOn, ou caiu no fluxo por engano como cliente ativo",
      next_node_id: targets.cliente,
    },
  ];
}

function conversaConfig(input: {
  personaId: string;
  prompt: string;
  transitions: Array<{
    id: string;
    label?: string;
    condition: string;
    next_node_id: string;
  }>;
  defaultNextNodeId?: string | null;
  isGlobal?: boolean;
  x: number;
  y: number;
}) {
  return {
    ...pos(input.x, input.y),
    contentMode: "prompt",
    prompt: input.prompt,
    staticSpeech: "",
    isGlobal: input.isGlobal ?? false,
    personaId: input.personaId,
    transitions: input.transitions,
    default_next_node_id: input.defaultNextNodeId ?? null,
  };
}

async function resolvePersonaId(client: import("pg").PoolClient): Promise<string> {
  const fromEnv = process.env.SEED_PERSONA_ID?.trim();
  if (fromEnv) return fromEnv;
  const r = await client.query<{ id: string }>(
    `SELECT id::text FROM ai_personas
     WHERE tenant_id = $1::uuid AND is_active = true
       AND (lower(name) LIKE '%cleo%' OR lower(name) LIKE '%assistente%')
     ORDER BY updated_at DESC NULLS LAST
     LIMIT 1`,
    [TENANT_ID]
  );
  if (r.rows[0]?.id) return r.rows[0].id;
  const any = await client.query<{ id: string }>(
    `SELECT id::text FROM ai_personas
     WHERE tenant_id = $1::uuid AND is_active = true
     ORDER BY updated_at DESC NULLS LAST
     LIMIT 1`,
    [TENANT_ID]
  );
  if (!any.rows[0]?.id) {
    throw new Error(
      "Nenhuma persona IA ativa encontrada. Crie a persona Cleo ou defina SEED_PERSONA_ID."
    );
  }
  console.warn(
    `Persona Cleo não encontrada; usando persona ${any.rows[0].id}`
  );
  return any.rows[0].id;
}

async function upsertTabulacoes(
  client: import("pg").PoolClient
): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  for (const tab of TABULACOES) {
    const r = await client.query<{ id: string }>(
      `INSERT INTO tabulacoes (tenant_id, key, label, description, active)
       VALUES ($1::uuid, $2, $3, $4, true)
       ON CONFLICT (tenant_id, key) DO UPDATE
         SET label = EXCLUDED.label,
             description = EXCLUDED.description,
             active = true,
             updated_at = now()
       RETURNING id::text`,
      [TENANT_ID, tab.key, tab.label, tab.description]
    );
    map[tab.key] = r.rows[0].id;
  }
  return map;
}

async function resolveFlowId(client: import("pg").PoolClient): Promise<string> {
  if (FLOW_ID_ENV) return FLOW_ID_ENV;
  const r = await client.query<{ id: string }>(
    `SELECT id::text FROM flows
     WHERE tenant_id = $1::uuid AND lower(name) = lower($2)
     LIMIT 1`,
    [TENANT_ID, FLOW_NAME]
  );
  if (r.rows[0]?.id) return r.rows[0].id;
  const created = await client.query<{ id: string }>(
    `INSERT INTO flows (tenant_id, name, channel, is_active)
     VALUES ($1::uuid, $2, 'whatsapp', true)
     RETURNING id::text`,
    [TENANT_ID, FLOW_NAME]
  );
  return created.rows[0].id;
}

function buildNodeRows(personaId: string, tabs: Record<string, string>) {
  const esc = {
    humano: IDS.transf_geral,
    preco: IDS.preco,
    encerrar: IDS.tab_geral,
    cliente: IDS.ja_cliente,
  };

  return [
    {
      id: IDS.inicio,
      type: "inicio",
      name: "Início",
      is_start: true,
      config: { ...pos(80, 40), next_node_id: IDS.saudacao },
    },
    {
      id: IDS.global_atalhos,
      type: "conversa",
      name: "Atalhos globais",
      is_start: false,
      config: conversaConfig({
        personaId,
        isGlobal: true,
        x: -320,
        y: 40,
        prompt: `Nó global — contexto para todas as etapas:
- Se pedir humano, estiver insatisfeito ou confuso: reconheça com empatia e ofereça encaminhamento.
- Se perguntar preço, prazo ou condição comercial: não invente; diga que o time comercial trata e ofereça encaminhamento.
- Não se reapresente se já se apresentou nesta conversa.
- Uma pergunta por vez; frases curtas.`,
        transitions: [],
      }),
    },
    {
      id: IDS.saudacao,
      type: "conversa",
      name: "Saudação",
      is_start: false,
      config: conversaConfig({
        personaId,
        x: 80,
        y: 140,
        prompt: `Etapa: primeira saudação após resposta ao template de convite.
Apresente-se UMA vez como Cleo, assistente virtual da ClientOn.
Agradeça o contato e pergunte se a pessoa quer conhecer a ClientOn ou tirar dúvidas.
Não explique tudo ainda. Uma pergunta só.`,
        transitions: [
          {
            id: "saud_interesse",
            label: "Quer conhecer",
            condition:
              "Cliente quer conhecer, pergunta o que é, o que faz, como funciona, ou demonstra curiosidade",
            next_node_id: IDS.o_que_e,
          },
          {
            id: "saud_teste",
            label: "Quer teste direto",
            condition:
              "Cliente quer teste, demonstração, experimentar, ou já demonstrou interesse claro em testar",
            next_node_id: IDS.qualif_1,
          },
          ...escapeTransitions(esc),
        ],
      }),
    },
    {
      id: IDS.o_que_e,
      type: "conversa",
      name: "O que é a ClientOn",
      is_start: false,
      config: conversaConfig({
        personaId,
        x: 80,
        y: 280,
        prompt: `Explique em 3–4 frases simples o que é a ClientOn e o que a plataforma faz para PMEs.
Não repita saudação nem se apresente de novo.
Ao final, pergunte se quer saber os benefícios práticos ou seguir para um teste.`,
        transitions: [
          {
            id: "oque_beneficios",
            label: "Benefícios",
            condition: "Cliente quer saber benefícios, vantagens, funcionalidades ou detalhes práticos",
            next_node_id: IDS.beneficios,
          },
          {
            id: "oque_historia",
            label: "História",
            condition: "Cliente pergunta sobre história, fundadores, origem da empresa ou quem criou",
            next_node_id: IDS.historia,
          },
          {
            id: "oque_teste",
            label: "Quer teste",
            condition: "Cliente quer teste, demonstração ou conhecer na prática",
            next_node_id: IDS.qualif_1,
          },
          ...escapeTransitions(esc),
        ],
      }),
    },
    {
      id: IDS.beneficios,
      type: "conversa",
      name: "Benefícios",
      is_start: false,
      config: conversaConfig({
        personaId,
        x: 320,
        y: 280,
        prompt: `Destaque 3 benefícios práticos: centralizar canais (WhatsApp), automatizar com fluxos/IA, organizar atendimento humano com filas.
Linguagem simples. Não repita o que já foi dito.
Pergunte se faz sentido fazer um teste da plataforma no atendimento dela(e).`,
        transitions: [
          {
            id: "ben_teste",
            label: "Aceita teste",
            condition: "Cliente aceita teste, demonstração ou quer conhecer na prática",
            next_node_id: IDS.qualif_1,
          },
          {
            id: "ben_nao",
            label: "Não quer teste",
            condition: "Cliente não quer teste agora, prefere depois, ou recusa",
            next_node_id: IDS.recusa,
          },
          ...escapeTransitions(esc),
        ],
      }),
    },
    {
      id: IDS.historia,
      type: "conversa",
      name: "História",
      is_start: false,
      config: conversaConfig({
        personaId,
        x: 320,
        y: 420,
        prompt: `Conte brevemente a história da ClientOn (Fabiano e Raphael, propósito de agilidade e qualidade no atendimento, empresa jovem de 2026).
Máximo 4 frases. Pergunte se quer saber benefícios ou fazer um teste.`,
        transitions: [
          {
            id: "hist_ben",
            label: "Benefícios",
            condition: "Cliente quer benefícios ou funcionalidades",
            next_node_id: IDS.beneficios,
          },
          {
            id: "hist_teste",
            label: "Teste",
            condition: "Cliente quer teste ou demonstração",
            next_node_id: IDS.qualif_1,
          },
          ...escapeTransitions(esc),
        ],
      }),
    },
    {
      id: IDS.qualif_1,
      type: "conversa",
      name: "Qualif. tipo negócio",
      is_start: false,
      config: conversaConfig({
        personaId,
        x: 80,
        y: 440,
        prompt: `Faça UMA pergunta curta sobre o tipo de negócio (loja, clínica, serviços, indústria, SaaS, etc.).
Não repita saudação. Não faça outras perguntas nesta mensagem.`,
        transitions: escapeTransitions(esc),
        defaultNextNodeId: IDS.qualif_2,
      }),
    },
    {
      id: IDS.qualif_2,
      type: "conversa",
      name: "Qualif. canais",
      is_start: false,
      config: conversaConfig({
        personaId,
        x: 80,
        y: 560,
        prompt: `Faça UMA pergunta sobre os canais de atendimento atuais (WhatsApp, Instagram, site, telefone, etc.).`,
        transitions: escapeTransitions(esc),
        defaultNextNodeId: IDS.qualif_3,
      }),
    },
    {
      id: IDS.qualif_3,
      type: "conversa",
      name: "Qualif. ferramentas",
      is_start: false,
      config: conversaConfig({
        personaId,
        x: 80,
        y: 680,
        prompt: `Faça UMA pergunta: hoje usa algum sistema de atendimento/CRM/chatbot ou faz tudo direto no celular?`,
        transitions: escapeTransitions(esc),
        defaultNextNodeId: IDS.qualif_4,
      }),
    },
    {
      id: IDS.qualif_4,
      type: "conversa",
      name: "Qualif. objetivo",
      is_start: false,
      config: conversaConfig({
        personaId,
        x: 80,
        y: 800,
        prompt: `Faça UMA pergunta sobre o principal objetivo: melhorar atendimento, organizar suporte, aumentar vendas, ou tudo junto.`,
        transitions: escapeTransitions(esc),
        defaultNextNodeId: IDS.convite_teste,
      }),
    },
    {
      id: IDS.convite_teste,
      type: "conversa",
      name: "Convite teste",
      is_start: false,
      config: conversaConfig({
        personaId,
        x: 80,
        y: 920,
        prompt: `Explique de forma genérica que vocês podem organizar um teste da ClientOn para ver na prática no atendimento dela(e), sem prometer prazos ou condições.
Pergunte diretamente: "Você gostaria de fazer um teste da plataforma?"`,
        transitions: [
          {
            id: "conv_aceita",
            label: "Aceita teste",
            condition: "Cliente aceita teste, diz sim, quero, pode ser, vamos",
            next_node_id: IDS.msg_intro_dados,
          },
          {
            id: "conv_recusa",
            label: "Não quer teste",
            condition: "Cliente recusa teste, não agora, depois, sem interesse",
            next_node_id: IDS.recusa,
          },
          ...escapeTransitions(esc),
        ],
      }),
    },
    {
      id: IDS.recusa,
      type: "conversa",
      name: "Recusa teste",
      is_start: false,
      config: conversaConfig({
        personaId,
        x: 320,
        y: 920,
        prompt: `Agradeça o interesse. Diga que sem problema.
Ofereça enviar um resumo da ClientOn por aqui e, se fizer sentido no futuro, o time pode falar com ela(e).
Pergunte se prefere receber o resumo.`,
        transitions: [
          {
            id: "rec_resumo",
            label: "Quer resumo",
            condition: "Cliente aceita resumo, quer receber informações, sim",
            next_node_id: IDS.msg_resumo,
          },
          {
            id: "rec_nao",
            label: "Não quer resumo",
            condition: "Cliente não quer resumo, encerra, obrigado, tchau",
            next_node_id: IDS.tab_recusa,
          },
          ...escapeTransitions(esc),
        ],
      }),
    },
    {
      id: IDS.preco,
      type: "conversa",
      name: "Preço / comercial",
      is_start: false,
      config: conversaConfig({
        personaId,
        x: 560,
        y: 140,
        prompt: `Explique que preço, prazo e condições comerciais são tratados pelo time comercial — você não tem esses valores.
Ofereça encaminhar os dados para um responsável entrar em contato.
Pergunte se pode encaminhar.`,
        transitions: [
          {
            id: "preco_sim",
            label: "Aceita encaminhar",
            condition: "Cliente aceita falar com comercial, quer contato, sim",
            next_node_id: IDS.transf_comercial,
          },
          {
            id: "preco_nao",
            label: "Não quer",
            condition: "Cliente não quer contato comercial agora",
            next_node_id: IDS.tab_geral,
          },
          ...escapeTransitions({
            humano: IDS.transf_geral,
            preco: IDS.transf_comercial,
            encerrar: IDS.tab_geral,
            cliente: IDS.ja_cliente,
          }),
        ],
      }),
    },
    {
      id: IDS.ja_cliente,
      type: "conversa",
      name: "Já é cliente",
      is_start: false,
      config: conversaConfig({
        personaId,
        x: 560,
        y: 280,
        prompt: `Agradeça por já ser cliente.
Pergunte de forma simples: precisa de ajuda com a plataforma ou quer falar com o suporte?`,
        transitions: [
          {
            id: "cli_suporte",
            label: "Suporte",
            condition: "Cliente quer suporte, ajuda, problema na plataforma, falar com suporte",
            next_node_id: IDS.transf_suporte,
          },
          {
            id: "cli_encerrar",
            label: "Encerrar",
            condition: "Cliente só queria avisar, não precisa de ajuda, obrigado",
            next_node_id: IDS.tab_geral,
          },
          {
            id: "esc_humano",
            label: "Humano",
            condition: "Cliente pede humano ou atendente",
            next_node_id: IDS.transf_suporte,
          },
        ],
      }),
    },
    {
      id: IDS.msg_intro_dados,
      type: "mensagem",
      name: "Intro coleta dados",
      is_start: false,
      config: {
        ...pos(80, 1040),
        content:
          "Ótimo! Vou te pedir só alguns dados para o time te atender direitinho, tudo bem?",
        next_node_id: IDS.recv_nome,
      },
    },
    {
      id: IDS.recv_nome,
      type: "receber_mensagem",
      name: "Receber nome",
      is_start: false,
      config: {
        ...pos(80, 1140),
        wait_hint: "Qual é seu nome completo ou como prefere ser chamado(a)?",
        variableName: "lead_nome",
        promptKey: "lead_nome",
        next_node_id: IDS.recv_empresa,
      },
    },
    {
      id: IDS.recv_empresa,
      type: "receber_mensagem",
      name: "Receber empresa",
      is_start: false,
      config: {
        ...pos(80, 1240),
        wait_hint: "Qual é o nome da sua empresa ou negócio?",
        variableName: "lead_empresa",
        promptKey: "lead_empresa",
        next_node_id: IDS.recv_email,
      },
    },
    {
      id: IDS.recv_email,
      type: "receber_mensagem",
      name: "Receber e-mail",
      is_start: false,
      config: {
        ...pos(80, 1340),
        wait_hint: "Qual e-mail podemos usar para contato?",
        variableName: "lead_email",
        promptKey: "lead_email",
        next_node_id: IDS.recv_tel,
      },
    },
    {
      id: IDS.recv_tel,
      type: "receber_mensagem",
      name: "Receber telefone",
      is_start: false,
      config: {
        ...pos(80, 1440),
        wait_hint:
          "Qual telefone ou WhatsApp para contato? (Se for o mesmo desta conversa, pode responder \"mesmo\")",
        variableName: "lead_telefone",
        promptKey: "lead_telefone",
        next_node_id: IDS.msg_confirmacao,
      },
    },
    {
      id: IDS.msg_confirmacao,
      type: "mensagem",
      name: "Confirmação lead",
      is_start: false,
      config: {
        ...pos(80, 1540),
        content: `Perfeito, muito obrigada pelas informações!

Nome: {{lead_nome}}
Empresa: {{lead_empresa}}
E-mail: {{lead_email}}
Telefone: {{lead_telefone}}

Vou te encaminhar agora para o time comercial da ClientOn. Um responsável continuará o atendimento por aqui em instantes.`,
        next_node_id: IDS.transf_comercial,
      },
    },
    {
      id: IDS.msg_resumo,
      type: "mensagem",
      name: "Resumo ClientOn",
      is_start: false,
      config: {
        ...pos(320, 1040),
        content: `A ClientOn centraliza o atendimento em múltiplos canais (com foco em WhatsApp), automatiza conversas com fluxos e IA, e organiza o atendimento humano com filas e histórico.

Quando quiser, nosso time pode te ajudar a testar na prática no seu negócio. Foi um prazer falar com você!`,
        next_node_id: IDS.tab_recusa,
      },
    },
    {
      id: IDS.tab_lead,
      type: "tabulacao",
      name: "Tab. Lead teste",
      is_start: false,
      config: {
        ...pos(80, 1640),
        tabulacao_id: tabs.lead_teste_clienton,
        tabulacao_key: "lead_teste_clienton",
        tabulacao_label: "Lead teste ClientOn",
        variable_name: "tabulacao",
        question_key: "desfecho_fluxo",
        next_node_id: IDS.enc_lead,
      },
    },
    {
      id: IDS.enc_lead,
      type: "encerramento",
      name: "Encerrar lead",
      is_start: false,
      config: {
        ...pos(80, 1740),
        reason_key: "lead_teste_coletado",
      },
    },
    {
      id: IDS.tab_recusa,
      type: "tabulacao",
      name: "Tab. Sem interesse",
      is_start: false,
      config: {
        ...pos(320, 1140),
        tabulacao_id: tabs.sem_interesse_teste,
        tabulacao_key: "sem_interesse_teste",
        tabulacao_label: "Sem interesse no teste",
        variable_name: "tabulacao",
        question_key: "desfecho_fluxo",
        next_node_id: IDS.enc_recusa,
      },
    },
    {
      id: IDS.enc_recusa,
      type: "encerramento",
      name: "Encerrar recusa",
      is_start: false,
      config: {
        ...pos(320, 1240),
        reason_key: "sem_interesse_teste",
      },
    },
    {
      id: IDS.tab_geral,
      type: "tabulacao",
      name: "Tab. Encerramento",
      is_start: false,
      config: {
        ...pos(560, 420),
        tabulacao_id: tabs.encerramento_geral,
        tabulacao_key: "encerramento_geral",
        tabulacao_label: "Encerrado",
        variable_name: "tabulacao",
        question_key: "desfecho_fluxo",
        next_node_id: IDS.enc_geral,
      },
    },
    {
      id: IDS.enc_geral,
      type: "encerramento",
      name: "Encerrar geral",
      is_start: false,
      config: {
        ...pos(560, 520),
        reason_key: "encerramento_geral",
      },
    },
    {
      id: IDS.transf_geral,
      type: "transferir_agente",
      name: "Transferir geral",
      is_start: false,
      config: {
        ...pos(560, 640),
        queue: "Geral",
        handoff_message:
          "Vou te encaminhar para um atendente da ClientOn. Em breve alguém continua o atendimento por aqui.",
        priority: "normal",
      },
    },
    {
      id: IDS.transf_comercial,
      type: "transferir_agente",
      name: "Transferir comercial",
      is_start: false,
      config: {
        ...pos(560, 760),
        queue: "Comercial",
        handoff_message:
          "Vou repassar seu contato para o time comercial da ClientOn. Um responsável falará com você em breve.",
        priority: "normal",
      },
    },
    {
      id: IDS.transf_suporte,
      type: "transferir_agente",
      name: "Transferir suporte",
      is_start: false,
      config: {
        ...pos(560, 880),
        queue: "Suporte",
        handoff_message:
          "Vou te encaminhar para o suporte da ClientOn. Aguarde um momento, por favor.",
        priority: "normal",
      },
    },
  ];
}

async function main() {
  await ensureFlowAiSchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const personaId = await resolvePersonaId(client);
    const flowId = await resolveFlowId(client);
    const tabs = await upsertTabulacoes(client);

    await client.query(`DELETE FROM nodes WHERE flow_id = $1::uuid`, [flowId]);

    const nodes = buildNodeRows(personaId, tabs);
    for (const node of nodes) {
      await client.query(
        `INSERT INTO nodes (id, flow_id, type, name, config, is_start)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5::jsonb, $6)`,
        [
          node.id,
          flowId,
          node.type,
          node.name,
          JSON.stringify(node.config),
          node.is_start,
        ]
      );
    }

    const aiSettings = {
      globalPrompt: CLEO_GLOBAL_PROMPT,
      language: "pt-BR",
      voiceId: "",
      executionMode: "rigid",
      personaId,
      providerOverride: null,
      guardrailPolicyId: null,
      guardrailDeployMode: "live",
      knowledgeBaseIds: [] as string[],
    };

    await client.query(
      `UPDATE flows
       SET ai_settings = $1::jsonb,
           is_active = true,
           channel = 'whatsapp'
       WHERE id = $2::uuid AND tenant_id = $3::uuid`,
      [JSON.stringify(aiSettings), flowId, TENANT_ID]
    );

    await client.query("COMMIT");

    console.log("Fluxo Cleo (apresentação + teste) aplicado com sucesso.");
    console.log(`  tenant_id: ${TENANT_ID}`);
    console.log(`  flow_id:   ${flowId}`);
    console.log(`  persona_id: ${personaId}`);
    console.log(`  nodes:     ${nodes.length}`);
    console.log(`  tabulacoes: ${Object.keys(tabs).join(", ")}`);
    console.log("");
    console.log("Próximo passo: confirme a rota inbound WhatsApp apontando para este fluxo.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
