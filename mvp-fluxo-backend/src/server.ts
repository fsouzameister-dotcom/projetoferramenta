import Fastify from "fastify";
import cors from "@fastify/cors";
import dotenv from "dotenv";
import { testDbConnection } from "./db";
import { testRedisConnection } from "./redis";
import { listFlowsByTenant, createFlow } from "./flows";
import { listNodesByFlow, createNode, updateNode, deleteNode } from "./nodes";

dotenv.config();

const fastify = Fastify({
  logger: true,
});

// ──────────────────────────────────────────────────────────────────
// CORS
// ──────────────────────────────────────────────────────────────────
fastify.register(cors, {
  origin: "http://localhost:5173",
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

// ──────────────────────────────────────────────────────────────────
// SAÚDE
// ──────────────────────────────────────────────────────────────────
fastify.get("/health", async () => {
  return { status: "ok" };
});

// ──────────────────────────────────────────────────────────────────
// FLOWS
// ──────────────────────────────────────────────────────────────────
fastify.get<{
  Params: { tenantId: string };
}>("/tenants/:tenantId/flows", async (request, reply) => {
  const { tenantId } = request.params;

  try {
    const flows = await listFlowsByTenant(tenantId);
    return { data: flows };
  } catch (err) {
    request.log.error(err);
    reply.code(500);
    return { error: "Erro ao listar flows" };
  }
});

fastify.get<{
  Params: { flowId: string };
}>("/flows/:flowId", async (request, reply) => {
  const { flowId } = request.params;

  try {
    const flows = await listFlowsByTenant("1be433d5-f15b-4764-9a85-e88f3bc88732");
    const flow = flows.find((f: any) => f.id === flowId);

    if (!flow) {
      reply.code(404);
      return { error: "Flow não encontrado" };
    }

    return { data: flow };
  } catch (err) {
    request.log.error(err);
    reply.code(500);
    return { error: "Erro ao buscar flow" };
  }
});

fastify.post<{
  Params: { tenantId: string };
  Body: {
    name: string;
    channel: string;
  };
}>("/tenants/:tenantId/flows", async (request, reply) => {
  const { tenantId } = request.params;
  const { name, channel } = request.body;

  if (!name || !channel) {
    reply.code(400);
    return { error: "Campos 'name' e 'channel' são obrigatórios." };
  }

  try {
    const flow = await createFlow({
      tenantId,
      name,
      channel,
    });

    reply.code(201);
    return { data: flow };
  } catch (err) {
    request.log.error(err);
    reply.code(500);
    return { error: "Erro ao criar flow" };
  }
});

// ──────────────────────────────────────────────────────────────────
// NODES
// ──────────────────────────────────────────────────────────────────
fastify.get<{
  Params: { flowId: string };
}>("/flows/:flowId/nodes", async (request, reply) => {
  const { flowId } = request.params;

  try {
    const nodes = await listNodesByFlow(flowId);
    return { data: nodes };
  } catch (err) {
    request.log.error(err);
    reply.code(500);
    return { error: "Erro ao listar nodes" };
  }
});

fastify.post<{
  Params: { flowId: string };
  Body: {
    type: string;
    name: string;
    config?: any;
    is_start?: boolean;
  };
}>("/flows/:flowId/nodes", async (request, reply) => {
  const { flowId } = request.params;
  const { type, name, config, is_start } = request.body;

  if (!type || !name) {
    reply.code(400);
    return { error: "Campos 'type' e 'name' são obrigatórios." };
  }

  try {
    const node = await createNode({
      flowId,
      type,
      name,
      config: config ?? {},
      isStart: is_start ?? false,
    });

    reply.code(201);
    return { data: node };
  } catch (err) {
    request.log.error(err);
    reply.code(500);
    return { error: "Erro ao criar node" };
  }
});

// ──────────────────────────────────────────────────────────────────
// ATUALIZAR NODE
// ──────────────────────────────────────────────────────────────────
fastify.put<{
  Params: { flowId: string; nodeId: string };
  Body: {
    type?: string;
    name?: string;
    config?: any;
    is_start?: boolean;
  };
}>("/flows/:flowId/nodes/:nodeId", async (request, reply) => {
  const { nodeId } = request.params;
  const { type, name, config, is_start } = request.body;

  try {
    const node = await updateNode(nodeId, {
      type,
      name,
      config,
      is_start,
    });

    return { data: node };
  } catch (err) {
    request.log.error(err);
    reply.code(500);
    return { error: "Erro ao atualizar node" };
  }
});

// ──────────────────────────────────────────────────────────────────
// DELETAR NODE
// ──────────────────────────────────────────────────────────────────
fastify.delete<{
  Params: { flowId: string; nodeId: string };
}>("/flows/:flowId/nodes/:nodeId", async (request, reply) => {
  const { nodeId } = request.params;

  try {
    await deleteNode(nodeId);
    return { success: true };
  } catch (err) {
    request.log.error(err);
    reply.code(500);
    return { error: "Erro ao deletar node" };
  }
});

// ──────────────────────────────────────────────────────────────────
// INICIALIZAÇÃO
// ──────────────────────────────────────────────────────────────────
async function start() {
  try {
    await testDbConnection();
    await testRedisConnection();

    const port = Number(process.env.PORT || 3000);
    await fastify.listen({ port, host: "0.0.0.0" });
    console.log(`API rodando em http://localhost:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();