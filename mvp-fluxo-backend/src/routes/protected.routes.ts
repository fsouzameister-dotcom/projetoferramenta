import { FastifyPluginAsync } from "fastify";
import {
  ApiError,
  ERROR_CODES,
  errorEnvelopeSchema,
  sendSuccess,
  successEnvelopeSchema,
} from "../http";

// Importe seus middlewares
import { tenantMiddleware } from "../middlewares/tenant.middleware";
import { authMiddleware } from "../middlewares/auth.middleware";

// Importe suas funções de flows e nodes
// ATENÇÃO: As funções de flows e nodes agora não precisam mais do :tenantId no path,
// pois o tenantId já estará disponível em request.tenant.id
// O mesmo vale para o userId em request.user.id
// Adaptei os handlers para usar request.tenant.id e request.user.id
// Você precisará garantir que listFlowsByTenant, createFlow, etc.,
// aceitem esses parâmetros ou que você crie wrappers para eles.
import { listFlowsByTenant, createFlow, updateFlow } from "../flows";
import { listNodesByFlow, createNode, updateNode, deleteNode } from "../nodes";
import { executeFlow } from "../flow-executor";
import {
  createUserForTenant,
  deleteUserForTenant,
  isAllowedRole,
  listUsersByTenant,
  updateUserForTenant,
} from "../users";
import {
  appendAgentMessage,
  createAgentConversation,
  listAgentConversations,
  updateAgentMessageStatus,
} from "../agent-conversations";

const flowSchema = {
  type: "object",
  additionalProperties: true,
  required: ["id", "name", "channel"],
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    channel: { type: "string" },
  },
} as const;

const nodeSchema = {
  type: "object",
  additionalProperties: true,
  required: ["id", "flow_id", "name", "type"],
  properties: {
    id: { type: "string" },
    flow_id: { type: "string" },
    name: { type: "string" },
    type: { type: "string" },
    is_start: { type: "boolean" },
    config: {},
    position: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["x", "y"],
          properties: {
            x: { type: "number" },
            y: { type: "number" },
          },
        },
      ],
    },
  },
} as const;

const flowIdParamSchema = {
  type: "object",
  additionalProperties: false,
  required: ["flowId"],
  properties: {
    flowId: { type: "string", minLength: 1 },
  },
} as const;

const flowNodeParamSchema = {
  type: "object",
  additionalProperties: false,
  required: ["flowId", "nodeId"],
  properties: {
    flowId: { type: "string", minLength: 1 },
    nodeId: { type: "string", minLength: 1 },
  },
} as const;

const userIdParamSchema = {
  type: "object",
  additionalProperties: false,
  required: ["userId"],
  properties: {
    userId: { type: "string", minLength: 1 },
  },
} as const;

const conversationIdParamSchema = {
  type: "object",
  additionalProperties: false,
  required: ["conversationId"],
  properties: {
    conversationId: { type: "string", minLength: 1 },
  },
} as const;

const messageIdParamSchema = {
  type: "object",
  additionalProperties: false,
  required: ["messageId"],
  properties: {
    messageId: { type: "string", minLength: 1 },
  },
} as const;

