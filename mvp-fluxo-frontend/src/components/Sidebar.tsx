import { Link, useLocation } from "react-router-dom";

const navItems = [
  { label: "Painel", path: "/dashboard", icon: "⊞" },
  { label: "Fluxos", path: "/flows", icon: "⬡" },
  { label: "Usuários", path: "/admin/users", icon: "👤" },
  { label: "Relatórios", path: "/reports", icon: "📊" },
  { label: "Configurações", path: "/settings", icon: "⚙" },
];

export default function Sidebar() {
  const location = useLocation();

  return (
    <aside className="w-60 bg-gradient-to-b from-zinc-800 to-zinc-900 min-h-screen flex flex-col border-r border-zinc-700/80 shadow-2xl">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-zinc-700/80 bg-zinc-200/95">
        <img
          src="/logo-clienton.png"
          alt="ClientOn"
          className="w-full h-auto max-h-16 object-contain mb-2"
        />
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