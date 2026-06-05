import { useCallback, useEffect, useState } from "react";
import api, { getApiErrorMessage, unwrapApiData } from "../api/client";

type MonitoringConversation = {
  id: string;
  contactName: string;
  phone: string;
  status: "em_espera" | "em_andamento" | "historico";
  lifecycleStatus: string;
  protocolNumber?: string;
  updatedAt: string;
  lastMessageAt?: string;
  lastMessagePreview?: string;
  lastMessageSource?: "cliente" | "agente" | "bot" | "sistema";
  messageCount: number;
};

type MonitoringMessage = {
  id: string;
  direction: "in" | "out";
  source: "cliente" | "agente" | "bot" | "sistema";
  senderName?: string;
  text?: string;
  createdAt: string;
};

const STATUS_OPTIONS = [
  { value: "todas", label: "Todas" },
  { value: "em_espera", label: "Em espera" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "historico", label: "Histórico" },
];

function sourceLabel(source?: string) {
  if (source === "bot") return "Bot";
  if (source === "agente") return "Agente";
  if (source === "sistema") return "Sistema";
  if (source === "cliente") return "Cliente";
  return "—";
}

function sourceClass(source?: string) {
  if (source === "bot") return "bg-violet-100 text-violet-800";
  if (source === "agente") return "bg-blue-100 text-blue-800";
  if (source === "sistema") return "bg-gray-100 text-gray-700";
  if (source === "cliente") return "bg-emerald-100 text-emerald-800";
  return "bg-gray-100 text-gray-600";
}

export default function MonitoringAdmin() {
  const [items, setItems] = useState<MonitoringConversation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("todas");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MonitoringMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/monitoring/conversations", {
        params: { status, search: search.trim() || undefined, limit: 80 },
      });
      const data = unwrapApiData<{ items: MonitoringConversation[]; total: number }>(res.data);
      setItems(data.items);
      setTotal(data.total);
      setError(null);
    } catch (err) {
      setError(getApiErrorMessage(err, "Erro ao carregar conversas"));
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [status, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const openConversation = async (id: string) => {
    setSelectedId(id);
    setLoadingMessages(true);
    try {
      const res = await api.get(`/admin/monitoring/conversations/${id}/messages`);
      setMessages(unwrapApiData<MonitoringMessage[]>(res.data));
    } catch (err) {
      setMessages([]);
      setError(getApiErrorMessage(err, "Erro ao carregar mensagens"));
    } finally {
      setLoadingMessages(false);
    }
  };

  const selected = items.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="p-8 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Monitoramento</h1>
        <p className="text-sm text-gray-300 mt-1">
          Acompanhe conversas do bot e do agente em tempo quase real.
        </p>
      </div>

      {error ? (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex flex-wrap gap-2">
            <select
              className="border rounded-lg px-3 py-2 text-sm text-gray-900"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <input
              className="border rounded-lg px-3 py-2 text-sm text-gray-900 flex-1 min-w-[180px]"
              placeholder="Buscar nome ou telefone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              type="button"
              onClick={() => void load()}
              className="px-3 py-2 rounded-lg bg-accent text-white text-sm hover:bg-accent-dark"
            >
              Atualizar
            </button>
          </div>

          <div className="max-h-[70vh] overflow-y-auto">
            {loading ? (
              <p className="p-6 text-sm text-gray-500">Carregando...</p>
            ) : items.length === 0 ? (
              <p className="p-6 text-sm text-gray-500">Nenhuma conversa encontrada.</p>
            ) : (
              <ul>
                {items.map((conv) => (
                  <li key={conv.id} className="border-b border-gray-50">
                    <button
                      type="button"
                      onClick={() => void openConversation(conv.id)}
                      className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${
                        selectedId === conv.id ? "bg-teal-50" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-gray-900">{conv.contactName}</span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            conv.status === "em_espera"
                              ? "bg-amber-100 text-amber-800"
                              : conv.status === "em_andamento"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {conv.status.replace("_", " ")}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{conv.phone}</p>
                      {conv.lastMessagePreview ? (
                        <p className="text-sm text-gray-700 mt-1 line-clamp-2">
                          {conv.lastMessagePreview}
                        </p>
                      ) : null}
                      <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                        <span className={`px-2 py-0.5 rounded-full ${sourceClass(conv.lastMessageSource)}`}>
                          {sourceLabel(conv.lastMessageSource)}
                        </span>
                        <span>{conv.messageCount} msgs</span>
                        {conv.lastMessageAt ? (
                          <span>{new Date(conv.lastMessageAt).toLocaleString("pt-BR")}</span>
                        ) : null}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="px-4 py-2 text-xs text-gray-500 border-t">{total} conversa(s)</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-4 min-h-[400px]">
          {!selected ? (
            <p className="text-sm text-gray-500">Selecione uma conversa para ver o histórico.</p>
          ) : (
            <>
              <div className="mb-4 pb-3 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">{selected.contactName}</h2>
                <p className="text-sm text-gray-600">{selected.phone}</p>
                {selected.protocolNumber ? (
                  <p className="text-xs text-gray-500 mt-1">Protocolo: {selected.protocolNumber}</p>
                ) : null}
              </div>
              {loadingMessages ? (
                <p className="text-sm text-gray-500">Carregando mensagens...</p>
              ) : (
                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`rounded-lg px-3 py-2 text-sm ${
                        msg.direction === "in"
                          ? "bg-emerald-50 border border-emerald-100"
                          : "bg-slate-50 border border-slate-100"
                      }`}
                    >
                      <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                        <span className={`px-2 py-0.5 rounded-full ${sourceClass(msg.source)}`}>
                          {sourceLabel(msg.source)}
                        </span>
                        <span>{new Date(msg.createdAt).toLocaleString("pt-BR")}</span>
                      </div>
                      <p className="text-gray-800 whitespace-pre-wrap">{msg.text || "(mídia)"}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
