import { useMemo, useState } from "react";

type FaqItem = {
  question: string;
  answer: string;
};

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Como reabrir os tours do sistema?",
    answer:
      "Nas telas com tour, clique no botão '?' no topo. Isso reabre o guia daquele módulo sem precisar limpar o navegador.",
  },
  {
    question: "Como conectar um número WhatsApp?",
    answer:
      "Vá em Admin > WhatsApp, selecione o provedor (Meta ou Twilio), preencha as credenciais e conclua em 'Conectar número'.",
  },
  {
    question: "Onde configuro usuários e perfis de acesso?",
    answer:
      "Em Admin > Usuários você cria e edita contas. Em Admin > Perfis você define o que cada perfil pode acessar (painel, fluxos, campanhas, relatórios, etc.). Ao criar ou editar um usuário, associe o perfil desejado.",
  },
  {
    question: "Quais permissões existem no sistema?",
    answer:
      "Painel, Fluxos, Usuários, Perfis, IA, WhatsApp, Entrada, Campanhas, Monitoramento, Operação (filas e tabulações), Relatórios e Clientes (plataforma). O menu lateral e as rotas da API respeitam apenas o que o perfil do usuário permite.",
  },
  {
    question: "O que o perfil Supervisor enxerga por padrão?",
    answer:
      "Por padrão: Painel, Fluxos, Monitoramento, Operação e Relatórios — sem Usuários, Campanhas, WhatsApp ou IA. Um administrador pode ajustar isso em Admin > Perfis.",
  },
  {
    question: "Por que não vejo um menu (Campanhas, Relatórios, etc.)?",
    answer:
      "O menu depende das permissões do seu perfil. Peça a um administrador para revisar Admin > Perfis ou troque seu perfil em Admin > Usuários. Agentes enxergam somente a tela de Atendimento.",
  },
  {
    question: "Como usar o cadastro mestre no atendimento?",
    answer:
      "Quando a conversa possui vínculo com cliente, o sistema mostra o selo 'Cadastro mestre' e prioriza o telefone principal.",
  },
  {
    question: "Como disparar uma campanha de WhatsApp?",
    answer:
      "Em Admin > Campanhas, importe a planilha de contatos, escolha o fluxo, o template e o canal, e dispare. O sistema registra entrega, leitura e resposta de cada destinatário.",
  },
  {
    question: "Como configurar Click to WhatsApp (anúncio Meta)?",
    answer:
      "No anúncio, use o botão WhatsApp apontando para o número já conectado no ClientOn. Em Admin > Entrada, crie uma rota tipo CTWA com chave ad_ID_DO_ANUNCIO (ou default para qualquer anúncio) e o fluxo desejado. A origem do anúncio fica gravada na conversa.",
  },
  {
    question: "Como receber leads de formulário Instagram/Facebook (Lead Ads)?",
    answer:
      "Em Admin > Entrada, crie rota tipo Instagram ou Facebook Lead Ads com uma chave (ex.: ig_minha_campanha). Envie POST para /webhooks/inbound com x-tenant-id, x-inbound-secret, sourceType, sourceKey, message, phone e name.",
  },
  {
    question: "O que mostra o Dashboard de Campanhas?",
    answer:
      "Na sub-aba Dashboard em Campanhas, o funil exibe: disparados → enviados → recebidos → lidos → respondidos. Há totais por campanha, linha do tempo e filtros por período.",
  },
  {
    question: "Como pausar ou retomar uma campanha?",
    answer:
      "Na lista de campanhas, use as ações de pausar/retomar. Destinatários pendentes ficam em espera; é possível consultar destinatários e reprocessar envios que falharam.",
  },
  {
    question: "Onde vejo o relatório de disparos de campanha?",
    answer:
      "Em Relatórios > Campanhas: status de entrega, primeira resposta, transferência para fila humana, protocolo e tabulação. Exporte em CSV pelo botão na tela.",
  },
  {
    question: "Como exportar respostas de um fluxo em planilha?",
    answer:
      "Em Relatórios > Planilha, selecione o fluxo e clique em Atualizar. Cada linha é um contato e cada coluna segue a ordem das perguntas do fluxo. Use Exportar CSV ou Excel.",
  },
  {
    question: "O que são os relatórios de Atendimentos e Conversas?",
    answer:
      "Em Relatórios > Atendimentos: resumo por agente e fila (totais, abertos, encerrados, TME e TMA). Em Relatórios > Conversas: lista detalhada exportável com protocolo, campanha de origem, tabulação e tempos.",
  },
  {
    question: "O que conta como atendimento humano nos relatórios?",
    answer:
      "Somente conversas fora do bot (não marcadas como bot_only). Fluxos automáticos puros não entram na contagem de atendimentos do agente.",
  },
  {
    question: "O que são TME e TMA nos relatórios?",
    answer:
      "TME: tempo até a primeira resposta humana do agente. TMA: tempo desde o início do atendimento humano até o encerramento — para conversas em aberto, o TMA é calculado até o momento da consulta.",
  },
  {
    question: "Como o sistema identifica qual agente atendeu?",
    answer:
      "Ao assumir (primeira mensagem enviada pelo agente), o sistema grava o usuário em assigned_user_id. Ao encerrar, grava closed_by_user_id. Nos relatórios aparecem o nome cadastrado e o ID do usuário.",
  },
  {
    question: "Como filtrar relatórios de atendimento?",
    answer:
      "Use filtro por data de abertura ou de encerramento, período (de/até), agente, campanha de origem e fila. No detalhado, exporte tudo em CSV.",
  },
];

export default function Faq() {
  const [query, setQuery] = useState("");
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const filtered = useMemo(() => {
    if (!query.trim()) return FAQ_ITEMS;
    const q = query.toLowerCase();
    return FAQ_ITEMS.filter(
      (item) => item.question.toLowerCase().includes(q) || item.answer.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-white">FAQ do App</h1>
        <p className="text-sm text-gray-300 mt-1">
          Respostas rápidas para dúvidas comuns de operação e administração.
        </p>
      </header>

      <div className="rounded-xl border border-[#2f3d63] bg-[#1b2540] p-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar pergunta (ex.: permissões, campanhas, relatórios, TME)"
          className="w-full bg-[#0f1a33] border border-[#314263] rounded-lg px-3 py-2 text-sm text-gray-100 outline-none"
        />
      </div>

      <section className="rounded-xl border border-[#2f3d63] bg-[#1b2540] divide-y divide-[#2f3d63]">
        {filtered.length === 0 ? (
          <p className="p-4 text-sm text-gray-300">Nenhum resultado para a busca.</p>
        ) : (
          filtered.map((item, index) => (
            <div key={item.question} className="p-4">
              <button
                type="button"
                className="w-full text-left flex items-start justify-between gap-3"
                onClick={() => setOpenIndex((prev) => (prev === index ? null : index))}
              >
                <span className="font-semibold text-white">{item.question}</span>
                <span className="text-cyan-300 text-xs">{openIndex === index ? "Ocultar" : "Mostrar"}</span>
              </button>
              {openIndex === index ? (
                <p className="mt-2 text-sm text-gray-200 leading-relaxed">{item.answer}</p>
              ) : null}
            </div>
          ))
        )}
      </section>
    </div>
  );
}
