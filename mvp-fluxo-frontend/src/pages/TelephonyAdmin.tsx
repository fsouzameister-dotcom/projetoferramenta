import { useCallback, useEffect, useMemo, useState } from "react";
import api, { getApiErrorMessage, unwrapApiData } from "../api/client";
import InfoTooltip from "~components/InfoTooltip";
import {
  adminBtnPrimaryClass,
  adminErrorClass,
  adminInputInlineClass,
  adminLabelClass,
  adminNoticeClass,
  adminPageShellClass,
  adminPanelClass,
  adminTableHeadClass,
  adminTableRowClass,
} from "~lib/admin-ui";
import {
  formatBrPhone,
  formatCallDateTime,
  formatDuration,
  voiceCallStatusLabel,
  type VoiceCall,
} from "~lib/telephony";

type TelephonyUser = {
  userId: string;
  name: string;
  email: string;
  roleName: string;
  enabled: boolean;
};

const roleLabel: Record<string, string> = {
  agente: "Agente",
  supervisor: "Supervisor",
  admin_local: "Administrador",
  platform_admin: "Plataforma",
};

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function TelephonyAdmin() {
  const [activeTab, setActiveTab] = useState<"calls" | "users">("calls");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className={adminPageShellClass(true)}>
      <header>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          Telefonia
          <InfoTooltip text="Ligações feitas pelos atendentes na Central do Agente (telefonia própria via Asterisk + tronco SIP)." />
        </h1>
        <p className="text-sm text-gray-300 mt-1">
          Libere quem pode fazer ligações e acompanhe o histórico de chamadas com resultado, duração e tabulação.
        </p>
      </header>

      <div className="flex gap-2 border-b border-zinc-700">
        {(
          [
            { id: "calls", label: "Histórico de ligações" },
            { id: "users", label: "Usuários liberados" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setActiveTab(tab.id);
              setError(null);
              setNotice(null);
            }}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.id
                ? "border-cyan-400 text-cyan-300"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error ? <div className={adminErrorClass}>{error}</div> : null}
      {notice ? <div className={adminNoticeClass}>{notice}</div> : null}

      {activeTab === "calls" ? (
        <CallsTab setError={setError} />
      ) : (
        <UsersTab setError={setError} setNotice={setNotice} />
      )}
    </div>
  );
}

