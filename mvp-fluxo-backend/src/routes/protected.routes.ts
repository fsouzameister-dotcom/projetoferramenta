import { FastifyPluginAsync } from 'fastify';

// Importe seus middlewares
import { tenantMiddleware } from '../middlewares/tenant.middleware';
import { authMiddleware } from '../middlewares/auth.middleware';

// Importe suas funções de flows e nodes
// ATENÇÃO: As funções de flows e nodes agora não precisam mais do :tenantId no path,
// pois o tenantId já estará disponível em request.tenant.id
// O mesmo vale para o userId em request.user.id
// Adaptei os handlers para usar request.tenant.id e request.user.id
// Você precisará garantir que listFlowsByTenant, createFlow, etc.,
// aceitem esses parâmetros ou que você crie wrappers para eles.
import { listFlowsByTenant, createFlow } from "../flows";
import { listNodesByFlow, createNode, updateNode, deleteNode } from "../nodes";

// Declaração do plugin Fastify
const protectedRoutes: FastifyPluginAsync = async (fastify, opts) => {

  // Aplica o tenantMiddleware a todas as rotas registradas dentro deste plugin
  fastify.addHook('preHandler', tenantMiddleware);

  // Aplica o authMiddleware a todas as rotas registradas dentro deste plugin
  fastify.addHook('preHandler', authMiddleware);

  // ──────────────────────────────────────────────────────────────────
  // FLOWS
  // ──────────────────────────────────────────────────────────────────
  fastify.get("/flows", async (request, reply) => {
    const tenantId = request.tenant.id; // request.tenant está disponível graças ao tenantMiddleware

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
    const tenantId = request.tenant.id; // tenantId do middleware

    try {
      const flows = await listFlowsByTenant(tenantId); // Busca todos os flows do tenant
      const flow = flows.find((f: any) => f.id === flowId); // Filtra pelo flowId

      if (!flow) {
        reply.code(404);
        return { error: "Flow não encontrado ou não pertence a este tenant" };
      }

      return { data: flow };
    } catch (err) {
      request.log.error(err);
      reply.code(500);
      return { error: "Erro ao buscar flow" };
    }
  });

  fastify.post<{
    Body: {
      name: string;
      channel: string;
    };
  }>("/flows", async (request, reply) => {
    const { name, channel } = request.body;
    const tenantId = request.tenant.id; // tenantId do middleware

    if (!name || !channel) {
      reply.code(400);
      return { error: "Campos 'name' e 'channel' são obrigatórios." };
    }

    try {
      const flow = await createFlow({
        tenantId, // Passa o tenantId do middleware
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

  // LISTAR NODES POR FLOW
  fastify.get<{
    Params: { flowId: string };
  }>("/flows/:flowId/nodes", async (request, reply) => {
    const { flowId } = request.params;
    const tenantId = request.tenant.id; // tenantId do middleware

    try {
      // Adaptei listNodesByFlow para aceitar tenantId para verificação de posse
      const nodes = await listNodesByFlow(flowId, tenantId);
      return { data: nodes };
    } catch (err: any) {
      request.log.error(err);
      if (err.message.includes('Flow not found')) {
        reply.code(404);
        return { error: err.message };
      }
      reply.code(500);
      return { error: "Erro ao listar nodes" };
    }
  });

  // CRIAR NODE
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
    const tenantId = request.tenant.id; // tenantId do middleware

    if (!type || !name) {
      reply.code(400);
      return { error: "Campos 'type' e 'name' são obrigatórios." };
    }

    try {
      // Adaptei createNode para aceitar tenantId para verificação de posse
      const node = await createNode({
        flowId,
        type,
        name,
        config: config ?? {},
        isStart: is_start ?? false,
      }, tenantId); // Passa o tenantId

      reply.code(201);
      return { data: node };
    } catch (err: any) {
      request.log.error(err);
      if (err.message.includes('Flow not found')) {
        reply.code(404);
        return { error: err.message };
      }
      reply.code(500);
      return { error: "Erro ao criar node" };
    }
  });

  // ATUALIZAR NODE
  fastify.put<{
    Params: { flowId: string; nodeId: string };
    Body: {
      type?: string;
      name?: string;
      config?: any;
      is_start?: boolean;
    };
  }>("/flows/:flowId/nodes/:nodeId", async (request, reply) => {
    const { nodeId, flowId } = request.params; // Obtenha flowId também
    const { type, name, config, is_start } = request.body;
    const tenantId = request.tenant.id; // tenantId do middleware

    try {
      // Adaptei updateNode para aceitar tenantId e flowId para verificação de posse
      const node = await updateNode(nodeId, {
        type,
        name,
        config,
        is_start,
      }, tenantId, flowId); // Passa tenantId e flowId

      if (!node) {
        reply.code(404);
        return { error: "Node não encontrado ou não pertence a este tenant" };
      }

      return { data: node };
    } catch (err: any) {
      request.log.error(err);
      if (err.message.includes('Node not found')) {
        reply.code(404);
        return { error: err.message };
      }
      reply.code(500);
      return { error: "Erro ao atualizar node" };
    }
  });

  // DELETAR NODE
  fastify.delete<{
    Params: { flowId: string; nodeId: string };
  }>("/flows/:flowId/nodes/:nodeId", async (request, reply) => {
    const { nodeId, flowId } = request.params; // Obtenha flowId também
    const tenantId = request.tenant.id; // tenantId do middleware

    try {
      // Adaptei deleteNode para aceitar tenantId e flowId para verificação de posse
      await deleteNode(nodeId, tenantId, flowId); // Passa tenantId e flowId
      return { success: true };
    } catch (err: any) {
      request.log.error(err);
      if (err.message.includes('Node not found')) {
        reply.code(404);
        return { error: err.message };
      }
      reply.code(500);
      return { error: "Erro ao deletar node" };
    }
  });

  // Rota de teste para verificar se os middlewares estão funcionando
  fastify.get('/test-protected', async (request, reply) => {
    return {
      message: 'Acesso protegido com sucesso!',
      tenant: request.tenant,
      user: request.user,
    };
  });
};

export default protectedRoutes;