import { useCallback, useEffect, useRef, useState } from "react";
import api, { getApiErrorMessage, unwrapApiData } from "../api/client";
import type { FlowEditorWarning } from "../lib/flow-editor-validation";

type FlowOutboundMessage = {
  kind: "text" | "interactive_buttons" | "interactive_list";
  body: string;
  buttons?: Array<{ id: string; label: string }>;
  listItems?: Array<{ id: string; label: string; description?: string }>;
  listButtonText?: string;
  listSectionTitle?: string;
};

type AwaitingInput = {
  nodeId: string;
  prompt: string;
  inputMode: "text" | "single_choice" | "multi_choice";
  options: Array<{ id: string; label: string }>;
  minSelections: number;
  maxSelections: number;
  awaitingStartedAt?: string;
  waitTimeoutSeconds?: number;
  nextNodeIdOnTimeout?: string | null;
};

type ExecuteFlowResult = {
  flowId: string;
  status: "completed" | "stopped" | "awaiting_input";
  stopReason?: string;
  messages: string[];
  outboundMessages?: FlowOutboundMessage[];
  variables: Record<string, unknown>;
  trace: Array<{
    nodeId: string;
    nodeType: string;
    nodeName: string;
    nextNodeId: string | null;
    details?: Record<string, unknown>;
  }>;
  currentNodeId: string | null;
  awaitingInput?: AwaitingInput;
};

type ChatEntry = {
  id: string;
  role: "bot" | "user" | "system";
  text: string;
  outbound?: FlowOutboundMessage;
};

type TestSession = {
  variables: Record<string, unknown>;
  currentNodeId: string | null;
  awaitingInput: AwaitingInput | null;
  awaitingStartedAt?: string;
  status: ExecuteFlowResult["status"] | "idle";
  stopReason?: string;
};

type FlowTestPanelProps = {
  flowId: string;
  flowName?: string;
  warnings?: FlowEditorWarning[];
  onClose: () => void;
};

let chatIdSeq = 0;
function nextChatId() {
  chatIdSeq += 1;
  return `chat-${chatIdSeq}`;
}

function outboundToChatEntries(outbound: FlowOutboundMessage[]): ChatEntry[] {
  return outbound.map((msg) => ({
    id: nextChatId(),
    role: "bot" as const,
    text: msg.body,
    outbound: msg,
  }));
}

function fallbackBotEntries(messages: string[], fromIndex: number): ChatEntry[] {
  return messages.slice(fromIndex).map((text) => ({
    id: nextChatId(),
    role: "bot" as const,
    text,
  }));
}

