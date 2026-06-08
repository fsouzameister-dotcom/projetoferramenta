import React from "react";
import ReactDOM from "react-dom/client";
import {
  createBrowserRouter,
  RouterProvider,
  Outlet,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";
import "./index.css";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import MonitoringAdmin from "./pages/MonitoringAdmin";
import Flows from "./pages/Flows";
import FlowEditor from "./pages/FlowEditor";
import FlowForm from "./pages/FlowForm";
import AgentHome from "./pages/AgentHome";
import UsersAdmin from "./pages/UsersAdmin";
import AiAdmin from "./pages/AiAdmin";
import WhatsAppAdmin from "./pages/WhatsAppAdmin";
import InboundAdmin from "./pages/InboundAdmin";
import OperationsAdmin from "./pages/OperationsAdmin";
import Reports from "./pages/Reports";
import CampaignsAdmin from "./pages/CampaignsAdmin";
import PlatformTenants from "./pages/PlatformTenants";
import Faq from "./pages/Faq";
import Sidebar from "./components/Sidebar";
import TenantActingBanner from "./components/TenantActingBanner";
import { clearSession, isSessionValid } from "./lib/session";

function getUserRole(): string {
  return localStorage.getItem("user_role") || "agente";
}

function SessionActionButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loggedIn, setLoggedIn] = React.useState(isSessionValid());
  const hideOnFlowBuilder = /^\/flows\/[^/]+$/.test(location.pathname);
  const hideOnAgent = location.pathname === "/agent";
  const hideOnSidebarLayout =
    /^\/dashboard$/.test(location.pathname) ||
    /^\/reports$/.test(location.pathname) ||
    /^\/faq$/.test(location.pathname) ||
    /^\/admin\//.test(location.pathname) ||
    /^\/flows$/.test(location.pathname) ||
    /^\/flows\/new$/.test(location.pathname) ||
    /^\/flows\/edit\/[^/]+$/.test(location.pathname);

  React.useEffect(() => {
    const sync = () => setLoggedIn(isSessionValid());
    sync();

    const id = setInterval(sync, 15000);
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);

    return () => {
      clearInterval(id);
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
    };
  }, [location.pathname]);

  const handleClick = () => {
    if (loggedIn) {
      clearSession();
      setLoggedIn(false);
    }
    navigate("/login");
  };

  if (hideOnFlowBuilder || hideOnAgent || hideOnSidebarLayout) {
    return null;
  }

  return (
    <div className="fixed top-6 right-6 z-[120]">
      <button
        type="button"
        onClick={handleClick}
        className={`px-4 py-2 rounded-xl text-sm font-semibold shadow-xl border transition-all ${
          loggedIn
            ? "bg-red-500/90 hover:bg-red-600 text-white border-red-300/40"
            : "bg-accent/90 hover:bg-accent-dark text-white border-cyan-200/40"
        }`}
      >
        {loggedIn ? "Logout" : "Login"}
      </button>
    </div>
  );
}

function RootLayout() {
  return (
    <>
      <SessionActionButton />
      <Outlet />
    </>
  );
}

const LayoutWithSidebar = () => {
  const navigate = useNavigate();

  const handleLogout = () => {
    clearSession();
    navigate("/login");
  };

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 p-5 overflow-auto bg-gradient-to-br from-primary-dark via-[#132a55] to-[#0f1e3d] text-gray-100">
        <div className="flex justify-end mb-3">
          <button
            type="button"
            onClick={handleLogout}
            className="px-4 py-2 rounded-xl text-sm font-semibold shadow-xl border transition-all bg-red-500/90 hover:bg-red-600 text-white border-red-300/40"
          >
            Logout
          </button>
        </div>
        <TenantActingBanner />
        <Outlet />
      </main>
    </div>
  );
};

const RequireAuth = () => {
  if (!isSessionValid()) {
    clearSession();
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
};

const RequireRoles = ({ allowed }: { allowed: string[] }) => {
  const role = getUserRole();
  if (!allowed.includes(role)) {
    return <Navigate to={role === "agente" ? "/agent" : "/dashboard"} replace />;
  }
  return <Outlet />;
};

const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <Login /> },
      { path: "login", element: <Login /> },
      {
        element: <RequireAuth />,
        children: [
          {
            element: (
              <RequireRoles
                allowed={[
                  "platform_admin",
                  "admin_local",
                  "supervisor",
                  "admin",
                ]}
              />
            ),
            children: [
              {
                element: <LayoutWithSidebar />,
                children: [
                  { path: "dashboard", element: <Dashboard /> },
                  { path: "reports", element: <Reports /> },
                  { path: "faq", element: <Faq /> },
                  { path: "flows", element: <Flows /> },
                  { path: "flows/new", element: <FlowForm /> },
                  { path: "flows/edit/:id", element: <FlowForm /> },
                  { path: "admin/users", element: <UsersAdmin /> },
                  { path: "admin/ai", element: <AiAdmin /> },
                  { path: "admin/whatsapp", element: <WhatsAppAdmin /> },
                  { path: "admin/inbound", element: <InboundAdmin /> },
                  { path: "admin/campaigns", element: <CampaignsAdmin /> },
                  { path: "admin/monitoring", element: <MonitoringAdmin /> },
                  { path: "admin/operations", element: <OperationsAdmin /> },
                  {
                    path: "admin/platform/tenants",
                    element: <PlatformTenants />,
                  },
                ],
              },
              { path: "flows/:flowId", element: <FlowEditor /> },
            ],
          },
          {
            element: <RequireRoles allowed={["agente"]} />,
            children: [{ path: "agent", element: <AgentHome /> }],
          },
        ],
      },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
