import { useCallback, useEffect, useState } from "react";
import api, { getApiErrorMessage, unwrapApiData } from "../api/client";

export type FlowAiSettings = {
  globalPrompt: string;
  language: string;
  voiceId: string;
  executionMode: "rigid" | "flexible";
  personaId: string | null;
  guardrailPolicyId: string | null;
  guardrailDeployMode: "live" | "shadow";
  knowledgeBaseIds: string[];
};

type Persona = { id: string; name: string };
type Provider = { id: string; provider: string; model: string; is_default: boolean };
type KnowledgeBase = { id: string; name: string; key: string; is_active: boolean };
type GuardrailPolicy = { id: string; name: string; version: string; status: string };

const defaultSettings: FlowAiSettings = {
  globalPrompt: "",
  language: "pt-BR",
  voiceId: "",
  executionMode: "rigid",
  personaId: null,
  guardrailPolicyId: null,
  guardrailDeployMode: "live",
  knowledgeBaseIds: [],
};

export default function FlowAiSettingsPanel(props: { flowId: string }) {
  const { flowId } = props;
  const [settings, setSettings] = useState<FlowAiSettings>(defaultSettings);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [policies, setPolicies] = useState<GuardrailPolicy[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [settingsRes, personasRes, kbRes, policiesRes, providersRes] = await Promise.all([
        api.get(`/flows/${flowId}/ai-settings`),
        api.get("/ai/personas"),
        api.get("/ai/knowledge-bases"),
        api.get("/ai/guardrail-policies"),
        api.get("/ai/providers"),
      ]);
      setSettings({ ...defaultSettings, ...unwrapApiData<FlowAiSettings>(settingsRes.data) });
      setPersonas(unwrapApiData<Persona[]>(personasRes.data));
      setKnowledgeBases(unwrapApiData<KnowledgeBase[]>(kbRes.data));
      setPolicies(unwrapApiData<GuardrailPolicy[]>(policiesRes.data));
      setProviders(unwrapApiData<Provider[]>(providersRes.data));
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Erro ao carregar configurações de IA."));
    } finally {
      setLoading(false);
    }
  }, [flowId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await api.patch(`/flows/${flowId}/ai-settings`, settings);
      setSettings({ ...defaultSettings, ...unwrapApiData<FlowAiSettings>(res.data) });
      setMessage("Configurações salvas.");
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Erro ao salvar."));
    } finally {
      setSaving(false);
    }
  };

  const toggleKb = (id: string) => {
    setSettings((prev) => {
      const has = prev.knowledgeBaseIds.includes(id);
      return {
        ...prev,
        knowledgeBaseIds: has
          ? prev.knowledgeBaseIds.filter((x) => x !== id)
          : [...prev.knowledgeBaseIds, id],
      };
    });
  };

  if (loading) {
    return <p className="text-sm text-gray-600 p-4">Carregando configurações de IA…</p>;
  }

  return (
    <div className="p-4 space-y-5 max-h-[calc(100vh-8rem)] overflow-y-auto text-gray-900">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Configurações do fluxo (IA)</h3>
        <p className="text-xs text-gray-500 mt-1">
          Prompt global, modo de execução, guardrails e bases de conhecimento (RAG).
        </p>
        {providers.length === 0 ? (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 mt-2">
            Cadastre o provedor OpenAI em{" "}
            <a href="/admin/ai" className="underline font-medium">
              Admin → IA
            </a>{" "}
            antes de testar nodes Conversa.
          </p>
        ) : (
          <p className="text-xs text-gray-500 mt-1">
            Modelo ativo:{" "}
            {providers.find((p) => p.is_default)?.provider || providers[0]?.provider}{" "}
            / {providers.find((p) => p.is_default)?.model || providers[0]?.model}
          </p>
        )}
      </div>

      {message && (
        <p className="text-sm rounded-lg px-3 py-2 bg-teal-50 text-teal-900 border border-teal-200">
          {message}
        </p>
      )}

      <section>
        <label className="block text-sm font-medium text-gray-700 mb-1">Prompt global</label>
        <textarea
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm h-32"
          value={settings.globalPrompt}
          onChange={(e) => setSettings((s) => ({ ...s, globalPrompt: e.target.value }))}
          placeholder="Persona, regras e objetivo do fluxo…"
        />
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Idioma</label>
          <select
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={settings.language}
            onChange={(e) => setSettings((s) => ({ ...s, language: e.target.value }))}
          >
            <option value="pt-BR">Português (Brasil)</option>
            <option value="en-US">English (US)</option>
            <option value="es">Español</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Voz (referência)</label>
          <input
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={settings.voiceId}
            onChange={(e) => setSettings((s) => ({ ...s, voiceId: e.target.value }))}
            placeholder="ex.: Cimo"
          />
        </div>
      </section>

      <section>
        <label className="block text-sm font-medium text-gray-700 mb-2">Modo de execução</label>
        <div className="space-y-2">
          <label className="flex gap-2 items-start border rounded-lg p-3 cursor-pointer border-teal-500 bg-teal-50/50">
            <input
              type="radio"
              checked={settings.executionMode === "flexible"}
              onChange={() => setSettings((s) => ({ ...s, executionMode: "flexible" }))}
            />
            <span className="text-sm">
              <strong>Flexível</strong> — contexto unificado; IA decide transições entre etapas.
            </span>
          </label>
          <label className="flex gap-2 items-start border rounded-lg p-3 cursor-pointer border-gray-300">
            <input
              type="radio"
              checked={settings.executionMode === "rigid"}
              onChange={() => setSettings((s) => ({ ...s, executionMode: "rigid" }))}
            />
            <span className="text-sm">
              <strong>Rígido</strong> — segue o canvas node a node com transições por etapa.
            </span>
          </label>
        </div>
      </section>

      <section>
        <label className="block text-sm font-medium text-gray-700 mb-1">Persona padrão do fluxo</label>
        <select
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          value={settings.personaId || ""}
          onChange={(e) =>
            setSettings((s) => ({ ...s, personaId: e.target.value || null }))
          }
        >
          <option value="">— Selecione —</option>
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </section>

      <section>
        <h4 className="text-sm font-semibold text-gray-800 mb-2">Bases de conhecimento (RAG)</h4>
        {knowledgeBases.length === 0 ? (
          <p className="text-xs text-gray-500">
            Nenhuma base cadastrada. Crie em Admin → IA (API{" "}
            <code className="text-[10px]">/ai/knowledge-bases</code>).
          </p>
        ) : (
          <ul className="space-y-1 max-h-32 overflow-y-auto">
            {knowledgeBases.map((kb) => (
              <li key={kb.id}>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={settings.knowledgeBaseIds.includes(kb.id)}
                    onChange={() => toggleKb(kb.id)}
                    disabled={!kb.is_active}
                  />
                  {kb.name} <span className="text-gray-400 text-xs">({kb.key})</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h4 className="text-sm font-semibold text-gray-800 mb-2">Guardrails</h4>
        <select
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2"
          value={settings.guardrailPolicyId || ""}
          onChange={(e) =>
            setSettings((s) => ({ ...s, guardrailPolicyId: e.target.value || null }))
          }
        >
          <option value="">Padrão da operação (nenhuma policy)</option>
          {policies.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.version} ({p.status})
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <button
            type="button"
            className={`flex-1 text-xs py-2 rounded-lg border ${
              settings.guardrailDeployMode === "live"
                ? "border-teal-600 bg-teal-50 text-teal-900"
                : "border-gray-300"
            }`}
            onClick={() => setSettings((s) => ({ ...s, guardrailDeployMode: "live" }))}
          >
            Live — bloqueia/mascara
          </button>
          <button
            type="button"
            className={`flex-1 text-xs py-2 rounded-lg border ${
              settings.guardrailDeployMode === "shadow"
                ? "border-amber-600 bg-amber-50 text-amber-900"
                : "border-gray-300"
            }`}
            onClick={() => setSettings((s) => ({ ...s, guardrailDeployMode: "shadow" }))}
          >
            Shadow — só audita
          </button>
        </div>
        <p className="text-[10px] text-gray-500 mt-1">
          Regras BLOCK:termo (uma por linha) no texto da policy.
        </p>
      </section>

      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="w-full py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-500 disabled:opacity-50"
      >
        {saving ? "Salvando…" : "Salvar configurações de IA"}
      </button>
    </div>
  );
}
