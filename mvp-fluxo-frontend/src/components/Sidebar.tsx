import { Link, useLocation } from "react-router-dom";

const navItems = [
  { label: "Painel", path: "/", icon: "⊞" },
  { label: "Fluxos", path: "/flows", icon: "⬡" },
  { label: "Agentes", path: "/agents", icon: "👤" },
  { label: "Relatórios", path: "/reports", icon: "📊" },
  { label: "Configurações", path: "/settings", icon: "⚙" },
];

export default function Sidebar() {
  const location = useLocation();

  return (
    <aside className="w-56 bg-primary min-h-screen flex flex-col">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-primary-light">
        <span className="text-white text-xl font-bold tracking-wide">
          Client<span className="text-accent">On</span>
        </span>
        <p className="text-gray-400 text-xs mt-1">Soluções em Atendimento</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-6 py-3 text-sm transition-colors
                ${
                  isActive
                    ? "bg-accent text-white font-semibold"
                    : "text-gray-300 hover:bg-primary-light hover:text-white"
                }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 text-xs text-gray-500 border-t border-primary-light">
        © 2026 ClientOn Tecnologia
      </div>
    </aside>
  );
}