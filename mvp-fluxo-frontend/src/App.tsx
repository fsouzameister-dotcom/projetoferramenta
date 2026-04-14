import { BrowserRouter, Routes, Route } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import FlowForm from "./pages/FlowForm";
import FlowEditor from "./pages/FlowEditor";

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 bg-gray-50 overflow-hidden">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/flows" element={<Dashboard />} />
            <Route path="/flows/novo/editor" element={<FlowForm />} />
            <Route path="/flows/:flowId/editor" element={<FlowForm />} />
            <Route path="/flows/:flowId/canvas" element={<FlowEditor />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}