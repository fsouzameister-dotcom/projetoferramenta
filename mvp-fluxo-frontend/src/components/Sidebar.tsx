import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import logoClienton from "../../logo-clienton.png";
import { isPlatformAdmin } from "~lib/session";

const baseNavItems = [
  { label: "Painel", path: "/dashboard", icon: "⊞" },
  { label: "Fluxos", path: "/flows", icon: "⬡" },
  { label: "Usuários", path: "/admin/users", icon: "👤" },
  { label: "IA", path: "/admin/ai", icon: "🤖" },
  { label: "WhatsApp", path: "/admin/whatsapp", icon: "💬" },
  { label: "Entrada", path: "/admin/inbound", icon: "📥" },
  { label: "Operação", path: "/admin/operations", icon: "⚙️" },
  { label: "Relatórios", path: "/reports", icon: "📊" },
  { label: "FAQ", path: "/faq", icon: "❓" },
];

export default function Sidebar() {
  const location = useLocation();
  const [logoFailed, setLogoFailed] = useState(false);
  const navItems = isPlatformAdmin()
    ? [
        { label: "Clientes", path: "/admin/platform/tenants", icon: "🏢" },
        ...baseNavItems,
      ]
    : baseNavItems;

  return (
    <aside className="w-60 bg-gradient-to-b from-zinc-800 to-zinc-900 min-h-screen flex flex-col border-r border-zinc-700/80 shadow-2xl">
      {/* Logo */}
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
        <p className="text-zinc-700 text-xs mt-1 text-center">
          Soluções de negócios
        </p>
      </div>

      {/* Nav */}
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

      {/* Footer */}
      <div className="px-6 py-4 text-xs text-zinc-400 border-t border-zinc-700">
        © 2026 ClientOn Tecnologia
      </div>
    </aside>
  );
}