// Declaração do plugin Fastify
const protectedRoutes: FastifyPluginAsync = async (fastify, opts) => {
  const ensureAdminAccess = (roleName?: string) => {
    if (roleName !== "admin_local" && roleName !== "supervisor" && roleName !== "admin") {
      throw new ApiError(
        403,
        ERROR_CODES.users.FORBIDDEN_ROLE,
        "Apenas admin local e supervisor podem gerenciar usuários"
      );
    }
  };

  // Aplica o tenantMiddleware a todas as rotas registradas dentro deste plugin
  fastify.addHook("preHandler", tenantMiddleware);

  // Aplica o authMiddleware a todas as rotas registradas dentro deste plugin
  fastify.addHook("preHandler", authMiddleware);

  // ──────────────────────────────────────────────────────────────────
  // FLOWS
  // ──────────────────────────────────────────────────────────────────
  fastify.get(
    "/flows",
    {
      schema: {
        response: {
          200: successEnvelopeSchema({
            type: "array",
            items: flowSchema,
          }),
          400: errorEnvelopeSchema([ERROR_CODES.tenant.TENANT_HEADER_REQUIRED]),
          401: errorEnvelopeSchema([
            ERROR_CODES.auth.AUTH_HEADER_INVALID,
            ERROR_CODES.auth.TOKEN_INVALID,
            ERROR_CODES.auth.USER_INVALID,
          ]),
          403: errorEnvelopeSchema([ERROR_CODES.auth.TOKEN_TENANT_MISMATCH]),
          404: errorEnvelopeSchema([ERROR_CODES.tenant.TENANT_NOT_FOUND]),
          500: errorEnvelopeSchema([
            ERROR_CODES.flows.FLOWS_LIST_FAILED,
            ERROR_CODES.common.INTERNAL_SERVER_ERROR,
          ]),
        },
      },
    },
    async (request, reply) => {
      const tenantId = request.tenant.id; // request.tenant está disponível graças ao tenantMiddleware

      try {
        const flows = await listFlowsByTenant(tenantId);
        return sendSuccess(request, reply, flows);
      } catch (err) {
        request.log.error(err);
        throw new ApiError(
          500,
          ERROR_CODES.flows.FLOWS_LIST_FAILED,
          "Erro ao listar flows"
        );
      }
    }
  );

  fastify.post<{
    Body: {
      contactName?: string;
      phone: string;
      queue?: string;
      templateName?: string;
      templateParams?: Record<string, string>;
    };
  }>(
    "/agent/conversations",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["phone"],
          properties: {
            contactName: { type: "string" },
            phone: { type: "string", minLength: 4 },
            queue: { type: "string" },
            templateName: { type: "string" },
            templateParams: { type: "object", additionalProperties: { type: "string" } },
          },
        },
        response: {
          201: successEnvelopeSchema({
            type: "object",
            additionalProperties: true,
          }),
          500: errorEnvelopeSchema([ERROR_CODES.agent.AGENT_CONVERSATION_CREATE_FAILED]),
        },
      },
    },
    async (request, reply) => {
      const body = request.body;
      try {
        const created = await createAgentConversation({
          tenantId: request.tenant.id,
          contactName: body.contactName?.trim() || body.phone,
          phone: body.phone.trim(),
          queue: body.queue?.trim() || undefined,
          templateName: body.templateName?.trim() || undefined,
          templateParams: body.templateParams ?? {},
        });
        return sendSuccess(request, reply, created, 201);
      } catch (error) {
        request.log.error(error);
        throw new ApiError(
          500,
          ERROR_CODES.agent.AGENT_CONVERSATION_CREATE_FAILED,
          "Erro ao criar novo contato"
        );
      }
    }
  );

  fastify.get<{
    Params: { flowId: string };
  }>(
    "/flows/:flowId",
    {
      schema: {
        params: flowIdParamSchema,
        response: {
          200: successEnvelopeSchema(flowSchema),
          400: errorEnvelopeSchema([ERROR_CODES.tenant.TENANT_HEADER_REQUIRED]),
          401: errorEnvelopeSchema([
            ERROR_CODES.auth.AUTH_HEADER_INVALID,
            ERROR_CODES.auth.TOKEN_INVALID,
            ERROR_CODES.auth.USER_INVALID,
          ]),
          403: errorEnvelopeSchema([ERROR_CODES.auth.TOKEN_TENANT_MISMATCH]),
          404: errorEnvelopeSchema([
            ERROR_CODES.flows.FLOW_NOT_FOUND,
            ERROR_CODES.tenant.TENANT_NOT_FOUND,
          ]),
          500: errorEnvelopeSchema([
            ERROR_CODES.flows.FLOW_GET_FAILED,
            ERROR_CODES.common.INTERNAL_SERVER_ERROR,
          ]),
        },
      },
    },
    async (request, reply) => {
    const { flowId } = request.params;
    const tenantId = request.tenant.id; // tenantId do middleware

    try {
      const flows = await listFlowsByTenant(tenantId); // Busca todos os flows do tenant
      const flow = flows.find((f: any) => f.id === flowId); // Filtra pelo flowId

      if (!flow) {
        throw new ApiError(
          404,
          ERROR_CODES.flows.FLOW_NOT_FOUND,
          "Flow não encontrado ou não pertence a este tenant"
        );
      }

      return sendSuccess(request, reply, flow);
    } catch (err) {
      request.log.error(err);
      if (err instanceof ApiError) throw err;
      throw new ApiError(500, ERROR_CODES.flows.FLOW_GET_FAILED, "Erro ao buscar flow");
    }
    }
  );

  fastify.post<{
    Body: {
      name: string;
      channel: string;
    };
  }>(
    "/flows",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["name", "channel"],
          properties: {
            name: { type: "string", minLength: 1 },
            channel: { type: "string", minLength: 1 },
          },
        },
        response: {
          201: successEnvelopeSchema(flowSchema),
          400: errorEnvelopeSchema([
            ERROR_CODES.common.VALIDATION_ERROR,
            ERROR_CODES.tenant.TENANT_HEADER_REQUIRED,
          ]),
          401: errorEnvelopeSchema([
            ERROR_CODES.auth.AUTH_HEADER_INVALID,
            ERROR_CODES.auth.TOKEN_INVALID,
            ERROR_CODES.auth.USER_INVALID,
          ]),
          403: errorEnvelopeSchema([ERROR_CODES.auth.TOKEN_TENANT_MISMATCH]),
          404: errorEnvelopeSchema([ERROR_CODES.tenant.TENANT_NOT_FOUND]),
          500: errorEnvelopeSchema([
            ERROR_CODES.flows.FLOW_CREATE_FAILED,
            ERROR_CODES.common.INTERNAL_SERVER_ERROR,
          ]),
        },
      },
    },
    async (request, reply) => {
    const { name, channel } = request.body;
    const tenantId = request.tenant.id; // tenantId do middleware

    if (!name || !channel) {
      throw new ApiError(
        400,
        ERROR_CODES.common.VALIDATION_ERROR,
        "Campos 'name' e 'channel' são obrigatórios."
      );
    }

    try {
      const flow = await createFlow({
        tenantId, // Passa o tenantId do middleware
        name,
        channel,
      });

      return sendSuccess(request, reply, flow, 201);
    } catch (err) {
      request.log.error(err);
      throw new ApiError(500, ERROR_CODES.flows.FLOW_CREATE_FAILED, "Erro ao criar flow");
    }
    }
  );

  fastify.put<{
    Params: { flowId: string };
    Body: { name: string; channel: string };
  }>(
    "/flows/:flowId",
    {
      schema: {
        params: flowIdParamSchema,
        body: {
          type: "object",
          additionalProperties: false,
          required: ["name", "channel"],
          properties: {
            name: { type: "string", minLength: 1 },
            channel: { type: "string", minLength: 1 },
          },
        },
        response: {
          200: successEnvelopeSchema(flowSchema),
          400: errorEnvelopeSchema([
            ERROR_CODES.common.VALIDATION_ERROR,
            ERROR_CODES.tenant.TENANT_HEADER_REQUIRED,
          ]),
          401: errorEnvelopeSchema([
            ERROR_CODES.auth.AUTH_HEADER_INVALID,
            ERROR_CODES.auth.TOKEN_INVALID,
            ERROR_CODES.auth.USER_INVALID,
          ]),
          403: errorEnvelopeSchema([ERROR_CODES.auth.TOKEN_TENANT_MISMATCH]),
          404: errorEnvelopeSchema([
            ERROR_CODES.flows.FLOW_NOT_FOUND,
            ERROR_CODES.tenant.TENANT_NOT_FOUND,
          ]),
          500: errorEnvelopeSchema([
            ERROR_CODES.flows.FLOW_UPDATE_FAILED,
            ERROR_CODES.common.INTERNAL_SERVER_ERROR,
          ]),
        },
      },
    },
    async (request, reply) => {
    const { flowId } = request.params;
    const { name, channel } = request.body;
    const tenantId = request.tenant.id;

    if (!name || !channel) {
      throw new ApiError(
        400,
        ERROR_CODES.common.VALIDATION_ERROR,
        "Campos 'name' e 'channel' são obrigatórios."
      );
    }

    try {
      const flow = await updateFlow(flowId, tenantId, { name, channel });
      if (!flow) {
        throw new ApiError(
          404,
          ERROR_CODES.flows.FLOW_NOT_FOUND,
          "Flow não encontrado ou não pertence a este tenant"
        );
      }
      return sendSuccess(request, reply, flow);
    } catch (err) {
      request.log.error(err);
      if (err instanceof ApiError) throw err;
      throw new ApiError(
        500,
        ERROR_CODES.flows.FLOW_UPDATE_FAILED,
        "Erro ao atualizar flow"
      );
    }
    }
  );

  // ──────────────────────────────────────────────────────────────────
  // NODES
  // ──────────────────────────────────────────────────────────────────

  // LISTAR NODES POR FLOW
  fastify.get<{
    Params: { flowId: string };
  }>(
    "/flows/:flowId/nodes",
    {
      schema: {
        params: flowIdParamSchema,
        response: {
          200: successEnvelopeSchema({
            type: "array",
            items: nodeSchema,
          }),
          400: errorEnvelopeSchema([ERROR_CODES.tenant.TENANT_HEADER_REQUIRED]),
          401: errorEnvelopeSchema([
            ERROR_CODES.auth.AUTH_HEADER_INVALID,
            ERROR_CODES.auth.TOKEN_INVALID,
            ERROR_CODES.auth.USER_INVALID,
          ]),
          403: errorEnvelopeSchema([ERROR_CODES.auth.TOKEN_TENANT_MISMATCH]),
          404: errorEnvelopeSchema([
            ERROR_CODES.flows.FLOW_NOT_FOUND,
            ERROR_CODES.tenant.TENANT_NOT_FOUND,
          ]),
          500: errorEnvelopeSchema([
            ERROR_CODES.nodes.NODES_LIST_FAILED,
            ERROR_CODES.common.INTERNAL_SERVER_ERROR,
          ]),
        },
      },
    },
    async (request, reply) => {
    const { flowId } = request.params;
    const tenantId = request.tenant.id; // tenantId do middleware

    try {
      // Adaptei listNodesByFlow para aceitar tenantId para verificação de posse
      const nodes = await listNodesByFlow(flowId, tenantId);
      return sendSuccess(request, reply, nodes);
    } catch (err: any) {
      request.log.error(err);
      if (err?.message?.includes("Flow not found")) {
        throw new ApiError(404, ERROR_CODES.flows.FLOW_NOT_FOUND, err.message);
      }
      throw new ApiError(500, ERROR_CODES.nodes.NODES_LIST_FAILED, "Erro ao listar nodes");
    }
    }
  );

  // CRIAR NODE
  fastify.post<{
    Params: { flowId: string };
    Body: {
      type: string;
      name: string;
      config?: any;
      is_start?: boolean;
      position?: { x: number; y: number } | null;
    };
  }>(
    "/flows/:flowId/nodes",
    {
      schema: {
        params: flowIdParamSchema,
        body: {
          type: "object",
          additionalProperties: false,
          required: ["type", "name"],
          properties: {
            type: { type: "string", minLength: 1 },
            name: { type: "string", minLength: 1 },
            config: {},
            is_start: { type: "boolean" },
            position: {
              anyOf: [
                { type: "null" },
                {
                  type: "object",
                  additionalProperties: false,
                  required: ["x", "y"],
                  properties: {
                    x: { type: "number" },
                    y: { type: "number" },
                  },
                },
              ],
            },
          },
        },
        response: {
          201: successEnvelopeSchema(nodeSchema),
          400: errorEnvelopeSchema([
            ERROR_CODES.common.VALIDATION_ERROR,
            ERROR_CODES.tenant.TENANT_HEADER_REQUIRED,
          ]),
          401: errorEnvelopeSchema([
            ERROR_CODES.auth.AUTH_HEADER_INVALID,
            ERROR_CODES.auth.TOKEN_INVALID,
            ERROR_CODES.auth.USER_INVALID,
          ]),
          403: errorEnvelopeSchema([ERROR_CODES.auth.TOKEN_TENANT_MISMATCH]),
          404: errorEnvelopeSchema([
            ERROR_CODES.flows.FLOW_NOT_FOUND,
            ERROR_CODES.tenant.TENANT_NOT_FOUND,
          ]),
          500: errorEnvelopeSchema([
            ERROR_CODES.nodes.NODE_CREATE_FAILED,
            ERROR_CODES.common.INTERNAL_SERVER_ERROR,
          ]),
        },
      },
    },
    async (request, reply) => {
    const { flowId } = request.params;
    const { type, name, config, is_start, position } = request.body;
    const tenantId = request.tenant.id; // tenantId do middleware

    if (!type || !name) {
      throw new ApiError(
        400,
        ERROR_CODES.common.VALIDATION_ERROR,
        "Campos 'type' e 'name' são obrigatórios."
      );
    }

    try {
      // Adaptei createNode para aceitar tenantId para verificação de posse
      const node = await createNode({
        flowId,
        type,
        name,
        config: config ?? {},
        isStart: is_start ?? false,
        position: position ?? null,
      }, tenantId); // Passa o tenantId

      return sendSuccess(request, reply, node, 201);
    } catch (err: any) {
      request.log.error(err);
      if (err?.message?.includes("Flow not found")) {
        throw new ApiError(404, ERROR_CODES.flows.FLOW_NOT_FOUND, err.message);
      }
      throw new ApiError(500, ERROR_CODES.nodes.NODE_CREATE_FAILED, "Erro ao criar node");
    }
    }
  );

  // ATUALIZAR NODE
  fastify.put<{
    Params: { flowId: string; nodeId: string };
    Body: {
      type?: string;
      name?: string;
      config?: any;
      is_start?: boolean;
      position?: { x: number; y: number } | null;
    };
  }>(
    "/flows/:flowId/nodes/:nodeId",
    {
      schema: {
        params: flowNodeParamSchema,
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            type: { type: "string", minLength: 1 },
            name: { type: "string", minLength: 1 },
            config: {},
            is_start: { type: "boolean" },
            position: {
              anyOf: [
                { type: "null" },
                {
                  type: "object",
                  additionalProperties: false,
                  required: ["x", "y"],
                  properties: {
                    x: { type: "number" },
                    y: { type: "number" },
                  },
                },
              ],
            },
          },
        },
        response: {
          200: successEnvelopeSchema(nodeSchema),
          400: errorEnvelopeSchema([ERROR_CODES.tenant.TENANT_HEADER_REQUIRED]),
          401: errorEnvelopeSchema([
            ERROR_CODES.auth.AUTH_HEADER_INVALID,
            ERROR_CODES.auth.TOKEN_INVALID,
            ERROR_CODES.auth.USER_INVALID,
          ]),
          403: errorEnvelopeSchema([ERROR_CODES.auth.TOKEN_TENANT_MISMATCH]),
          404: errorEnvelopeSchema([
            ERROR_CODES.nodes.NODE_NOT_FOUND,
            ERROR_CODES.tenant.TENANT_NOT_FOUND,
          ]),
          500: errorEnvelopeSchema([
            ERROR_CODES.nodes.NODE_UPDATE_FAILED,
            ERROR_CODES.common.INTERNAL_SERVER_ERROR,
          ]),
        },
      },
    },
    async (request, reply) => {
    const { nodeId, flowId } = request.params; // Obtenha flowId também
    const { type, name, config, is_start, position } = request.body;
    const tenantId = request.tenant.id; // tenantId do middleware

    try {
      // Adaptei updateNode para aceitar tenantId e flowId para verificação de posse
      const node = await updateNode(nodeId, {
        type,
        name,
        config,
        is_start,
        position,
      }, tenantId, flowId); // Passa tenantId e flowId

      if (!node) {
        throw new ApiError(
          404,
          ERROR_CODES.nodes.NODE_NOT_FOUND,
          "Node não encontrado ou não pertence a este tenant"
        );
      }

      return sendSuccess(request, reply, node);
    } catch (err: any) {
      request.log.error(err);
      if (err?.message?.includes("Node not found")) {
        throw new ApiError(404, ERROR_CODES.nodes.NODE_NOT_FOUND, err.message);
      }
      throw new ApiError(500, ERROR_CODES.nodes.NODE_UPDATE_FAILED, "Erro ao atualizar node");
    }
    }
  );

  // DELETAR NODE
  fastify.delete<{
    Params: { flowId: string; nodeId: string };
  }>(
    "/flows/:flowId/nodes/:nodeId",
    {
      schema: {
        params: flowNodeParamSchema,
        response: {
          200: successEnvelopeSchema({
            type: "object",
            additionalProperties: false,
            required: ["success"],
            properties: {
              success: { type: "boolean" },
            },
          }),
          400: errorEnvelopeSchema([ERROR_CODES.tenant.TENANT_HEADER_REQUIRED]),
          401: errorEnvelopeSchema([
            ERROR_CODES.auth.AUTH_HEADER_INVALID,
            ERROR_CODES.auth.TOKEN_INVALID,
            ERROR_CODES.auth.USER_INVALID,
          ]),
          403: errorEnvelopeSchema([ERROR_CODES.auth.TOKEN_TENANT_MISMATCH]),
          404: errorEnvelopeSchema([
            ERROR_CODES.nodes.NODE_NOT_FOUND,
            ERROR_CODES.tenant.TENANT_NOT_FOUND,
          ]),
          500: errorEnvelopeSchema([
            ERROR_CODES.nodes.NODE_DELETE_FAILED,
            ERROR_CODES.common.INTERNAL_SERVER_ERROR,
          ]),
        },
      },
    },
    async (request, reply) => {
    const { nodeId, flowId } = request.params; // Obtenha flowId também
    const tenantId = request.tenant.id; // tenantId do middleware

    try {
      // Adaptei deleteNode para aceitar tenantId e flowId para verificação de posse
      await deleteNode(nodeId, tenantId, flowId); // Passa tenantId e flowId
      return sendSuccess(request, reply, { success: true });
    } catch (err: any) {
      request.log.error(err);
      if (err?.message?.includes("Node not found")) {
        throw new ApiError(404, ERROR_CODES.nodes.NODE_NOT_FOUND, err.message);
      }
      throw new ApiError(500, ERROR_CODES.nodes.NODE_DELETE_FAILED, "Erro ao deletar node");
    }
    }
  );

  fastify.post<{
    Params: { flowId: string };
    Body: {
      variables?: Record<string, unknown>;
      startNodeId?: string;
      maxSteps?: number;
    };
  }>(
    "/flows/:flowId/execute",
    {
      schema: {
        params: flowIdParamSchema,
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            variables: { type: "object", additionalProperties: true },
            startNodeId: { type: "string", minLength: 1 },
            maxSteps: { type: "number", minimum: 1, maximum: 200 },
          },
        },
        response: {
          200: successEnvelopeSchema({
            type: "object",
            additionalProperties: false,
            required: [
              "flowId",
              "status",
              "visitedNodeIds",
              "currentNodeId",
              "messages",
              "variables",
              "trace",
            ],
            properties: {
              flowId: { type: "string" },
              status: { type: "string", enum: ["completed", "stopped"] },
              stopReason: { type: "string" },
              visitedNodeIds: { type: "array", items: { type: "string" } },
              currentNodeId: { anyOf: [{ type: "string" }, { type: "null" }] },
              messages: { type: "array", items: { type: "string" } },
              variables: { type: "object", additionalProperties: true },
              trace: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["nodeId", "nodeType", "nodeName", "nextNodeId"],
                  properties: {
                    nodeId: { type: "string" },
                    nodeType: { type: "string" },
                    nodeName: { type: "string" },
                    nextNodeId: { anyOf: [{ type: "string" }, { type: "null" }] },
                    details: { type: "object", additionalProperties: true },
                  },
                },
              },
            },
          }),
          400: errorEnvelopeSchema([
            ERROR_CODES.tenant.TENANT_HEADER_REQUIRED,
            ERROR_CODES.execution.FLOW_EXECUTION_INVALID,
          ]),
          401: errorEnvelopeSchema([
            ERROR_CODES.auth.AUTH_HEADER_INVALID,
            ERROR_CODES.auth.TOKEN_INVALID,
            ERROR_CODES.auth.USER_INVALID,
          ]),
          403: errorEnvelopeSchema([ERROR_CODES.auth.TOKEN_TENANT_MISMATCH]),
          404: errorEnvelopeSchema([
            ERROR_CODES.flows.FLOW_NOT_FOUND,
            ERROR_CODES.tenant.TENANT_NOT_FOUND,
            ERROR_CODES.execution.FLOW_EXECUTION_INVALID,
          ]),
          500: errorEnvelopeSchema([
            ERROR_CODES.execution.FLOW_EXECUTION_FAILED,
            ERROR_CODES.common.INTERNAL_SERVER_ERROR,
          ]),
          502: errorEnvelopeSchema([ERROR_CODES.execution.FLOW_EXECUTION_API_CALL_FAILED]),
        },
      },
    },
    async (request, reply) => {
      const { flowId } = request.params;
      const tenantId = request.tenant.id;
      const body = request.body ?? {};

      try {
        const result = await executeFlow(flowId, tenantId, body);
        return sendSuccess(request, reply, result);
      } catch (err) {
        request.log.error(err);
        if (err instanceof ApiError) throw err;
        throw new ApiError(
          500,
          ERROR_CODES.execution.FLOW_EXECUTION_FAILED,
          "Erro ao executar fluxo"
        );
      }
    }
  );

  fastify.get(
    "/users",
    {
      schema: {
        response: {
          200: successEnvelopeSchema({
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "email", "name", "tenant_id", "role_id", "role_name"],
              properties: {
                id: { type: "string" },
                email: { type: "string" },
                name: { type: "string" },
                tenant_id: { type: "string" },
                role_id: { type: "string" },
                role_name: { type: "string" },
              },
            },
          }),
          403: errorEnvelopeSchema([ERROR_CODES.users.FORBIDDEN_ROLE]),
          500: errorEnvelopeSchema([ERROR_CODES.users.USERS_LIST_FAILED]),
        },
      },
    },
    async (request, reply) => {
      ensureAdminAccess(request.user?.role_name);
      try {
        const users = await listUsersByTenant(request.tenant.id);
        return sendSuccess(request, reply, users);
      } catch (error) {
        request.log.error(error);
        throw new ApiError(
          500,
          ERROR_CODES.users.USERS_LIST_FAILED,
          "Erro ao listar usuários"
        );
      }
    }
  );

  fastify.post<{
    Body: {
      name: string;
      email: string;
      password: string;
      role_name: string;
    };
  }>(
    "/users",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["name", "email", "password", "role_name"],
          properties: {
            name: { type: "string", minLength: 2 },
            email: { type: "string", minLength: 5 },
            password: { type: "string", minLength: 6 },
            role_name: { type: "string", enum: ["admin_local", "supervisor", "agente"] },
          },
        },
        response: {
          201: successEnvelopeSchema({
            type: "object",
            additionalProperties: false,
            required: ["id", "email", "name", "tenant_id", "role_id", "role_name"],
            properties: {
              id: { type: "string" },
              email: { type: "string" },
              name: { type: "string" },
              tenant_id: { type: "string" },
              role_id: { type: "string" },
              role_name: { type: "string" },
            },
          }),
          400: errorEnvelopeSchema([ERROR_CODES.users.ROLE_REQUIRED]),
          403: errorEnvelopeSchema([ERROR_CODES.users.FORBIDDEN_ROLE]),
          409: errorEnvelopeSchema([ERROR_CODES.users.USER_EMAIL_ALREADY_EXISTS]),
          500: errorEnvelopeSchema([ERROR_CODES.users.USER_CREATE_FAILED]),
        },
      },
    },
    async (request, reply) => {
      ensureAdminAccess(request.user?.role_name);
      const { name, email, password, role_name } = request.body;
      if (!isAllowedRole(role_name)) {
        throw new ApiError(
          400,
          ERROR_CODES.users.ROLE_REQUIRED,
          "Perfil de usuário inválido"
        );
      }
      try {
        const created = await createUserForTenant({
          tenantId: request.tenant.id,
          name,
          email,
          password,
          roleName: role_name,
        });
        return sendSuccess(request, reply, created, 201);
      } catch (error) {
        request.log.error(error);
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          (error as { code?: string }).code === "23505"
        ) {
          throw new ApiError(
            409,
            ERROR_CODES.users.USER_EMAIL_ALREADY_EXISTS,
            "Já existe um usuário com este e-mail"
          );
        }
        throw new ApiError(
          500,
          ERROR_CODES.users.USER_CREATE_FAILED,
          "Erro ao criar usuário"
        );
      }
    }
  );

  fastify.put<{
    Params: { userId: string };
    Body: {
      name?: string;
      email?: string;
      password?: string;
      role_name?: string;
    };
  }>(
    "/users/:userId",
    {
      schema: {
        params: userIdParamSchema,
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string", minLength: 2 },
            email: { type: "string", minLength: 5 },
            password: { type: "string", minLength: 6 },
            role_name: { type: "string", enum: ["admin_local", "supervisor", "agente"] },
          },
        },
        response: {
          200: successEnvelopeSchema({
            type: "object",
            additionalProperties: false,
            required: ["id", "email", "name", "tenant_id", "role_id", "role_name"],
            properties: {
              id: { type: "string" },
              email: { type: "string" },
              name: { type: "string" },
              tenant_id: { type: "string" },
              role_id: { type: "string" },
              role_name: { type: "string" },
            },
          }),
          400: errorEnvelopeSchema([ERROR_CODES.users.ROLE_REQUIRED]),
          403: errorEnvelopeSchema([ERROR_CODES.users.FORBIDDEN_ROLE]),
          404: errorEnvelopeSchema([ERROR_CODES.users.USER_NOT_FOUND]),
          500: errorEnvelopeSchema([ERROR_CODES.users.USER_UPDATE_FAILED]),
        },
      },
    },
    async (request, reply) => {
      ensureAdminAccess(request.user?.role_name);
      const { userId } = request.params;
      const { name, email, password, role_name } = request.body;

      if (role_name !== undefined && !isAllowedRole(role_name)) {
        throw new ApiError(
          400,
          ERROR_CODES.users.ROLE_REQUIRED,
          "Perfil de usuário inválido"
        );
      }

      try {
        const updated = await updateUserForTenant({
          tenantId: request.tenant.id,
          userId,
          name,
          email,
          password,
          roleName: role_name,
        });
        if (!updated) {
          throw new ApiError(404, ERROR_CODES.users.USER_NOT_FOUND, "Usuário não encontrado");
        }
        return sendSuccess(request, reply, updated);
      } catch (error) {
        request.log.error(error);
        if (error instanceof ApiError) throw error;
        throw new ApiError(500, ERROR_CODES.users.USER_UPDATE_FAILED, "Erro ao atualizar usuário");
      }
    }
  );

  fastify.delete<{
    Params: { userId: string };
  }>(
    "/users/:userId",
    {
      schema: {
        params: userIdParamSchema,
        response: {
          200: successEnvelopeSchema({
            type: "object",
            additionalProperties: false,
            required: ["success"],
            properties: {
              success: { type: "boolean" },
            },
          }),
          403: errorEnvelopeSchema([ERROR_CODES.users.FORBIDDEN_ROLE]),
          404: errorEnvelopeSchema([ERROR_CODES.users.USER_NOT_FOUND]),
          500: errorEnvelopeSchema([ERROR_CODES.users.USER_DELETE_FAILED]),
        },
      },
    },
    async (request, reply) => {
      ensureAdminAccess(request.user?.role_name);
      const { userId } = request.params;
      if (request.user?.id === userId) {
        throw new ApiError(
          403,
          ERROR_CODES.users.FORBIDDEN_ROLE,
          "Você não pode excluir seu próprio usuário"
        );
      }
      try {
        const deleted = await deleteUserForTenant(request.tenant.id, userId);
        if (!deleted) {
          throw new ApiError(404, ERROR_CODES.users.USER_NOT_FOUND, "Usuário não encontrado");
        }
        return sendSuccess(request, reply, { success: true });
      } catch (error) {
        request.log.error(error);
        if (error instanceof ApiError) throw error;
        throw new ApiError(500, ERROR_CODES.users.USER_DELETE_FAILED, "Erro ao excluir usuário");
      }
    }
  );

  fastify.get(
    "/agent/conversations",
    {
      schema: {
        response: {
          200: successEnvelopeSchema({
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "contactName", "phone", "status", "messages"],
              properties: {
                id: { type: "string" },
                contactName: { type: "string" },
                phone: { type: "string" },
                status: { type: "string", enum: ["em_espera", "em_andamento", "historico"] },
                tags: { type: "array", items: { type: "string" } },
                messages: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: true,
                    required: ["id", "type", "direction", "createdAt"],
                    properties: {
                      id: { type: "string" },
                      type: { type: "string", enum: ["text", "contact", "location"] },
                      direction: { type: "string", enum: ["in", "out"] },
                      delivery: {
                        type: "string",
                        enum: ["sending", "sent", "delivered", "read", "failed"],
                      },
                      text: { type: "string" },
                      createdAt: { type: "string" },
                      contact: { type: "object", additionalProperties: true },
                      location: { type: "object", additionalProperties: true },
                    },
                  },
                },
              },
            },
          }),
          500: errorEnvelopeSchema([ERROR_CODES.agent.AGENT_CONVERSATIONS_LIST_FAILED]),
        },
      },
    },
    async (request, reply) => {
      try {
        const data = await listAgentConversations(request.tenant.id);
        return sendSuccess(request, reply, data);
      } catch (error) {
        request.log.error(error);
        throw new ApiError(
          500,
          ERROR_CODES.agent.AGENT_CONVERSATIONS_LIST_FAILED,
          "Erro ao listar conversas do agente"
        );
      }
    }
  );

  fastify.post<{
    Params: { conversationId: string };
    Body: {
      type: "text" | "contact" | "location";
      text?: string;
      contact?: { name: string; phone: string };
      location?: { label: string; lat: number; lng: number };
    };
  }>(
    "/agent/conversations/:conversationId/messages",
    {
      schema: {
        params: conversationIdParamSchema,
        body: {
          type: "object",
          additionalProperties: false,
          required: ["type"],
          properties: {
            type: { type: "string", enum: ["text", "contact", "location"] },
            text: { type: "string" },
            contact: { type: "object", additionalProperties: true },
            location: { type: "object", additionalProperties: true },
          },
        },
        response: {
          200: successEnvelopeSchema({
            type: "object",
            additionalProperties: true,
          }),
          404: errorEnvelopeSchema([ERROR_CODES.agent.AGENT_CONVERSATION_NOT_FOUND]),
          500: errorEnvelopeSchema([ERROR_CODES.agent.AGENT_MESSAGE_SEND_FAILED]),
        },
      },
    },
    async (request, reply) => {
      const { conversationId } = request.params;
      try {
        const updated = await appendAgentMessage(
          request.tenant.id,
          conversationId,
          request.body
        );
        if (!updated) {
          throw new ApiError(
            404,
            ERROR_CODES.agent.AGENT_CONVERSATION_NOT_FOUND,
            "Conversa não encontrada"
          );
        }
        return sendSuccess(request, reply, updated);
      } catch (error) {
        request.log.error(error);
        if (error instanceof ApiError) throw error;
        throw new ApiError(
          500,
          ERROR_CODES.agent.AGENT_MESSAGE_SEND_FAILED,
          "Erro ao enviar mensagem"
        );
      }
    }
  );

  fastify.post<{
    Params: { messageId: string };
    Body: {
      delivery_status: "sending" | "sent" | "delivered" | "read" | "failed";
      error_code?: string;
      error_description?: string;
    };
  }>(
    "/agent/messages/:messageId/status",
    {
      schema: {
        params: messageIdParamSchema,
        body: {
          type: "object",
          additionalProperties: false,
          required: ["delivery_status"],
          properties: {
            delivery_status: {
              type: "string",
              enum: ["sending", "sent", "delivered", "read", "failed"],
            },
            error_code: { type: "string" },
            error_description: { type: "string" },
          },
        },
        response: {
          200: successEnvelopeSchema({
            type: "object",
            additionalProperties: true,
          }),
          404: errorEnvelopeSchema([
            ERROR_CODES.agent.AGENT_MESSAGE_NOT_FOUND,
            ERROR_CODES.agent.AGENT_CONVERSATION_NOT_FOUND,
          ]),
          500: errorEnvelopeSchema([ERROR_CODES.agent.AGENT_MESSAGE_STATUS_UPDATE_FAILED]),
        },
      },
    },
    async (request, reply) => {
      const { messageId } = request.params;
      const { delivery_status, error_code, error_description } = request.body;
      try {
        const updatedConversation = await updateAgentMessageStatus({
          tenantId: request.tenant.id,
          messageId,
          deliveryStatus: delivery_status,
          errorCode: error_code,
          errorDescription: error_description,
        });
        if (!updatedConversation) {
          throw new ApiError(
            404,
            ERROR_CODES.agent.AGENT_MESSAGE_NOT_FOUND,
            "Mensagem não encontrada"
          );
        }
        return sendSuccess(request, reply, updatedConversation);
      } catch (error) {
        request.log.error(error);
        if (error instanceof ApiError) throw error;
        throw new ApiError(
          500,
          ERROR_CODES.agent.AGENT_MESSAGE_STATUS_UPDATE_FAILED,
          "Erro ao atualizar status da mensagem"
        );
      }
    }
  );

  // Rota de teste para verificar se os middlewares estão funcionando
  fastify.get(
    "/test-protected",
    {
      schema: {
        response: {
          200: successEnvelopeSchema({
            type: "object",
            additionalProperties: true,
            required: ["message", "tenant"],
            properties: {
              message: { type: "string" },
              tenant: { type: "object" },
              user: { type: "object" },
            },
          }),
        },
      },
    },
    async (request, reply) => {
      return sendSuccess(request, reply, {
        message: "Acesso protegido com sucesso!",
        tenant: request.tenant,
        user: request.user,
      });
    }
  );
};

export default protectedRoutes;