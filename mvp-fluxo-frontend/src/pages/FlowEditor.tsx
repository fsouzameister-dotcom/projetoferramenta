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
import api, { getApiErrorMessage, unwrapApiData } from "../api/client"; // Importa o cliente axios configurado
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

type DecisionRule = {
  variable: string;
  operator: string;
  comparisonValue: string;
};

type DecisionRouteRule = DecisionRule & {
  label: string;
  next_node_id: string;
};

type PaletteItem = { id: string; name: string; icon: string };

const productionPaletteItems: PaletteItem[] = [
  { id: "inicio", name: "Início", icon: "▶️" },
  { id: "mensagem", name: "Mensagem", icon: "📨" },
  { id: "capturar_entrada", name: "Capturar Entrada", icon: "📥" },
  { id: "decisao", name: "Decisão", icon: "⚖️" },
  { id: "chamada_api", name: "Chamada API", icon: "🔌" },
  { id: "transferir_agente", name: "Transferir Agente", icon: "👤" },
  { id: "encerramento", name: "Encerramento", icon: "⏹️" },
];

const comingSoonPaletteItems: PaletteItem[] = [
  { id: "conversa", name: "Conversa", icon: "💬" },
  { id: "funcao", name: "Função", icon: "⚡" },
  { id: "transferir_chamada", name: "Transferir Chamada", icon: "📞" },
  { id: "digitar_tecla", name: "Digitar Tecla", icon: "🔢" },
  { id: "divisao_logica", name: "Divisão Lógica", icon: "🔀" },
  { id: "sms", name: "SMS", icon: "💬" },
  { id: "extrair_variavel", name: "Extrair Variável", icon: "📦" },
  { id: "mcp", name: "MCP", icon: "🔗" },
];

