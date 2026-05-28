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
    question: "Por que meu login pode falhar após deploy?",
    answer:
      "Normalmente por cache de navegador. Faça Ctrl+F5 e tente novamente. Se persistir, valide se a API de produção está configurada no build.",
  },
  {
    question: "Como criar um novo tenant (cliente)?",
    answer:
      "Acesse Admin > Clientes, preencha os dados do tenant e o administrador inicial, e clique em 'Criar tenant'.",
  },
  {
    question: "Onde configuro usuários e permissões?",
    answer:
      "Em Admin > Usuários. Nessa tela você cria, edita e remove perfis com papéis como admin_local, supervisor e agente.",
  },
  {
    question: "Como usar o cadastro mestre no atendimento?",
    answer:
      "Quando a conversa possui vínculo com cliente, o sistema mostra o selo 'Cadastro mestre' e prioriza o telefone principal.",
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
          placeholder="Buscar pergunta (ex.: login, WhatsApp, tenant)"
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
