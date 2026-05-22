import { Handle, Position } from "reactflow";

export const ConversaNode = ({ data }: { data: any }) => (
  <div
    className="px-4 py-3 shadow-lg rounded-lg bg-gray-900 border-2 border-pink-500 min-w-[160px] cursor-pointer hover:shadow-xl transition-shadow"
    onClick={() => data.onSelect?.(data.id)}
  >
    <div className="text-xs font-bold text-pink-400 mb-1">💬 Conversa</div>
    <div className="text-sm font-semibold text-white">{data.label}</div>
    <Handle type="target" position={Position.Top} />
    <Handle type="source" position={Position.Bottom} />
  </div>
);

export const FuncaoNode = ({ data }: { data: any }) => (
  <div
    className="px-4 py-3 shadow-lg rounded-lg bg-gray-900 border-2 border-cyan-500 min-w-[160px] cursor-pointer hover:shadow-xl transition-shadow"
    onClick={() => data.onSelect?.(data.id)}
  >
    <div className="text-xs font-bold text-cyan-400 mb-1">⚡ Função</div>
    <div className="text-sm font-semibold text-white">{data.label}</div>
    <Handle type="target" position={Position.Top} />
    <Handle type="source" position={Position.Bottom} />
  </div>
);

export const TransferirChamadaNode = ({ data }: { data: any }) => (
  <div
    className="px-4 py-3 shadow-lg rounded-lg bg-gray-900 border-2 border-orange-500 min-w-[160px] cursor-pointer hover:shadow-xl transition-shadow"
    onClick={() => data.onSelect?.(data.id)}
  >
    <div className="text-xs font-bold text-orange-400 mb-1">📞 Transferir Chamada</div>
    <div className="text-sm font-semibold text-white">{data.label}</div>
    <Handle type="target" position={Position.Top} />
    <Handle type="source" position={Position.Bottom} />
  </div>
);

export const DigitarTeclaNode = ({ data }: { data: any }) => (
  <div
    className="px-4 py-3 shadow-lg rounded-lg bg-gray-900 border-2 border-yellow-500 min-w-[160px] cursor-pointer hover:shadow-xl transition-shadow"
    onClick={() => data.onSelect?.(data.id)}
  >
    <div className="text-xs font-bold text-yellow-400 mb-1">🔢 Digitar Tecla</div>
    <div className="text-sm font-semibold text-white">{data.label}</div>
    <Handle type="target" position={Position.Top} />
    <Handle type="source" position={Position.Bottom} />
  </div>
);

export const DivisaoLogicaNode = ({ data }: { data: any }) => (
  <div
    className="px-4 py-3 shadow-lg rounded-lg bg-gray-900 border-2 border-purple-500 min-w-[160px] cursor-pointer hover:shadow-xl transition-shadow"
    onClick={() => data.onSelect?.(data.id)}
  >
    <div className="text-xs font-bold text-purple-400 mb-1">🔀 Divisão Lógica</div>
    <div className="text-sm font-semibold text-white">{data.label}</div>
    <Handle type="target" position={Position.Top} />
    <Handle type="source" position={Position.Bottom} id="true" />
    <Handle type="source" position={Position.Right} id="false" />
  </div>
);

export const TransferirAgenteNode = ({ data }: { data: any }) => (
  <div
    className="px-4 py-3 shadow-lg rounded-lg bg-gray-900 border-2 border-blue-400 min-w-[160px] cursor-pointer hover:shadow-xl transition-shadow"
    onClick={() => data.onSelect?.(data.id)}
  >
    <div className="text-xs font-bold text-blue-300 mb-1">👤 Transferir Agente</div>
    <div className="text-sm font-semibold text-white">{data.label}</div>
    {data.config?.queue ? (
      <div className="text-xs text-blue-200 mt-1">Fila: {data.config.queue}</div>
    ) : null}
    <Handle type="target" position={Position.Top} />
    <Handle type="source" position={Position.Bottom} />
  </div>
);

export const SmsNode = ({ data }: { data: any }) => (
  <div
    className="px-4 py-3 shadow-lg rounded-lg bg-gray-900 border-2 border-green-400 min-w-[160px] cursor-pointer hover:shadow-xl transition-shadow"
    onClick={() => data.onSelect?.(data.id)}
  >
    <div className="text-xs font-bold text-green-300 mb-1">💬 SMS</div>
    <div className="text-sm font-semibold text-white">{data.label}</div>
    <Handle type="target" position={Position.Top} />
    <Handle type="source" position={Position.Bottom} />
  </div>
);

