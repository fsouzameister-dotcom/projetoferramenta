import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api/client"; // Importa o cliente axios configurado

// REMOVA ESTA LINHA: const tenantId = "1be433d5-f15b-4764-9a85-e88f3bc88732";

interface Flow {
  id: string;
  name: string;
  description?: string; // Adicionado para corresponder ao formData
  channel: string;
}

export default function FlowForm() {
  const { id: flowId } = useParams<{ id?: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(!!flowId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    channel: "whatsapp",
  });

  useEffect(() => {
    if (!flowId) return;

    setLoading(true);
    api
      .get(`/flows/${flowId}`)
      .then((res) => {
        const flow = res.data?.data as Flow | undefined;
        if (flow) {
          setFormData({
            name: flow.name,
            description: flow.description || "",
            channel: flow.channel || "whatsapp",
          });
        } else {
          setError("Fluxo não encontrado.");
        }
      })
      .catch((err) => {
        console.error("Erro ao carregar fluxo:", err);
        setError("Erro ao carregar os dados do fluxo.");
      })
      .finally(() => setLoading(false));
  }, [flowId]); // Dependência de flowId

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    if (!formData.name.trim()) {
      setError("O nome do fluxo é obrigatório.");
      setSubmitting(false);
      return;
    }

    try {
      if (flowId) {
        // A chamada de API agora não precisa do tenantId na URL.
        // O interceptor do axios adicionará o `x-tenant-id` e o prefixo `/api`.
        await api.put(`/flows/${flowId}`, {
          name: formData.name,
          description: formData.description || null,
          channel: formData.channel,
        });
      } else {
        // A chamada de API agora não precisa do tenantId na URL.
        // O interceptor do axios adicionará o `x-tenant-id` e o prefixo `/api`.
        await api.post(`/flows`, {
          name: formData.name,
          description: formData.description || null,
          channel: formData.channel,
        });
      }

      navigate("/dashboard");
    } catch (err) {
      console.error("Erro ao salvar fluxo:", err);
      setError("Erro ao salvar o fluxo. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center text-gray-400">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">
            {flowId ? "Editar Fluxo" : "Criar Novo Fluxo"}
          </h1>
          <p className="text-sm text-gray-300 mt-1">
            {flowId
              ? "Atualize as informações do seu fluxo"
              : "Preencha os dados para criar um novo fluxo"}
          </p>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-600 rounded-xl px-6 py-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
          <div className="mb-6">
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              Nome do Fluxo *
            </label>
            <input
              id="name"
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Ex: Fluxo de Boas-vindas"
              className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              disabled={submitting}
            />
          </div>

          <div className="mb-6">
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
              Descrição
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Descreva o propósito deste fluxo (opcional)"
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              disabled={submitting}
            />
          </div>

          <div className="mb-8">
            <label htmlFor="channel" className="block text-sm font-medium text-gray-700 mb-2">
              Canal *
            </label>
            <select
              id="channel"
              name="channel"
              value={formData.channel}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              disabled={submitting}
            >
              <option value="whatsapp">WhatsApp</option>
              <option value="telegram">Telegram</option>
              <option value="instagram">Instagram</option>
              <option value="facebook">Facebook</option>
              <option value="email">Email</option>
            </select>
          </div>

          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              disabled={submitting}
              className="flex-1 px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-6 py-2 bg-accent text-white rounded-lg hover:bg-accent-dark transition-colors disabled:opacity-50"
            >
              {submitting ? "Salvando..." : flowId ? "Atualizar" : "Criar Fluxo"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}