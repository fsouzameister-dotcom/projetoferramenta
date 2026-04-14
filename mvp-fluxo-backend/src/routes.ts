import { FastifyInstance } from "fastify";
import * as flowsService from "./flows";
import * as nodesService from "./nodes";

export async function setupRoutes(app: FastifyInstance) {
  // ==================== FLOWS ====================

  // GET /tenants/:tenantId/flows
  app.get("/tenants/:tenantId/flows", async (request, reply) => {
    try {
      const { tenantId } = request.params as { tenantId: string };
      const flows = await flowsService.listFlowsByTenant(tenantId);
      reply.send({ data: flows });
    } catch (error) {
      console.error("Erro ao listar flows:", error);
      reply.status(500).send({ error: "Erro ao listar flows" });
    }
  });

  // GET /flows/:flowId
  app.get("/flows/:flowId", async (request, reply) => {
    try {
      const { flowId } = request.params as { flowId: string };
      const flow = await flowsService.getFlowById(flowId);
      if (!flow) {
        return reply.status(404).send({ error: "Flow não encontrado" });
      }
      reply.send({ data: flow });
    } catch (error) {
      console.error("Erro ao buscar flow:", error);
      reply.status(500).send({ error: "Erro ao buscar flow" });
    }
  });

  // POST /tenants/:tenantId/flows
  app.post("/tenants/:tenantId/flows", async (request, reply) => {
    try {
      const { tenantId } = request.params as { tenantId: string };
      const { name, channel } = request.body as { name: string; channel: string };

      const flow = await flowsService.createFlow({
        tenantId,
        name,
        channel,
      });

      reply.status(201).send({ data: flow });
    } catch (error) {
      console.error("Erro ao criar flow:", error);
      reply.status(500).send({ error: "Erro ao criar flow" });
    }
  });

  // ==================== NODES ====================

  // GET /flows/:flowId/nodes
  app.get("/flows/:flowId/nodes", async (request, reply) => {
    try {
      const { flowId } = request.params as { flowId: string };
      const nodes = await nodesService.listNodesByFlow(flowId);
      reply.send({ data: nodes });
    } catch (error) {
      console.error("Erro ao listar nodes:", error);
      reply.status(500).send({ error: "Erro ao listar nodes" });
    }
  });

  // POST /flows/:flowId/nodes
  app.post("/flows/:flowId/nodes", async (request, reply) => {
    try {
      const { flowId } = request.params as { flowId: string };
      const { type, name, config, is_start } = request.body as {
        type: string;
        name: string;
        config: any;
        is_start?: boolean;
      };

      const node = await nodesService.createNode({
        flowId,
        type,
        name,
        config,
        isStart: is_start ?? false,
      });

      reply.status(201).send({ data: node });
    } catch (error) {
      console.error("Erro ao criar node:", error);
      reply.status(500).send({ error: "Erro ao criar node" });
    }
  });

  // PUT /flows/:flowId/nodes/:nodeId
  app.put("/flows/:flowId/nodes/:nodeId", async (request, reply) => {
    try {
      const { nodeId } = request.params as { nodeId: string };
      const { name, type, config, is_start } = request.body as {
        name?: string;
        type?: string;
        config?: any;
        is_start?: boolean;
      };

      const updatedNode = await nodesService.updateNode(nodeId, {
        name,
        type,
        config,
        is_start,
      });

      reply.send({ data: updatedNode });
    } catch (error) {
      console.error("Erro ao atualizar node:", error);
      reply.status(500).send({ error: "Erro ao atualizar node" });
    }
  });

  // DELETE /flows/:flowId/nodes/:nodeId
  app.delete("/flows/:flowId/nodes/:nodeId", async (request, reply) => {
    try {
      const { nodeId } = request.params as { nodeId: string };

      await nodesService.deleteNode(nodeId);

      reply.send({ success: true });
    } catch (error) {
      console.error("Erro ao deletar node:", error);
      reply.status(500).send({ error: "Erro ao deletar node" });
    }
  });
}