export const ExtrairVariavelNode = ({ data }: { data: any }) => (
  <div
    className="px-4 py-3 shadow-lg rounded-lg bg-gray-900 border-2 border-amber-500 min-w-[160px] cursor-pointer hover:shadow-xl transition-shadow"
    onClick={() => data.onSelect?.(data.id)}
  >
    <div className="text-xs font-bold text-amber-400 mb-1">📦 Extrair Variável</div>
    <div className="text-sm font-semibold text-white">{data.label}</div>
    <Handle type="target" position={Position.Top} />
    <Handle type="source" position={Position.Bottom} />
  </div>
);

export const McpNode = ({ data }: { data: any }) => (
  <div
    className="px-4 py-3 shadow-lg rounded-lg bg-gray-900 border-2 border-indigo-500 min-w-[160px] cursor-pointer hover:shadow-xl transition-shadow"
    onClick={() => data.onSelect?.(data.id)}
  >
    <div className="text-xs font-bold text-indigo-400 mb-1">🔗 MCP</div>
    <div className="text-sm font-semibold text-white">{data.label}</div>
    <Handle type="target" position={Position.Top} />
    <Handle type="source" position={Position.Bottom} />
  </div>
);

export const MensagemNode = ({ data }: { data: any }) => (
  <div
    className="px-4 py-3 shadow-lg rounded-lg bg-gray-900 border-2 border-teal-500 min-w-[160px] cursor-pointer hover:shadow-xl transition-shadow"
    onClick={() => data.onSelect?.(data.id)}
  >
    <div className="text-xs font-bold text-teal-400 mb-1">📨 Mensagem</div>
    <div className="text-sm font-semibold text-white">{data.label}</div>
    <Handle type="target" position={Position.Top} />
    <Handle type="source" position={Position.Bottom} />
  </div>
);

export const ChamadaApiNode = ({ data }: { data: any }) => (
  <div
    className="px-4 py-3 shadow-lg rounded-lg bg-gray-900 border-2 border-rose-500 min-w-[160px] cursor-pointer hover:shadow-xl transition-shadow"
    onClick={() => data.onSelect?.(data.id)}
  >
    <div className="text-xs font-bold text-rose-400 mb-1">🔌 Chamada API</div>
    <div className="text-sm font-semibold text-white">{data.label}</div>
    {data.config?.url && (
      <div className="text-xs text-rose-300 mt-1 truncate max-w-[140px]">
        {data.config.method || "GET"} {data.config.url}
      </div>
    )}
    <Handle type="target" position={Position.Top} />
    <Handle type="source" position={Position.Bottom} />
  </div>
);

