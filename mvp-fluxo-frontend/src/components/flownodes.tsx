import { Handle, Position } from "reactflow";

// CONVERSA
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

// FUNÇÃO
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

// TRANSFERIR CHAMADA
export const TransferirChamadaNode = ({ data }: { data: any }) => (
  <div 
    className="px-4 py-3 shadow-lg rounded-lg bg-gray-900 border-2 border-green-500 min-w-[160px] cursor-pointer hover:shadow-xl transition-shadow"
    onClick={() => data.onSelect?.(data.id)}
  >
    <div className="text-xs font-bold text-green-400 mb-1">📞 Transferir</div>
    <div className="text-sm font-semibold text-white">{data.label}</div>
    <Handle type="target" position={Position.Top} />
    <Handle type="source" position={Position.Bottom} />
  </div>
);

// DIGITAR TECLA
export const DigitarTeclaNode = ({ data }: { data: any }) => (
  <div 
    className="px-4 py-3 shadow-lg rounded-lg bg-gray-900 border-2 border-orange-500 min-w-[160px] cursor-pointer hover:shadow-xl transition-shadow"
    onClick={() => data.onSelect?.(data.id)}
  >
    <div className="text-xs font-bold text-orange-400 mb-1">🔢 Digitar Tecla</div>
    <div className="text-sm font-semibold text-white">{data.label}</div>
    <Handle type="target" position={Position.Top} />
    <Handle type="source" position={Position.Bottom} />
  </div>
);

// DIVISÃO LÓGICA
export const DivisaoLogicaNode = ({ data }: { data: any }) => (
  <div 
    className="px-4 py-3 shadow-lg rounded-lg bg-gray-900 border-2 border-purple-500 min-w-[160px] cursor-pointer hover:shadow-xl transition-shadow"
    onClick={() => data.onSelect?.(data.id)}
  >
    <div className="text-xs font-bold text-purple-400 mb-1">🔀 Divisão</div>
    <div className="text-sm font-semibold text-white">{data.label}</div>
    <Handle type="target" position={Position.Top} />
    <Handle type="source" position={Position.Bottom} id="default" />
    {data.config?.conditions?.map((cond: any, idx: number) => (
      <Handle 
        key={`cond-${idx}`}
        type="source" 
        position={Position.Right} 
        id={`condition-${idx}`}
        style={{ top: `${60 + idx * 25}px` }}
      />
    ))}
  </div>
);

// TRANSFERIR AGENTE
export const TransferirAgenteNode = ({ data }: { data: any }) => (
  <div 
    className="px-4 py-3 shadow-lg rounded-lg bg-gray-900 border-2 border-blue-500 min-w-[160px] cursor-pointer hover:shadow-xl transition-shadow"
    onClick={() => data.onSelect?.(data.id)}
  >
    <div className="text-xs font-bold text-blue-400 mb-1">👤 Agente</div>
    <div className="text-sm font-semibold text-white">{data.label}</div>
    <Handle type="target" position={Position.Top} />
    <Handle type="source" position={Position.Bottom} />
  </div>
);

// SMS
export const SmsNode = ({ data }: { data: any }) => (
  <div 
    className="px-4 py-3 shadow-lg rounded-lg bg-gray-900 border-2 border-yellow-500 min-w-[160px] cursor-pointer hover:shadow-xl transition-shadow"
    onClick={() => data.onSelect?.(data.id)}
  >
    <div className="text-xs font-bold text-yellow-400 mb-1">💬 SMS</div>
    <div className="text-sm font-semibold text-white">{data.label}</div>
    <Handle type="target" position={Position.Top} />
    <Handle type="source" position={Position.Bottom} />
  </div>
);

// EXTRAIR VARIÁVEL
export const ExtrairVariavelNode = ({ data }: { data: any }) => (
  <div 
    className="px-4 py-3 shadow-lg rounded-lg bg-gray-900 border-2 border-indigo-500 min-w-[160px] cursor-pointer hover:shadow-xl transition-shadow"
    onClick={() => data.onSelect?.(data.id)}
  >
    <div className="text-xs font-bold text-indigo-400 mb-1">📦 Variável</div>
    <div className="text-sm font-semibold text-white">{data.label}</div>
    <Handle type="target" position={Position.Top} />
    <Handle type="source" position={Position.Bottom} />
  </div>
);

// MCP
export const McpNode = ({ data }: { data: any }) => (
  <div 
    className="px-4 py-3 shadow-lg rounded-lg bg-gray-900 border-2 border-teal-500 min-w-[160px] cursor-pointer hover:shadow-xl transition-shadow"
    onClick={() => data.onSelect?.(data.id)}
  >
    <div className="text-xs font-bold text-teal-400 mb-1">🔗 MCP</div>
    <div className="text-sm font-semibold text-white">{data.label}</div>
    <Handle type="target" position={Position.Top} />
    <Handle type="source" position={Position.Bottom} />
  </div>
);

