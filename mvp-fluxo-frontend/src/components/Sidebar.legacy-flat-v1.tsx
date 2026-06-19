/**
 * Sidebar plana (menu antigo) — preservada para rollback.
 *
 * Para restaurar:
 * 1. Renomeie Sidebar.tsx → Sidebar.grouped-v2.tsx
 * 2. Copie este arquivo para Sidebar.tsx (ou importe SidebarLegacyFlat no Layout)
 *
 * Ver docs/frontend/ADMIN-SIDEBAR.md
 */
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import logoClienton from "../../logo-clienton.png";
import { isPlatformAdmin } from "~lib/session";
import { hasPermission, type AppPermission } from "~lib/permissions";

type NavItem = {
  label: string;
  path: string;
  icon: string;
  permission?: AppPermission;
};

const baseNavItems: NavItem[] = [
  { label: "Painel", path: "/dashboard", icon: "⊞", permission: "dashboard" },
  { label: "Fluxos", path: "/flows", icon: "⬡", permission: "flows" },
  { label: "Usuários", path: "/admin/users", icon: "👤", permission: "users" },
  { label: "Perfis", path: "/admin/roles", icon: "🛡️", permission: "roles" },
  { label: "IA", path: "/admin/ai", icon: "🤖", permission: "ai" },
  { label: "WhatsApp", path: "/admin/whatsapp", icon: "💬", permission: "whatsapp" },
  { label: "Entrada", path: "/admin/inbound", icon: "📥", permission: "inbound" },
  { label: "Campanhas", path: "/admin/campaigns", icon: "📣", permission: "campaigns" },
  { label: "Monitoramento", path: "/admin/monitoring", icon: "📡", permission: "monitoring" },
  { label: "Operação", path: "/admin/operations", icon: "⚙️", permission: "operations" },
  { label: "Relatórios", path: "/reports", icon: "📊", permission: "reports" },
  { label: "Insights IA", path: "/admin/insights", icon: "✨", permission: "reports" },
  { label: "FAQ", path: "/faq", icon: "❓", permission: "dashboard" },
];

export default function SidebarLegacyFlatV1() {
  const location = useLocation();
  const [logoFailed, setLogoFailed] = useState(false);

  const platformItems: NavItem[] = isPlatformAdmin()
    ? [{ label: "Clientes", path: "/admin/platform/tenants", icon: "🏢", permission: "platform_tenants" }]
    : [];

  const navItems = [...platformItems, ...baseNavItems].filter((item) => {
    if (item.path === "/admin/insights") {
      return hasPermission("reports") || hasPermission("ai");
    }
    if (!item.permission) return true;
    return hasPermission(item.permission);
  });

  return (
    <aside className="w-60 bg-gradient-to-b from-zinc-800 to-zinc-900 min-h-screen flex flex-col border-r border-zinc-700/80 shadow-2xl">
      <div className="px-4 py-5 border-b border-zinc-700/80 bg-zinc-200/95">
        {logoFailed ? (
          <div className="w-full h-14 mb-2 rounded-md bg-zinc-800 text-zinc-100 flex items-center justify-center font-semibold tracking-wide text-xl">
            ClientOn
          </div>
        ) : (
          <img
            src={logoClienton}
            alt="ClientOn"
            className="w-full h-auto max-h-16 object-contain mb-2"
            onError={() => setLogoFailed(true)}
          />
        )}
        <p className="text-zinc-700 text-xs mt-1 text-center">Soluções de negócios</p>
      </div>

      <nav className="flex-1 py-4">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`mx-2 rounded-lg flex items-center gap-3 px-4 py-3 text-sm transition-all
                ${
                  isActive
                    ? "bg-accent text-white font-semibold shadow-lg shadow-cyan-900/30"
                    : "text-zinc-200 hover:bg-zinc-700/80 hover:text-white"
                }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-6 py-4 text-xs text-zinc-400 border-t border-zinc-700">
        © 2026 ClientOn Tecnologia
      </div>
    </aside>
  );
}
