import type { FastifyPluginAsync } from "fastify";
import {
  createGuardrailPolicy,
  listGuardrailPolicies,
  updateGuardrailPolicy,
} from "../ai-guardrails";
import {
  createKnowledgeBase,
  listKnowledgeBases,
  updateKnowledgeBase,
} from "../ai-knowledge-bases";
import { getFlowAiSettings, updateFlowAiSettings } from "../flow-ai-settings";
import { ApiError, ERROR_CODES, sendSuccess } from "../http";

const flowIdParamSchema = {
  type: "object",
  required: ["flowId"],
  properties: { flowId: { type: "string", minLength: 1 } },
};

export const aiFlowRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Params: { flowId: string } }>(
    "/flows/:flowId/ai-settings",
    { schema: { params: flowIdParamSchema } },
    async (request, reply) => {
      const settings = await getFlowAiSettings(request.params.flowId, request.tenant.id);
      if (!settings) {
        throw new ApiError(404, ERROR_CODES.flows.FLOW_NOT_FOUND, "Flow não encontrado");
      }
      return sendSuccess(request, reply, settings);
    }
  );

  fastify.patch<{ Params: { flowId: string }; Body: Record<string, unknown> }>(
    "/flows/:flowId/ai-settings",
    { schema: { params: flowIdParamSchema } },
    async (request, reply) => {
      const updated = await updateFlowAiSettings({
        flowId: request.params.flowId,
        tenantId: request.tenant.id,
        settings: request.body as Parameters<typeof updateFlowAiSettings>[0]["settings"],
      });
      if (!updated) {
        throw new ApiError(404, ERROR_CODES.flows.FLOW_NOT_FOUND, "Flow não encontrado");
      }
      return sendSuccess(request, reply, updated);
    }
  );

  fastify.get("/ai/knowledge-bases", async (request, reply) => {
    const rows = await listKnowledgeBases(request.tenant.id);
    return sendSuccess(request, reply, rows);
  });

  fastify.post<{
    Body: { key: string; name: string; description?: string; content?: Record<string, unknown> };
  }>("/ai/knowledge-bases", async (request, reply) => {
    const row = await createKnowledgeBase({
      tenantId: request.tenant.id,
      key: request.body.key,
      name: request.body.name,
      description: request.body.description,
      content: request.body.content,
    });
    return sendSuccess(request, reply, row, 201);
  });

  fastify.patch<{
    Params: { id: string };
    Body: {
      name?: string;
      description?: string;
      content?: Record<string, unknown>;
      isActive?: boolean;
    };
  }>("/ai/knowledge-bases/:id", async (request, reply) => {
    const row = await updateKnowledgeBase({
      tenantId: request.tenant.id,
      id: request.params.id,
      ...request.body,
    });
    if (!row) {
      throw new ApiError(404, ERROR_CODES.flows.FLOW_NOT_FOUND, "Base não encontrada");
    }
    return sendSuccess(request, reply, row);
  });

  fastify.get("/ai/guardrail-policies", async (request, reply) => {
    const rows = await listGuardrailPolicies(request.tenant.id);
    return sendSuccess(request, reply, rows);
  });

  fastify.post<{
    Body: {
      key: string;
      name: string;
      description?: string;
      version?: string;
      status?: string;
      rulesText: string;
    };
  }>("/ai/guardrail-policies", async (request, reply) => {
    const row = await createGuardrailPolicy({
      tenantId: request.tenant.id,
      key: request.body.key,
      name: request.body.name,
      description: request.body.description,
      version: request.body.version,
      status: request.body.status,
      rulesText: request.body.rulesText,
    });
    return sendSuccess(request, reply, row, 201);
  });

  fastify.patch<{
    Params: { id: string };
    Body: {
      name?: string;
      description?: string;
      version?: string;
      status?: string;
      rulesText?: string;
      isActive?: boolean;
    };
  }>("/ai/guardrail-policies/:id", async (request, reply) => {
    const row = await updateGuardrailPolicy({
      tenantId: request.tenant.id,
      policyId: request.params.id,
      ...request.body,
    });
    if (!row) {
      throw new ApiError(404, ERROR_CODES.flows.FLOW_NOT_FOUND, "Policy não encontrada");
    }
    return sendSuccess(request, reply, row);
  });
};
