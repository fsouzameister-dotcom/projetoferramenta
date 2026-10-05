import { useCallback, useEffect, useRef, useState } from "react";
import { UA, WebSocketInterface } from "jssip";
import type { RTCSession } from "jssip/lib/RTCSession";
import api, { getApiErrorMessage, unwrapApiData } from "../api/client";
import {
  formatBrPhone,
  formatCallDateTime,
  formatDuration,
  voiceCallStatusLabel,
  voiceOutcomeOptions,
  type AgentVoiceCampaign,
  type NextVoiceContact,
  type VoiceCall,
  type VoiceContactOutcome,
} from "~lib/telephony";

type TelephonySession = { wsUrl: string; sipUri: string; username: string; password: string };
type Tabulacao = { id: string; label: string; description: string | null };
type LineState = "offline" | "connecting" | "ready" | "error";
type CallState = "idle" | "requesting" | "ringing" | "in_call";
type DialerTab = "preview" | "manual";

export type DialRequest = { phone: string; nonce: number };

const KEYPAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];
const CAMPAIGN_STORAGE_KEY = "clienton.dialer.campaign";

export default function Softphone(props: {
  dialRequest?: DialRequest | null;
  onEnabledChange?: (enabled: boolean) => void;
}) {
  const { dialRequest, onEnabledChange } = props;
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<DialerTab>("preview");
  const [line, setLine] = useState<LineState>("offline");
  const [callState, setCallState] = useState<CallState>("idle");
  const [number, setNumber] = useState("");
  const [dialedNumber, setDialedNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [showKeypad, setShowKeypad] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [pendingCallId, setPendingCallId] = useState<string | null>(null);
  const [tabulacoes, setTabulacoes] = useState<Tabulacao[]>([]);
  const [selectedTabulacao, setSelectedTabulacao] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<VoiceContactOutcome | null>(null);
  const [savingTabulacao, setSavingTabulacao] = useState(false);
  const [recent, setRecent] = useState<VoiceCall[]>([]);
  const [campaigns, setCampaigns] = useState<AgentVoiceCampaign[]>([]);
  const [campaignId, setCampaignId] = useState<string>(() => localStorage.getItem(CAMPAIGN_STORAGE_KEY) ?? "");
  const [contact, setContact] = useState<NextVoiceContact | null>(null);

  const uaRef = useRef<UA | null>(null);
  const domainRef = useRef<string>("");
  const sessionRef = useRef<RTCSession | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const answeredAtRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api.get("/agent/telephony/status");
        const data = unwrapApiData<{ configured: boolean; enabled: boolean }>(res.data);
        if (!cancelled) setEnabled(Boolean(data.configured && data.enabled));
      } catch {
        if (!cancelled) setEnabled(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    onEnabledChange?.(enabled);
  }, [enabled, onEnabledChange]);

  useEffect(() => {
    if (callState !== "in_call") return;
    const timer = window.setInterval(() => {
      if (answeredAtRef.current) setElapsed(Math.floor((Date.now() - answeredAtRef.current) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [callState]);

  useEffect(() => {
    return () => {
      sessionRef.current?.terminate();
      uaRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (campaignId) localStorage.setItem(CAMPAIGN_STORAGE_KEY, campaignId);
  }, [campaignId]);

  const loadRecent = useCallback(async () => {
    try {
      const res = await api.get("/agent/telephony/calls");
      setRecent(unwrapApiData<VoiceCall[]>(res.data));
    } catch {
      /* histórico é apenas informativo */
    }
  }, []);

  const loadCampaigns = useCallback(async () => {
    try {
      const res = await api.get("/agent/telephony/campaigns");
      const items = unwrapApiData<AgentVoiceCampaign[]>(res.data);
      setCampaigns(items);
      setCampaignId((prev) => (items.some((c) => c.id === prev) ? prev : (items[0]?.id ?? "")));
    } catch {
      setCampaigns([]);
    }
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    setLine("connecting");
    try {
      const res = await api.post("/agent/telephony/session");
      const session = unwrapApiData<TelephonySession>(res.data);
      domainRef.current = session.sipUri.split("@")[1] ?? "";
      uaRef.current?.stop();
      const ua = new UA({
        sockets: [new WebSocketInterface(session.wsUrl)],
        uri: session.sipUri,
        password: session.password,
        register: true,
        session_timers: false,
      });
      ua.on("registered", () => setLine("ready"));
      ua.on("unregistered", () => setLine("offline"));
      ua.on("registrationFailed", () => {
        setLine("error");
        setError("Não foi possível conectar o discador. Clique em Reconectar.");
      });
      ua.on("disconnected", () => {
        setLine((prev) => (prev === "ready" ? "connecting" : prev));
      });
      ua.start();
      uaRef.current = ua;
    } catch (e) {
      setLine("error");
      setError(getApiErrorMessage(e, "Não foi possível preparar o discador"));
    }
  }, []);

  const openPanel = useCallback(() => {
    setOpen(true);
    if (line === "offline" || line === "error") void connect();
    void loadRecent();
    void loadCampaigns();
  }, [connect, line, loadCampaigns, loadRecent]);

  const openTabulation = useCallback(async (callId: string) => {
    setPendingCallId(callId);
    setSelectedTabulacao(null);
    setOutcome(null);
    try {
      const res = await api.get("/agent/telephony/tabulacoes");
      const items = unwrapApiData<Tabulacao[]>(res.data);
      setTabulacoes(items);
      if (items.length === 0) setPendingCallId(null);
    } catch {
      setTabulacoes([]);
      setPendingCallId(null);
    }
  }, []);

  const canStart = useCallback((): boolean => {
    if (!uaRef.current || line !== "ready") {
      setError("Discador desconectado. Aguarde ou clique em Reconectar.");
      return false;
    }
    if (pendingCallId) {
      setError("Tabule a ligação anterior antes de fazer outra.");
      return false;
    }
    return true;
  }, [line, pendingCallId]);

  /** Disca um pedido já registrado no backend (callId vai no cabeçalho para o dialplan autorizar). */
  const dial = useCallback(
    (callId: string, dialNumber: string, hasContact: boolean) => {
      const ua = uaRef.current;
      setDialedNumber(dialNumber);
      let reachedServer = false;
      const finish = (failedCause?: string) => {
        sessionRef.current = null;
        answeredAtRef.current = null;
        setCallState("idle");
        setMuted(false);
        setShowKeypad(false);
        setElapsed(0);
        if (reachedServer) {
          void openTabulation(callId);
        } else {
          void api.post(`/agent/telephony/calls/${callId}/abandon`).catch(() => undefined);
          if (hasContact) setContact(null);
          if (failedCause) setError(`Ligação não iniciada: ${failedCause}`);
        }
        window.setTimeout(() => void loadRecent(), 1500);
      };

      if (!ua) {
        finish("discador desconectado");
        return;
      }
      try {
        const session = ua.call(`sip:${dialNumber}@${domainRef.current}`, {
          extraHeaders: [`X-ClientOn-Call-Id: ${callId}`],
          mediaConstraints: { audio: true, video: false },
          pcConfig: { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] },
        });
        sessionRef.current = session;
        session.on("sending", () => {
          reachedServer = true;
        });
        session.on("progress", () => setCallState("ringing"));
        session.on("confirmed", () => {
          answeredAtRef.current = Date.now();
          setCallState("in_call");
        });
        session.on("ended", () => finish());
        session.on("failed", (e: { cause?: string }) => finish(e.cause));
        session.connection?.addEventListener("track", (ev: RTCTrackEvent) => {
          if (audioRef.current) audioRef.current.srcObject = ev.streams[0];
        });
        session.on("peerconnection", (e: { peerconnection: RTCPeerConnection }) => {
          e.peerconnection.addEventListener("track", (ev: RTCTrackEvent) => {
            if (audioRef.current) audioRef.current.srcObject = ev.streams[0];
          });
        });
        setCallState("ringing");
      } catch (e) {
        finish(e instanceof Error ? e.message : undefined);
      }
    },
    [loadRecent, openTabulation]
  );

  const startManualCall = useCallback(
    async (rawNumber: string) => {
      if (!canStart()) return;
      setError(null);
      setInfo(null);
      setContact(null);
      setCallState("requesting");
      try {
        const res = await api.post("/agent/telephony/calls", { phone: rawNumber });
        const data = unwrapApiData<{ callId: string; dialNumber: string }>(res.data);
        dial(data.callId, data.dialNumber, false);
      } catch (e) {
        setCallState("idle");
        setError(getApiErrorMessage(e, "Não foi possível iniciar a ligação"));
      }
    },
    [canStart, dial]
  );

  const requestNextContact = useCallback(async () => {
    if (!campaignId) {
      setError("Selecione a fila/campanha.");
      return;
    }
    if (!canStart()) return;
    setError(null);
    setInfo(null);
    setCallState("requesting");
    try {
      const res = await api.post(`/agent/telephony/campaigns/${campaignId}/next`);
      const data = unwrapApiData<NextVoiceContact>(res.data);
      setContact(data);
      dial(data.callId, data.dialNumber, true);
    } catch (e) {
      setCallState("idle");
      setContact(null);
      setInfo(null);
      setError(getApiErrorMessage(e, "Não foi possível pedir o próximo contato"));
      void loadCampaigns();
    }
  }, [campaignId, canStart, dial, loadCampaigns]);

  useEffect(() => {
    if (!dialRequest || !enabled) return;
    setNumber(dialRequest.phone);
    setTab("manual");
    openPanel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialRequest?.nonce]);

  const hangup = () => sessionRef.current?.terminate();

  const toggleMute = () => {
    const session = sessionRef.current;
    if (!session) return;
    if (muted) session.unmute({ audio: true });
    else session.mute({ audio: true });
    setMuted(!muted);
  };

  const sendDigit = (digit: string) => {
    if (callState === "in_call") {
      sessionRef.current?.sendDTMF(digit);
    } else {
      setNumber((prev) => prev + digit);
    }
  };

  const confirmTabulation = async () => {
    if (!pendingCallId || !selectedTabulacao) return;
    if (contact && !outcome) {
      setError("Escolha o que fazer com o contato.");
      return;
    }
    setSavingTabulacao(true);
    try {
      await api.post(`/agent/telephony/calls/${pendingCallId}/tabulate`, {
        tabulacaoId: selectedTabulacao,
        outcome: contact ? outcome : undefined,
      });
      setPendingCallId(null);
      setSelectedTabulacao(null);
      setOutcome(null);
      setError(null);
      if (contact) {
        setContact(null);
        setInfo("Tabulação salva. Peça o próximo contato quando estiver pronto.");
        void loadCampaigns();
      }
      void loadRecent();
    } catch (e) {
      setError(getApiErrorMessage(e, "Erro ao salvar tabulação"));
    } finally {
      setSavingTabulacao(false);
    }
  };

  if (!enabled) return null;

  const busy = callState !== "idle";
  const lineDot =
    callState !== "idle"
      ? "bg-amber-400"
      : line === "ready"
        ? "bg-emerald-400"
        : line === "connecting"
          ? "bg-sky-400 animate-pulse"
          : line === "error"
            ? "bg-red-400"
            : "bg-gray-500";
  const badge =
    callState !== "idle"
      ? { label: callState === "in_call" ? "Em ligação" : "Chamando", cls: "bg-amber-500/20 text-amber-200 border-amber-400/40" }
      : line === "ready"
        ? { label: "Disponível", cls: "bg-emerald-500/20 text-emerald-200 border-emerald-400/40" }
        : line === "connecting"
          ? { label: "Conectando", cls: "bg-sky-500/20 text-sky-200 border-sky-400/40" }
          : line === "error"
            ? { label: "Erro", cls: "bg-red-500/20 text-red-200 border-red-400/40" }
            : { label: "Desconectado", cls: "bg-gray-500/20 text-gray-300 border-gray-400/40" };
  const selectedCampaign = campaigns.find((c) => c.id === campaignId) ?? null;
  const shownNumber = busy ? dialedNumber : number.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");

  const contactCard = contact ? (
    <div className="rounded-lg border border-cyan-500/30 bg-[#0f1a33] p-3 mb-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">{contact.contact.name || "Sem nome"}</p>
          <p className="text-xs text-cyan-200">{formatBrPhone(contact.contact.phone)}</p>
        </div>
        <span className="text-[10px] text-gray-300 whitespace-nowrap">
          Tentativa {contact.contact.attempts}/{contact.contact.maxAttempts}
        </span>
      </div>
      <p className="text-[11px] text-gray-400 mt-1">
        {contact.campaign.name}
        {contact.campaign.recordCalls ? " · ligação gravada" : ""}
        {contact.contact.lastTabulacaoLabel ? ` · última: ${contact.contact.lastTabulacaoLabel}` : ""}
      </p>
      {Object.keys(contact.contact.data).length > 0 ? (
        <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-2 gap-y-0.5 max-h-36 overflow-y-auto text-[11px]">
          {Object.entries(contact.contact.data)
            .filter(([, v]) => String(v ?? "").trim())
            .map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-gray-400 truncate max-w-[110px]" title={k}>
                  {k}
                </dt>
                <dd className="text-gray-100 break-words">{String(v)}</dd>
              </div>
            ))}
        </dl>
      ) : null}
    </div>
  ) : null;

  const callControls = (
    <>
      <div className="text-center mb-3">
        <p className="text-sm text-white">{formatBrPhone(shownNumber)}</p>
        <p className="text-xs text-gray-300 mt-0.5">
          {callState === "in_call" ? formatDuration(elapsed) : callState === "requesting" ? "Preparando…" : "Chamando…"}
        </p>
      </div>
      {showKeypad ? (
        <div className="grid grid-cols-3 gap-1.5 mb-3">
          {KEYPAD.map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => sendDigit(digit)}
              disabled={callState !== "in_call"}
              className="py-2 rounded-lg bg-[#0f1a33] border border-[#314263] text-white text-sm hover:border-cyan-500/50 disabled:opacity-40"
            >
              {digit}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={toggleMute}
          disabled={callState !== "in_call"}
          className={`flex-1 px-3 py-2 rounded-lg text-xs border disabled:opacity-40 ${
            muted ? "bg-amber-500/20 border-amber-400/50 text-amber-200" : "border-[#314263] text-gray-200 hover:bg-[#223150]"
          }`}
        >
          {muted ? "Tirar mudo" : "Mudo"}
        </button>
        <button
          type="button"
          onClick={() => setShowKeypad((v) => !v)}
          disabled={callState !== "in_call"}
          className="flex-1 px-3 py-2 rounded-lg text-xs border border-[#314263] text-gray-200 hover:bg-[#223150] disabled:opacity-40"
        >
          Teclado
        </button>
        <button
          type="button"
          onClick={hangup}
          disabled={callState === "requesting"}
          className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-500 disabled:opacity-50"
        >
          Desligar
        </button>
      </div>
    </>
  );

  const tabulationForm = (
    <div>
      <p className="text-xs text-gray-300 mb-2">Tabule a ligação para continuar:</p>
      <ul className="space-y-1.5 max-h-48 overflow-y-auto">
        {tabulacoes.map((t) => (
          <li key={t.id}>
            <label className="flex items-start gap-2 p-2 rounded-lg border border-[#314263] bg-[#0f1a33] cursor-pointer hover:border-cyan-500/50">
              <input
                type="radio"
                name="call-tabulacao"
                className="mt-0.5"
                checked={selectedTabulacao === t.id}
                onChange={() => setSelectedTabulacao(t.id)}
              />
              <span>
                <span className="text-xs font-medium text-white block">{t.label}</span>
                {t.description ? <span className="text-[11px] text-gray-400 block">{t.description}</span> : null}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {contact ? (
        <div className="mt-3">
          <p className="text-xs text-gray-300 mb-1.5">E o contato?</p>
          <div className="grid grid-cols-3 gap-1.5">
            {voiceOutcomeOptions.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setOutcome(o.value)}
                className={`px-2 py-1.5 rounded-lg text-[11px] border leading-tight ${
                  outcome === o.value
                    ? "border-cyan-400 bg-cyan-500/15 text-cyan-100"
                    : "border-[#314263] text-gray-300 hover:bg-[#223150]"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <button
        type="button"
        disabled={!selectedTabulacao || (contact !== null && !outcome) || savingTabulacao}
        onClick={() => void confirmTabulation()}
        className="mt-3 w-full px-3 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-dark disabled:opacity-50"
      >
        {savingTabulacao ? "Salvando…" : "Salvar tabulação"}
      </button>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPanel())}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-cyan-400/60 text-cyan-200 hover:bg-cyan-500/10 inline-flex items-center gap-2"
        aria-expanded={open}
      >
        <span className={`w-2 h-2 rounded-full ${lineDot}`} />
        {busy ? (callState === "in_call" ? `Em ligação ${formatDuration(elapsed)}` : "Chamando…") : "Discador"}
      </button>

      <audio ref={audioRef} autoPlay />

      <div
        className={`fixed right-6 top-24 z-[65] w-96 max-h-[calc(100vh-7rem)] overflow-y-auto bg-[#1b2540] border border-[#2f3d63] rounded-xl shadow-2xl p-4 ${
          open ? "" : "hidden"
        }`}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-white">Discador</h2>
            <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${badge.cls}`}>{badge.label}</span>
          </div>
          <div className="flex items-center gap-2">
            {line === "error" || line === "offline" ? (
              <button type="button" onClick={() => void connect()} className="text-[11px] text-cyan-300 hover:underline">
                Reconectar
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-6 h-6 rounded text-gray-400 hover:text-white hover:bg-[#223150]"
              aria-label="Fechar discador"
            >
              ×
            </button>
          </div>
        </div>

        <div className="flex rounded-lg bg-[#0f1a33] p-1 mb-3">
          {(["preview", "manual"] as const).map((t) => (
            <button
              key={t}
              type="button"
              disabled={busy || Boolean(pendingCallId)}
              onClick={() => {
                setTab(t);
                setError(null);
                setInfo(null);
              }}
              className={`flex-1 py-1.5 rounded-md text-xs font-semibold disabled:cursor-not-allowed ${
                tab === t ? "bg-[#223150] text-white" : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {t === "preview" ? "Preview" : "Manual"}
            </button>
          ))}
        </div>

        {error ? (
          <div className="mb-3 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</div>
        ) : null}
        {info && !error ? (
          <div className="mb-3 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
            {info}
          </div>
        ) : null}

        {contactCard}

        {pendingCallId ? (
          tabulationForm
        ) : busy ? (
          callControls
        ) : tab === "preview" ? (
          <div>
            <label className="block text-[11px] text-gray-400 mb-1">Selecione a fila</label>
            <select
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              className="w-full bg-[#0f1a33] border border-[#314263] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/60"
            >
              {campaigns.length === 0 ? <option value="">Nenhuma campanha disponível</option> : null}
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.queueLabels.length ? ` — ${c.queueLabels.join(", ")}` : ""}
                </option>
              ))}
            </select>
            {selectedCampaign ? (
              <p className="text-[11px] text-gray-400 mt-1.5">
                {selectedCampaign.readyNow} contato(s) disponível(is) agora
                {selectedCampaign.scheduled > 0
                  ? ` · ${selectedCampaign.scheduled} agendado(s)${
                      selectedCampaign.nextRetryAt ? ` (próximo ${formatCallDateTime(selectedCampaign.nextRetryAt)})` : ""
                    }`
                  : ""}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => void requestNextContact()}
              disabled={line !== "ready" || !campaignId}
              className="mt-3 w-full px-3 py-2.5 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              Pedir próximo contato
            </button>
          </div>
        ) : (
          <>
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && number.trim()) void startManualCall(number);
              }}
              placeholder="DDD + número"
              className="w-full bg-[#0f1a33] border border-[#314263] rounded-lg px-3 py-2 text-base text-white tracking-wide outline-none focus:border-cyan-500/60"
            />
            <div className="grid grid-cols-3 gap-1.5 mt-3">
              {KEYPAD.map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => sendDigit(digit)}
                  className="py-2 rounded-lg bg-[#0f1a33] border border-[#314263] text-white text-sm hover:border-cyan-500/50"
                >
                  {digit}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void startManualCall(number)}
              disabled={line !== "ready" || !number.trim()}
              className="mt-3 w-full px-3 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              Ligar
            </button>
          </>
        )}

        {recent.length > 0 && !busy && !pendingCallId ? (
          <div className="mt-4 border-t border-[#33466f] pt-3">
            <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1.5">Últimas ligações</p>
            <ul className="space-y-1 max-h-40 overflow-y-auto">
              {recent.slice(0, 8).map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setNumber(c.phone);
                      setTab("manual");
                    }}
                    className="w-full flex items-center justify-between text-left px-2 py-1 rounded hover:bg-[#223150]"
                    title="Usar este número na discagem manual"
                  >
                    <span className="text-xs text-gray-200 truncate">
                      {c.contactName ? `${c.contactName} · ` : ""}
                      {formatBrPhone(c.phone)}
                    </span>
                    <span className="text-[11px] text-gray-400 whitespace-nowrap">
                      {voiceCallStatusLabel[c.status] ?? c.status}
                      {c.status === "answered" ? ` · ${formatDuration(c.talkSeconds)}` : ""} · {formatCallDateTime(c.createdAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </>
  );
}
