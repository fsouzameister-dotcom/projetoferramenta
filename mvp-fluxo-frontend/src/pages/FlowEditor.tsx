import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ReactFlow, {
  addEdge,
  useNodesState,
  useEdgesState,
  MiniMap,
  Controls,
  Background,
  type Node,
  type Connection,
} from "reactflow";
import "reactflow/dist/style.css";
import api from "../api/client";
import { nodeTypes } from "../components/flownodes";

const tenantId = "1be433d5-f15b-4764-9a85-e88f3bc88732";

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

const paletteItems = [
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
  { id: "inicio", name: "Início", icon: "▶️" },
];

export default function FlowEditor() {
  const { flowId: rawFlowId } = useParams<{ flowId: string }>();
  const navigate = useNavigate();

  const flowId = rawFlowId?.split(":")[0] || "";

  const [flowData, setFlowData] = useState<FlowData | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
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

  // Carregar fluxo
  useEffect(() => {
    if (!flowId) return;

    setLoading(true);
    setError(null);

    Promise.all([
      api.get(`/tenants/${tenantId}/flows`),
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

        const nodesList = nodesRes.data?.data || nodesRes.data || [];
        const nodesWithPosition: Node[] = Array.isArray(nodesList)
          ? nodesList.map((node: NodeDataType, index: number) => ({
              id: node.id,
              type: node.type,
              data: {
                label: node.name,
                config: node.config,
                onSelect: handleNodeClick,
              },
              position: node.position || { x: 250 + index * 280, y: 100 },
            }))
          : [];

        setNodes(nodesWithPosition);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Erro ao carregar fluxo:", err);
        setError("Erro ao carregar o fluxo.");
        setLoading(false);
      });
  }, [flowId, setNodes]);

  // Clique no node
  const handleNodeClick = (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (node) {
      setSelectedNodeId(nodeId);
      setSelectedNodeType(node.type);
    }
  };

  // Adicionar node
  const handleAddNode = async (nodeType: string) => {
    const nodeName =
      paletteItems.find((t) => t.id === nodeType)?.name || "Node";

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
      }
    } catch (err) {
      console.error("Erro ao criar node:", err);
      alert("Erro ao criar node");
    }
  };

  // Editar node
  const handleEditNode = (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (node) {
      setEditingNodeId(nodeId);
      setEditNodeName(node.data.label);
      setEditNodeContent(node.data.config?.content || "");
      setEditNodeConfig(node.data.config || {});
    }
  };

  // Deletar node
  const handleDeleteNode = async (nodeId: string) => {
    if (!window.confirm("Tem certeza que deseja deletar este node?")) return;

    try {
      await api.delete(`/flows/${flowId}/nodes/${nodeId}`);
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setSelectedNodeId(null);
      setSelectedNodeType(null);
    } catch (err) {
      console.error("Erro ao deletar node:", err);
      alert("Erro ao deletar node");
    }
  };

  // Salvar edição
  const handleSaveEdit = async () => {
    if (!editingNodeId) return;

    setEditingNode(true);

    try {
      const response = await api.put(
        `/flows/${flowId}/nodes/${editingNodeId}`,
        {
          name: editNodeName,
          config: {
            ...editNodeConfig,
            content: editNodeContent,
          },
        }
      );

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

  // Conectar nodes
  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge(connection, eds));
    },
    [setEdges]
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
      {/* Painel Esquerdo - Paleta */}
      <div className="w-64 bg-white shadow-lg p-6 overflow-y-auto border-r border-gray-200 flex flex-col">
        <div className="mb-6">
          <h2 className="text-base font-bold text-gray-900">
            {flowData?.name || "Fluxo"}
          </h2>
          <p className="text-xs text-gray-500 mt-1">ID: {flowId}</p>
        </div>

        {/* Paleta de Nodes */}
        <div className="mb-8 flex-1">
          <h3 className="text-xs font-bold text-gray-700 mb-3 uppercase tracking-widest">
            Paleta de Nodes
          </h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {paletteItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleAddNode(item.id)}
                className="w-full px-3 py-2 bg-white border-2 border-teal-300 text-teal-700 rounded-lg hover:bg-teal-50 transition-all text-xs font-medium flex items-center gap-2 active:scale-95"
              >
                <span>{item.icon}</span>
                <span className="truncate">{item.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Painel de Propriedades do Node Selecionado */}
        {selectedNodeId && (
          <div className="border-t pt-6">
            <h3 className="text-xs font-bold text-gray-700 mb-3 uppercase tracking-widest">
              Propriedades
            </h3>
            <div className="space-y-3">
              <button
                onClick={() => handleEditNode(selectedNodeId)}
                className="w-full px-3 py-2 bg-blue-50 border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-100 transition-all text-xs font-medium flex items-center justify-center gap-2"
              >
                ✏️ Editar
              </button>
              <button
                onClick={() => handleDeleteNode(selectedNodeId)}
                className="w-full px-3 py-2 bg-red-50 border border-red-300 text-red-700 rounded-lg hover:bg-red-100 transition-all text-xs font-medium flex items-center justify-center gap-2"
              >
                🗑️ Deletar
              </button>
              <button
                onClick={() => {
                  setSelectedNodeId(null);
                  setSelectedNodeType(null);
                }}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-all text-xs font-medium"
              >
                Desselecionar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Canvas React Flow */}
      <div className="flex-1 bg-white relative">
        <ReactFlow
          nodes={nodes.map((n) => ({
            ...n,
            selected: n.id === selectedNodeId,
            data: {
              ...n.data,
              onSelect: handleNodeClick,
            },
          }))}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => handleNodeClick(node.id)}
          onPaneClick={() => {
            setSelectedNodeId(null);
            setSelectedNodeType(null);
          }}
          nodeTypes={nodeTypes}
          fitView
        >
          <Background color="#e0e0e0" gap={16} />
          <Controls />
          <MiniMap />
        </ReactFlow>

        {/* Informações do Canvas */}
        <div className="absolute bottom-4 left-4 bg-white px-4 py-2 rounded-lg shadow-md border border-gray-200 text-xs text-gray-600">
          <p>Nodes: <span className="font-bold">{nodes.length}</span> | Conexões: <span className="font-bold">{edges.length}</span></p>
        </div>
      </div>

      {/* Modal de Edição */}
      {editingNodeId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full border border-gray-300 max-h-96 overflow-y-auto">
            <h3 className="text-xl font-bold text-gray-900 mb-6">Editar Node</h3>

            {/* Nome */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nome
              </label>
              <input
                type="text"
                value={editNodeName}
                onChange={(e) => setEditNodeName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                autoFocus
              />
            </div>

            {/* Conteúdo */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Conteúdo
              </label>
              <textarea
                value={editNodeContent}
                onChange={(e) => setEditNodeContent(e.target.value)}
                placeholder="Digite o conteúdo..."
                className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent h-24 resize-none"
              />
            </div>

            {/* Campos dinâmicos por tipo */}
            {selectedNodeType === "chamada_api" && (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    URL
                  </label>
                  <input
                    type="text"
                    value={editNodeConfig.url || ""}
                    onChange={(e) =>
                      setEditNodeConfig({ ...editNodeConfig, url: e.target.value })
                    }
                    placeholder="https://api.example.com/endpoint"
                    className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Método
                  </label>
                  <select
                    value={editNodeConfig.method || "GET"}
                    onChange={(e) =>
                      setEditNodeConfig({ ...editNodeConfig, method: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option>GET</option>
                    <option>POST</option>
                    <option>PUT</option>
                    <option>DELETE</option>
                  </select>
                </div>
              </>
            )}

            {selectedNodeType === "capturar_entrada" && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tipo de Entrada
                </label>
                <select
                  value={editNodeConfig.input_type || "text"}
                  onChange={(e) =>
                    setEditNodeConfig({ ...editNodeConfig, input_type: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="text">Texto</option>
                  <option value="number">Número</option>
                  <option value="email">Email</option>
                  <option value="phone">Telefone</option>
                  <option value="date">Data</option>
                </select>
              </div>
            )}

            {selectedNodeType === "transferir_chamada" && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Destino
                </label>
                <input
                  type="text"
                  value={editNodeConfig.destination || ""}
                  onChange={(e) =>
                    setEditNodeConfig({ ...editNodeConfig, destination: e.target.value })
                  }
                  placeholder="Número ou ramal"
                  className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            )}

            {selectedNodeType === "transferir_agente" && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fila
                </label>
                <input
                  type="text"
                  value={editNodeConfig.queue || ""}
                  onChange={(e) =>
                    setEditNodeConfig({ ...editNodeConfig, queue: e.target.value })
                  }
                  placeholder="Nome da fila"
                  className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            )}

            {selectedNodeType === "extrair_variavel" && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nome da Variável
                </label>
                <input
                  type="text"
                  value={editNodeConfig.variable_name || ""}
                  onChange={(e) =>
                    setEditNodeConfig({ ...editNodeConfig, variable_name: e.target.value })
                  }
                  placeholder="nome_variavel"
                  className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            )}

            {selectedNodeType === "funcao" && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nome da Função
                </label>
                <input
                  type="text"
                  value={editNodeConfig.function_name || ""}
                  onChange={(e) =>
                    setEditNodeConfig({ ...editNodeConfig, function_name: e.target.value })
                  }
                  placeholder="nome_funcao"
                  className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            )}

            {selectedNodeType === "digitar_tecla" && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Teclas (DTMF)
                </label>
                <input
                  type="text"
                  value={editNodeConfig.keys || ""}
                  onChange={(e) =>
                    setEditNodeConfig({ ...editNodeConfig, keys: e.target.value })
                  }
                  placeholder="0-9, *, #"
                  className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            )}

            {selectedNodeType === "encerramento" && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Motivo
                </label>
                <input
                  type="text"
                  value={editNodeConfig.reason || ""}
                  onChange={(e) =>
                    setEditNodeConfig({ ...editNodeConfig, reason: e.target.value })
                  }
                  placeholder="Motivo do encerramento"
                  className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            )}

            {/* Botões */}
            <div className="flex gap-3">
              <button
                onClick={() => setEditingNodeId(null)}
                disabled={editingNode}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={editingNode}
                className="flex-1 px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors disabled:opacity-50 font-medium"
              >
                {editingNode ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}