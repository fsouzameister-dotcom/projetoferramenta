import React from "react";
import ReactDOM from "react-dom/client";
import {
  createBrowserRouter,
  RouterProvider,
  Outlet,
} from "react-router-dom";
import "./index.css";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import FlowEditor from "./pages/FlowEditor";
import FlowForm from "./pages/FlowForm";
import Sidebar from "./components/Sidebar";

function RootLayout() {
  return <Outlet />;
}

const LayoutWithSidebar = () => (
  <div className="flex h-screen">
    <Sidebar />
    <main className="flex-1 p-4 overflow-auto">
      <Outlet />
    </main>
  </div>
);

const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <Login /> },
      { path: "login", element: <Login /> },
      {
        element: <LayoutWithSidebar />,
        children: [
          { path: "dashboard", element: <Dashboard /> },
          { path: "flows/new", element: <FlowForm /> },
          { path: "flows/edit/:id", element: <FlowForm /> },
          { path: "flows/:flowId", element: <FlowEditor /> },
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
