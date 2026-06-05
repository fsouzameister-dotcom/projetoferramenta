import { useEffect, useState } from "react";
import api, { unwrapApiData } from "../api/client";

type PersonaSelectProps = {
  value: string;
  onChange: (personaId: string) => void;
  label: string;
  emptyLabel: string;
  required?: boolean;
  className?: string;
};

export default function PersonaSelect({
  value,
  onChange,
  label,
  emptyLabel,
  required = false,
  className = "mb-4",
}: PersonaSelectProps) {
  const [personas, setPersonas] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get("/ai/personas")
      .then((res) => setPersonas(unwrapApiData(res.data)))
      .catch(() => setPersonas([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {loading ? (
        <p className="text-xs text-gray-500">Carregando personas…</p>
      ) : personas.length === 0 ? (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
          Nenhuma persona cadastrada. Crie em{" "}
          <a href="/admin/ai" className="underline font-medium">
            Admin → IA
          </a>
          .
        </p>
      ) : (
        <select
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
          value={value}
          required={required}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{emptyLabel}</option>
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
      {value && personas.length > 0 ? (
        <p className="text-[10px] text-gray-400 mt-1 font-mono truncate" title={value}>
          ID: {value}
        </p>
      ) : null}
    </div>
  );
}