export const CapturarEntradaNode = ({ data }: { data: any }) => {
  const mode = data.config?.inputMode || "text";
  const optionsCount = Array.isArray(data.config?.options) ? data.config.options.length : 0;
  const modeLabel =
    mode === "multi_choice"
      ? `Multi (${data.config?.minSelections ?? 1}-${data.config?.maxSelections ?? 3})`
      : mode === "single_choice"
        ? "Uma opção"
        : "Texto";
  return (
    <div
      className="px-4 py-3 shadow-lg rounded-lg bg-gray-900 border-2 border-lime-500 min-w-[160px] cursor-pointer hover:shadow-xl transition-shadow"
      onClick={() => data.onSelect?.(data.id)}
    >
      <div className="text-xs font-bold text-lime-400 mb-1">📥 Capturar Entrada</div>
      <div className="text-sm font-semibold text-white">{data.label}</div>
      <div className="text-xs text-lime-300 mt-1">
        {modeLabel}
        {optionsCount > 0 ? ` · ${optionsCount} opção(ões)` : ""}
      </div>
      {data.config?.promptKey && (
        <div className="text-[10px] text-lime-200/80 mt-1 truncate max-w-[140px]">
          {data.config.promptKey}
        </div>
      )}
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

export const DecisaoNode = ({ data }: { data: any }) => (
  (() => {
    const mode = data.config?.decisionMode || "simple";
    let missingTargets = 0;
    if (mode === "ai" && Array.isArray(data.config?.aiRoutes)) {
      missingTargets = data.config.aiRoutes.filter((route: any) => !route?.next_node_id).length;
    } else if (mode === "multi_branch" && Array.isArray(data.config?.routeRules)) {
      missingTargets = data.config.routeRules.filter((route: any) => !route?.next_node_id).length;
    } else {
      if (!data.config?.next_node_id_true) missingTargets += 1;
      if (!data.config?.next_node_id_false) missingTargets += 1;
    }

    return (
      <div
        className={`px-4 py-3 shadow-lg rounded-lg bg-gray-900 border-2 min-w-[180px] cursor-pointer hover:shadow-xl transition-shadow ${
          missingTargets > 0 ? "border-amber-400" : "border-yellow-400"
        }`}
        onClick={() => data.onSelect?.(data.id)}
      >
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="text-xs font-bold text-yellow-300">⚖️ Decisão</div>
          {missingTargets > 0 ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-200 border border-amber-400/40">
              {missingTargets} sem destino
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-200 border border-emerald-400/40">
              OK
            </span>
          )}
        </div>
        <div className="text-sm font-semibold text-white">{data.label}</div>
        {data.config?.decisionMode === "ai" ? (
          <div className="text-xs text-yellow-300 mt-1">
            IA: {data.config.aiRoutes?.length || 0} rota(s)
          </div>
        ) : data.config?.decisionMode === "multi_branch" ? (
          <div className="text-xs text-yellow-300 mt-1">
            Multi-rota: {data.config.routeRules?.length || 0} regra(s)
          </div>
        ) : data.config?.rules?.length > 1 ? (
          <div className="text-xs text-yellow-300 mt-1">
            Combinada ({data.config.logicalOperator || "AND"}): {data.config.rules.length} regras
          </div>
        ) : data.config?.variable ? (
          <div className="text-xs text-yellow-300 mt-1">
            SE {`{{${data.config.variable}}}`} {data.config.operator?.replace(/_/g, " ")}{" "}
            {data.config.comparisonValue && `"${data.config.comparisonValue}"`}
          </div>
        ) : null}
        <Handle type="target" position={Position.Top} />
        {data.config?.decisionMode === "multi_branch" && Array.isArray(data.config?.routeRules)
          ? data.config.routeRules.map((_: any, idx: number) => (
              <Handle
                key={`route-${idx}`}
                type="source"
                position={Position.Right}
                id={`route-${idx}`}
                style={{ top: `${28 + idx * 18}px`, background: "#facc15" }}
              />
            ))
          : null}
        {data.config?.decisionMode === "ai" && Array.isArray(data.config?.aiRoutes)
          ? data.config.aiRoutes.map((_: any, idx: number) => (
              <Handle
                key={`ai-route-${idx}`}
                type="source"
                position={Position.Right}
                id={`ai-route-${idx}`}
                style={{ top: `${28 + idx * 18}px`, background: "#60a5fa" }}
              />
            ))
          : null}
        {data.config?.decisionMode !== "multi_branch" && data.config?.decisionMode !== "ai" ? (
          <>
            <Handle type="source" position={Position.Bottom} id="true" />
            <Handle type="source" position={Position.Right} id="false" />
            <div className="absolute -bottom-5 left-2 text-xs text-green-400">✓ Sim</div>
            <div className="absolute top-1/2 -right-8 text-xs text-red-400">✗ Não</div>
          </>
        ) : null}
      </div>
    );
  })()
);

export const EncerramentoNode = ({ data }: { data: any }) => (
  <div
    className="px-4 py-3 shadow-lg rounded-lg bg-gray-900 border-2 border-red-500 min-w-[160px] cursor-pointer hover:shadow-xl transition-shadow"
    onClick={() => data.onSelect?.(data.id)}
  >
    <div className="text-xs font-bold text-red-400 mb-1">⏹️ Encerramento</div>
    <div className="text-sm font-semibold text-white">{data.label}</div>
    {data.config?.reason_key || data.config?.reason ? (
      <div className="text-xs text-red-200 mt-1">
        {data.config.reason_key || data.config.reason}
      </div>
    ) : null}
    <Handle type="target" position={Position.Top} />
  </div>
);

export const InicioNode = ({ data }: { data: any }) => (
  <div
    className="px-4 py-3 shadow-lg rounded-lg bg-gray-900 border-2 border-green-600 min-w-[160px]"
    onClick={() => data.onSelect?.(data.id)}
  >
    <div className="text-xs font-bold text-green-400 mb-1">▶️ Início</div>
    <div className="text-sm font-semibold text-white">{data.label}</div>
    <Handle type="source" position={Position.Bottom} />
  </div>
);

export const nodeTypes = {
  conversa: ConversaNode,
  funcao: FuncaoNode,
  transferir_chamada: TransferirChamadaNode,
  digitar_tecla: DigitarTeclaNode,
  divisao_logica: DivisaoLogicaNode,
  transferir_agente: TransferirAgenteNode,
  sms: SmsNode,
  extrair_variavel: ExtrairVariavelNode,
  mcp: McpNode,
  mensagem: MensagemNode,
  chamada_api: ChamadaApiNode,
  capturar_entrada: CapturarEntradaNode,
  decisao: DecisaoNode,
  encerramento: EncerramentoNode,
  inicio: InicioNode,
};