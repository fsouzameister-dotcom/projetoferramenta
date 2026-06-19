import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import logoClienton from "../../logo-clienton.png";
import {
  SIDEBAR_FOOTER,
  SIDEBAR_GROUPS,
  SIDEBAR_STANDALONE,
  filterVisibleNavGroups,
  filterVisibleNavItems,
  groupContainsActivePath,
  isPathActive,
  type SidebarNavGroup,
  type SidebarNavItem,
} from "~lib/sidebar-nav";

const EXPANDED_STORAGE_KEY = "clienton.sidebar.expandedGroups.v2";

function loadExpandedGroups(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(EXPANDED_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, boolean>;
  } catch {
    return {};
  }
}

function NavLink({ item, active }: { item: SidebarNavItem; active: boolean }) {
  return (
    <Link
      to={item.path}
      className={`mx-2 rounded-lg flex items-center gap-3 px-4 py-2.5 text-sm transition-all
        ${
          active
            ? "bg-accent text-white font-semibold shadow-lg shadow-cyan-900/30"
            : "text-zinc-200 hover:bg-zinc-700/80 hover:text-white"
        }`}
    >
      <span className="text-base leading-none">{item.icon}</span>
      {item.label}
    </Link>
  );
}

function NavGroupSection({
  group,
  expanded,
  onToggle,
  currentPath,
}: {
  group: SidebarNavGroup;
  expanded: boolean;
  onToggle: () => void;
  currentPath: string;
}) {
  const groupActive = groupContainsActivePath(group, currentPath);

  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={onToggle}
        className={`mx-2 w-[calc(100%-1rem)] rounded-lg flex items-center gap-3 px-4 py-2.5 text-sm transition-all text-left
          ${
            groupActive && !expanded
              ? "bg-zinc-700/60 text-white font-medium"
              : "text-zinc-300 hover:bg-zinc-700/50 hover:text-white"
          }`}
        aria-expanded={expanded}
      >
        <span className="text-base leading-none">{group.icon}</span>
        <span className="flex-1 font-medium">{group.label}</span>
        <span
          className={`text-xs text-zinc-400 transition-transform ${expanded ? "rotate-90" : ""}`}
          aria-hidden
        >
          ›
        </span>
      </button>
      {expanded && (
        <div className="mt-0.5 ml-2 border-l border-zinc-700/80 pl-1 space-y-0.5">
          {group.children.map((child) => (
            <NavLink
              key={child.path}
              item={child}
              active={isPathActive(currentPath, child.path)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sidebar() {
  const location = useLocation();
  const [logoFailed, setLogoFailed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    loadExpandedGroups
  );

  const standaloneItems = useMemo(
    () => filterVisibleNavItems(SIDEBAR_STANDALONE),
    []
  );
  const groups = useMemo(() => filterVisibleNavGroups(SIDEBAR_GROUPS), []);
  const footerItem = useMemo(() => {
    const items = filterVisibleNavItems([SIDEBAR_FOOTER]);
    return items[0] ?? null;
  }, []);

  useEffect(() => {
    setExpandedGroups((prev) => {
      const activeGroup = groups.find((group) =>
        groupContainsActivePath(group, location.pathname)
      );
      if (!activeGroup) return prev;

      if (prev[activeGroup.id] && !groups.some((g) => g.id !== activeGroup.id && prev[g.id])) {
        return prev;
      }

      const next: Record<string, boolean> = {};
      for (const group of groups) {
        next[group.id] = group.id === activeGroup.id;
      }
      localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, [location.pathname, groups]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next: Record<string, boolean> = {};
      const willOpen = !prev[groupId];
      for (const group of groups) {
        next[group.id] = willOpen && group.id === groupId;
      }
      localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

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
        <p className="text-zinc-700 text-xs mt-1 text-center">
          Soluções de negócios
        </p>
      </div>

      <nav className="flex-1 py-4 overflow-y-auto">
        {standaloneItems.map((item) => (
          <NavLink
            key={item.path}
            item={item}
            active={isPathActive(location.pathname, item.path)}
          />
        ))}

        {groups.map((group) => (
          <NavGroupSection
            key={group.id}
            group={group}
            expanded={expandedGroups[group.id] ?? false}
            onToggle={() => toggleGroup(group.id)}
            currentPath={location.pathname}
          />
        ))}
      </nav>

      {footerItem && (
        <div className="border-t border-zinc-700/80 pt-2 pb-2">
          <NavLink
            item={footerItem}
            active={isPathActive(location.pathname, footerItem.path)}
          />
        </div>
      )}

      <div className="px-6 py-4 text-xs text-zinc-400 border-t border-zinc-700">
        © 2026 ClientOn Tecnologia
      </div>
    </aside>
  );
}