const paletteItems: PaletteItem[] = [
  ...productionPaletteItems,
  ...comingSoonPaletteItems,
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
  const [decisionAssistantGoal, setDecisionAssistantGoal] = useState("");
  const [decisionAssistantLoading, setDecisionAssistantLoading] = useState(false);

  const parseJsonText = <T,>(text: string, fallback: T): T => {
    try {
      return JSON.parse(text) as T;
    } catch {
      return fallback;
    }
  };

  const parseFirstJsonObject = (rawText: string): Record<string, any> | null => {
    const trimmed = rawText.trim();
    try {
      return JSON.parse(trimmed) as Record<string, any>;
    } catch {
      const start = trimmed.indexOf("{");
      const end = trimmed.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, any>;
        } catch {
          return null;
        }
      }
      return null;
    }
  };

  const handleGenerateDecisionSuggestion = async (
    availableTargets: Array<{ id: string; label: string }>
  ) => {
    if (!decisionAssistantGoal.trim()) {
      alert("Descreva o objetivo da decisão para gerar a sugestão.");
      return;
    }
    setDecisionAssistantLoading(true);
    try {
      let personaId = (editNodeConfig.aiPersonaId as string | undefined)?.trim();
      if (!personaId) {
        personaId = localStorage.getItem("ai_persona_id") || "";
      }
      if (!personaId) {
        const personasResponse = await api.get("/ai/personas");
        const personas = unwrapApiData<Array<{ id: string }>>(personasResponse.data);
        personaId = personas[0]?.id || "";
      }
      if (!personaId) {
        alert("Cadastre ao menos uma persona em IA para usar o assistente.");
        return;
      }

      const currentMode = editNodeConfig.decisionMode || "simple";
      const prompt = [
        "Você é um assistente de configuração de node de decisão para fluxo de atendimento.",
        `Objetivo: ${decisionAssistantGoal.trim()}`,
        `Modo atual sugerido pelo usuário: ${currentMode}`,
        `Variáveis disponíveis no fluxo: ${Object.keys(flowVariables).join(", ") || "nenhuma"}`,
        `Nós de destino possíveis: ${availableTargets.map((t) => t.label).join(", ") || "nenhum"}`,
        "Retorne APENAS JSON com chaves possíveis:",
        "{",
        '  "decisionMode": "simple|combined|multi_branch|ai",',
        '  "logicalOperator": "AND|OR",',
        '  "rules": [{"variable":"{{var}}","operator":"igual_a","comparisonValue":"x"}],',
        '  "routeRules": [{"label":"rota","variable":"{{var}}","operator":"igual_a","comparisonValue":"x","targetLabel":"Nome do node"}],',
        '  "aiPrompt": "texto curto",',
        '  "aiContextKeys": ["var1","var2"],',
        '  "aiRoutes": [{"label":"rota","targetLabel":"Nome do node"}]',
        "}",
        "Se não souber o destino exato, envie targetLabel vazio.",
      ].join("\n");

      const aiResponse = await api.post("/ai/respond", {
        personaId,
        message: prompt,
      });
      const aiPayload = unwrapApiData<{ text: string }>(aiResponse.data);
      const parsed = parseFirstJsonObject(aiPayload?.text || "");
      if (!parsed) {
        alert("A IA não retornou um JSON válido para sugestão. Tente refinar o objetivo.");
        return;
      }

      const targetByLabel = new Map(
        availableTargets.map((target) => [target.label.toLowerCase(), target.id])
      );

      const suggestedDecisionMode =
        typeof parsed.decisionMode === "string" ? parsed.decisionMode : currentMode;
      const suggestedRules = Array.isArray(parsed.rules) ? parsed.rules : [];
      const suggestedRouteRules = Array.isArray(parsed.routeRules)
        ? parsed.routeRules.map((route: any) => {
            const matchedTargetId =
              typeof route.targetLabel === "string"
                ? targetByLabel.get(route.targetLabel.toLowerCase()) || ""
                : "";
            return {
              label: route.label || "",
              variable: route.variable || "",
              operator: route.operator || "igual_a",
              comparisonValue: route.comparisonValue || "",
              next_node_id: matchedTargetId,
            };
          })
        : [];
      const suggestedAiRoutes = Array.isArray(parsed.aiRoutes)
        ? parsed.aiRoutes.map((route: any) => {
            const matchedTargetId =
              typeof route.targetLabel === "string"
                ? targetByLabel.get(route.targetLabel.toLowerCase()) || ""
                : "";
            return {
              label: route.label || "",
              next_node_id: matchedTargetId,
            };
          })
        : [];

      setEditNodeConfig({
        ...editNodeConfig,
        decisionMode: suggestedDecisionMode,
        logicalOperator:
          typeof parsed.logicalOperator === "string" ? parsed.logicalOperator : "AND",
        rules: suggestedRules,
        routeRules: suggestedRouteRules,
        aiPrompt: typeof parsed.aiPrompt === "string" ? parsed.aiPrompt : editNodeConfig.aiPrompt || "",
        aiContextKeys: Array.isArray(parsed.aiContextKeys) ? parsed.aiContextKeys : [],
        aiRoutes: suggestedAiRoutes,
        aiPersonaId: editNodeConfig.aiPersonaId || personaId,
      });
      setHasUnsavedChanges(true);
    } catch (err) {
      alert(getApiErrorMessage(err, "Não foi possível gerar sugestão de decisão via IA."));
    } finally {
      setDecisionAssistantLoading(false);
    }
  };

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
        const flows = unwrapApiData<FlowData[]>(flowsRes.data);
        const flow = Array.isArray(flows)
          ? flows.find((f: FlowData) => f.id === flowId)
          : null;

        if (!flow) {
          setError("Fluxo não encontrado.");
          setLoading(false);
          return;
        }

        setFlowData(flow);
        const initialNodes = unwrapApiData<NodeDataType[]>(nodesRes.data).map(
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
            const routeRules = Array.isArray(node.data.config?.routeRules)
              ? node.data.config.routeRules
              : [];
            routeRules.forEach((rule: any, idx: number) => {
              if (rule?.next_node_id) {
                initialEdges.push({
                  id: `e${node.id}-route-${idx}-${rule.next_node_id}`,
                  source: node.id,
                  target: rule.next_node_id,
                  animated: true,
                  label: rule.label || `Rota ${idx + 1}`,
                });
              }
            });
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
        setError(getApiErrorMessage(err, "Não foi possível carregar o fluxo ou seus nós."));
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

  const defaultConfigForNodeType = (nodeType: string): Record<string, unknown> => {
    if (nodeType === "capturar_entrada") {
      return {
        prompt: "Escolha até três opções:",
        promptKey: "escolha_multipla",
        inputMode: "multi_choice",
        minSelections: 1,
        maxSelections: 3,
        variableName: "escolha_multipla",
        options: [
          { id: "opcao_1", label: "Opção 1" },
          { id: "opcao_2", label: "Opção 2" },
          { id: "opcao_3", label: "Opção 3" },
        ],
      };
    }
    if (nodeType === "transferir_agente") {
      return {
        queue: "Geral",
        handoff_message: "",
        priority: "normal",
      };
    }
    if (nodeType === "encerramento") {
      return {
        end_message: "Obrigado pelo contato!",
        reason_key: "flow_completed",
      };
    }
    return {};
  };

  const handleAddNode = async (nodeType: string) => {
    const nodeName = paletteItems.find((t) => t.id === nodeType)?.name || "Node";
    const initialPosition = {
      x: Math.random() * 400 + 200,
      y: Math.random() * 300 + 100,
    };
    try {
      const response = await api.post(`/flows/${flowId}/nodes`, {
        name: nodeName,
        type: nodeType,
        config: defaultConfigForNodeType(nodeType),
        is_start: false,
        position: initialPosition,
      });
      const newNode = unwrapApiData<NodeDataType>(response.data);
      if (newNode && newNode.id) {
        const newReactFlowNode: Node = {
          id: newNode.id,
          type: nodeType,
          data: {
            label: newNode.name,
            config: newNode.config,
            onSelect: handleNodeClick,
          },
          position: newNode.position || initialPosition,
        };
        setNodes((nds) => [...nds, newReactFlowNode]);
        setHasUnsavedChanges(true);
      }
    } catch (err) {
      console.error("Erro ao criar node:", err);
      alert(getApiErrorMessage(err, "Erro ao criar node"));
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
            position: node.position,
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
      alert(getApiErrorMessage(err, "Erro ao salvar fluxo."));
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
      alert(getApiErrorMessage(err, "Erro ao deletar node"));
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
      const updatedNode = unwrapApiData<NodeDataType>(response.data);
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
      alert(getApiErrorMessage(err, "Erro ao atualizar node"));
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

  const buildDecisionDraftEdges = (sourceId: string, config: any) => {
    const draftEdges: any[] = [];
    const mode = config?.decisionMode || "simple";

    if (mode === "ai" && Array.isArray(config?.aiRoutes)) {
      config.aiRoutes.forEach((route: any, index: number) => {
        if (!route?.next_node_id) return;
        draftEdges.push({
          id: `e${sourceId}-ai-route-${index}-${route.next_node_id}`,
          source: sourceId,
          sourceHandle: `ai-route-${index}`,
          target: route.next_node_id,
          animated: true,
          label: route.label || `IA ${index + 1}`,
        });
      });
      if (config.default_next_node_id) {
        draftEdges.push({
          id: `e${sourceId}-default-${config.default_next_node_id}`,
          source: sourceId,
          target: config.default_next_node_id,
          animated: true,
          label: "Fallback",
        });
      }
      return draftEdges;
    }

    if (mode === "multi_branch" && Array.isArray(config?.routeRules)) {
      config.routeRules.forEach((rule: any, index: number) => {
        if (!rule?.next_node_id) return;
        draftEdges.push({
          id: `e${sourceId}-route-${index}-${rule.next_node_id}`,
          source: sourceId,
          sourceHandle: `route-${index}`,
          target: rule.next_node_id,
          animated: true,
          label: rule.label || `Rota ${index + 1}`,
        });
      });
      if (config.default_next_node_id) {
        draftEdges.push({
          id: `e${sourceId}-default-${config.default_next_node_id}`,
          source: sourceId,
          target: config.default_next_node_id,
          animated: true,
          label: "Fallback",
        });
      }
      return draftEdges;
    }

    if (config?.next_node_id_true) {
      draftEdges.push({
        id: `e${sourceId}-true-${config.next_node_id_true}`,
        source: sourceId,
        sourceHandle: "true",
        target: config.next_node_id_true,
        animated: true,
        label: "Sim",
      });
    }
    if (config?.next_node_id_false) {
      draftEdges.push({
        id: `e${sourceId}-false-${config.next_node_id_false}`,
        source: sourceId,
        sourceHandle: "false",
        target: config.next_node_id_false,
        animated: true,
        label: "Não",
      });
    }
    if (config?.next_node_id) {
      draftEdges.push({
        id: `e${sourceId}-${config.next_node_id}`,
        source: sourceId,
        target: config.next_node_id,
        animated: true,
      });
    }
    return draftEdges;
  };

  const applyDecisionDraftConnections = async () => {
    if (!selectedNodeId) return;
    const sourceNode = nodes.find((n) => n.id === selectedNodeId);
    if (!sourceNode) return;
    try {
      await api.put(`/flows/${flowId}/nodes/${selectedNodeId}`, {
        name: editNodeName || sourceNode.data.label,
        config: editNodeConfig,
      });

      const newDraftEdges = buildDecisionDraftEdges(selectedNodeId, editNodeConfig);
      setEdges((prev) => {
        const filtered = prev.filter((edge) => edge.source !== selectedNodeId);
        return [...filtered, ...newDraftEdges];
      });
      setNodes((prev) =>
        prev.map((node) =>
          node.id === selectedNodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  config: editNodeConfig,
                },
              }
            : node
        )
      );
      setHasUnsavedChanges(true);
      alert("Rascunho de conexões aplicado no canvas.");
    } catch (error) {
      alert(getApiErrorMessage(error, "Erro ao aplicar conexões sugeridas."));
    }
  };

  const getDecisionMissingTargets = (config: any): string[] => {
    const mode = config?.decisionMode || "simple";
    if (mode === "ai") {
      const routes = Array.isArray(config?.aiRoutes) ? config.aiRoutes : [];
      return routes
        .map((route: any, index: number) => ({
          label: route?.label || `Rota IA ${index + 1}`,
          hasTarget: Boolean(route?.next_node_id),
        }))
        .filter((item: { label: string; hasTarget: boolean }) => !item.hasTarget)
        .map((item: { label: string; hasTarget: boolean }) => item.label);
    }
    if (mode === "multi_branch") {
      const routes = Array.isArray(config?.routeRules) ? config.routeRules : [];
      return routes
        .map((route: any, index: number) => ({
          label: route?.label || `Rota ${index + 1}`,
          hasTarget: Boolean(route?.next_node_id),
        }))
        .filter((item: { label: string; hasTarget: boolean }) => !item.hasTarget)
        .map((item: { label: string; hasTarget: boolean }) => item.label);
    }
    const missing: string[] = [];
    if (!config?.next_node_id_true) missing.push("Saída Sim");
    if (!config?.next_node_id_false) missing.push("Saída Não");
    return missing;
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
          if (params.sourceHandle?.startsWith("route-")) {
            const index = Number(params.sourceHandle.replace("route-", ""));
            const currentRules = Array.isArray(updatedConfig.routeRules)
              ? [...updatedConfig.routeRules]
              : [];
            if (currentRules[index]) {
              currentRules[index] = {
                ...currentRules[index],
                next_node_id: params.target,
              };
              updatedConfig.routeRules = currentRules;
              updatedConfig.decisionMode = "multi_branch";
            }
          } else if (params.sourceHandle?.startsWith("ai-route-")) {
            const index = Number(params.sourceHandle.replace("ai-route-", ""));
            const currentRoutes = Array.isArray(updatedConfig.aiRoutes)
              ? [...updatedConfig.aiRoutes]
              : [];
            if (currentRoutes[index]) {
              currentRoutes[index] = {
                ...currentRoutes[index],
                next_node_id: params.target,
              };
              updatedConfig.aiRoutes = currentRoutes;
              updatedConfig.decisionMode = "ai";
            }
          } else if (params.sourceHandle === "true") {
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
            } else if (edge.sourceHandle?.startsWith("route-")) {
              const index = Number(edge.sourceHandle.replace("route-", ""));
              const currentRules = Array.isArray(updatedConfig.routeRules)
                ? [...updatedConfig.routeRules]
                : [];
              if (currentRules[index]) {
                currentRules[index] = {
                  ...currentRules[index],
                  next_node_id: "",
                };
                updatedConfig.routeRules = currentRules;
              }
            } else if (edge.sourceHandle?.startsWith("ai-route-")) {
              const index = Number(edge.sourceHandle.replace("ai-route-", ""));
              const currentRoutes = Array.isArray(updatedConfig.aiRoutes)
                ? [...updatedConfig.aiRoutes]
                : [];
              if (currentRoutes[index]) {
                currentRoutes[index] = {
                  ...currentRoutes[index],
                  next_node_id: "",
                };
                updatedConfig.aiRoutes = currentRoutes;
              }
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
        <p className="text-[10px] font-semibold text-teal-700 mb-1 uppercase tracking-wide">
          Produção
        </p>
        <div className="space-y-1.5 mb-3">
          {productionPaletteItems.map((item) => (
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
        <p className="text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">
          Em breve
        </p>
        <div className="space-y-1.5 opacity-80">
          {comingSoonPaletteItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleAddNode(item.id)}
              title="Executor ainda não implementado — apenas modelagem"
              className="group w-full flex items-center gap-2 p-1.5 bg-[#111827] hover:bg-[#0f172a] rounded-md border border-dashed border-[#374151] text-left transition-all"
            >
              <span className="w-6 h-6 rounded-full bg-[#0b1220] border border-[#334155] text-sm flex items-center justify-center">
                {item.icon}
              </span>
              <span className="text-xs font-medium text-gray-300 leading-tight">
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

            {selectedNodeType === "transferir_agente" && (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Fila de atendimento
                  </label>
                  <input
                    type="text"
                    value={editNodeConfig.queue || "Geral"}
                    onChange={(e) =>
                      setEditNodeConfig({ ...editNodeConfig, queue: e.target.value })
                    }
                    placeholder="Ex.: Pesquisa, Vendas, SAC"
                    className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg"
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Mensagem ao cliente (opcional)
                  </label>
                  <textarea
                    value={editNodeConfig.handoff_message || ""}
                    onChange={(e) =>
                      setEditNodeConfig({
                        ...editNodeConfig,
                        handoff_message: e.target.value,
                      })
                    }
                    placeholder="Deixe vazio para mensagem padrão de handoff"
                    className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg h-20 resize-none"
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Prioridade
                  </label>
                  <select
                    value={editNodeConfig.priority || "normal"}
                    onChange={(e) =>
                      setEditNodeConfig({ ...editNodeConfig, priority: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg text-sm"
                  >
                    <option value="normal">Normal</option>
                    <option value="alta">Alta</option>
                  </select>
                </div>
                <p className="text-xs text-gray-500 mb-4">
                  Encerra o fluxo automático e coloca a conversa em espera na fila (quando
                  houver <code className="text-[10px]">conversationId</code> na execução).
                  Conecte uma saída abaixo apenas se quiser continuar o fluxo após o handoff.
                </p>
              </>
            )}

            {selectedNodeType === "encerramento" && (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Mensagem final (opcional)
                  </label>
                  <textarea
                    value={editNodeConfig.end_message || ""}
                    onChange={(e) =>
                      setEditNodeConfig({
                        ...editNodeConfig,
                        end_message: e.target.value,
                      })
                    }
                    placeholder="Ex.: Obrigado! Até logo."
                    className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg h-20 resize-none"
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Chave do motivo (relatórios)
                  </label>
                  <input
                    type="text"
                    value={editNodeConfig.reason_key || ""}
                    onChange={(e) =>
                      setEditNodeConfig({
                        ...editNodeConfig,
                        reason_key: e.target.value,
                      })
                    }
                    placeholder="flow_completed"
                    className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg"
                  />
                </div>
                <p className="text-xs text-gray-500">
                  Encerra o fluxo. Não possui saída — conecte apenas entradas.
                </p>
              </>
            )}

            {selectedNodeType === "capturar_entrada" && (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Pergunta exibida ao usuário
                  </label>
                  <textarea
                    value={editNodeConfig.prompt || ""}
                    onChange={(e) =>
                      setEditNodeConfig({ ...editNodeConfig, prompt: e.target.value })
                    }
                    placeholder="Ex.: Escolha até três opções:"
                    className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 h-24 resize-none"
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Chave da pergunta (relatórios)
                  </label>
                  <input
                    type="text"
                    value={editNodeConfig.promptKey || ""}
                    onChange={(e) =>
                      setEditNodeConfig({ ...editNodeConfig, promptKey: e.target.value })
                    }
                    placeholder="ex.: interesses_produto"
                    className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Identificador estável para agregar respostas em relatórios.
                  </p>
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Modo de entrada
                  </label>
                  <select
                    value={editNodeConfig.inputMode || "text"}
                    onChange={(e) =>
                      setEditNodeConfig({ ...editNodeConfig, inputMode: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                  >
                    <option value="text">Texto livre</option>
                    <option value="single_choice">Uma opção</option>
                    <option value="multi_choice">Várias opções</option>
                  </select>
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Variável do fluxo
                  </label>
                  <input
                    type="text"
                    value={editNodeConfig.variableName || ""}
                    onChange={(e) =>
                      setEditNodeConfig({ ...editNodeConfig, variableName: e.target.value })
                    }
                    placeholder="ex.: interesses"
                    className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                {(editNodeConfig.inputMode === "single_choice" ||
                  editNodeConfig.inputMode === "multi_choice") && (
                  <>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Mínimo
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={editNodeConfig.minSelections ?? 1}
                          onChange={(e) =>
                            setEditNodeConfig({
                              ...editNodeConfig,
                              minSelections: Number(e.target.value),
                            })
                          }
                          className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Máximo
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={editNodeConfig.maxSelections ?? 3}
                          onChange={(e) =>
                            setEditNodeConfig({
                              ...editNodeConfig,
                              maxSelections: Number(e.target.value),
                            })
                          }
                          className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg"
                        />
                      </div>
                    </div>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Opções
                      </label>
                      <div className="space-y-2">
                        {(Array.isArray(editNodeConfig.options)
                          ? editNodeConfig.options
                          : []
                        ).map(
                          (
                            opt: { id?: string; label?: string },
                            index: number
                          ) => (
                            <div key={index} className="grid grid-cols-2 gap-2">
                              <input
                                value={opt.id || ""}
                                onChange={(e) => {
                                  const current = [
                                    ...(Array.isArray(editNodeConfig.options)
                                      ? editNodeConfig.options
                                      : []),
                                  ];
                                  current[index] = {
                                    ...current[index],
                                    id: e.target.value,
                                  };
                                  setEditNodeConfig({
                                    ...editNodeConfig,
                                    options: current,
                                  });
                                }}
                                placeholder="id (ex.: fin)"
                                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                              />
                              <div className="flex gap-2">
                                <input
                                  value={opt.label || ""}
                                  onChange={(e) => {
                                    const current = [
                                      ...(Array.isArray(editNodeConfig.options)
                                        ? editNodeConfig.options
                                        : []),
                                    ];
                                    current[index] = {
                                      ...current[index],
                                      label: e.target.value,
                                    };
                                    setEditNodeConfig({
                                      ...editNodeConfig,
                                      options: current,
                                    });
                                  }}
                                  placeholder="Rótulo exibido"
                                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const current = [
                                      ...(Array.isArray(editNodeConfig.options)
                                        ? editNodeConfig.options
                                        : []),
                                    ];
                                    current.splice(index, 1);
                                    setEditNodeConfig({
                                      ...editNodeConfig,
                                      options: current,
                                    });
                                  }}
                                  className="px-2 text-red-600"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          )
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            const current = Array.isArray(editNodeConfig.options)
                              ? [...editNodeConfig.options]
                              : [];
                            const n = current.length + 1;
                            current.push({ id: `opcao_${n}`, label: `Opção ${n}` });
                            setEditNodeConfig({ ...editNodeConfig, options: current });
                          }}
                          className="px-3 py-2 rounded-lg bg-slate-700 text-white text-sm hover:bg-slate-800"
                        >
                          + Adicionar opção
                        </button>
                      </div>
                    </div>
                  </>
                )}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Próximo node (ID)
                  </label>
                  <input
                    type="text"
                    value={editNodeConfig.next_node_id || ""}
                    onChange={(e) =>
                      setEditNodeConfig({
                        ...editNodeConfig,
                        next_node_id: e.target.value,
                      })
                    }
                    placeholder="id do próximo node após captura"
                    className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </>
            )}

            {/* DECISÃO */}
            {selectedNodeType === "decisao" && (
              <>
                {(() => {
                  const availableTargets = nodes
                    .filter((n) => n.id !== selectedNodeId)
                    .map((n) => ({ id: n.id, label: n.data?.label || n.id }));
                  const missingTargets = getDecisionMissingTargets(editNodeConfig);
                  const canApplyDecisionDraft = missingTargets.length === 0;

                  const updateRouteRule = (
                    index: number,
                    field: keyof DecisionRouteRule,
                    value: string
                  ) => {
                    const current = Array.isArray(editNodeConfig.routeRules)
                      ? [...editNodeConfig.routeRules]
                      : [];
                    while (current.length <= index) {
                      current.push({
                        label: "",
                        variable: "",
                        operator: "igual_a",
                        comparisonValue: "",
                        next_node_id: "",
                      });
                    }
                    current[index] = { ...current[index], [field]: value };
                    setEditNodeConfig({ ...editNodeConfig, routeRules: current });
                  };

                  const removeRouteRule = (index: number) => {
                    const current = Array.isArray(editNodeConfig.routeRules)
                      ? [...editNodeConfig.routeRules]
                      : [];
                    current.splice(index, 1);
                    setEditNodeConfig({ ...editNodeConfig, routeRules: current });
                  };

                  const addRouteRule = () => {
                    const current = Array.isArray(editNodeConfig.routeRules)
                      ? [...editNodeConfig.routeRules]
                      : [];
                    current.push({
                      label: "",
                      variable: "",
                      operator: "igual_a",
                      comparisonValue: "",
                      next_node_id: "",
                    });
                    setEditNodeConfig({ ...editNodeConfig, routeRules: current });
                  };

                  const updateAiRoute = (
                    index: number,
                    field: "label" | "next_node_id",
                    value: string
                  ) => {
                    const current = Array.isArray(editNodeConfig.aiRoutes)
                      ? [...editNodeConfig.aiRoutes]
                      : [];
                    while (current.length <= index) {
                      current.push({ label: "", next_node_id: "" });
                    }
                    current[index] = { ...current[index], [field]: value };
                    setEditNodeConfig({ ...editNodeConfig, aiRoutes: current });
                  };

                  const removeAiRoute = (index: number) => {
                    const current = Array.isArray(editNodeConfig.aiRoutes)
                      ? [...editNodeConfig.aiRoutes]
                      : [];
                    current.splice(index, 1);
                    setEditNodeConfig({ ...editNodeConfig, aiRoutes: current });
                  };

                  const addAiRoute = () => {
                    const current = Array.isArray(editNodeConfig.aiRoutes)
                      ? [...editNodeConfig.aiRoutes]
                      : [];
                    current.push({ label: "", next_node_id: "" });
                    setEditNodeConfig({ ...editNodeConfig, aiRoutes: current });
                  };

                  return (
                    <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Modo de decisão
                  </label>
                  <select
                    value={editNodeConfig.decisionMode || "simple"}
                    onChange={(e) =>
                      setEditNodeConfig({ ...editNodeConfig, decisionMode: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="simple">Simples (1 regra)</option>
                    <option value="combined">Combinada (AND/OR)</option>
                    <option value="multi_branch">Multi-rota (várias saídas)</option>
                    <option value="ai">IA (contextual)</option>
                  </select>
                </div>

                <div className="mb-4 p-3 rounded-lg border border-indigo-200 bg-indigo-50">
                  <label className="block text-sm font-medium text-indigo-900 mb-2">
                    Assistente IA de configuração
                  </label>
                  <textarea
                    value={decisionAssistantGoal}
                    onChange={(e) => setDecisionAssistantGoal(e.target.value)}
                    placeholder="Descreva o objetivo da decisão. Ex.: separar clientes por intenção (reclamação, compra, suporte) com fallback para humano."
                    className="w-full px-3 py-2 border border-indigo-200 bg-white text-gray-900 rounded-lg h-24 resize-none text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => void handleGenerateDecisionSuggestion(availableTargets)}
                    disabled={decisionAssistantLoading}
                    className="mt-2 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {decisionAssistantLoading
                      ? "Gerando sugestão..."
                      : "Sugerir regras e rotas com IA"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void applyDecisionDraftConnections()}
                    disabled={!canApplyDecisionDraft}
                    className="mt-2 ml-2 px-3 py-2 rounded-lg bg-indigo-900 text-indigo-100 text-sm hover:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Aplicar sugestão + rascunho conexões
                  </button>
                  {!canApplyDecisionDraft ? (
                    <p className="mt-2 text-xs text-amber-700">
                      Destinos obrigatórios faltando: {missingTargets.join(", ")}
                    </p>
                  ) : null}
                </div>

                {(editNodeConfig.decisionMode || "simple") === "simple" && (
                  <>
                    <div className="mb-4">
                      <label htmlFor="decisionVariable" className="block text-sm font-medium text-gray-700 mb-2">
                        Variável para Decisão (ex: &#123;&#123;nome_da_variavel&#125;&#125;)
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
                        value={editNodeConfig.comparisonValue || ""}
                        onChange={(e) =>
                          setEditNodeConfig({ ...editNodeConfig, comparisonValue: e.target.value })
                        }
                        placeholder="valor"
                        className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                  </>
                )}

                {(editNodeConfig.decisionMode || "simple") === "combined" && (
                  <>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Operador lógico entre regras
                      </label>
                      <select
                        value={editNodeConfig.logicalOperator || "AND"}
                        onChange={(e) =>
                          setEditNodeConfig({ ...editNodeConfig, logicalOperator: e.target.value })
                        }
                        className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                      >
                        <option value="AND">AND (todas verdadeiras)</option>
                        <option value="OR">OR (qualquer verdadeira)</option>
                      </select>
                    </div>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Regras combinadas (JSON)
                      </label>
                      <textarea
                        value={JSON.stringify(editNodeConfig.rules || [], null, 2)}
                        onChange={(e) =>
                          setEditNodeConfig({
                            ...editNodeConfig,
                            rules: parseJsonText<DecisionRule[]>(e.target.value, []),
                          })
                        }
                        placeholder='[{"variable":"{{intencao}}","operator":"igual_a","comparisonValue":"reclamacao"}]'
                        className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 h-28 resize-none font-mono text-xs"
                      />
                    </div>
                  </>
                )}

                {(editNodeConfig.decisionMode || "simple") === "multi_branch" && (
                  <>
                    <div className="mb-4 space-y-3">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Rotas de decisão
                      </label>
                      {(Array.isArray(editNodeConfig.routeRules) ? editNodeConfig.routeRules : []).map(
                        (rule: DecisionRouteRule, index: number) => (
                          <div key={index} className="p-3 rounded-lg border border-gray-200 bg-gray-50">
                            <div className="grid grid-cols-2 gap-2 mb-2">
                              <input
                                value={rule.label || ""}
                                onChange={(e) => updateRouteRule(index, "label", e.target.value)}
                                placeholder="Label da rota"
                                className="px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg text-sm"
                              />
                              <select
                                value={rule.next_node_id || ""}
                                onChange={(e) =>
                                  updateRouteRule(index, "next_node_id", e.target.value)
                                }
                                className={`px-3 py-2 border rounded-lg text-sm ${
                                  rule.next_node_id
                                    ? "border-gray-300 bg-white text-gray-900"
                                    : "border-amber-400 bg-amber-50 text-amber-900"
                                }`}
                              >
                                <option value="">Destino da rota</option>
                                {availableTargets.map((target) => (
                                  <option key={target.id} value={target.id}>
                                    {target.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="grid grid-cols-3 gap-2 mb-2">
                              <input
                                value={rule.variable || ""}
                                onChange={(e) => updateRouteRule(index, "variable", e.target.value)}
                                placeholder="{{variavel}}"
                                className="px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg text-sm"
                              />
                              <select
                                value={rule.operator || "igual_a"}
                                onChange={(e) => updateRouteRule(index, "operator", e.target.value)}
                                className="px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg text-sm"
                              >
                                <option value="igual_a">Igual a</option>
                                <option value="diferente_de">Diferente de</option>
                                <option value="contem">Contém</option>
                                <option value="nao_contem">Não contém</option>
                                <option value="maior_que">Maior que</option>
                                <option value="menor_que">Menor que</option>
                              </select>
                              <input
                                value={String(rule.comparisonValue || "")}
                                onChange={(e) =>
                                  updateRouteRule(index, "comparisonValue", e.target.value)
                                }
                                placeholder="valor"
                                className="px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg text-sm"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => removeRouteRule(index)}
                              className="text-xs text-red-600 hover:underline"
                            >
                              Remover rota
                            </button>
                          </div>
                        )
                      )}
                      <button
                        type="button"
                        onClick={addRouteRule}
                        className="px-3 py-2 rounded-lg bg-slate-700 text-white text-sm hover:bg-slate-800"
                      >
                        + Adicionar rota
                      </button>
                    </div>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Próximo node padrão (fallback)
                      </label>
                      <input
                        type="text"
                        value={editNodeConfig.default_next_node_id || ""}
                        onChange={(e) =>
                          setEditNodeConfig({
                            ...editNodeConfig,
                            default_next_node_id: e.target.value,
                          })
                        }
                        placeholder="node-id fallback"
                        className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                  </>
                )}

                {(editNodeConfig.decisionMode || "simple") === "ai" && (
                  <>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Persona IA (ID)
                      </label>
                      <input
                        type="text"
                        value={editNodeConfig.aiPersonaId || ""}
                        onChange={(e) =>
                          setEditNodeConfig({ ...editNodeConfig, aiPersonaId: e.target.value })
                        }
                        placeholder="id da persona configurada"
                        className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Prompt da decisão IA
                      </label>
                      <textarea
                        value={editNodeConfig.aiPrompt || ""}
                        onChange={(e) =>
                          setEditNodeConfig({ ...editNodeConfig, aiPrompt: e.target.value })
                        }
                        placeholder="Instruções para a IA decidir a próxima rota..."
                        className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 h-24 resize-none"
                      />
                    </div>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Rotas da IA
                      </label>
                      <div className="space-y-2">
                        {(Array.isArray(editNodeConfig.aiRoutes) ? editNodeConfig.aiRoutes : []).map(
                          (route: { label: string; next_node_id: string }, index: number) => (
                            <div key={index} className="grid grid-cols-2 gap-2 items-center">
                              <input
                                value={route.label || ""}
                                onChange={(e) => updateAiRoute(index, "label", e.target.value)}
                                placeholder="Label (ex.: reclamacao)"
                                className="px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg text-sm"
                              />
                              <div className="flex gap-2">
                                <select
                                  value={route.next_node_id || ""}
                                  onChange={(e) => updateAiRoute(index, "next_node_id", e.target.value)}
                                  className={`flex-1 px-3 py-2 border rounded-lg text-sm ${
                                    route.next_node_id
                                      ? "border-gray-300 bg-white text-gray-900"
                                      : "border-amber-400 bg-amber-50 text-amber-900"
                                  }`}
                                >
                                  <option value="">Destino</option>
                                  {availableTargets.map((target) => (
                                    <option key={target.id} value={target.id}>
                                      {target.label}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  onClick={() => removeAiRoute(index)}
                                  className="px-2 text-red-600 hover:text-red-700"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          )
                        )}
                        <button
                          type="button"
                          onClick={addAiRoute}
                          className="px-3 py-2 rounded-lg bg-slate-700 text-white text-sm hover:bg-slate-800"
                        >
                          + Adicionar rota IA
                        </button>
                      </div>
                    </div>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Chaves de contexto IA (JSON array, opcional)
                      </label>
                      <textarea
                        value={JSON.stringify(editNodeConfig.aiContextKeys || [], null, 2)}
                        onChange={(e) =>
                          setEditNodeConfig({
                            ...editNodeConfig,
                            aiContextKeys: parseJsonText<string[]>(e.target.value, []),
                          })
                        }
                        placeholder='["historico_compras","ultima_reclamacao","sentimento"]'
                        className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 h-20 resize-none font-mono text-xs"
                      />
                    </div>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Próximo node padrão (fallback)
                      </label>
                      <input
                        type="text"
                        value={editNodeConfig.default_next_node_id || ""}
                        onChange={(e) =>
                          setEditNodeConfig({
                            ...editNodeConfig,
                            default_next_node_id: e.target.value,
                          })
                        }
                        placeholder="node-id fallback"
                        className="w-full px-4 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                  </>
                )}
                    </>
                  );
                })()}
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