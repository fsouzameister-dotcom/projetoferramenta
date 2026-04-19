import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ReactFlow, {
  addEdge,
  useNodesState,
  useEdgesState,
  MiniMap,
  Controls,
  Background,
  applyNodeChanges,
  type NodeChange,
  type Node,
  type Connection,
  BackgroundVariant,
} from "reactflow";
import "reactflow/dist/style.css";
import api from "../api/client"; // Importa o cliente axios configurado
import { nodeTypes } from "../components/flownodes"; // Seus tipos de nós personalizados

// REMOVA ESTA LINHA: const tenantId = "1be433d5-f15b-4764-9a85-e88f3bc88732";

interface FlowData {
  id: string;
  name: string;
  channel: string;
}

interface NodeDataType {
  id: string;
  type: string;
  name: string;
  config: any;
  is_start: boolean;
  flow_id: string;
  position?: { x: number; y: number };
}

interface TestResult {
  status?: number;
  statusText?: string;
  data?: any;
  success: boolean;
  error?: string;
}

const paletteItems = [
  { id: "inicio", name: "Início", icon: "▶️" },
  { id: "conversa", name: "Conversa", icon: "💬" },
  { id: "funcao", name: "Função", icon: "⚡" },
  { id: "transferir_chamada", name: "Transferir Chamada", icon: "📞" },
  { id: "digitar_tecla", name: "Digitar Tecla", icon: "🔢" },
  { id: "divisao_logica", name: "Divisão Lógica", icon: "🔀" },
  { id: "transferir_agente", name: "Transferir Agente", icon: "👤" },
  { id: "sms", name: "SMS", icon: "💬" },
  { id: "extrair_variavel", name: "Extrair Variável", icon: "📦" },
  { id: "mcp", name: "MCP", icon: "🔗" },
  { id: "mensagem", name: "Mensagem", icon: "📨" },
  { id: "chamada_api", name: "Chamada API", icon: "🔌" },
  { id: "capturar_entrada", name: "Capturar Entrada", icon: "📥" },
  { id: "decisao", name: "Decisão", icon: "⚖️" },
  { id: "encerramento", name: "Encerramento", icon: "⏹️" },
];

