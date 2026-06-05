import { useCallback, useEffect, useState } from "react";
import api, { getApiErrorMessage, unwrapApiData } from "../api/client";

type BotSafeguardStatus = {
  tenantId: string;
  paused: boolean;
  pauseReason: string | null;
  pausedAt: string | null;
  pauseSource: "manual" | "circuit_breaker" | null;
  updatedAt: string;
};

type Props = {
  variant?: "dashboard" | "compact";
};

export default function BotSafeguardPanel({ variant = "dashboard" }: Props) {
  const [status, setStatus] = useState<BotSafeguardStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/bot-safeguard");
      setStatus(unwrapApiData<BotSafeguardStatus>(res.data));
      setError(null);
    } catch (err) {
      setError(getApiErrorMessage(err, "Erro ao carregar proteção anti-spam do bot"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async () => {
    if (!status || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.patch("/bot-safeguard", { paused: !status.paused });
      setStatus(unwrapApiData<BotSafeguardStatus>(res.data));
    } catch (err) {
      setError(getApiErrorMessage(err, "Erro ao atualizar proteção do bot"));
    } finally {
      setSaving(false);
    }
  };

  const paused = status?.paused ?? false;
  const isDashboard = variant === "dashboard";

  return (
    <div
      className={`rounded-xl border ${
        paused
          ? "bg-red-50 border-red-300"
          : "bg-white border-gray-100"
      } ${isDashboard ? "shadow-sm p-4 mb-4" : "p-4"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            className={`font-semibold ${
              paused ? "text-red-800" : isDashboard ? "text-primary text-lg" : "text-gray-900"
            }`}
          >
            {paused ? "Bot pausado — envios automáticos bloqueados" : "Proteção anti-spam do bot"}
          </h2>
          <p className={`text-sm mt-1 ${paused ? "text-red-700" : "text-gray-600"}`}>
            Pausa apenas fluxo e respostas automáticas. O agente humano continua enviando
            mensagens normalmente.
          </p>
          {paused && status?.pauseReason ? (
            <p className="text-sm mt-2 text-red-800 font-medium">{status.pauseReason}</p>
          ) : null}
          {paused && status?.pauseSource === "circuit_breaker" ? (
            <p className="text-xs mt-1 text-red-600">
              Pausa automática por circuit breaker. Revise o fluxo e retome manualmente.
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={loading || saving || !status}
          className={`shrink-0 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 ${
            paused
              ? "bg-emerald-600 text-white hover:bg-emerald-700"
              : "bg-red-600 text-white hover:bg-red-700"
          }`}
        >
          {saving ? "Salvando..." : paused ? "Retomar bot" : "Pausar bot"}
        </button>
      </div>
      {error ? (
        <p className="text-sm text-red-700 mt-3">{error}</p>
      ) : null}
      {!paused && !loading ? (
        <ul className="text-xs text-gray-500 mt-3 space-y-1 list-disc list-inside">
          <li>Bloqueia texto repetido para o mesmo número (10 min)</li>
          <li>Mensagens diferentes no mesmo fluxo não têm limite de volume</li>
          <li>Circuit breaker pausa o tenant se detectar padrão de spam (texto igual)</li>
        </ul>
      ) : null}
    </div>
  );
}