export default function FlowTestPanel({
  flowId,
  flowName,
  warnings = [],
  onClose,
}: FlowTestPanelProps) {
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [trace, setTrace] = useState<ExecuteFlowResult["trace"]>([]);
  const [session, setSession] = useState<TestSession>({
    variables: {},
    currentNodeId: null,
    awaitingInput: null,
    status: "idle",
  });
  const [textInput, setTextInput] = useState("");
  const [multiSelected, setMultiSelected] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTrace, setShowTrace] = useState(false);
  const [showVariables, setShowVariables] = useState(false);
  const outboundCountRef = useRef(0);
  const messageCountRef = useRef(0);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const appendBotFromResult = useCallback((result: ExecuteFlowResult) => {
    const outbound = result.outboundMessages ?? [];
    let newEntries: ChatEntry[] = [];

    if (outbound.length > outboundCountRef.current) {
      newEntries = outboundToChatEntries(outbound.slice(outboundCountRef.current));
      outboundCountRef.current = outbound.length;
      messageCountRef.current = result.messages.length;
    } else if (result.messages.length > messageCountRef.current) {
      newEntries = fallbackBotEntries(result.messages, messageCountRef.current);
      messageCountRef.current = result.messages.length;
    }

    if (newEntries.length) {
      setChat((prev) => [...prev, ...newEntries]);
    }
    setTrace((prev) => [...prev, ...result.trace]);
  }, []);

  const applyResult = useCallback(
    (result: ExecuteFlowResult) => {
      appendBotFromResult(result);
      setSession({
        variables: result.variables ?? {},
        currentNodeId: result.currentNodeId,
        awaitingInput: result.status === "awaiting_input" ? result.awaitingInput ?? null : null,
        awaitingStartedAt: result.awaitingInput?.awaitingStartedAt,
        status: result.status,
        stopReason: result.stopReason,
      });
      setMultiSelected([]);
      setTextInput("");

      if (result.status === "completed" || result.status === "stopped") {
        const label =
          result.status === "completed"
            ? result.stopReason
              ? `Fluxo concluído (${result.stopReason}).`
              : "Fluxo concluído."
            : `Fluxo interrompido: ${result.stopReason ?? "motivo desconhecido"}.`;
        setChat((prev) => [...prev, { id: nextChatId(), role: "system", text: label }]);
      }
    },
    [appendBotFromResult]
  );

  const runExecute = useCallback(
    async (body: Record<string, unknown>) => {
      setRunning(true);
      setError(null);
      try {
        const response = await api.post(`/flows/${flowId}/execute`, {
          persistResponses: false,
          testMode: true,
          ...body,
        });
        const result = unwrapApiData<ExecuteFlowResult>(response.data);
        applyResult(result);
      } catch (err) {
        setError(getApiErrorMessage(err, "Erro ao executar o fluxo em modo teste."));
      } finally {
        setRunning(false);
      }
    },
    [applyResult, flowId]
  );

  const resetAndStart = useCallback(() => {
    outboundCountRef.current = 0;
    messageCountRef.current = 0;
    setChat([
      {
        id: nextChatId(),
        role: "system",
        text: "Modo teste — sem canal. Mensagens com botões pausam até você clicar.",
      },
    ]);
    setTrace([]);
    setSession({
      variables: {},
      currentNodeId: null,
      awaitingInput: null,
      status: "idle",
    });
    setMultiSelected([]);
    setTextInput("");
    setError(null);
    void runExecute({ variables: {} });
  }, [runExecute]);

  useEffect(() => {
    resetAndStart();
  }, [resetAndStart]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, running]);

  const submitUserInput = useCallback(
    (input: string | string[], displayLabel?: string) => {
      const display = displayLabel ?? (Array.isArray(input) ? input.join(", ") : input);
      setChat((prev) => [...prev, { id: nextChatId(), role: "user", text: display }]);

      if (!session.currentNodeId) return;

      void runExecute({
        startNodeId: session.currentNodeId,
        userInput: input,
        variables: session.variables,
        awaitingStartedAt: session.awaitingStartedAt,
      });
    },
    [runExecute, session]
  );

  const handleSendText = () => {
    const trimmed = textInput.trim();
    if (!trimmed || running || session.status !== "awaiting_input") return;
    submitUserInput(trimmed);
  };

  const handleChoice = (optionId: string, optionLabel?: string) => {
    if (running || session.status !== "awaiting_input") return;
    const awaiting = session.awaitingInput;
    if (!awaiting) return;

    if (awaiting.inputMode === "multi_choice") {
      setMultiSelected((prev) =>
        prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId]
      );
      return;
    }
    submitUserInput(optionId, optionLabel ?? optionId);
  };

  const handleSubmitMulti = () => {
    if (!multiSelected.length || running) return;
    submitUserInput(multiSelected);
  };

  const handleSimulateTimeout = () => {
    if (!session.currentNodeId || running) return;
    setChat((prev) => [
      ...prev,
      { id: nextChatId(), role: "system", text: "Simulando tempo esgotado…" },
    ]);
    void runExecute({
      startNodeId: session.currentNodeId,
      variables: session.variables,
      awaitingStartedAt: session.awaitingStartedAt,
      resumeReason: "timeout",
    });
  };

  const awaiting = session.awaitingInput;
  const canInteract = session.status === "awaiting_input" && !running;
  const showTextInput = canInteract && awaiting?.inputMode === "text";
  const showChoices =
    canInteract &&
    awaiting &&
    (awaiting.inputMode === "single_choice" || awaiting.inputMode === "multi_choice") &&
    awaiting.options.length > 0;

  return (
    <div className="fixed inset-y-0 right-0 z-[90] flex w-full max-w-md flex-col border-l border-[#334155] bg-[#0f172a] shadow-2xl">
      <div className="flex items-center gap-2 border-b border-[#334155] bg-[#111827] px-4 py-3 shrink-0">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-white">Testar fluxo</h2>
          <p className="truncate text-[11px] text-gray-400">
            {flowName || "Simulador"} · sem canal
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
            session.status === "awaiting_input"
              ? "bg-amber-500/20 text-amber-200"
              : session.status === "completed"
                ? "bg-emerald-500/20 text-emerald-200"
                : session.status === "stopped"
                  ? "bg-red-500/20 text-red-200"
                  : "bg-slate-500/20 text-slate-200"
          }`}
        >
          {running ? "executando" : session.status}
        </span>
        <button
          type="button"
          onClick={resetAndStart}
          disabled={running}
          className="rounded-lg border border-[#475569] px-2 py-1 text-[11px] text-gray-200 hover:bg-[#1e293b] disabled:opacity-50"
          title="Reiniciar teste"
        >
          ↺
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-[#475569] px-2 py-1 text-sm text-gray-200 hover:bg-[#1e293b]"
          aria-label="Fechar simulador"
        >
          ✕
        </button>
      </div>

      {warnings.length > 0 ? (
        <div className="shrink-0 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 max-h-20 overflow-y-auto">
          <p className="text-[10px] font-medium text-amber-200 mb-0.5">Avisos do fluxo</p>
          {warnings.slice(0, 4).map((w) => (
            <p key={`${w.nodeId}-${w.message}`} className="text-[10px] text-amber-100/90 leading-snug">
              {w.nodeName}: {w.message}
            </p>
          ))}
        </div>
      ) : null}

      <div className="flex gap-1 border-b border-[#334155] px-3 py-2 shrink-0">
        <button
          type="button"
          onClick={() => setShowTrace((v) => !v)}
          className={`rounded px-2 py-1 text-[11px] ${
            showTrace ? "bg-cyan-500/20 text-cyan-200" : "text-gray-400 hover:text-gray-200"
          }`}
        >
          Trace ({trace.length})
        </button>
        <button
          type="button"
          onClick={() => setShowVariables((v) => !v)}
          className={`rounded px-2 py-1 text-[11px] ${
            showVariables ? "bg-cyan-500/20 text-cyan-200" : "text-gray-400 hover:text-gray-200"
          }`}
        >
          Variáveis
        </button>
      </div>

      {showTrace ? (
        <div className="max-h-40 shrink-0 overflow-y-auto border-b border-[#334155] bg-[#0a0f1a] p-3 text-[10px] font-mono text-gray-300">
          {trace.length === 0 ? (
            <p className="text-gray-500">Nenhum node visitado ainda.</p>
          ) : (
            trace.map((entry, i) => (
              <div key={`${entry.nodeId}-${i}`} className="mb-1 border-b border-[#1e293b] pb-1">
                <span className="text-cyan-300">{entry.nodeType}</span>{" "}
                <span className="text-white">{entry.nodeName}</span>
                {entry.nextNodeId ? (
                  <span className="text-gray-500"> → {entry.nextNodeId.slice(0, 8)}…</span>
                ) : null}
              </div>
            ))
          )}
        </div>
      ) : null}

      {showVariables ? (
        <div className="max-h-32 shrink-0 overflow-y-auto border-b border-[#334155] bg-[#0a0f1a] p-3 text-[10px] font-mono text-gray-300">
          <pre className="whitespace-pre-wrap break-all">
            {JSON.stringify(session.variables, null, 2)}
          </pre>
        </div>
      ) : null}

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
        {chat.map((entry) => (
          <div
            key={entry.id}
            className={`flex ${entry.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[90%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                entry.role === "user"
                  ? "bg-teal-700 text-white"
                  : entry.role === "system"
                    ? "bg-slate-700/50 text-gray-300 text-xs italic w-full max-w-full text-center"
                    : "bg-[#1e293b] text-gray-100 border border-[#334155]"
              }`}
            >
              {entry.text}
              {entry.outbound?.kind === "interactive_buttons" && entry.outbound.buttons?.length ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {entry.outbound.buttons.map((btn) => (
                    <button
                      key={btn.id}
                      type="button"
                      disabled={!canInteract}
                      onClick={() => handleChoice(btn.id, btn.label)}
                      className="rounded border border-teal-500/50 px-2 py-1 text-[11px] text-teal-100 hover:bg-teal-500/20 disabled:opacity-40 disabled:cursor-default"
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              ) : null}
              {entry.outbound?.kind === "interactive_list" && entry.outbound.listItems?.length ? (
                <ul className="mt-2 space-y-1">
                  {entry.outbound.listItems.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        disabled={!canInteract}
                        onClick={() => handleChoice(item.id, item.label)}
                        className="w-full rounded border border-teal-500/40 px-2 py-1 text-left text-[11px] text-gray-200 hover:bg-teal-500/10 disabled:opacity-40 disabled:cursor-default"
                      >
                        {item.label}
                        {item.description ? (
                          <span className="block text-gray-500">{item.description}</span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        ))}
        {running ? (
          <p className="text-center text-xs text-gray-500 animate-pulse">Executando fluxo…</p>
        ) : null}
        <div ref={chatEndRef} />
      </div>

      {error ? (
        <div className="shrink-0 border-t border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      ) : null}

      <div className="shrink-0 border-t border-[#334155] bg-[#111827] p-3 space-y-2">
        {awaiting?.prompt && session.status === "awaiting_input" ? (
          <p className="text-[11px] text-gray-400 line-clamp-3">{awaiting.prompt}</p>
        ) : null}

        {showChoices ? (
          <div className="space-y-1">
            {awaiting!.options.map((opt) => {
              const selected = multiSelected.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={!canInteract}
                  onClick={() => handleChoice(opt.id, opt.label)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:opacity-50 ${
                    selected
                      ? "border-teal-500 bg-teal-500/20 text-teal-100"
                      : "border-[#475569] text-gray-200 hover:bg-[#1e293b]"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
            {awaiting!.inputMode === "multi_choice" ? (
              <button
                type="button"
                disabled={!canInteract || multiSelected.length < awaiting!.minSelections}
                onClick={handleSubmitMulti}
                className="w-full rounded-lg bg-teal-600 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
              >
                Confirmar seleção ({multiSelected.length})
              </button>
            ) : null}
          </div>
        ) : null}

        {showTextInput ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSendText();
              }}
              disabled={!canInteract}
              placeholder="Digite como o cliente…"
              className="flex-1 rounded-lg border border-[#475569] bg-[#0f172a] px-3 py-2 text-sm text-white placeholder:text-gray-500 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={handleSendText}
              disabled={!canInteract || !textInput.trim()}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
            >
              Enviar
            </button>
          </div>
        ) : null}

        {canInteract &&
        awaiting?.waitTimeoutSeconds &&
        awaiting.nextNodeIdOnTimeout ? (
          <button
            type="button"
            onClick={handleSimulateTimeout}
            className="w-full rounded-lg border border-amber-500/40 py-1.5 text-[11px] text-amber-200 hover:bg-amber-500/10"
          >
            Simular tempo esgotado ({awaiting.waitTimeoutSeconds}s)
          </button>
        ) : null}

        {session.status !== "awaiting_input" && session.status !== "idle" && !running ? (
          <button
            type="button"
            onClick={resetAndStart}
            className="w-full rounded-lg border border-[#475569] py-2 text-sm text-gray-200 hover:bg-[#1e293b]"
          >
            Executar novamente
          </button>
        ) : null}

        <p className="text-[10px] text-gray-500 leading-snug">
          Decisão avalia variáveis na hora — não espera texto. Use Receber/Capturar antes, ou
          clique nos botões da mensagem quando o fluxo pausar.
        </p>
      </div>
    </div>
  );
}