// MENSAGEM
export const MensagemNode = ({ data }: { data: any }) => (
  <div 
    className="px-4 py-3 shadow-lg rounded-lg bg-gray-900 border-2 border-blue-400 min-w-[160px] cursor-pointer hover:shadow-xl transition-shadow"
    onClick={() => data.onSelect?.(data.id)}
  >
    <div className="text-xs font-bold text-blue-300 mb-1">📨 Mensagem</div>
    <div className="text-sm font-semibold text-white">{data.label}</div>
    {data.config?.content && (
      <div className="text-xs text-gray-400 mt-2 line-clamp-2">"{data.config.content}"</div>
    )}
    <Handle type="target" position={Position.Top} />
    <Handle type="source" position={Position.Bottom} />
  </div>
);

// CHAMADA API
export const ChamadaApiNode = ({ data }: { data: any }) => (
  <div 
    className="px-4 py-3 shadow-lg rounded-lg bg-gray-900 border-2 border-purple-400 min-w-[160px] cursor-pointer hover:shadow-xl transition-shadow"
    onClick={() => data.onSelect?.(data.id)}
  >
    <div className="text-xs font-bold text-purple-300 mb-1">🔌 API</div>
    <div className="text-sm font-semibold text-white">{data.label}</div>
    {data.config?.url && (
      <div className="text-xs text-gray-400 mt-2 truncate">{data.config.url}</div>
    )}
    <Handle type="target" position={Position.Top} />
    <Handle type="source" position={Position.Bottom} id="success" />
    <Handle type="source" position={Position.Right} id="error" />
  </div>
);

// CAPTURAR ENTRADA
export const CapturarEntradaNode = ({ data }: { data: any }) => (
  <div 
    className="px-4 py-3 shadow-lg rounded-lg bg-gray-900 border-2 border-pink-400 min-w-[160px] cursor-pointer hover:shadow-xl transition-shadow"
    onClick={() => data.onSelect?.(data.id)}
  >
    <div className="text-xs font-bold text-pink-300 mb-1">📥 Entrada</div>
    <div className="text-sm font-semibold text-white">{data.label}</div>
    <Handle type="target" position={Position.Top} />
    <Handle type="source" position={Position.Bottom} />
  </div>
);

// DECISÃO
export const DecisaoNode = ({ data }: { data: any }) => (
  <div 
    className="px-4 py-3 shadow-lg rounded-lg bg-gray-900 border-2 border-yellow-500 min-w-[180px] cursor-pointer hover:shadow-xl transition-shadow"
    onClick={() => data.onSelect?.(data.id)}
  >
    <div className="text-xs font-bold text-yellow-400 mb-2">⚖️ Decisão</div>
    <div className="text-sm font-semibold text-white mb-2">{data.label}</div>
    {data.config?.conditions && data.config.conditions.length > 0 ? (
      <div className="text-xs space-y-1">
        {data.config.conditions.map((cond: any, idx: number) => (
          <div key={idx} className="bg-yellow-900 bg-opacity-30 p-1 rounded text-yellow-200">
            IF {cond.variable} {cond.operator} {cond.value}
          </div>
        ))}
      </div>
    ) : (
      <div className="text-xs text-gray-500 italic">Sem condições</div>
    )}
    <Handle type="target" position={Position.Top} />
    <Handle type="source" position={Position.Bottom} id="default" />
    {data.config?.conditions?.map((cond: any, idx: number) => (
      <Handle 
        key={`cond-${idx}`}
        type="source" 
        position={Position.Right} 
        id={`condition-${idx}`}
        style={{ top: `${80 + idx * 30}px` }}
      />
    ))}
  </div>
);

// ENCERRAMENTO
export const EncerramentoNode = ({ data }: { data: any }) => (
  <div 
    className="px-4 py-3 shadow-lg rounded-lg bg-gray-900 border-2 border-red-500 min-w-[160px] cursor-pointer hover:shadow-xl transition-shadow"
    onClick={() => data.onSelect?.(data.id)}
  >
    <div className="text-xs font-bold text-red-400 mb-1">⏹️ Encerramento</div>
    <div className="text-sm font-semibold text-white">{data.label}</div>
    {data.config?.reason && (
      <div className="text-xs text-gray-400 mt-2">Motivo: {data.config.reason}</div>
    )}
    <Handle type="target" position={Position.Top} />
  </div>
);

// INÍCIO
export const InicioNode = ({ data }: { data: any }) => (
  <div className="px-4 py-3 shadow-lg rounded-lg bg-gray-900 border-2 border-green-600 min-w-[160px]">
    <div className="text-xs font-bold text-green-400">▶️ Início</div>
    <div className="text-sm font-semibold text-white mt-1">{data.label}</div>
    <Handle type="source" position={Position.Bottom} />
  </div>
);

// MAPA DE TIPOS - EXPORTAR APENAS UMA VEZ
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