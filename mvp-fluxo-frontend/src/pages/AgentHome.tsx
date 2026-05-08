import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api, { getApiErrorMessage, unwrapApiData } from "../api/client";
import logoClienton from "../../logo-clienton.png";

type ConversationStatus = "em_espera" | "em_andamento" | "historico";
type MessageType = "text" | "contact" | "location" | "attachment" | "audio" | "image";
type MessageDirection = "in" | "out";
type MessageDelivery = "sending" | "sent" | "delivered" | "read" | "failed";

type ChatMessage = {
  id: string;
  provider_message_id?: string;
  type: MessageType;
  direction: MessageDirection;
  sender_name?: string;
  delivery?: MessageDelivery;
  text?: string;
  createdAt: string;
  contact?: { name: string; phone: string };
  location?: { label: string; lat: number; lng: number };
  attachment?: { fileName: string; fileSizeKb: number };
  image?: { fileName: string; url: string; fileSizeKb: number };
  audio?: { url: string; durationSec?: number };
  error_code?: string;
  error_description?: string;
};

type Conversation = {
  id: string;
  contactName: string;
  phone: string;
  status: ConversationStatus;
  lifecycle_status?: "open" | "closed_manual" | "closed_window";
  closed_at?: string;
  closed_by?: string;
  last_customer_message_at?: string;
  window_expires_at?: string;
  outside_service_window?: boolean;
  requires_template_to_resume?: boolean;
  tags?: string[];
  metadata?: {
    queue?: string;
    templateName?: string;
    templateParams?: Record<string, string>;
  };
  messages: ChatMessage[];
};

type AiHintPayload = {
  hint: string;
  source: "ai" | "fallback";
};

type AgentDataMode = "mock" | "api";
const emojiOptions = ["😀", "😁", "😂", "😉", "😍", "👍", "🙏", "🎯", "🚀", "✅", "🔥", "💬"];
const templateOptions = [
  { name: "Boas-vindas", params: ["nome"] },
  { name: "Lembrete pagamento", params: ["nome", "vencimento", "valor"] },
  { name: "Confirmação atendimento", params: ["protocolo"] },
];

function getSimulationFeatureKey(): string {
  const tenantId = localStorage.getItem("tenant_id") || "default";
  return `agent_test_simulation_enabled_${tenantId}`;
}

const initialConversations: Conversation[] = [
  {
    id: "c1",
    contactName: "Marina Souza",
    phone: "+55 11 98877-1234",
    status: "em_espera",
    tags: ["Novo lead"],
    messages: [
      {
        id: "m1",
        type: "text",
        direction: "in",
        sender_name: "Cliente",
        text: "Oi, quero saber sobre planos.",
        createdAt: "10:11",
      },
    ],
  },
  {
    id: "c2",
    contactName: "Carlos Mendes",
    phone: "+55 21 97777-8899",
    status: "em_andamento",
    tags: ["Suporte"],
    messages: [
      {
        id: "m2",
        type: "text",
        direction: "in",
        sender_name: "Cliente",
        text: "Consegue me enviar a localização da loja?",
        createdAt: "10:25",
      },
      {
        id: "m3",
        type: "location",
        direction: "out",
        sender_name: "BOT",
        createdAt: "10:27",
        delivery: "read",
        location: { label: "Loja Central", lat: -23.55052, lng: -46.633308 },
      },
    ],
  },
  {
    id: "c3",
    contactName: "Patrícia Lima",
    phone: "+55 31 96666-4455",
    status: "historico",
    tags: ["Fechado"],
    messages: [
      {
        id: "m4",
        type: "contact",
        direction: "out",
        sender_name: "BOT",
        createdAt: "09:50",
        delivery: "delivered",
        contact: { name: "Comercial ClientOn", phone: "+55 11 4000-1000" },
      },
    ],
  },
];

function deliveryLabel(delivery?: MessageDelivery) {
  if (!delivery) return "";
  const map: Record<MessageDelivery, string> = {
    sending: "Enviando",
    sent: "Enviada",
    delivered: "Entregue",
    read: "Lida",
    failed: "Falha",
  };
  return map[delivery];
}

function deliveryClass(delivery?: MessageDelivery) {
  if (!delivery) return "text-gray-300";
  if (delivery === "failed") return "text-red-300";
  if (delivery === "read") return "text-emerald-300";
  if (delivery === "delivered") return "text-cyan-300";
  return "text-amber-200";
}

