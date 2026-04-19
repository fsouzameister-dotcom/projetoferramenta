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
import Flows from "./pages/Flows";
import FlowEditor from "./pages/FlowEditor";
import FlowForm from "./pages/FlowForm";
import Sidebar from "./components/Sidebar";

function isSessionValid(): boolean {
  const token = localStorage.getItem("jwt_token");
  const tenantId = localStorage.getItem("tenant_id");
  if (!token || !tenantId) return false;

  try {
    const payloadBase64 = token.split(".")[1];
    if (!payloadBase64) return false;
    const normalized = payloadBase64.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const payloadJson = atob(padded);
    const payload = JSON.parse(payloadJson) as { exp?: number };
    if (!payload.exp) return false;
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

function SessionActionButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loggedIn, setLoggedIn] = React.useState(isSessionValid());
  const hideOnFlowBuilder = /^\/flows\/[^/]+$/.test(location.pathname);

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
      localStorage.removeItem("jwt_token");
      localStorage.removeItem("tenant_id");
      setLoggedIn(false);
    }
    navigate("/login");
  };

  if (hideOnFlowBuilder) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50">
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

const LayoutWithSidebar = () => (
  <div className="flex h-screen">
    <Sidebar />
    <main className="flex-1 p-5 overflow-auto bg-gradient-to-br from-primary-dark via-[#132a55] to-[#0f1e3d] text-gray-100">
      <Outlet />
    </main>
  </div>
);

const RequireAuth = () => {
  if (!isSessionValid()) {
    localStorage.removeItem("jwt_token");
    localStorage.removeItem("tenant_id");
    return <Navigate to="/login" replace />;
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
            element: <LayoutWithSidebar />,
            children: [
              { path: "dashboard", element: <Dashboard /> },
              { path: "flows", element: <Flows /> },
              { path: "flows/new", element: <FlowForm /> },
              { path: "flows/edit/:id", element: <FlowForm /> },
              { path: "flows/:flowId", element: <FlowEditor /> },
            ],
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
