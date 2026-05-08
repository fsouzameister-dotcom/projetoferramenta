import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import api, { getApiErrorMessage, unwrapApiData } from "../api/client";

type PhoneNumber = {
  id: string;
  channel_account_id: string;
  phone_number_id: string;
  display_phone_number?: string | null;
};

type Channel = {
  id: string;
  tenant_id: string;
  label: string;
  provider: string;
  waba_id: string;
  phone_numbers: PhoneNumber[];
  created_at?: string;
};

const initialForm = {
  label: "",
  wabaId: "",
  accessToken: "",
  phoneNumberId: "",
  displayPhoneNumber: "",
};

export default function WhatsAppAdmin() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get("/whatsapp/channels");
      setChannels(unwrapApiData<Channel[]>(res.data));
      setError(null);
    } catch (err) {
      setError(getApiErrorMessage(err, "Erro ao carregar canais WhatsApp"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await api.post("/whatsapp/channels", {
        label: form.label.trim() || undefined,
        wabaId: form.wabaId.trim(),
        accessToken: form.accessToken.trim(),
        phoneNumberId: form.phoneNumberId.trim(),
        displayPhoneNumber: form.displayPhoneNumber.trim() || undefined,
      });
      setForm(initialForm);
      setNotice("Canal WhatsApp registrado com sucesso.");
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err, "Erro ao registrar canal WhatsApp"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white">Canais WhatsApp</h1>
      <p className="text-sm text-gray-300 mt-1">
        Conecte um número WhatsApp Business via Cloud API direta (Meta).
      </p>
      <p className="text-xs text-gray-400 mt-1">
        Fase 1: cole as credenciais (Opção B). O Embedded Signup virá em uma fase posterior.
      </p>

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}
      {notice && (
        <div className="mt-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg px-4 py-3 text-sm">
          {notice}
        </div>
      )}

      <form
        onSubmit={onSubmit}
        className="mt-6 bg-white rounded-xl p-6 grid grid-cols-1 md:grid-cols-2 gap-3"
      >
        <input
          className="border rounded-lg px-3 py-2 text-gray-900 md:col-span-2"
          placeholder="Rótulo do canal (ex.: Atendimento, Suporte, BRDID)"
          value={form.label}
          onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
        />
        <input
          className="border rounded-lg px-3 py-2 text-gray-900"
          placeholder="WABA ID (WhatsApp Business Account ID)"
          value={form.wabaId}
          onChange={(e) => setForm((p) => ({ ...p, wabaId: e.target.value }))}
          required
        />
        <input
          className="border rounded-lg px-3 py-2 text-gray-900"
          placeholder="Phone Number ID"
          value={form.phoneNumberId}
          onChange={(e) => setForm((p) => ({ ...p, phoneNumberId: e.target.value }))}
          required
        />
        <input
          className="border rounded-lg px-3 py-2 text-gray-900"
          placeholder="Telefone (display, ex.: +55 11 99999-9999)"
          value={form.displayPhoneNumber}
          onChange={(e) => setForm((p) => ({ ...p, displayPhoneNumber: e.target.value }))}
        />
        <input
          className="border rounded-lg px-3 py-2 text-gray-900 font-mono text-xs"
          placeholder="Access Token permanente (System User)"
          value={form.accessToken}
          onChange={(e) => setForm((p) => ({ ...p, accessToken: e.target.value }))}
          type="password"
          required
        />
        <div className="md:col-span-2 flex items-center justify-between text-xs text-gray-500">
          <span>O token é cifrado em repouso (AES-256-GCM).</span>
          <button
            type="submit"
            disabled={saving}
            className="bg-accent text-white px-5 py-2 rounded-lg hover:bg-accent-dark disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Conectar canal"}
          </button>
        </div>
      </form>

      <div className="mt-8 bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b text-sm font-semibold text-gray-700">
          Canais conectados
        </div>
        <div className="divide-y">
          {loading ? (
            <div className="p-6 text-sm text-gray-500">Carregando...</div>
          ) : channels.length === 0 ? (
            <div className="p-6 text-sm text-gray-500">
              Nenhum canal conectado ainda.
            </div>
          ) : (
            channels.map((channel) => (
              <div key={channel.id} className="p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {channel.label || "WhatsApp"}{" "}
                      <span className="text-xs font-normal text-gray-500">
                        — {channel.provider}
                      </span>
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">WABA: {channel.waba_id}</p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                  {channel.phone_numbers.map((p) => (
                    <div
                      key={p.id}
                      className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-gray-50"
                    >
                      <p className="text-gray-900 font-medium">
                        {p.display_phone_number || "(número sem display)"}
                      </p>
                      <p className="text-xs text-gray-500">
                        Phone Number ID: <span className="font-mono">{p.phone_number_id}</span>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mt-6 text-xs text-gray-400 leading-relaxed">
        <p className="font-semibold text-gray-300">Webhook (configurar na Meta)</p>
        <p>
          URL: <span className="font-mono">https://&lt;sua-api&gt;/webhooks/whatsapp</span> — método
          GET para verificação e POST para eventos. Defina no servidor:
          <span className="font-mono"> WHATSAPP_WEBHOOK_VERIFY_TOKEN</span> e
          <span className="font-mono"> WHATSAPP_APP_SECRET</span>.
        </p>
      </div>
    </div>
  );
}
