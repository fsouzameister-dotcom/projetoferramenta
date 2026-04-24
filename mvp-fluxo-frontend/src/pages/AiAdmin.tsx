import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import api, { getApiErrorMessage, unwrapApiData } from "../api/client";

type Provider = {
  id: string;
  provider: "openai" | "gemini";
  model: string;
  is_default: boolean;
  is_active: boolean;
};

type Persona = {
  id: string;
  name: string;
  description?: string | null;
  tone?: string | null;
  system_prompt: string;
  is_active: boolean;
};

export default function AiAdmin() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [providerForm, setProviderForm] = useState({
    provider: "openai" as "openai" | "gemini",
    model: "gpt-4o-mini",
    apiKey: "",
    isDefault: true,
  });

  const [personaForm, setPersonaForm] = useState({
    name: "",
    description: "",
    tone: "consultivo",
    systemPrompt: "",
  });

  const [scriptForm, setScriptForm] = useState({
    personaId: "",
    name: "",
    scriptContent: `{"objetivo":"Atender com clareza","estilo":"direto e empático"}`,
  });

  const loadAll = async () => {
    try {
      setLoading(true);
      const [providersRes, personasRes] = await Promise.all([
        api.get("/ai/providers"),
        api.get("/ai/personas"),
      ]);
      setProviders(unwrapApiData<Provider[]>(providersRes.data));
      const loadedPersonas = unwrapApiData<Persona[]>(personasRes.data);
      setPersonas(loadedPersonas);
      if (loadedPersonas.length && !scriptForm.personaId) {
        setScriptForm((prev) => ({ ...prev, personaId: loadedPersonas[0].id }));
      }
    } catch (error) {
      setNotice(getApiErrorMessage(error, "Falha ao carregar configurações de IA"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const submitProvider = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/ai/providers", providerForm);
      setProviderForm((prev) => ({ ...prev, apiKey: "" }));
      setNotice("Provedor salvo com sucesso.");
      await loadAll();
    } catch (error) {
      setNotice(getApiErrorMessage(error, "Erro ao salvar provedor"));
    }
  };

  const submitPersona = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/ai/personas", personaForm);
      setPersonaForm({ name: "", description: "", tone: "consultivo", systemPrompt: "" });
      setNotice("Persona criada com sucesso.");
      await loadAll();
    } catch (error) {
      setNotice(getApiErrorMessage(error, "Erro ao criar persona"));
    }
  };

  const submitScript = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const scriptContent = JSON.parse(scriptForm.scriptContent);
      await api.post("/ai/scripts", {
        personaId: scriptForm.personaId,
        name: scriptForm.name,
        scriptContent,
      });
      setScriptForm((prev) => ({ ...prev, name: "" }));
      setNotice("Roteiro salvo com sucesso.");
    } catch (error) {
      setNotice(getApiErrorMessage(error, "Erro ao salvar roteiro (verifique JSON)"));
    }
  };

  if (loading) {
    return <div className="text-gray-200">Carregando configurações de IA...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Configurações de IA</h1>
        <p className="text-sm text-gray-300">Gerencie provedores, personas e roteiros por tenant.</p>
      </div>

      {notice ? (
        <div className="rounded-lg border border-cyan-700/50 bg-cyan-950/30 px-3 py-2 text-sm text-cyan-200">
          {notice}
        </div>
      ) : null}

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <form onSubmit={submitProvider} className="rounded-xl border border-[#324569] bg-[#1b2540] p-4 space-y-3">
          <h2 className="font-semibold text-white">Provedor</h2>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={providerForm.provider}
              onChange={(e) => setProviderForm((p) => ({ ...p, provider: e.target.value as "openai" | "gemini" }))}
              className="bg-[#0f1a33] border border-[#314263] rounded px-3 py-2 text-sm text-gray-100"
            >
              <option value="openai">OpenAI</option>
              <option value="gemini">Gemini</option>
            </select>
            <input
              value={providerForm.model}
              onChange={(e) => setProviderForm((p) => ({ ...p, model: e.target.value }))}
              placeholder="Modelo"
              className="bg-[#0f1a33] border border-[#314263] rounded px-3 py-2 text-sm text-gray-100"
            />
          </div>
          <input
            value={providerForm.apiKey}
            onChange={(e) => setProviderForm((p) => ({ ...p, apiKey: e.target.value }))}
            placeholder="API Key"
            className="w-full bg-[#0f1a33] border border-[#314263] rounded px-3 py-2 text-sm text-gray-100"
          />
          <label className="text-sm text-gray-200 flex items-center gap-2">
            <input
              type="checkbox"
              checked={providerForm.isDefault}
              onChange={(e) => setProviderForm((p) => ({ ...p, isDefault: e.target.checked }))}
            />
            Definir como padrão do tenant
          </label>
          <button className="px-4 py-2 rounded-lg bg-accent text-white hover:bg-accent-dark">Salvar provedor</button>
        </form>

        <div className="rounded-xl border border-[#324569] bg-[#1b2540] p-4">
          <h2 className="font-semibold text-white mb-3">Provedores cadastrados</h2>
          <div className="space-y-2">
            {providers.length === 0 ? (
              <p className="text-sm text-gray-300">Nenhum provedor cadastrado.</p>
            ) : (
              providers.map((p) => (
                <div key={p.id} className="rounded-lg border border-[#324569] bg-[#121f3b] px-3 py-2 text-sm">
                  <p className="text-gray-100 font-medium">
                    {p.provider.toUpperCase()} • {p.model}
                  </p>
                  <p className="text-xs text-gray-400">
                    {p.is_default ? "Padrão" : "Secundário"} • {p.is_active ? "Ativo" : "Inativo"}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <form onSubmit={submitPersona} className="rounded-xl border border-[#324569] bg-[#1b2540] p-4 space-y-3">
          <h2 className="font-semibold text-white">Persona</h2>
          <input
            value={personaForm.name}
            onChange={(e) => setPersonaForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="Nome da persona"
            className="w-full bg-[#0f1a33] border border-[#314263] rounded px-3 py-2 text-sm text-gray-100"
          />
          <input
            value={personaForm.tone}
            onChange={(e) => setPersonaForm((p) => ({ ...p, tone: e.target.value }))}
            placeholder="Tom (ex.: consultivo, técnico)"
            className="w-full bg-[#0f1a33] border border-[#314263] rounded px-3 py-2 text-sm text-gray-100"
          />
          <input
            value={personaForm.description}
            onChange={(e) => setPersonaForm((p) => ({ ...p, description: e.target.value }))}
            placeholder="Descrição"
            className="w-full bg-[#0f1a33] border border-[#314263] rounded px-3 py-2 text-sm text-gray-100"
          />
          <textarea
            value={personaForm.systemPrompt}
            onChange={(e) => setPersonaForm((p) => ({ ...p, systemPrompt: e.target.value }))}
            placeholder="System prompt"
            rows={5}
            className="w-full bg-[#0f1a33] border border-[#314263] rounded px-3 py-2 text-sm text-gray-100"
          />
          <button className="px-4 py-2 rounded-lg bg-accent text-white hover:bg-accent-dark">Salvar persona</button>
        </form>

        <form onSubmit={submitScript} className="rounded-xl border border-[#324569] bg-[#1b2540] p-4 space-y-3">
          <h2 className="font-semibold text-white">Roteiro</h2>
          <select
            value={scriptForm.personaId}
            onChange={(e) => setScriptForm((p) => ({ ...p, personaId: e.target.value }))}
            className="w-full bg-[#0f1a33] border border-[#314263] rounded px-3 py-2 text-sm text-gray-100"
          >
            <option value="">Selecione uma persona</option>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            value={scriptForm.name}
            onChange={(e) => setScriptForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="Nome do roteiro"
            className="w-full bg-[#0f1a33] border border-[#314263] rounded px-3 py-2 text-sm text-gray-100"
          />
          <textarea
            value={scriptForm.scriptContent}
            onChange={(e) => setScriptForm((p) => ({ ...p, scriptContent: e.target.value }))}
            rows={6}
            className="w-full bg-[#0f1a33] border border-[#314263] rounded px-3 py-2 text-sm text-gray-100 font-mono"
          />
          <button className="px-4 py-2 rounded-lg bg-accent text-white hover:bg-accent-dark">Salvar roteiro</button>
        </form>
      </section>
    </div>
  );
}
