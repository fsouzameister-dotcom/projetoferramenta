import { Link } from "react-router-dom";
import { exitImpersonation, getActingTenantId, isImpersonating } from "~lib/session";

export default function TenantActingBanner() {
  if (!isImpersonating()) {
    return null;
  }

  const name =
    localStorage.getItem("acting_tenant_name") || getActingTenantId().slice(0, 8);

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/40 bg-amber-500/15 px-4 py-3 text-sm text-amber-100">
      <span>
        Ambiente do cliente: <strong className="text-white">{name}</strong>
      </span>
      <div className="flex gap-2">
        <Link
          to="/admin/platform/tenants"
          className="rounded-lg border border-amber-300/50 px-3 py-1.5 text-xs font-semibold hover:bg-amber-500/25"
        >
          Trocar cliente
        </Link>
        <button
          type="button"
          onClick={() => {
            exitImpersonation();
            window.location.href = "/admin/platform/tenants";
          }}
          className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
        >
          Voltar à plataforma
        </button>
      </div>
    </div>
  );
}