export default function FlowEditor() {
  const { flowId: rawFlowId } = useParams<{ flowId: string }>();
  const navigate = useNavigate();

  const flowId = rawFlowId?.split(":")[0] || "";

  const [flowData, setFlowData] = useState<FlowData | null>(null);
  const [nodes, setNodes] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editNodeName, setEditNodeName] = useState("");
  const [editNodeContent, setEditNodeContent] = useState("");
  const [editNodeConfig, setEditNodeConfig] = useState<any>({});
  const [editingNode, setEditingNode] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNodeType, setSelectedNodeType] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [showTestResult, setShowTestResult] = useState(false);
  const [flowVariables, setFlowVariables] = useState<Record<string, any>>({});
  const [savingFlow, setSavingFlow] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const resolvePersistedPosition = (node: NodeDataType) => {
    const fromColumn = node.position;
    const fromConfig = node.config?.ui?.position;
    if (
      fromColumn &&
      typeof fromColumn.x === "number" &&
      typeof fromColumn.y === "number"
    ) {
      return fromColumn;
    }
    if (
      fromConfig &&
      typeof fromConfig.x === "number" &&
      typeof fromConfig.y === "number"
    ) {
      return fromConfig;
    }
    return { x: Math.random() * 400 + 200, y: Math.random() * 300 + 100 };
  };

  useEffect(() => {
    if (!flowId) return;
    setLoading(true);
    setError(null);

    // As chamadas de API agora não precisam do tenantId na URL
    // O tenantId será adicionado automaticamente pelo interceptor do axios
    Promise.all([
      api.get(`/flows`), // Rota para listar flows do tenant logado
      api.get(`/flows/${flowId}/nodes`),
    ])
      .then(([flowsRes, nodesRes]) => {
        const flows = flowsRes.data?.data || flowsRes.data || [];
        const flow = Array.isArray(flows)
          ? flows.find((f: FlowData) => f.id === flowId)
          : null;

        if (!flow) {
          setError("Fluxo não encontrado.");
          setLoading(false);
          return;
        }

        setFlowData(flow);
        const initialNodes = (nodesRes.data?.data || nodesRes.data || []).map(
          (node: NodeDataType) => ({
            id: node.id,
            type: node.type,
            position: resolvePersistedPosition(node),
            data: {
              ...node,
              label: node.name,
              onSelect: handleNodeClick,
            },
          })
        );

        // Reconstruir as arestas (edges) a partir dos nós
        const initialEdges: any[] = [];
        initialNodes.forEach((node: any) => {
          // Conexão padrão (next_node_id)
          if (node.data.config && node.data.config.next_node_id) {
            initialEdges.push({
              id: `e${node.id}-${node.data.config.next_node_id}`,
              source: node.id,
              target: node.data.config.next_node_id,
              animated: true,
            });
          }
          // Lógica para nós de decisão ou divisão lógica com múltiplos next_node_id
          if (node.data.type === "decisao" || node.data.type === "divisao_logica") {
            if (node.data.config.next_node_id_true) {
              initialEdges.push({
                id: `e${node.id}-true-${node.data.config.next_node_id_true}`,
                source: node.id,
                sourceHandle: "true",
                target: node.data.config.next_node_id_true,
                animated: true,
                label: "Sim",
              });
            }
            if (node.data.config.next_node_id_false) {
              initialEdges.push({
                id: `e${node.id}-false-${node.data.config.next_node_id_false}`,
                source: node.id,
                sourceHandle: "false",
                target: node.data.config.next_node_id_false,
                animated: true,
                label: "Não",
              });
            }
          }
        });

        setNodes(initialNodes);
        setEdges(initialEdges);
        setHasUnsavedChanges(false);
        setError(null);
      })
      .catch((err) => {
        console.error("Erro ao carregar fluxo ou nós:", err);
        setError("Não foi possível carregar o fluxo ou seus nós.");
      })
      .finally(() => setLoading(false));
  }, [flowId]); // Dependência apenas de flowId

  const handleNodeClick = (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (node) {
      setSelectedNodeId(nodeId);
      setSelectedNodeType(node.type ?? null);
    }
  };

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const shouldMarkUnsaved = changes.some((change) => {
        if (change.type === "position" || change.type === "remove" || change.type === "add") {
          return true;
        }
        return false;
      });
      if (shouldMarkUnsaved) {
        setHasUnsavedChanges(true);
      }
      setNodes((nds) => applyNodeChanges(changes, nds));
    },
    [setNodes]
  );

  const handleNodeDoubleClick = (_event: unknown, node: Node) => {
    setSelectedNodeId(node.id);
    setSelectedNodeType(node.type ?? null);
    handleEditNode(node.id);
  };

  const handleAddNode = async (nodeType: string) => {
    const nodeName = paletteItems.find((t) => t.id === nodeType)?.name || "Node";
    try {
      const response = await api.post(`/flows/${flowId}/nodes`, {
        name: nodeName,
        type: nodeType,
        config: {},
        is_start: false,
      });
      const newNode = response.data?.data || response.data;
      if (newNode && newNode.id) {
        const newReactFlowNode: Node = {
          id: newNode.id,
          type: nodeType,
          data: {
            label: newNode.name,
            config: newNode.config,
            onSelect: handleNodeClick,
          },
          position: {
            x: Math.random() * 400 + 200,
            y: Math.random() * 300 + 100,
          },
        };
        setNodes((nds) => [...nds, newReactFlowNode]);
        setHasUnsavedChanges(true);
      }
    } catch (err) {
      console.error("Erro ao criar node:", err);
      alert("Erro ao criar node");
    }
  };

  const handleSaveFlow = async () => {
    if (!flowId || nodes.length === 0) return;
    setSavingFlow(true);
    try {
      await Promise.all(
        nodes.map((node) =>
          api.put(`/flows/${flowId}/nodes/${node.id}`, {
            name: node.data.label,
            config: {
              ...(node.data.config || {}),
              ui: {
                ...((node.data.config && node.data.config.ui) || {}),
                position: node.position,
              },
            },
          })
        )
      );

      setNodes((nds) =>
        nds.map((node) => ({
          ...node,
          data: {
            ...node.data,
            config: {
              ...(node.data.config || {}),
              ui: {
                ...((node.data.config && node.data.config.ui) || {}),
                position: node.position,
              },
            },
          },
        }))
      );

      setHasUnsavedChanges(false);
      alert("Fluxo salvo com sucesso.");
    } catch (err) {
      console.error("Erro ao salvar fluxo:", err);
      alert("Erro ao salvar fluxo.");
    } finally {
      setSavingFlow(false);
    }
  };

  const handleEditNode = (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (node) {
      setEditingNodeId(nodeId);
      setEditNodeName(node.data.label);
      setEditNodeContent(node.data.config?.content || "");
      setEditNodeConfig(node.data.config || {});
    }
  };

  const handleDeleteNode = async (nodeId: string) => {
    if (!window.confirm("Tem certeza que deseja deletar este node?")) return;
    try {
      await api.delete(`/flows/${flowId}/nodes/${nodeId}`);
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      // Remover arestas conectadas a este nó
      setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
      setSelectedNodeId(null);
      setSelectedNodeType(null);
      setHasUnsavedChanges(true);
    } catch (err) {
      console.error("Erro ao deletar node:", err);
      alert("Erro ao deletar node");
    }
  };

  const handleSaveEdit = async () => {
    if (!editingNodeId) return;
    setEditingNode(true);
    try {
      const response = await api.put(`/flows/${flowId}/nodes/${editingNodeId}`, {
        name: editNodeName,
        config: {
          ...editNodeConfig,
          content: editNodeContent,
        },
      });
      const updatedNode = response.data?.data || response.data;
      setNodes((nds) =>
        nds.map((n) =>
          n.id === editingNodeId
            ? {
                ...n,
                data: {
                  ...n.data,
                  label: updatedNode.name,
                  config: updatedNode.config,
                },
              }
            : n
        )
      );
      setHasUnsavedChanges(true);
      setEditingNodeId(null);
      setEditNodeName("");
      setEditNodeContent("");
      setEditNodeConfig({});
    } catch (err) {
      console.error("Erro ao atualizar node:", err);
      alert("Erro ao atualizar node");
    } finally {
      setEditingNode(false);
    }
  };

  const handleTestApi = async () => {
    if (!editNodeConfig.url) {
      alert("⚠️ Preencha a URL primeiro!");
      return;
    }
    setEditingNode(true);
    try {
      let url = editNodeConfig.url;
      if (
        editNodeConfig.queryParams &&
        Object.keys(editNodeConfig.queryParams).length > 0
      ) {
        const params = new URLSearchParams(editNodeConfig.queryParams).toString();
        url = `${url}?${params}`;
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(editNodeConfig.headers || {}),
      };

      if (editNodeConfig.authType === "bearer" && editNodeConfig.bearerToken) {
        headers["Authorization"] = `Bearer ${editNodeConfig.bearerToken}`;
      }
      if (
        editNodeConfig.authType === "basic" &&
        editNodeConfig.basicUser &&
        editNodeConfig.basicPassword
      ) {
        headers["Authorization"] = `Basic ${btoa(
          `${editNodeConfig.basicUser}:${editNodeConfig.basicPassword}`
        )}`;
      }
      if (
        editNodeConfig.authType === "api_key" &&
        editNodeConfig.apiKeyName &&
        editNodeConfig.apiKeyValue
      ) {
        headers[editNodeConfig.apiKeyName] = editNodeConfig.apiKeyValue;
      }

      // Usar fetch diretamente para o teste de API, pois ele pode ir para URLs externas
      // e não deve passar pelos interceptors do axios que adicionam tenantId e token
      const response = await fetch(url, {
        method: editNodeConfig.method || "GET",
        headers,
        body:
          ["POST", "PUT", "PATCH"].includes(editNodeConfig.method) &&
          editNodeConfig.body
            ? JSON.stringify(editNodeConfig.body)
            : undefined,
      });

      const data = await response.json();

      // Extrair variáveis do responseMapping
      if (editNodeConfig.responseMapping && response.ok) {
        const newVars: Record<string, any> = {};
        Object.entries(editNodeConfig.responseMapping).forEach(([varName, path]) => {
          const keys = (path as string).split(".");
          let value: any = data;
          for (const key of keys) {
            value = value?.[key];
          }
          newVars[varName] = value;
        });
        setFlowVariables((prev) => ({ ...prev, ...newVars }));
      }

      setTestResult({
        status: response.status,
        statusText: response.statusText,
        data,
        success: response.ok,
      });
      setShowTestResult(true);
    } catch (err) {
      setTestResult({
        success: false,
        error: (err as Error).message,
      });
      setShowTestResult(true);
    } finally {
      setEditingNode(false);
    }
  };

  const resolveTemplate = (text: string): string => {
    return text.replace(/\{\{(\w+)\}\}/g, (_, varName) => {
      return flowVariables[varName] !== undefined
        ? String(flowVariables[varName])
        : `{{${varName}}}`;
    });
  };

  const onConnect = useCallback(
    async (params: Connection) => {
      const newEdge = { ...params, animated: true };
      setEdges((eds) => addEdge(newEdge, eds));
      setHasUnsavedChanges(true);

      // Atualizar o nó de origem com o next_node_id
      const sourceNode = nodes.find((n) => n.id === params.source);
      if (sourceNode) {
        const updatedConfig = { ...sourceNode.data.config };
        if (sourceNode.type === "decisao" || sourceNode.type === "divisao_logica") {
          if (params.sourceHandle === "true") {
            updatedConfig.next_node_id_true = params.target;
            updatedConfig.next_node_id = undefined; // Limpa o next_node_id padrão se for decisão
          } else if (params.sourceHandle === "false") {
            updatedConfig.next_node_id_false = params.target;
            updatedConfig.next_node_id = undefined; // Limpa o next_node_id padrão se for decisão
          } else {
            updatedConfig.next_node_id = params.target;
            updatedConfig.next_node_id_true = undefined; // Limpa os de decisão se for conexão padrão
            updatedConfig.next_node_id_false = undefined;
          }
        } else {
          updatedConfig.next_node_id = params.target;
        }

        try {
          await api.put(`/flows/${flowId}/nodes/${sourceNode.id}`, {
            name: sourceNode.data.label,
            config: updatedConfig,
          });
          // Atualiza o estado local dos nós para refletir a mudança
          setNodes((nds) =>
            nds.map((n) =>
              n.id === sourceNode.id
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      config: updatedConfig,
                    },
                  }
                : n
            )
          );
          setHasUnsavedChanges(true);
        } catch (err) {
          console.error("Erro ao atualizar node com nova conexão:", err);
          alert("Erro ao salvar conexão.");
        }
      }
    },
    [setEdges, nodes, flowId, setNodes]
  );

  // Função para lidar com a remoção de arestas
  const onEdgesDelete = useCallback(
    async (edgesToDelete: any[]) => {
      // Para cada aresta deletada, precisamos remover a referência next_node_id do nó de origem
      for (const edge of edgesToDelete) {
        const sourceNode = nodes.find((n) => n.id === edge.source);
        if (sourceNode) {
          const updatedConfig = { ...sourceNode.data.config };
          if (sourceNode.type === "decisao" || sourceNode.type === "divisao_logica") {
            if (edge.sourceHandle === "true") {
              updatedConfig.next_node_id_true = undefined;
            } else if (edge.sourceHandle === "false") {
              updatedConfig.next_node_id_false = undefined;
            } else {
              updatedConfig.next_node_id = undefined;
            }
          } else {
            updatedConfig.next_node_id = undefined;
          }

          try {
            await api.put(`/flows/${flowId}/nodes/${sourceNode.id}`, {
              name: sourceNode.data.label,
              config: updatedConfig,
            });
            setNodes((nds) =>
              nds.map((n) =>
                n.id === sourceNode.id
                  ? {
                      ...n,
                      data: {
                        ...n.data,
                        config: updatedConfig,
                      },
                    }
                  : n
              )
            );
          } catch (err) {
            console.error("Erro ao remover conexão do node:", err);
            alert("Erro ao remover conexão.");
          }
        }
      }
      // Remove as arestas do estado local
      setEdges((eds) =>
        eds.filter((edge) => !edgesToDelete.some((e) => e.id === edge.id))
      );
      setHasUnsavedChanges(true);
    },
    [nodes, flowId, setNodes, setEdges]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500 mx-auto mb-4"></div>
          <p className="text-gray-700 font-medium">Carregando fluxo...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="text-center">
          <p className="text-red-600 font-medium mb-4">{error}</p>
          <button
            onClick={() => navigate("/flows")}
            className="px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600"
          >
            Voltar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-white">
      {/* Painel Esquerdo */}
      <div className="w-64 bg-white shadow-lg p-4 overflow-y-auto border-r border-gray-200 flex flex-col">
        <div className="mb-3">
          <button
            onClick={() => navigate("/flows")}
            className="text-[11px] text-teal-600 hover:underline mb-1 flex items-center gap-1"
          >
            ← Voltar para Fluxos
          </button>
          <h2 className="text-lg font-semibold text-gray-800">
            {flowData?.name || "Editor de Fluxo"}
          </h2>
          <p className="text-xs text-gray-500">
            {flowData?.channel ? `Canal: ${flowData.channel}` : ""}
          </p>
          <button
            onClick={handleSaveFlow}
            disabled={savingFlow}
            className="mt-2 w-full px-3 py-1.5 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-60"
          >
            {savingFlow ? "Salvando fluxo..." : "Salvar fluxo"}
          </button>
          <p
            className={`mt-2 text-xs ${
              hasUnsavedChanges ? "text-amber-600" : "text-emerald-600"
            }`}
          >
            {hasUnsavedChanges ? "Alterações não salvas" : "Tudo salvo"}
          </p>
        </div>

        <h3 className="text-sm font-semibold text-gray-700 mb-2">Paleta de Nós</h3>
        <p className="text-[11px] text-gray-500 mb-2">
          Clique para adicionar. Dê duplo clique no node para editar.
        </p>
        <div className="space-y-1.5">
          {paletteItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleAddNode(item.id)}
              className="group w-full flex items-center gap-2 p-1.5 bg-[#111827] hover:bg-[#0f172a] rounded-md border border-[#1f2937] text-left transition-all"
            >
              <span className="w-6 h-6 rounded-full bg-[#0b1220] border border-[#334155] text-sm flex items-center justify-center group-hover:scale-105 transition-transform">
                {item.icon}
              </span>
              <span className="text-xs font-medium text-white leading-tight">
                {item.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Área do ReactFlow */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDoubleClick={handleNodeDoubleClick}
          onConnect={onConnect}
          onEdgesDelete={onEdgesDelete} // Adicionado: Lidar com a exclusão de arestas
          nodeTypes={nodeTypes}
          fitView
        >
          <MiniMap />
          <Controls />
          <Background
            id="1"
            gap={12}
            size={1}
            variant={BackgroundVariant.Dots} // CORRIGIDO AQUI
            color="#eee"
          />
        </ReactFlow>
      </div>

      {/* Painel Direito (Configurações do Node) */}
      {selectedNodeId && (
        <div className="w-80 bg-white shadow-lg p-6 overflow-y-auto border-l border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-800">
              Configurar Node
            </h3>
            <button
              onClick={() => {
                setEditingNodeId(null);
                setSelectedNodeId(null);
                setSelectedNodeType(null);
                setShowTestResult(false);
                setTestResult(null);
              }}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>

          <div className="space-y-4">
            {/* Botões de Ação */}
            <div className="flex gap-2">
              <button
                onClick={() => handleEditNode(selectedNodeId)}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Editar
              </button>
              <button
                onClick={() => handleDeleteNode(selectedNodeId)}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                Deletar
              </button>
            </div>

            {/* Nome do Node */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nome do Node
              </label>
              <input
                type="text"
                value={editNodeName}
                onChange={(e) => setEditNodeName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            {/* Configurações específicas para Chamada API */}
            {selectedNodeType === "chamada_api" && (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    URL da API
                  </label>
                  <input
                    type="text"
                    value={editNodeConfig.url || ""}
                    onChange={(e) =>
                      setEditNodeConfig({ ...editNodeConfig, url: e.target.value })
                    }
                    placeholder="https://api.exemplo.com/endpoint"
                    className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Método HTTP
                  </label>
                  <select
                    value={editNodeConfig.method || "GET"}
                    onChange={(e) =>
                      setEditNodeConfig({ ...editNodeConfig, method: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                    <option value="PATCH">PATCH</option>
                  </select>
                </div>

                {/* Headers */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Headers (JSON)
                  </label>
                  <textarea
                    value={JSON.stringify(editNodeConfig.headers || {}, null, 2)}
                    onChange={(e) => {
                      try {
                        setEditNodeConfig({
                          ...editNodeConfig,
                          headers: JSON.parse(e.target.value),
                        });
                      } catch {}
                    }}
                    placeholder='{"Authorization": "Bearer token"}'
                    className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 h-20 resize-none font-mono text-xs"
                  />
                </div>

                {/* Body */}
                {["POST", "PUT", "PATCH"].includes(editNodeConfig.method) && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Body (JSON)
                    </label>
                    <textarea
                      value={JSON.stringify(editNodeConfig.body || {}, null, 2)}
                      onChange={(e) => {
                        try {
                          setEditNodeConfig({
                            ...editNodeConfig,
                            body: JSON.parse(e.target.value),
                          });
                        } catch {}
                      }}
                      placeholder='{"campo": "valor"}'
                      className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 h-24 resize-none font-mono text-xs"
                    />
                  </div>
                )}

                {/* Auth */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Autenticação
                  </label>
                  <select
                    value={editNodeConfig.authType || "none"}
                    onChange={(e) =>
                      setEditNodeConfig({ ...editNodeConfig, authType: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="none">Nenhuma</option>
                    <option value="bearer">Bearer Token</option>
                    <option value="basic">Basic Auth</option>
                    <option value="api_key">API Key</option>
                  </select>
                </div>

                {editNodeConfig.authType === "bearer" && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Bearer Token
                    </label>
                    <input
                      type="password"
                      value={editNodeConfig.bearerToken || ""}
                      onChange={(e) =>
                        setEditNodeConfig({ ...editNodeConfig, bearerToken: e.target.value })
                      }
                      placeholder="seu_token"
                      className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                )}

                {editNodeConfig.authType === "basic" && (
                  <>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Usuário Basic Auth
                      </label>
                      <input
                        type="text"
                        value={editNodeConfig.basicUser || ""}
                        onChange={(e) =>
                          setEditNodeConfig({ ...editNodeConfig, basicUser: e.target.value })
                        }
                        placeholder="usuario"
                        className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Senha Basic Auth
                      </label>
                      <input
                        type="password"
                        value={editNodeConfig.basicPassword || ""}
                        onChange={(e) =>
                          setEditNodeConfig({ ...editNodeConfig, basicPassword: e.target.value })
                        }
                        placeholder="senha"
                        className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                  </>
                )}

                {editNodeConfig.authType === "api_key" && (
                  <>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Nome do Header da API Key
                      </label>
                      <input
                        type="text"
                        value={editNodeConfig.apiKeyName || ""}
                        onChange={(e) =>
                          setEditNodeConfig({ ...editNodeConfig, apiKeyName: e.target.value })
                        }
                        placeholder="X-API-Key"
                        className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Valor da API Key
                      </label>
                      <input
                        type="password"
                        value={editNodeConfig.apiKeyValue || ""}
                        onChange={(e) =>
                          setEditNodeConfig({ ...editNodeConfig, apiKeyValue: e.target.value })
                        }
                        placeholder="sua_api_key"
                        className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                  </>
                )}

                {/* Query Params */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Query Params (JSON)
                  </label>
                  <textarea
                    value={JSON.stringify(editNodeConfig.queryParams || {}, null, 2)}
                    onChange={(e) => {
                      try {
                        setEditNodeConfig({
                          ...editNodeConfig,
                          queryParams: JSON.parse(e.target.value),
                        });
                      } catch {}
                    }}
                    placeholder='{"param1": "valor1"}'
                    className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 h-20 resize-none font-mono text-xs"
                  />
                </div>

                {/* Response Mapping */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Mapeamento de Resposta (JSON)
                  </label>
                  <textarea
                    value={JSON.stringify(editNodeConfig.responseMapping || {}, null, 2)}
                    onChange={(e) => {
                      try {
                        setEditNodeConfig({
                          ...editNodeConfig,
                          responseMapping: JSON.parse(e.target.value),
                        });
                      } catch {}
                    }}
                    placeholder='{"variavel_flow": "caminho.no.json"}'
                    className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 h-20 resize-none font-mono text-xs"
                  />
                </div>

                <button
                  onClick={handleTestApi}
                  disabled={editingNode}
                  className="w-full px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50 mb-4"
                >
                  {editingNode ? "Testando..." : "Testar API"}
                </button>

                {showTestResult && testResult && (
                  <div
                    className={`p-3 rounded-lg text-xs font-mono ${
                      testResult.success
                        ? "bg-green-100 text-green-800 border border-green-300"
                        : "bg-red-100 text-red-800 border border-red-300"
                    } mb-4`}
                  >
                    <p className="font-bold mb-1">Resultado do Teste:</p>
                    {testResult.success ? (
                      <>
                        <p>Status: {testResult.status} {testResult.statusText}</p>
                        <p>Dados: {JSON.stringify(testResult.data, null, 2)}</p>
                      </>
                    ) : (
                      <p>Erro: {testResult.error}</p>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Outros tipos de Node (Conversa, Mensagem, etc.) */}
            {selectedNodeType === "conversa" || selectedNodeType === "mensagem" ? (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Conteúdo da Mensagem
                </label>
                <textarea
                  value={resolveTemplate(editNodeContent)}
                  onChange={(e) => setEditNodeContent(e.target.value)}
                  placeholder="Digite a mensagem aqui. Use {{variavel}} para variáveis."
                  className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 h-32 resize-none"
                />
              </div>
            ) : null}

            {/* DECISÃO */}
            {selectedNodeType === "decisao" && (
              <>
                <div className="mb-4">
                  <label htmlFor="decisionVariable" className="block text-sm font-medium text-gray-700 mb-2">
                    Variável para Decisão (ex: &#123;&#123;nome_da_variavel&#125;&#125;) {/* CORRIGIDO AQUI */}
                  </label>
                  <input
                    id="decisionVariable"
                    type="text"
                    value={editNodeConfig.variable || ""}
                    onChange={(e) =>
                      setEditNodeConfig({ ...editNodeConfig, variable: e.target.value })
                    }
                    placeholder="nome_da_variavel"
                    className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Operador
                  </label>
                  <select
                    value={editNodeConfig.operator || "igual_a"}
                    onChange={(e) =>
                      setEditNodeConfig({ ...editNodeConfig, operator: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="igual_a">Igual a</option>
                    <option value="diferente_de">Diferente de</option>
                    <option value="contem">Contém</option>
                    <option value="nao_contem">Não Contém</option>
                    <option value="maior_que">Maior que</option>
                    <option value="menor_que">Menor que</option>
                  </select>
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Valor para Comparação
                  </label>
                  <input
                    type="text"
                    value={editNodeConfig.comparisonValue || ""} // CORRIGIDO AQUI
                    onChange={(e) =>
                      setEditNodeConfig({ ...editNodeConfig, comparisonValue: e.target.value }) // E AQUI
                    }
                    placeholder="valor"
                    className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </>
            )}

            {/* Botões de Ação */}
            <div className="flex gap-4 mt-6">
              <button
                type="button"
                onClick={() => {
                  setEditingNodeId(null);
                  setEditNodeName("");
                  setEditNodeContent("");
                  setEditNodeConfig({});
                  setShowTestResult(false);
                  setTestResult(null);
                }}
                disabled={editingNode}
                className="flex-1 px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                onClick={handleSaveEdit}
                disabled={editingNode}
                className="flex-1 px-6 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors disabled:opacity-50"
              >
                {editingNode ? "Salvando..." : "Salvar Node"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}