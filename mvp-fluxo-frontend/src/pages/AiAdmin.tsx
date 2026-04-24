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
  avatar_url?: string | null;
  is_active: boolean;
};

type VoiceOption = {
  id: string;
  label: string;
  hint: string;
};

const voiceOptions: VoiceOption[] = [
  { id: "alloy", label: "Alloy", hint: "Equilibrada e neutra" },
  { id: "shimmer", label: "Shimmer", hint: "Brilhante e energética" },
  { id: "nova", label: "Nova", hint: "Clara e confiante" },
  { id: "echo", label: "Echo", hint: "Calma e estável" },
];

type ScriptStage = {
  title: string;
  whatToSay: string;
  whatToAchieve: string;
  additionalGuidelines: string;
  objectionsHandling: string;
  doNotSay: string;
  closureInstructions: string;
};

function createEmptyStage(stepNumber: number): ScriptStage {
  return {
    title: `Etapa ${stepNumber}`,
    whatToSay: "",
    whatToAchieve: "",
    additionalGuidelines: "",
    objectionsHandling: "",
    doNotSay: "",
    closureInstructions: "",
  };
}

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
    apparentAge: "",
    voice: "shimmer",
    communicationTone: "",
    communicationStyle: "",
    mainGoal: "",
    personality: "",
    differentials: "",
    additionalGuidelines: "",
    avatarUrl: "",
    avatarPreviewUrl: "",
  });

  const [scriptForm, setScriptForm] = useState({
    personaId: "",
    name: "",
    stages: [createEmptyStage(1)] as ScriptStage[],
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
      const systemPrompt = [
        `Identidade: ${personaForm.name || "Assistente"}${personaForm.apparentAge ? `, idade aparente ${personaForm.apparentAge}` : ""}.`,
        `Voz sugerida: ${personaForm.voice}.`,
        `Tom de voz: ${personaForm.communicationTone || "consultivo e acolhedor"}.`,
        `Estilo de comunicação: ${personaForm.communicationStyle || "claro, simples e objetivo"}.`,
        `Objetivo principal: ${personaForm.mainGoal || "resolver a demanda do cliente no primeiro contato"}.`,
        personaForm.personality ? `Personalidade: ${personaForm.personality}` : "",
        personaForm.differentials ? `Diferenciais: ${personaForm.differentials}` : "",
        personaForm.additionalGuidelines ? `Outras orientações: ${personaForm.additionalGuidelines}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      await api.post("/ai/personas", {
        name: personaForm.name,
        tone: personaForm.communicationTone || "consultivo",
        description: `${personaForm.mainGoal}\n\n${personaForm.personality}`.trim(),
        systemPrompt,
        avatarUrl: personaForm.avatarUrl || undefined,
      });
      setPersonaForm({
        name: "",
        apparentAge: "",
        voice: "shimmer",
        communicationTone: "",
        communicationStyle: "",
        mainGoal: "",
        personality: "",
        differentials: "",
        additionalGuidelines: "",
        avatarUrl: "",
        avatarPreviewUrl: "",
      });
      setNotice("Persona criada com sucesso.");
      await loadAll();
    } catch (error) {
      setNotice(getApiErrorMessage(error, "Erro ao criar persona"));
    }
  };

  const submitScript = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/ai/scripts", {
        personaId: scriptForm.personaId,
        name: scriptForm.name,
        scriptContent: {
          stages: scriptForm.stages.map((stage, index) => ({
            step: index + 1,
            title: stage.title || `Etapa ${index + 1}`,
            whatToSay: stage.whatToSay,
            whatToAchieve: stage.whatToAchieve,
            additionalGuidelines: stage.additionalGuidelines,
            objectionsHandling: stage.objectionsHandling,
            doNotSay: stage.doNotSay,
            closureInstructions: stage.closureInstructions,
          })),
        },
      });
      setScriptForm((prev) => ({
        ...prev,
        name: "",
        stages: [createEmptyStage(1)],
      }));
      setNotice("Roteiro salvo com sucesso.");
    } catch (error) {
      setNotice(getApiErrorMessage(error, "Erro ao salvar roteiro"));
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

      <section className="rounded-xl border border-[#324569] bg-[#1b2540] p-4 space-y-4">
        <h2 className="font-semibold text-white">Criar Persona (modo guiado)</h2>
        <form onSubmit={submitPersona} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              value={personaForm.name}
              onChange={(e) => setPersonaForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Nome da persona"
              className="w-full bg-[#0f1a33] border border-[#314263] rounded px-3 py-2 text-sm text-gray-100"
            />
            <input
              value={personaForm.apparentAge}
              onChange={(e) => setPersonaForm((p) => ({ ...p, apparentAge: e.target.value }))}
              placeholder="Idade aparente"
              className="w-full bg-[#0f1a33] border border-[#314263] rounded px-3 py-2 text-sm text-gray-100"
            />
            <input
              value={personaForm.communicationTone}
              onChange={(e) => setPersonaForm((p) => ({ ...p, communicationTone: e.target.value }))}
              placeholder="Tom de voz (ex.: amigável, confiante)"
              className="w-full bg-[#0f1a33] border border-[#314263] rounded px-3 py-2 text-sm text-gray-100"
            />
            <select
              value={personaForm.voice}
              onChange={(e) => setPersonaForm((p) => ({ ...p, voice: e.target.value }))}
              className="w-full bg-[#0f1a33] border border-[#314263] rounded px-3 py-2 text-sm text-gray-100"
            >
              {voiceOptions.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.label} - {voice.hint}
                </option>
              ))}
            </select>
          </div>

          <textarea
            value={personaForm.communicationStyle}
            onChange={(e) => setPersonaForm((p) => ({ ...p, communicationStyle: e.target.value }))}
            rows={2}
            placeholder="Estilo de comunicação"
            className="w-full bg-[#0f1a33] border border-[#314263] rounded px-3 py-2 text-sm text-gray-100"
          />
          <textarea
            value={personaForm.mainGoal}
            onChange={(e) => setPersonaForm((p) => ({ ...p, mainGoal: e.target.value }))}
            rows={3}
            placeholder="Objetivo principal da persona"
            className="w-full bg-[#0f1a33] border border-[#314263] rounded px-3 py-2 text-sm text-gray-100"
          />
          <textarea
            value={personaForm.personality}
            onChange={(e) => setPersonaForm((p) => ({ ...p, personality: e.target.value }))}
            rows={4}
            placeholder="Personalidade"
            className="w-full bg-[#0f1a33] border border-[#314263] rounded px-3 py-2 text-sm text-gray-100"
          />
          <textarea
            value={personaForm.differentials}
            onChange={(e) => setPersonaForm((p) => ({ ...p, differentials: e.target.value }))}
            rows={3}
            placeholder="Diferenciais da persona"
            className="w-full bg-[#0f1a33] border border-[#314263] rounded px-3 py-2 text-sm text-gray-100"
          />
          <textarea
            value={personaForm.additionalGuidelines}
            onChange={(e) =>
              setPersonaForm((p) => ({ ...p, additionalGuidelines: e.target.value }))
            }
            rows={3}
            placeholder="Outras orientações"
            className="w-full bg-[#0f1a33] border border-[#314263] rounded px-3 py-2 text-sm text-gray-100"
          />

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-start">
            <input
              value={personaForm.avatarUrl}
              onChange={(e) =>
                setPersonaForm((p) => ({
                  ...p,
                  avatarUrl: e.target.value,
                  avatarPreviewUrl: e.target.value,
                }))
              }
              placeholder="URL da foto da persona (opcional)"
              className="w-full bg-[#0f1a33] border border-[#314263] rounded px-3 py-2 text-sm text-gray-100"
            />
            <label className="px-3 py-2 rounded-lg bg-[#223150] text-gray-200 text-sm hover:bg-[#2b3f66] cursor-pointer">
              Selecionar foto
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const preview = URL.createObjectURL(file);
                  setPersonaForm((p) => ({ ...p, avatarPreviewUrl: preview }));
                }}
              />
            </label>
          </div>
          {personaForm.avatarPreviewUrl ? (
            <img
              src={personaForm.avatarPreviewUrl}
              alt="Prévia da persona"
              className="w-24 h-24 rounded-xl object-cover border border-[#314263]"
            />
          ) : null}

          <button className="px-4 py-2 rounded-lg bg-accent text-white hover:bg-accent-dark">
            Salvar persona
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-[#324569] bg-[#1b2540] p-4 space-y-4">
        <h2 className="font-semibold text-white">Criar Roteiro (sem código)</h2>
        <form onSubmit={submitScript} className="space-y-3">
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
          <div className="space-y-4">
            {scriptForm.stages.map((stage, index) => (
              <div key={`${index}-${stage.title}`} className="rounded-lg border border-[#314263] p-3 bg-[#121f3b]">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <input
                    value={stage.title}
                    onChange={(e) =>
                      setScriptForm((prev) => ({
                        ...prev,
                        stages: prev.stages.map((s, i) =>
                          i === index ? { ...s, title: e.target.value } : s
                        ),
                      }))
                    }
                    placeholder={`Etapa ${index + 1}`}
                    className="flex-1 bg-[#0f1a33] border border-[#314263] rounded px-3 py-2 text-sm text-gray-100"
                  />
                  {scriptForm.stages.length > 1 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setScriptForm((prev) => ({
                          ...prev,
                          stages: prev.stages.filter((_, i) => i !== index),
                        }))
                      }
                      className="px-2 py-1 rounded bg-red-900/40 border border-red-700/40 text-red-200 text-xs"
                    >
                      Remover
                    </button>
                  ) : null}
                </div>
                <textarea
                  value={stage.whatToSay}
                  onChange={(e) =>
                    setScriptForm((prev) => ({
                      ...prev,
                      stages: prev.stages.map((s, i) =>
                        i === index ? { ...s, whatToSay: e.target.value } : s
                      ),
                    }))
                  }
                  rows={4}
                  placeholder="O que falar (abertura/recomendação)"
                  className="w-full mb-2 bg-[#0f1a33] border border-[#314263] rounded px-3 py-2 text-sm text-gray-100"
                />
                <textarea
                  value={stage.whatToAchieve}
                  onChange={(e) =>
                    setScriptForm((prev) => ({
                      ...prev,
                      stages: prev.stages.map((s, i) =>
                        i === index ? { ...s, whatToAchieve: e.target.value } : s
                      ),
                    }))
                  }
                  rows={2}
                  placeholder="O que conseguir (objetivo da etapa)"
                  className="w-full mb-2 bg-emerald-950/40 border border-emerald-700/40 rounded px-3 py-2 text-sm text-emerald-100"
                />
                <textarea
                  value={stage.additionalGuidelines}
                  onChange={(e) =>
                    setScriptForm((prev) => ({
                      ...prev,
                      stages: prev.stages.map((s, i) =>
                        i === index ? { ...s, additionalGuidelines: e.target.value } : s
                      ),
                    }))
                  }
                  rows={2}
                  placeholder="Outras orientações"
                  className="w-full mb-2 bg-[#0f1a33] border border-[#314263] rounded px-3 py-2 text-sm text-gray-100"
                />
                <textarea
                  value={stage.objectionsHandling}
                  onChange={(e) =>
                    setScriptForm((prev) => ({
                      ...prev,
                      stages: prev.stages.map((s, i) =>
                        i === index ? { ...s, objectionsHandling: e.target.value } : s
                      ),
                    }))
                  }
                  rows={2}
                  placeholder="Como tratar objeções"
                  className="w-full mb-2 bg-[#0f1a33] border border-[#314263] rounded px-3 py-2 text-sm text-gray-100"
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <textarea
                    value={stage.doNotSay}
                    onChange={(e) =>
                      setScriptForm((prev) => ({
                        ...prev,
                        stages: prev.stages.map((s, i) =>
                          i === index ? { ...s, doNotSay: e.target.value } : s
                        ),
                      }))
                    }
                    rows={2}
                    placeholder="Restrições (evitar dizer)"
                    className="w-full bg-[#0f1a33] border border-[#314263] rounded px-3 py-2 text-sm text-gray-100"
                  />
                  <textarea
                    value={stage.closureInstructions}
                    onChange={(e) =>
                      setScriptForm((prev) => ({
                        ...prev,
                        stages: prev.stages.map((s, i) =>
                          i === index ? { ...s, closureInstructions: e.target.value } : s
                        ),
                      }))
                    }
                    rows={2}
                    placeholder="Instruções de fechamento"
                    className="w-full bg-[#0f1a33] border border-[#314263] rounded px-3 py-2 text-sm text-gray-100"
                  />
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              setScriptForm((prev) => ({
                ...prev,
                stages: [...prev.stages, createEmptyStage(prev.stages.length + 1)],
              }))
            }
            className="px-4 py-2 rounded-lg bg-[#223150] text-gray-100 hover:bg-[#2b3f66]"
          >
            + Adicionar etapa
          </button>
          <button className="px-4 py-2 rounded-lg bg-accent text-white hover:bg-accent-dark">
            Salvar roteiro
          </button>
        </form>
      </section>
    </div>
  );
}