export default function AgentHome() {
  const userName = localStorage.getItem("user_name") || "Agente";
  const simulationEnabled = localStorage.getItem(getSimulationFeatureKey()) === "true";
  const envMode = (import.meta.env.VITE_AGENT_DATA_MODE as AgentDataMode | undefined) || "mock";
  const [resolvedMode, setResolvedMode] = useState<AgentDataMode>(envMode);
  const [modeNotice, setModeNotice] = useState<string | null>(null);
  const [loadingConversations, setLoadingConversations] = useState(envMode === "api");
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [activeStatus, setActiveStatus] = useState<ConversationStatus>("em_espera");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    initialConversations[0]?.id ?? null
  );
  const [composeText, setComposeText] = useState("");
  const [chatSearch, setChatSearch] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(null);
  const [showNewContactModal, setShowNewContactModal] = useState(false);
  const [newContactForm, setNewContactForm] = useState({
    contactName: "",
    phone: "",
    queue: "",
    templateName: templateOptions[0].name,
    templateParams: {} as Record<string, string>,
  });
  const [pendingMediaByConversation, setPendingMediaByConversation] = useState<
    Record<string, ChatMessage[]>
  >({});
  const [loadingHint, setLoadingHint] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const mergeWithPendingMedia = (apiConversations: Conversation[]) => {
    return apiConversations.map((conv) => {
      const pending = pendingMediaByConversation[conv.id] ?? [];
      if (pending.length === 0) return conv;
      const existingIds = new Set(conv.messages.map((m) => m.id));
      return {
        ...conv,
        messages: [...conv.messages, ...pending.filter((p) => !existingIds.has(p.id))],
      };
    });
  };

  useEffect(() => {
    if (envMode !== "api") return;

    const loadConversations = async () => {
      try {
        setLoadingConversations(true);
        const response = await api.get("/agent/conversations");
        const payload = unwrapApiData<Conversation[]>(response.data);
        if (Array.isArray(payload)) {
          setConversations(mergeWithPendingMedia(payload));
          setActiveConversationId(payload[0]?.id ?? null);
          setResolvedMode("api");
          setModeNotice(null);
        } else {
          setResolvedMode("mock");
          setModeNotice("API sem payload esperado. Fallback para modo emulado.");
        }
      } catch (err) {
        setResolvedMode("mock");
        setModeNotice(
          `${getApiErrorMessage(err, "API indisponível")}. Fallback para modo emulado.`
        );
      } finally {
        setLoadingConversations(false);
      }
    };

    void loadConversations();
  }, [envMode]);

  useEffect(() => {
    if (resolvedMode !== "api") return;
    const timer = window.setInterval(async () => {
      try {
        const response = await api.get("/agent/conversations");
        const payload = unwrapApiData<Conversation[]>(response.data);
        if (Array.isArray(payload)) {
          setConversations(mergeWithPendingMedia(payload));
        }
      } catch {
        // keep UI with last known state
      }
    }, 10000);
    return () => window.clearInterval(timer);
  }, [resolvedMode]);

  const filteredConversations = useMemo(() => {
    return conversations.filter((conv) => {
      const byStatus = conv.status === activeStatus;
      const bySearch =
        !searchTerm ||
        conv.contactName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        conv.phone.includes(searchTerm);
      return byStatus && bySearch;
    });
  }, [activeStatus, conversations, searchTerm]);

  const activeConversation =
    conversations.find((conv) => conv.id === activeConversationId) ?? null;
  const isConversationClosed = activeConversation?.lifecycle_status
    ? activeConversation.lifecycle_status !== "open"
    : activeConversation?.status === "historico";
  const requiresTemplateToResume = Boolean(activeConversation?.requires_template_to_resume);

  const activeMessages = useMemo(() => {
    if (!activeConversation) return [];
    if (!chatSearch) return activeConversation.messages;
    return activeConversation.messages.filter((msg) => {
      const text = (msg.text || msg.contact?.name || msg.location?.label || "").toLowerCase();
      return text.includes(chatSearch.toLowerCase());
    });
  }, [activeConversation, chatSearch]);

  const statusCounters = useMemo(() => {
    return {
      em_espera: conversations.filter((c) => c.status === "em_espera").length,
      em_andamento: conversations.filter((c) => c.status === "em_andamento").length,
      historico: conversations.filter((c) => c.status === "historico").length,
    };
  }, [conversations]);

  const updateConversation = (conversationId: string, updater: (conv: Conversation) => Conversation) => {
    setConversations((prev) => prev.map((c) => (c.id === conversationId ? updater(c) : c)));
  };

  const pushLocalMessage = (conversationId: string, message: ChatMessage) => {
    if (resolvedMode === "api" && ["attachment", "audio", "image"].includes(message.type)) {
      setPendingMediaByConversation((prev) => ({
        ...prev,
        [conversationId]: [...(prev[conversationId] ?? []), message],
      }));
    }
    updateConversation(conversationId, (conv) => ({
      ...conv,
      status: "em_andamento",
      messages: [...conv.messages, message],
    }));
  };

  const requestAgentHint = async () => {
    if (!activeConversation) return;
    setLoadingHint(true);
    try {
      let personaId = localStorage.getItem("ai_persona_id");
      if (!personaId) {
        const personaRes = await api.get("/ai/personas");
        const personas = unwrapApiData<Array<{ id: string }>>(personaRes.data);
        personaId = personas[0]?.id;
        if (personaId) {
          localStorage.setItem("ai_persona_id", personaId);
        }
      }

      if (!personaId) {
        window.alert("Cadastre ao menos uma persona de IA para receber recomendações contextuais.");
        return;
      }

      const recentMessages = activeConversation.messages
        .slice(-6)
        .map((msg) => msg.text || msg.contact?.name || msg.location?.label || "")
        .filter((line) => line.trim().length > 0);

      const response = await api.post("/ai/assist-hint", {
        personaId,
        conversationId: activeConversation.id,
        customerContext: {
          contactName: activeConversation.contactName,
          tags: activeConversation.tags ?? [],
          recentMessages,
        },
      });
      const payload = unwrapApiData<AiHintPayload>(response.data);
      window.alert(payload.hint);
    } catch (error) {
      window.alert(
        getApiErrorMessage(
          error,
          "Não foi possível gerar dica IA agora. Continue com abordagem consultiva e confirme a necessidade do cliente."
        )
      );
    } finally {
      setLoadingHint(false);
    }
  };

  useEffect(() => {
    if (!chatScrollRef.current) return;
    chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [activeMessages.length, activeConversationId]);

  useEffect(() => {
    if (!activeConversationId) return;
    if (resolvedMode !== "api") return;
    void requestAgentHint();
  }, [activeConversationId, resolvedMode]);

  const handleSendText = () => {
    if (!activeConversation || !composeText.trim()) return;
    if (isConversationClosed) {
      window.alert(
        requiresTemplateToResume
          ? "Atendimento encerrado e janela Meta fechada. Reabra com template para retomar."
          : "Atendimento encerrado. Reabra a conversa para enviar mensagens."
      );
      return;
    }
    const payload = composeText.trim();
    setComposeText("");
    if (resolvedMode === "api") {
      void api
        .post(`/agent/conversations/${activeConversation.id}/messages`, {
          type: "text",
          text: payload,
          sender_name: userName,
        })
        .then((res) => {
          const updated = unwrapApiData<Conversation>(res.data);
          setConversations((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        })
        .catch(() => undefined);
    }
    pushLocalMessage(activeConversation.id, {
      id: crypto.randomUUID(),
      type: "text",
      direction: "out",
      sender_name: userName,
      text: payload,
      createdAt: new Date().toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      delivery: "sent",
    });
  };

  const ensureConversationOpenForMessage = () => {
    if (!isConversationClosed) return true;
    window.alert(
      requiresTemplateToResume
        ? "Atendimento encerrado e janela Meta fechada. Reabra com template para retomar."
        : "Atendimento encerrado. Reabra a conversa para enviar mensagens."
    );
    return false;
  };

  const handleCloseConversation = async () => {
    if (!activeConversation) return;
    const ok = window.confirm("Encerrar este atendimento agora?");
    if (!ok) return;
    if (resolvedMode === "api") {
      try {
        const res = await api.post(`/agent/conversations/${activeConversation.id}/close`);
        const updated = unwrapApiData<Conversation>(res.data);
        setConversations((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        return;
      } catch (error) {
        window.alert(getApiErrorMessage(error, "Não foi possível encerrar atendimento."));
        return;
      }
    }
    updateConversation(activeConversation.id, (conv) => ({
      ...conv,
      status: "historico",
      lifecycle_status: "closed_manual",
      closed_at: new Date().toISOString(),
      closed_by: userName,
    }));
  };

  const handleReopenConversation = async () => {
    if (!activeConversation) return;
    let templateName: string | undefined;
    if (requiresTemplateToResume) {
      const provided = window.prompt(
        "Janela Meta encerrada. Informe o nome do template aprovado para reabrir:"
      );
      templateName = provided?.trim() || undefined;
      if (!templateName) {
        window.alert("Reabertura cancelada: template é obrigatório fora da janela.");
        return;
      }
    }
    if (resolvedMode === "api") {
      try {
        const res = await api.post(`/agent/conversations/${activeConversation.id}/reopen`, {
          templateName,
          templateParams: {},
          botName: "BOT",
        });
        const updated = unwrapApiData<Conversation>(res.data);
        setConversations((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        return;
      } catch (error) {
        window.alert(getApiErrorMessage(error, "Não foi possível reabrir atendimento."));
        return;
      }
    }
    updateConversation(activeConversation.id, (conv) => ({
      ...conv,
      status: "em_andamento",
      lifecycle_status: "open",
      closed_at: undefined,
      closed_by: undefined,
    }));
  };

  const handleSimulateIncomingMessage = () => {
    if (!activeConversation || !simulationEnabled) return;
    pushLocalMessage(activeConversation.id, {
      id: crypto.randomUUID(),
      type: "text",
      direction: "in",
      sender_name: activeConversation.contactName || "Cliente",
      text: "Mensagem simulada do cliente para validar o layout do atendimento.",
      createdAt: new Date().toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      delivery: "read",
    });
  };

  const handleSendContact = () => {
    if (!activeConversation) return;
    if (!ensureConversationOpenForMessage()) return;
    if (resolvedMode === "api") {
      void api
        .post(`/agent/conversations/${activeConversation.id}/messages`, {
          type: "contact",
          contact: { name: "Equipe Comercial", phone: "+55 11 4000-1000" },
          sender_name: userName,
        })
        .then((res) => {
          const updated = unwrapApiData<Conversation>(res.data);
          setConversations((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        })
        .catch(() => undefined);
    }
    pushLocalMessage(activeConversation.id, {
      id: crypto.randomUUID(),
      type: "contact",
      direction: "out",
      sender_name: userName,
      createdAt: new Date().toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      delivery: "delivered",
      contact: { name: "Equipe Comercial", phone: "+55 11 4000-1000" },
    });
  };

  const handleSendLocation = () => {
    if (!activeConversation) return;
    if (!ensureConversationOpenForMessage()) return;
    if (resolvedMode === "api") {
      void api
        .post(`/agent/conversations/${activeConversation.id}/messages`, {
          type: "location",
          location: { label: "Unidade Atendimento", lat: -23.55052, lng: -46.633308 },
          sender_name: userName,
        })
        .then((res) => {
          const updated = unwrapApiData<Conversation>(res.data);
          setConversations((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        })
        .catch(() => undefined);
    }
    pushLocalMessage(activeConversation.id, {
      id: crypto.randomUUID(),
      type: "location",
      direction: "out",
      sender_name: userName,
      createdAt: new Date().toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      delivery: "delivered",
      location: { label: "Unidade Atendimento", lat: -23.55052, lng: -46.633308 },
    });
  };

  const handleAttachmentSelected = (file: File | null) => {
    if (!activeConversation || !file) return;
    if (!ensureConversationOpenForMessage()) return;
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      type: "attachment",
      direction: "out",
      sender_name: userName,
      createdAt: new Date().toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      delivery: "sent",
      attachment: {
        fileName: file.name,
        fileSizeKb: Math.max(1, Math.round(file.size / 1024)),
      },
      text: `Anexo enviado: ${file.name}`,
    };
    pushLocalMessage(activeConversation.id, msg);
  };

  const handleImageSelected = (file: File | null) => {
    if (!activeConversation || !file) return;
    if (!ensureConversationOpenForMessage()) return;
    const imageUrl = URL.createObjectURL(file);
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      type: "image",
      direction: "out",
      sender_name: userName,
      createdAt: new Date().toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      delivery: "sent",
      image: {
        fileName: file.name,
        url: imageUrl,
        fileSizeKb: Math.max(1, Math.round(file.size / 1024)),
      },
      text: `Imagem enviada: ${file.name}`,
    };
    pushLocalMessage(activeConversation.id, msg);
  };

  const startRecording = async () => {
    if (isRecording) return;
    if (!ensureConversationOpenForMessage()) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    setRecordingStartedAt(Date.now());
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: "audio/webm" });
      setRecordedAudioBlob(blob);
      setRecordedAudioUrl(URL.createObjectURL(blob));
      stream.getTracks().forEach((t) => t.stop());
      setIsRecording(false);
    };
    mediaRecorder.start();
    setIsRecording(true);
    (window as unknown as { __agentRecorder?: MediaRecorder }).__agentRecorder = mediaRecorder;
  };

  const stopRecording = () => {
    const holder = window as unknown as { __agentRecorder?: MediaRecorder };
    holder.__agentRecorder?.stop();
  };

  const sendRecordedAudio = () => {
    if (!activeConversation || !recordedAudioBlob || !recordedAudioUrl) return;
    if (!ensureConversationOpenForMessage()) return;
    const durationSec =
      recordingStartedAt !== null ? Math.max(1, Math.round((Date.now() - recordingStartedAt) / 1000)) : undefined;
    pushLocalMessage(activeConversation.id, {
      id: crypto.randomUUID(),
      type: "audio",
      direction: "out",
      sender_name: userName,
      createdAt: new Date().toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      delivery: "sent",
      audio: { url: recordedAudioUrl, durationSec },
      text: "Áudio enviado",
    });
    setRecordedAudioBlob(null);
    setRecordedAudioUrl(null);
    setRecordingStartedAt(null);
  };

  const handleCreateNewContact = async () => {
    const phone = newContactForm.phone.trim();
    if (!phone) {
      setModeNotice("Informe o número do contato.");
      return;
    }

    if (resolvedMode === "api") {
      try {
        const response = await api.post("/agent/conversations", {
          contactName: newContactForm.contactName.trim() || undefined,
          phone,
          queue: newContactForm.queue.trim() || undefined,
          templateName: newContactForm.templateName || undefined,
          templateParams: newContactForm.templateParams,
          botName: "BOT",
        });
        const created = unwrapApiData<Conversation>(response.data);
        setConversations((prev) => [created, ...prev]);
        setActiveStatus("em_espera");
        setActiveConversationId(created.id);
        setShowNewContactModal(false);
        return;
      } catch (err) {
        setModeNotice(getApiErrorMessage(err, "Erro ao criar novo contato"));
        return;
      }
    }

    const newConversation: Conversation = {
      id: crypto.randomUUID(),
      contactName: newContactForm.contactName.trim() || "Novo contato",
      phone,
      status: "em_espera",
      tags: ["Novo contato"],
      messages: [],
      metadata: {
        queue: newContactForm.queue.trim() || undefined,
        templateName: newContactForm.templateName || undefined,
        templateParams: newContactForm.templateParams,
      },
    };
    if (newContactForm.templateName) {
      newConversation.messages.push({
        id: crypto.randomUUID(),
        type: "text",
        direction: "out",
        sender_name: "BOT",
        text: `Template "${newContactForm.templateName}" enviado`,
        createdAt: new Date().toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        delivery: "sent",
      });
    }
    setConversations((prev) => [newConversation, ...prev]);
    setActiveStatus("em_espera");
    setActiveConversationId(newConversation.id);
    setShowNewContactModal(false);
  };

  const handleTemplateChange = (templateName: string) => {
    const found = templateOptions.find((t) => t.name === templateName);
    const emptyParams: Record<string, string> = {};
    (found?.params ?? []).forEach((param) => {
      emptyParams[param] = "";
    });
    setNewContactForm((prev) => ({
      ...prev,
      templateName,
      templateParams: emptyParams,
    }));
  };

  return (
    <div className="h-screen overflow-hidden bg-gradient-to-br from-primary-dark via-[#132a55] to-[#0f1e3d] text-gray-100 p-4 md:p-6">
      <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-4 h-[calc(100vh-2rem)]">
        <aside className="bg-[#1b2540] rounded-xl border border-[#2f3d63] p-4 flex flex-col shadow-xl">
          <Link
            to="/agent"
            className="mb-4 rounded-lg border border-[#314263] bg-[#101b34] px-3 py-2 inline-flex w-fit transition-all duration-200 hover:border-cyan-300/60 hover:bg-[#142142] hover:shadow-[0_0_0_1px_rgba(103,232,249,0.25)] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
            aria-label="Ir para início da central do agente"
          >
            <img src={logoClienton} alt="ClientOn" className="h-9 w-auto" />
          </Link>

          <div className="flex items-center gap-2 mb-3">
            <button
              type="button"
              onClick={() => setShowNewContactModal(true)}
              className="px-3 py-2 text-sm rounded-lg border border-cyan-400 text-cyan-300 hover:bg-cyan-500/10"
            >
              + Novo contato
            </button>
          </div>

          <div className="flex items-center gap-2 mb-3">
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Pesquisar por atendimentos"
              className="flex-1 bg-[#0f1a33] border border-[#314263] rounded-lg px-3 py-2 text-sm text-gray-100 outline-none"
            />
            <button type="button" className="px-3 py-2 rounded-lg bg-[#223150] text-gray-300">
              ⌕
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 border-b border-[#33466f] mb-3 px-1">
            {[
              {
                key: "em_espera",
                label: "Aguardando",
                count: statusCounters.em_espera,
              },
              { key: "em_andamento", label: "Em atendimento", count: statusCounters.em_andamento },
              { key: "historico", label: "Histórico", count: statusCounters.historico },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveStatus(tab.key as ConversationStatus)}
                className={`min-h-[64px] px-2 py-2 text-[13px] leading-tight text-center border-b-2 flex flex-col items-center justify-center gap-1 ${
                  activeStatus === tab.key
                    ? "text-cyan-300 border-cyan-300"
                    : "text-gray-300 border-transparent"
                }`}
              >
                <span className="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-cyan-500 text-[#0b162d] text-[10px] font-semibold">
                  {tab.count}
                </span>
                <span className="text-center">
                  {tab.label}
                </span>
              </button>
            ))}
          </div>

          <div className="overflow-hidden space-y-2 pr-1">
            {filteredConversations.length === 0 ? (
              <div className="text-center text-cyan-300 mt-10">
                <p className="text-4xl mb-3">💬</p>
                <p className="font-semibold">Não encontramos mensagens</p>
              </div>
            ) : (
              filteredConversations.map((conv) => (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => setActiveConversationId(conv.id)}
                  className={`w-full text-left p-3 rounded-lg border ${
                    activeConversationId === conv.id
                      ? "bg-[#0f1f3f] border-cyan-400"
                      : "bg-[#121d37] border-[#2d3d63]"
                  }`}
                >
                  <p className="font-semibold text-sm text-gray-100">{conv.contactName}</p>
                  <p className="text-xs text-gray-400">{conv.phone}</p>
                  {conv.tags?.length ? (
                    <div className="mt-2 flex gap-1 flex-wrap">
                      {conv.tags.map((tag) => (
                        <span key={tag} className="text-[10px] px-2 py-0.5 rounded bg-[#273758] text-gray-200">
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="bg-[#1b2540] rounded-xl border border-[#2f3d63] p-3 flex flex-col min-h-0 overflow-hidden shadow-xl">
          <div className="flex items-center justify-between border-b border-[#33466f] pb-2 mb-2">
            <div>
              <h1 className="text-[20px] font-bold text-white tracking-tight">Central do Agente</h1>
              <p className="text-xs text-gray-300">Atendente: {userName}</p>
            </div>
            <input
              value={chatSearch}
              onChange={(e) => setChatSearch(e.target.value)}
              placeholder="Busca por texto na conversa"
              className="w-56 bg-[#0f1a33] border border-[#314263] rounded-lg px-3 py-1.5 text-xs text-gray-100 outline-none"
            />
          </div>

          {modeNotice ? (
            <div className="mb-2 text-[11px] px-2.5 py-1.5 rounded border border-[#324464] bg-[#162544] text-gray-300">
              {modeNotice}
            </div>
          ) : null}
          {loadingConversations ? (
            <div className="flex-1 flex items-center justify-center text-gray-300">
              Carregando conversas...
            </div>
          ) : null}

          {!loadingConversations && !activeConversation ? (
            <div className="flex-1 flex items-center justify-center text-gray-300">
              Selecione uma conversa para iniciar.
            </div>
          ) : !loadingConversations ? (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-sm text-gray-100">{activeConversation?.contactName}</p>
                  <p className="text-[11px] text-gray-400">{activeConversation?.phone}</p>
                  <p className="text-[11px] text-cyan-200 mt-0.5">
                    {activeConversation?.lifecycle_status === "closed_manual"
                      ? "Encerrado manualmente"
                      : activeConversation?.lifecycle_status === "closed_window"
                      ? "Encerrado por janela Meta"
                      : "Em atendimento"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {isConversationClosed ? (
                    <button
                      type="button"
                      onClick={() => void handleReopenConversation()}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-[11px] hover:bg-emerald-500/30"
                    >
                      Reabrir atendimento
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleCloseConversation()}
                      className="px-2.5 py-1 rounded-lg bg-red-500/20 border border-red-400/40 text-red-200 text-[11px] hover:bg-red-500/30"
                    >
                      Encerrar atendimento
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void requestAgentHint()}
                    disabled={loadingHint}
                    className="px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-200 text-[11px] hover:bg-amber-500/30 disabled:opacity-60"
                  >
                    {loadingHint ? "Gerando dica..." : "Gerar dica IA"}
                  </button>
                </div>
              </div>

              <div ref={chatScrollRef} className="flex-1 overflow-auto space-y-2 pr-1">
                {activeMessages.length === 0 ? (
                  <p className="text-gray-300 text-sm">Sem mensagens para o filtro informado.</p>
                ) : (
                  activeMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`max-w-[80%] px-3 py-2 rounded-lg border text-sm ${
                        msg.direction === "out"
                          ? "ml-auto bg-[#173829] border-[#2b6b4b]"
                          : "bg-[#222f4d] border-[#374c77] text-gray-100"
                      }`}
                    >
                      <p className="text-[11px] font-semibold text-cyan-200 mb-1">
                        {msg.sender_name ||
                          (msg.direction === "out"
                            ? userName
                            : activeConversation?.contactName || "Cliente")}
                      </p>
                      {msg.type === "text" ? <p>{msg.text}</p> : null}
                      {msg.type === "contact" && msg.contact ? (
                        <div>
                          <p className="font-semibold">Contato</p>
                          <p>{msg.contact.name}</p>
                          <p className="text-xs text-gray-300">{msg.contact.phone}</p>
                        </div>
                      ) : null}
                      {msg.type === "location" && msg.location ? (
                        <div>
                          <p className="font-semibold">Localização</p>
                          <p>{msg.location.label}</p>
                          <p className="text-xs text-gray-300">
                            {msg.location.lat}, {msg.location.lng}
                          </p>
                        </div>
                      ) : null}
                      {msg.type === "attachment" && msg.attachment ? (
                        <div>
                          <p className="font-semibold">Anexo</p>
                          <p>{msg.attachment.fileName}</p>
                          <p className="text-xs text-gray-300">{msg.attachment.fileSizeKb} KB</p>
                        </div>
                      ) : null}
                      {msg.type === "audio" && msg.audio ? (
                        <div>
                          <p className="font-semibold">Áudio</p>
                          <audio controls src={msg.audio.url} className="mt-1 max-w-full" />
                          {msg.audio.durationSec ? (
                            <p className="text-xs text-gray-300 mt-1">Duração: {msg.audio.durationSec}s</p>
                          ) : null}
                        </div>
                      ) : null}
                      {msg.type === "image" && msg.image ? (
                        <div>
                          <p className="font-semibold">Imagem</p>
                          <img
                            src={msg.image.url}
                            alt={msg.image.fileName}
                            className="mt-1 max-h-44 rounded border border-[#4a5f8f] object-contain"
                          />
                          <p className="text-xs text-gray-300 mt-1">
                            {msg.image.fileName} • {msg.image.fileSizeKb} KB
                          </p>
                        </div>
                      ) : null}
                      <p className="text-[11px] text-gray-300 mt-1">
                        {msg.createdAt}
                        {msg.direction === "out" ? " • " : ""}
                        {msg.direction === "out" ? (
                          <span
                            className={deliveryClass(msg.delivery)}
                            title={
                              msg.error_code || msg.error_description
                                ? `Erro ${msg.error_code || ""} ${msg.error_description || ""}`.trim()
                                : "Status da mensagem"
                            }
                          >
                            {deliveryLabel(msg.delivery)}
                          </span>
                        ) : null}
                        {msg.direction === "out" && msg.error_code ? (
                          <span className="text-red-300"> ({msg.error_code})</span>
                        ) : null}
                      </p>
                    </div>
                  ))
                )}
              </div>

              <div className="shrink-0 mt-3 border-t border-[#3a3a3a] pt-3 bg-[#1b2540]">
                <div className="flex gap-2 mb-2">
                  {simulationEnabled ? (
                    <button
                      type="button"
                      onClick={handleSimulateIncomingMessage}
                      className="px-3 py-2 rounded-lg bg-[#3a2a59] text-violet-100 text-sm hover:bg-[#4a3470]"
                    >
                      Simular cliente
                    </button>
                  ) : null}
                  <label className="px-3 py-2 rounded-lg bg-[#223150] text-gray-200 text-sm hover:bg-[#2b3f66] cursor-pointer">
                    Enviar imagem
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        handleImageSelected(e.target.files?.[0] ?? null);
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>
                  <label className="px-3 py-2 rounded-lg bg-[#223150] text-gray-200 text-sm hover:bg-[#2b3f66] cursor-pointer">
                    Enviar anexo
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        handleAttachmentSelected(e.target.files?.[0] ?? null);
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleSendContact}
                    className="px-3 py-2 rounded-lg bg-[#223150] text-gray-200 text-sm hover:bg-[#2b3f66]"
                  >
                    Enviar contato
                  </button>
                  <button
                    type="button"
                    onClick={handleSendLocation}
                    className="px-3 py-2 rounded-lg bg-[#223150] text-gray-200 text-sm hover:bg-[#2b3f66]"
                  >
                    Enviar localização
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowEmojiPicker((v) => !v)}
                    className="px-3 py-2 rounded-lg bg-[#223150] text-gray-200 text-sm hover:bg-[#2b3f66]"
                  >
                    Emoji
                  </button>
                  {!isRecording ? (
                    <button
                      type="button"
                      onClick={startRecording}
                      className="px-3 py-2 rounded-lg bg-[#223150] text-gray-200 text-sm hover:bg-[#2b3f66]"
                    >
                      Gravar áudio
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="px-3 py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-500"
                    >
                      Parar gravação
                    </button>
                  )}
                  {recordedAudioBlob ? (
                    <button
                      type="button"
                      onClick={sendRecordedAudio}
                      className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-500"
                    >
                      Enviar áudio
                    </button>
                  ) : null}
                </div>
                {showEmojiPicker ? (
                  <div className="mb-2 p-2 rounded-lg bg-[#101a31] border border-[#2e3f63] flex flex-wrap gap-1">
                    {emojiOptions.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className="text-lg px-2 py-1 rounded hover:bg-[#243556]"
                        onClick={() => {
                          setComposeText((prev) => `${prev}${emoji}`);
                          setShowEmojiPicker(false);
                        }}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <input
                    value={composeText}
                    onChange={(e) => setComposeText(e.target.value)}
                    placeholder={
                      isConversationClosed
                        ? requiresTemplateToResume
                          ? "Conversa encerrada por janela. Reabra com template."
                          : "Conversa encerrada. Reabra para continuar."
                        : "Digite a mensagem..."
                    }
                    disabled={isConversationClosed}
                    className="flex-1 bg-[#0f1a33] border border-[#314263] rounded-lg px-3 py-2 text-sm text-gray-100 outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleSendText}
                    disabled={isConversationClosed}
                    className="px-4 py-2 rounded-lg bg-accent text-white font-semibold hover:bg-accent-dark"
                  >
                    Enviar
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      </div>
      {showNewContactModal ? (
        <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-[#1b2540] border border-[#2f3d63] rounded-xl p-5">
            <h2 className="text-lg font-semibold text-white mb-4">Novo contato</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                className="bg-[#0f1a33] border border-[#314263] rounded-lg px-3 py-2 text-sm text-gray-100"
                placeholder="Nome (opcional)"
                value={newContactForm.contactName}
                onChange={(e) =>
                  setNewContactForm((prev) => ({ ...prev, contactName: e.target.value }))
                }
              />
              <input
                className="bg-[#0f1a33] border border-[#314263] rounded-lg px-3 py-2 text-sm text-gray-100"
                placeholder="Número (ex.: +5511999990000)"
                value={newContactForm.phone}
                onChange={(e) => setNewContactForm((prev) => ({ ...prev, phone: e.target.value }))}
              />
              <input
                className="bg-[#0f1a33] border border-[#314263] rounded-lg px-3 py-2 text-sm text-gray-100"
                placeholder="Fila"
                value={newContactForm.queue}
                onChange={(e) => setNewContactForm((prev) => ({ ...prev, queue: e.target.value }))}
              />
              <select
                className="bg-[#0f1a33] border border-[#314263] rounded-lg px-3 py-2 text-sm text-gray-100"
                value={newContactForm.templateName}
                onChange={(e) => handleTemplateChange(e.target.value)}
              >
                {templateOptions.map((tpl) => (
                  <option key={tpl.name} value={tpl.name}>
                    {tpl.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              {(templateOptions.find((t) => t.name === newContactForm.templateName)?.params ?? []).map(
                (param) => (
                  <input
                    key={param}
                    className="bg-[#0f1a33] border border-[#314263] rounded-lg px-3 py-2 text-sm text-gray-100"
                    placeholder={`Parâmetro: ${param}`}
                    value={newContactForm.templateParams[param] ?? ""}
                    onChange={(e) =>
                      setNewContactForm((prev) => ({
                        ...prev,
                        templateParams: {
                          ...prev.templateParams,
                          [param]: e.target.value,
                        },
                      }))
                    }
                  />
                )
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewContactModal(false)}
                className="px-4 py-2 rounded-lg bg-[#223150] text-gray-200 hover:bg-[#2b3f66]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleCreateNewContact()}
                className="px-4 py-2 rounded-lg bg-accent text-white hover:bg-accent-dark"
              >
                Enviar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