function CallsTab(props: { setError: (v: string | null) => void }) {
  const { setError } = props;
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [calls, setCalls] = useState<VoiceCall[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/admin/telephony/calls", { params: { from, to } });
      setCalls(unwrapApiData<VoiceCall[]>(res.data));
    } catch (e) {
      setError(getApiErrorMessage(e, "Erro ao carregar ligações"));
    } finally {
      setLoading(false);
    }
  }, [from, to, setError]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    const answered = calls.filter((c) => c.status === "answered");
    const talk = answered.reduce((acc, c) => acc + c.talkSeconds, 0);
    return {
      total: calls.length,
      answered: answered.length,
      rate: calls.length ? Math.round((answered.length / calls.length) * 100) : 0,
      talk,
      avg: answered.length ? Math.round(talk / answered.length) : 0,
    };
  }, [calls]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className={adminLabelClass}>
          De
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${adminInputInlineClass} mt-1.5 block`} />
        </label>
        <label className={adminLabelClass}>
          Até
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${adminInputInlineClass} mt-1.5 block`} />
        </label>
        <button type="button" className={adminBtnPrimaryClass} onClick={() => void load()} disabled={loading}>
          {loading ? "Carregando..." : "Atualizar"}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Ligações", value: String(summary.total) },
          { label: "Atendidas", value: `${summary.answered} (${summary.rate}%)` },
          { label: "Tempo falado", value: formatDuration(summary.talk) },
          { label: "Duração média", value: formatDuration(summary.avg) },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-zinc-600/60 bg-zinc-800/40 p-4">
            <div className="text-xs text-gray-400">{card.label}</div>
            <div className="text-xl font-semibold text-white mt-1">{card.value}</div>
          </div>
        ))}
      </div>

      <div className={adminPanelClass}>
        <table className="w-full text-sm">
          <thead className={adminTableHeadClass}>
            <tr>
              <th className="px-4 py-3">Data/hora</th>
              <th className="px-4 py-3">Atendente</th>
              <th className="px-4 py-3">Número</th>
              <th className="px-4 py-3">Resultado</th>
              <th className="px-4 py-3">Duração</th>
              <th className="px-4 py-3">Tabulação</th>
            </tr>
          </thead>
          <tbody>
            {calls.length === 0 ? (
              <tr className={adminTableRowClass}>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  Nenhuma ligação no período.
                </td>
              </tr>
            ) : (
              calls.map((c) => (
                <tr key={c.id} className={adminTableRowClass}>
                  <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{formatCallDateTime(c.createdAt)}</td>
                  <td className="px-4 py-3 text-gray-200">{c.userName ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-200 whitespace-nowrap">{formatBrPhone(c.phone)}</td>
                  <td className="px-4 py-3">
                    <span className={c.status === "answered" ? "text-emerald-300" : "text-gray-300"}>
                      {voiceCallStatusLabel[c.status] ?? c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{c.status === "answered" ? formatDuration(c.talkSeconds) : "—"}</td>
                  <td className="px-4 py-3 text-gray-300">{c.tabulacaoLabel ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UsersTab(props: { setError: (v: string | null) => void; setNotice: (v: string | null) => void }) {
  const { setError, setNotice } = props;
  const [users, setUsers] = useState<TelephonyUser[]>([]);
  const [configured, setConfigured] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get("/admin/telephony/users");
      const data = unwrapApiData<{ configured: boolean; users: TelephonyUser[] }>(res.data);
      setConfigured(data.configured);
      setUsers(data.users);
    } catch (e) {
      setError(getApiErrorMessage(e, "Erro ao carregar usuários"));
    }
  }, [setError]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (user: TelephonyUser) => {
    setSavingId(user.userId);
    setError(null);
    setNotice(null);
    try {
      const res = await api.put(`/admin/telephony/users/${user.userId}`, { enabled: !user.enabled });
      const updated = unwrapApiData<TelephonyUser>(res.data);
      setUsers((prev) => prev.map((u) => (u.userId === updated.userId ? updated : u)));
      setNotice(
        updated.enabled
          ? `${updated.name || updated.email} pode fazer ligações.`
          : `Ligações bloqueadas para ${updated.name || updated.email}.`
      );
    } catch (e) {
      setError(getApiErrorMessage(e, "Erro ao salvar"));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {!configured ? (
        <div className={adminErrorClass}>Telefonia ainda não configurada no servidor. As liberações ficam salvas, mas ninguém consegue ligar.</div>
      ) : null}
      <p className="text-sm text-gray-400">
        O telefone aparece na Central do Agente somente para os usuários liberados aqui.
      </p>
      <div className={adminPanelClass}>
        <table className="w-full text-sm">
          <thead className={adminTableHeadClass}>
            <tr>
              <th className="px-4 py-3">Usuário</th>
              <th className="px-4 py-3">Perfil</th>
              <th className="px-4 py-3 text-right">Pode ligar</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.userId} className={adminTableRowClass}>
                <td className="px-4 py-3">
                  <div className="text-gray-100">{u.name || "—"}</div>
                  <div className="text-xs text-gray-400">{u.email}</div>
                </td>
                <td className="px-4 py-3 text-gray-300">{roleLabel[u.roleName] ?? u.roleName}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={u.enabled}
                    disabled={savingId === u.userId}
                    onClick={() => void toggle(u)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                      u.enabled ? "bg-emerald-500" : "bg-zinc-600"
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                        u.enabled ? "translate-x-5" : "translate-x-1"
                      }`}
                    />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
