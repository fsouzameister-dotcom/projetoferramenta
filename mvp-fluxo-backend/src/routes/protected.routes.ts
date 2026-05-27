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
  aggregateFlowResponseOptions,
  listFlowResponseEvents,
} from "../flow-response-events";
import {
  createTabulacao,
  deleteTabulacao,
  listTabulacoesByTenant,
  updateTabulacao,
} from "../tabulacoes";
import {
  createMasterClient,
  createMasterClientPhone,
  listMasterClientPhones,
  listMasterClientsByTenant,
  updateMasterClient,
  updateMasterClientPhone,
} from "../clients-master";
import {
  hasAdminAccess,
  isAllowedRoleForTenant,
  isPlatformAdmin,
} from "../auth-roles";
import {
  createCustomerTenant,
  ensurePlatformTenantSchema,
  getTenantById,
  listCustomerTenants,
  type TenantSegment,
} from "../tenant-platform";
import {
  createUserForTenant,
  deleteUserForTenant,
  isAllowedRole,
  listUsersByTenant,
  updateUserForTenant,
} from "../users";
import {
  createWhatsAppChannelOptionB,
  createWhatsAppChannelTwilio,
  deleteWhatsAppChannel,
  listTwilioContentTemplatesForTenant,
  listWhatsAppChannels,
  updateWhatsAppChannelLabel,
} from "../whatsapp-channels";
import {
  getServerWhatsAppSettingsPublic,
  upsertServerWhatsAppSettings,
} from "../server-whatsapp-settings";
import {
  AgentConversationRuleError,
  appendAgentMessage,
  closeAgentConversation,
  createAgentConversation,
  listAgentConversations,
  reopenAgentConversation,
  updateAgentMessageStatus,
} from "../agent-conversations";
import {
  createAiPersona,
  createAiProviderSetting,
  createAiScript,
  generateAiText,
  listAiPersonas,
  listAiProviderSettings,
  updateAiPersona,
} from "../ai";

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

const tabulacaoSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "tenantId", "key", "label", "active", "createdAt", "updatedAt"],
  properties: {
    id: { type: "string" },
    tenantId: { type: "string" },
    key: { type: "string" },
    label: { type: "string" },
    description: { anyOf: [{ type: "string" }, { type: "null" }] },
    active: { type: "boolean" },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
  },
} as const;

const masterClientSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "tenantId", "name", "metadata", "createdAt", "updatedAt"],
  properties: {
    id: { type: "string" },
    tenantId: { type: "string" },
    externalId: { anyOf: [{ type: "string" }, { type: "null" }] },
    name: { type: "string" },
    email: { anyOf: [{ type: "string" }, { type: "null" }] },
    document: { anyOf: [{ type: "string" }, { type: "null" }] },
    metadata: { type: "object", additionalProperties: true },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
  },
} as const;

const masterClientPhoneSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "tenantId",
    "clientId",
    "phoneE164",
    "isPrimary",
    "isWhatsApp",
    "metadata",
    "createdAt",
    "updatedAt",
  ],
  properties: {
    id: { type: "string" },
    tenantId: { type: "string" },
    clientId: { type: "string" },
    phoneE164: { type: "string" },
    label: { anyOf: [{ type: "string" }, { type: "null" }] },
    isPrimary: { type: "boolean" },
    isWhatsApp: { type: "boolean" },
    metadata: { type: "object", additionalProperties: true },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
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

const personaIdParamSchema = {
  type: "object",
  additionalProperties: false,
  required: ["personaId"],
  properties: {
    personaId: { type: "string", minLength: 1 },
  },
} as const;

const whatsappChannelIdParamSchema = {
  type: "object",
  additionalProperties: false,
  required: ["channelId"],
  properties: {
    channelId: { type: "string", minLength: 1 },
  },
} as const;

// Declaração do plugin Fastify
const protectedRoutes: FastifyPluginAsync = async (fastify, opts) => {
  const ensureAdminAccess = (roleName?: string) => {
    if (!hasAdminAccess(roleName)) {
      throw new ApiError(
        403,
        ERROR_CODES.users.FORBIDDEN_ROLE,
        "Apenas administradores podem executar esta ação"
      );
    }
  };

  const ensurePlatformAdmin = (roleName?: string) => {
    if (!isPlatformAdmin(roleName)) {
      throw new ApiError(
        403,
        ERROR_CODES.platform.PLATFORM_FORBIDDEN,
        "Apenas operadores platform_admin podem gerenciar tenants de clientes"
      );
    }
  };

  const ensureAiAdminAccess = (roleName?: string) => {
    if (!hasAdminAccess(roleName)) {
      throw new ApiError(
        403,
        ERROR_CODES.ai.AI_FORBIDDEN_ROLE,
        "Apenas admin local e supervisor podem configurar IA"
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
      templateContentSid?: string;
      templateParams?: Record<string, string>;
      botName?: string;
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
            templateContentSid: { type: "string" },
            templateParams: { type: "object", additionalProperties: { type: "string" } },
            botName: { type: "string" },
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
          templateContentSid: body.templateContentSid?.trim() || undefined,
          templateParams: body.templateParams ?? {},
          botName: body.botName?.trim() || undefined,
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

  fastify.post<{
    Body: {
      personaId: string;
      conversationId?: string;
      customerContext?: {
        contactName?: string;
        tags?: string[];
        recentMessages?: string[];
      };
    };
  }>(
    "/ai/assist-hint",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["personaId"],
          properties: {
            personaId: { type: "string", minLength: 1 },
            conversationId: { type: "string" },
            customerContext: {
              type: "object",
              additionalProperties: false,
              properties: {
                contactName: { type: "string" },
                tags: { type: "array", items: { type: "string" } },
                recentMessages: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
        response: {
          200: successEnvelopeSchema({
            type: "object",
            additionalProperties: false,
            required: ["hint", "source"],
            properties: {
              hint: { type: "string" },
              source: { type: "string", enum: ["ai", "fallback"] },
            },
          }),
          404: errorEnvelopeSchema([
            ERROR_CODES.ai.AI_PROVIDER_NOT_FOUND,
            ERROR_CODES.ai.AI_PERSONA_NOT_FOUND,
          ]),
          502: errorEnvelopeSchema([ERROR_CODES.ai.AI_HINT_GENERATION_FAILED]),
        },
      },
    },
    async (request, reply) => {
      const { personaId, conversationId, customerContext } = request.body;
      const tags = customerContext?.tags ?? [];
      const recentMessages = customerContext?.recentMessages ?? [];
      const contactName = customerContext?.contactName || "Cliente";
      const heuristicText = `${tags.join(" ")} ${recentMessages.join(" ")}`.toLowerCase();

      const fallbackHint = (() => {
        if (/(reclama|insatisfeit|ruim|cancel|atras|problema|erro)/.test(heuristicText)) {
          return "Cliente com possível risco de atrito. Valide o motivo, confirme entendimento e ofereça próximo passo com prazo claro.";
        }
        if (/(compr|contrat|plano|fechado|assin)/.test(heuristicText)) {
          return "Cliente com sinal de interesse/compras anteriores. Priorize continuidade: confirme objetivo e ofereça upsell aderente ao histórico.";
        }
        return "Inicie com confirmação objetiva da necessidade e proponha duas opções claras para acelerar a decisão do cliente.";
      })();

      const prompt = [
        `Você é um copiloto de atendimento para agente humano.`,
        `Gere UMA dica curta (máx 220 caracteres), objetiva e acionável em português.`,
        `Contato: ${contactName}`,
        `Tags: ${tags.join(", ") || "sem tags"}`,
        `Mensagens recentes: ${recentMessages.join(" | ") || "sem mensagens"}`,
        `A dica deve reduzir atrito e aumentar resolução no primeiro contato.`,
      ].join("\n");

      try {
        const ai = await generateAiText({
          tenantId: request.tenant.id,
          personaId,
          conversationId,
          message: prompt,
        });
        return sendSuccess(request, reply, {
          hint: ai.text.slice(0, 220),
          source: "ai",
        });
      } catch (error) {
        request.log.warn(error);
        return sendSuccess(request, reply, {
          hint: fallbackHint,
          source: "fallback",
        });
      }
    }
  );

  fastify.post<{
    Body: { provider: "openai" | "gemini"; model: string; apiKey: string; isDefault?: boolean };
  }>(
    "/ai/providers",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["provider", "model", "apiKey"],
          properties: {
            provider: { type: "string", enum: ["openai", "gemini"] },
            model: { type: "string", minLength: 1 },
            apiKey: { type: "string", minLength: 8 },
            isDefault: { type: "boolean" },
          },
        },
        response: {
          201: successEnvelopeSchema({
            type: "object",
            additionalProperties: false,
            required: ["id", "provider", "model", "is_default", "is_active"],
            properties: {
              id: { type: "string" },
              provider: { type: "string" },
              model: { type: "string" },
              is_default: { type: "boolean" },
              is_active: { type: "boolean" },
            },
          }),
          403: errorEnvelopeSchema([ERROR_CODES.ai.AI_FORBIDDEN_ROLE]),
          500: errorEnvelopeSchema([ERROR_CODES.ai.AI_PROVIDER_CREATE_FAILED]),
        },
      },
    },
    async (request, reply) => {
      ensureAiAdminAccess(request.user?.role_name);
      const body = request.body;
      try {
        const created = await createAiProviderSetting({
          tenantId: request.tenant.id,
          provider: body.provider,
          model: body.model,
          apiKey: body.apiKey,
          isDefault: body.isDefault,
        });
        return sendSuccess(request, reply, created, 201);
      } catch (error) {
        request.log.error(error);
        if (error instanceof ApiError) throw error;
        throw new ApiError(
          500,
          ERROR_CODES.ai.AI_PROVIDER_CREATE_FAILED,
          "Erro ao criar provedor de IA"
        );
      }
    }
  );

  fastify.get(
    "/ai/providers",
    {
      schema: {
        response: {
          200: successEnvelopeSchema({
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "provider", "model", "is_default", "is_active"],
              properties: {
                id: { type: "string" },
                provider: { type: "string" },
                model: { type: "string" },
                is_default: { type: "boolean" },
                is_active: { type: "boolean" },
              },
            },
          }),
          403: errorEnvelopeSchema([ERROR_CODES.ai.AI_FORBIDDEN_ROLE]),
          500: errorEnvelopeSchema([ERROR_CODES.ai.AI_PROVIDERS_LIST_FAILED]),
        },
      },
    },
    async (request, reply) => {
      ensureAiAdminAccess(request.user?.role_name);
      try {
        const providers = await listAiProviderSettings(request.tenant.id);
        return sendSuccess(request, reply, providers);
      } catch (error) {
        request.log.error(error);
        throw new ApiError(
          500,
          ERROR_CODES.ai.AI_PROVIDERS_LIST_FAILED,
          "Erro ao listar provedores de IA"
        );
      }
    }
  );

  fastify.get(
    "/whatsapp/channels",
    {
      schema: {
        response: {
          200: successEnvelopeSchema({
            type: "array",
            items: { type: "object", additionalProperties: true },
          }),
          403: errorEnvelopeSchema([ERROR_CODES.users.FORBIDDEN_ROLE]),
          500: errorEnvelopeSchema([ERROR_CODES.whatsapp.WHATSAPP_CHANNELS_LIST_FAILED]),
        },
      },
    },
    async (request, reply) => {
      ensureAdminAccess(request.user?.role_name);
      try {
        const data = await listWhatsAppChannels(request.tenant.id);
        return sendSuccess(request, reply, data);
      } catch (error) {
        request.log.error(error);
        throw new ApiError(
          500,
          ERROR_CODES.whatsapp.WHATSAPP_CHANNELS_LIST_FAILED,
          "Erro ao listar canais WhatsApp"
        );
      }
    }
  );

  fastify.post<{
    Body: {
      label?: string;
      wabaId: string;
      accessToken: string;
      phoneNumberId: string;
      displayPhoneNumber?: string;
    };
  }>(
    "/whatsapp/channels",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["wabaId", "accessToken", "phoneNumberId"],
          properties: {
            label: { type: "string" },
            wabaId: { type: "string", minLength: 1 },
            accessToken: { type: "string", minLength: 1 },
            phoneNumberId: { type: "string", minLength: 1 },
            displayPhoneNumber: { type: "string" },
          },
        },
        response: {
          201: successEnvelopeSchema({
            type: "object",
            additionalProperties: false,
            required: ["channelId", "phoneNumberId"],
            properties: {
              channelId: { type: "string" },
              phoneNumberId: { type: "string" },
            },
          }),
          400: errorEnvelopeSchema([ERROR_CODES.common.VALIDATION_ERROR]),
          403: errorEnvelopeSchema([ERROR_CODES.users.FORBIDDEN_ROLE]),
          500: errorEnvelopeSchema([ERROR_CODES.whatsapp.WHATSAPP_CHANNEL_CREATE_FAILED]),
        },
      },
    },
    async (request, reply) => {
      ensureAdminAccess(request.user?.role_name);
      const body = request.body;
      try {
        const created = await createWhatsAppChannelOptionB({
          tenantId: request.tenant.id,
          label: body.label,
          wabaId: body.wabaId,
          accessToken: body.accessToken,
          phoneNumberId: body.phoneNumberId,
          displayPhoneNumber: body.displayPhoneNumber,
        });
        return sendSuccess(request, reply, created, 201);
      } catch (error) {
        request.log.error(error);
        if (error instanceof ApiError) throw error;
        const msg = error instanceof Error ? error.message : "Erro ao registrar canal WhatsApp";
        throw new ApiError(400, ERROR_CODES.common.VALIDATION_ERROR, msg);
      }
    }
  );

  fastify.post<{
    Body: {
      label?: string;
      accountSid: string;
      authToken: string;
      fromWhatsApp: string;
    };
  }>(
    "/whatsapp/channels/twilio",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["accountSid", "authToken", "fromWhatsApp"],
          properties: {
            label: { type: "string" },
            accountSid: { type: "string", minLength: 32 },
            authToken: { type: "string", minLength: 8 },
            fromWhatsApp: { type: "string", minLength: 8 },
          },
        },
        response: {
          201: successEnvelopeSchema({
            type: "object",
            additionalProperties: false,
            required: ["channelId", "phoneNumberId"],
            properties: {
              channelId: { type: "string" },
              phoneNumberId: { type: "string" },
            },
          }),
          400: errorEnvelopeSchema([ERROR_CODES.common.VALIDATION_ERROR]),
          403: errorEnvelopeSchema([ERROR_CODES.users.FORBIDDEN_ROLE]),
          500: errorEnvelopeSchema([ERROR_CODES.whatsapp.WHATSAPP_CHANNEL_CREATE_FAILED]),
        },
      },
    },
    async (request, reply) => {
      ensureAdminAccess(request.user?.role_name);
      const body = request.body;
      try {
        const created = await createWhatsAppChannelTwilio({
          tenantId: request.tenant.id,
          label: body.label,
          accountSid: body.accountSid,
          authToken: body.authToken,
          fromWhatsApp: body.fromWhatsApp,
        });
        return sendSuccess(request, reply, created, 201);
      } catch (error) {
        request.log.error(error);
        if (error instanceof ApiError) throw error;
        const msg = error instanceof Error ? error.message : "Erro ao registrar canal Twilio";
        throw new ApiError(400, ERROR_CODES.common.VALIDATION_ERROR, msg);
      }
    }
  );

  fastify.patch<{
    Params: { channelId: string };
    Body: { label: string };
  }>(
    "/whatsapp/channels/:channelId",
    {
      schema: {
        params: whatsappChannelIdParamSchema,
        body: {
          type: "object",
          additionalProperties: false,
          required: ["label"],
          properties: {
            label: { type: "string", minLength: 1, maxLength: 200 },
          },
        },
        response: {
          200: successEnvelopeSchema({
            type: "object",
            additionalProperties: false,
            required: ["success"],
            properties: {
              success: { type: "boolean" },
            },
          }),
          400: errorEnvelopeSchema([ERROR_CODES.common.VALIDATION_ERROR]),
          403: errorEnvelopeSchema([ERROR_CODES.users.FORBIDDEN_ROLE]),
          404: errorEnvelopeSchema([ERROR_CODES.whatsapp.WHATSAPP_CHANNEL_NOT_FOUND]),
          500: errorEnvelopeSchema([ERROR_CODES.whatsapp.WHATSAPP_CHANNEL_UPDATE_FAILED]),
        },
      },
    },
    async (request, reply) => {
      ensureAdminAccess(request.user?.role_name);
      try {
        await updateWhatsAppChannelLabel(
          request.tenant.id,
          request.params.channelId,
          request.body.label
        );
        return sendSuccess(request, reply, { success: true });
      } catch (error) {
        request.log.error(error);
        if (error instanceof Error && error.message === "CANAL_NAO_ENCONTRADO") {
          throw new ApiError(
            404,
            ERROR_CODES.whatsapp.WHATSAPP_CHANNEL_NOT_FOUND,
            "Canal WhatsApp não encontrado"
          );
        }
        if (error instanceof Error && error.message.includes("label")) {
          throw new ApiError(400, ERROR_CODES.common.VALIDATION_ERROR, error.message);
        }
        throw new ApiError(
          500,
          ERROR_CODES.whatsapp.WHATSAPP_CHANNEL_UPDATE_FAILED,
          "Erro ao atualizar canal WhatsApp"
        );
      }
    }
  );

  fastify.delete<{
    Params: { channelId: string };
  }>(
    "/whatsapp/channels/:channelId",
    {
      schema: {
        params: whatsappChannelIdParamSchema,
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
          404: errorEnvelopeSchema([ERROR_CODES.whatsapp.WHATSAPP_CHANNEL_NOT_FOUND]),
          500: errorEnvelopeSchema([ERROR_CODES.whatsapp.WHATSAPP_CHANNEL_DELETE_FAILED]),
        },
      },
    },
    async (request, reply) => {
      ensureAdminAccess(request.user?.role_name);
      try {
        await deleteWhatsAppChannel(request.tenant.id, request.params.channelId);
        return sendSuccess(request, reply, { success: true });
      } catch (error) {
        request.log.error(error);
        if (error instanceof Error && error.message === "CANAL_NAO_ENCONTRADO") {
          throw new ApiError(
            404,
            ERROR_CODES.whatsapp.WHATSAPP_CHANNEL_NOT_FOUND,
            "Canal WhatsApp não encontrado"
          );
        }
        throw new ApiError(
          500,
          ERROR_CODES.whatsapp.WHATSAPP_CHANNEL_DELETE_FAILED,
          "Erro ao remover canal WhatsApp"
        );
      }
    }
  );

  const serverWhatsAppSettingsSchema = {
    type: "object",
    additionalProperties: false,
    required: ["meta", "flags"],
    properties: {
      meta: {
        type: "object",
        additionalProperties: false,
        required: ["webhookVerifyTokenConfigured", "appSecretConfigured"],
        properties: {
          webhookVerifyTokenConfigured: { type: "boolean" },
          appSecretConfigured: { type: "boolean" },
        },
      },
      flags: {
        type: "object",
        additionalProperties: false,
        required: ["whatsappSkipSignatureVerify", "twilioSkipSignatureVerify"],
        properties: {
          whatsappSkipSignatureVerify: { type: "boolean" },
          twilioSkipSignatureVerify: { type: "boolean" },
        },
      },
    },
  } as const;

  fastify.get(
    "/whatsapp/server-settings",
    {
      schema: {
        response: {
          200: successEnvelopeSchema(serverWhatsAppSettingsSchema),
          403: errorEnvelopeSchema([ERROR_CODES.users.FORBIDDEN_ROLE]),
          500: errorEnvelopeSchema([ERROR_CODES.whatsapp.WHATSAPP_SERVER_SETTINGS_GET_FAILED]),
        },
      },
    },
    async (request, reply) => {
      ensureAdminAccess(request.user?.role_name);
      try {
        const data = await getServerWhatsAppSettingsPublic();
        return sendSuccess(request, reply, data);
      } catch (error) {
        request.log.error(error);
        throw new ApiError(
          500,
          ERROR_CODES.whatsapp.WHATSAPP_SERVER_SETTINGS_GET_FAILED,
          "Erro ao carregar configurações globais do WhatsApp"
        );
      }
    }
  );

  fastify.patch<{
    Body: {
      metaWebhookVerifyToken?: string;
      metaAppSecret?: string;
      whatsappSkipSignatureVerify?: boolean;
      twilioSkipSignatureVerify?: boolean;
    };
  }>(
    "/whatsapp/server-settings",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            metaWebhookVerifyToken: { type: "string" },
            metaAppSecret: { type: "string" },
            whatsappSkipSignatureVerify: { type: "boolean" },
            twilioSkipSignatureVerify: { type: "boolean" },
          },
        },
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
          500: errorEnvelopeSchema([ERROR_CODES.whatsapp.WHATSAPP_SERVER_SETTINGS_UPDATE_FAILED]),
        },
      },
    },
    async (request, reply) => {
      ensureAdminAccess(request.user?.role_name);
      const body = request.body;
      try {
        await upsertServerWhatsAppSettings({
          metaWebhookVerifyToken: body.metaWebhookVerifyToken,
          metaAppSecret: body.metaAppSecret,
          whatsappSkipSignatureVerify: body.whatsappSkipSignatureVerify,
          twilioSkipSignatureVerify: body.twilioSkipSignatureVerify,
        });
        return sendSuccess(request, reply, { success: true });
      } catch (error) {
        request.log.error(error);
        throw new ApiError(
          500,
          ERROR_CODES.whatsapp.WHATSAPP_SERVER_SETTINGS_UPDATE_FAILED,
          "Erro ao salvar configurações globais do WhatsApp"
        );
      }
    }
  );

  fastify.post<{
    Body: {
      name: string;
      description?: string;
      tone?: string;
      systemPrompt: string;
      avatarUrl?: string;
    };
  }>(
    "/ai/personas",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["name", "systemPrompt"],
          properties: {
            name: { type: "string", minLength: 2 },
            description: { type: "string" },
            tone: { type: "string" },
            systemPrompt: { type: "string", minLength: 8 },
            avatarUrl: { type: "string" },
          },
        },
        response: {
          201: successEnvelopeSchema({
            type: "object",
            additionalProperties: true,
          }),
          403: errorEnvelopeSchema([ERROR_CODES.ai.AI_FORBIDDEN_ROLE]),
          500: errorEnvelopeSchema([ERROR_CODES.ai.AI_PERSONA_CREATE_FAILED]),
        },
      },
    },
    async (request, reply) => {
      ensureAiAdminAccess(request.user?.role_name);
      try {
        const persona = await createAiPersona({
          tenantId: request.tenant.id,
          createdBy: request.user?.id,
          name: request.body.name,
          description: request.body.description,
          tone: request.body.tone,
          systemPrompt: request.body.systemPrompt,
          avatarUrl: request.body.avatarUrl,
        });
        return sendSuccess(request, reply, persona, 201);
      } catch (error) {
        request.log.error(error);
        if (error instanceof ApiError) throw error;
        throw new ApiError(500, ERROR_CODES.ai.AI_PERSONA_CREATE_FAILED, "Erro ao criar persona");
      }
    }
  );

  fastify.get(
    "/ai/personas",
    {
      schema: {
        response: {
          200: successEnvelopeSchema({
            type: "array",
            items: {
              type: "object",
              additionalProperties: true,
            },
          }),
          500: errorEnvelopeSchema([ERROR_CODES.ai.AI_PERSONAS_LIST_FAILED]),
        },
      },
    },
    async (request, reply) => {
      try {
        const personas = await listAiPersonas(request.tenant.id);
        return sendSuccess(request, reply, personas);
      } catch (error) {
        request.log.error(error);
        throw new ApiError(500, ERROR_CODES.ai.AI_PERSONAS_LIST_FAILED, "Erro ao listar personas");
      }
    }
  );

  fastify.put<{
    Params: { personaId: string };
    Body: {
      name?: string;
      description?: string;
      tone?: string;
      systemPrompt?: string;
      avatarUrl?: string;
      isActive?: boolean;
    };
  }>(
    "/ai/personas/:personaId",
    {
      schema: {
        params: personaIdParamSchema,
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string", minLength: 2 },
            description: { type: "string" },
            tone: { type: "string" },
            systemPrompt: { type: "string", minLength: 8 },
            avatarUrl: { type: "string" },
            isActive: { type: "boolean" },
          },
        },
        response: {
          200: successEnvelopeSchema({
            type: "object",
            additionalProperties: true,
          }),
          403: errorEnvelopeSchema([ERROR_CODES.ai.AI_FORBIDDEN_ROLE]),
          404: errorEnvelopeSchema([ERROR_CODES.ai.AI_PERSONA_NOT_FOUND]),
          500: errorEnvelopeSchema([ERROR_CODES.ai.AI_PERSONA_UPDATE_FAILED]),
        },
      },
    },
    async (request, reply) => {
      ensureAiAdminAccess(request.user?.role_name);
      const { personaId } = request.params;
      try {
        const updated = await updateAiPersona({
          tenantId: request.tenant.id,
          personaId,
          name: request.body.name,
          description: request.body.description,
          tone: request.body.tone,
          systemPrompt: request.body.systemPrompt,
          avatarUrl: request.body.avatarUrl,
          isActive: request.body.isActive,
        });
        if (!updated) {
          throw new ApiError(404, ERROR_CODES.ai.AI_PERSONA_NOT_FOUND, "Persona não encontrada");
        }
        return sendSuccess(request, reply, updated);
      } catch (error) {
        request.log.error(error);
        if (error instanceof ApiError) throw error;
        throw new ApiError(
          500,
          ERROR_CODES.ai.AI_PERSONA_UPDATE_FAILED,
          "Erro ao atualizar persona"
        );
      }
    }
  );

  fastify.post<{
    Body: {
      personaId: string;
      flowId?: string;
      name: string;
      scriptContent: unknown;
    };
  }>(
    "/ai/scripts",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["personaId", "name", "scriptContent"],
          properties: {
            personaId: { type: "string", minLength: 1 },
            flowId: { type: "string" },
            name: { type: "string", minLength: 2 },
            scriptContent: {},
          },
        },
        response: {
          201: successEnvelopeSchema({
            type: "object",
            additionalProperties: true,
          }),
          403: errorEnvelopeSchema([ERROR_CODES.ai.AI_FORBIDDEN_ROLE]),
          500: errorEnvelopeSchema([ERROR_CODES.ai.AI_SCRIPT_CREATE_FAILED]),
        },
      },
    },
    async (request, reply) => {
      ensureAiAdminAccess(request.user?.role_name);
      try {
        const script = await createAiScript({
          tenantId: request.tenant.id,
          createdBy: request.user?.id,
          personaId: request.body.personaId,
          flowId: request.body.flowId,
          name: request.body.name,
          scriptContent: request.body.scriptContent,
        });
        return sendSuccess(request, reply, script, 201);
      } catch (error) {
        request.log.error(error);
        if (error instanceof ApiError) throw error;
        throw new ApiError(500, ERROR_CODES.ai.AI_SCRIPT_CREATE_FAILED, "Erro ao criar roteiro");
      }
    }
  );

  fastify.post<{
    Body: {
      personaId: string;
      scriptId?: string;
      message: string;
      conversationId?: string;
    };
  }>(
    "/ai/respond",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["personaId", "message"],
          properties: {
            personaId: { type: "string", minLength: 1 },
            scriptId: { type: "string" },
            message: { type: "string", minLength: 1 },
            conversationId: { type: "string" },
          },
        },
        response: {
          200: successEnvelopeSchema({
            type: "object",
            additionalProperties: false,
            required: ["text", "provider", "model", "usage"],
            properties: {
              text: { type: "string" },
              provider: { type: "string" },
              model: { type: "string" },
              usage: {
                type: "object",
                additionalProperties: false,
                required: ["requestTokens", "responseTokens"],
                properties: {
                  requestTokens: { type: "number" },
                  responseTokens: { type: "number" },
                },
              },
            },
          }),
          404: errorEnvelopeSchema([
            ERROR_CODES.ai.AI_PROVIDER_NOT_FOUND,
            ERROR_CODES.ai.AI_PERSONA_NOT_FOUND,
          ]),
          502: errorEnvelopeSchema([
            ERROR_CODES.ai.AI_RESPONSE_FAILED,
            ERROR_CODES.ai.AI_RESPONSE_INVALID,
          ]),
        },
      },
    },
    async (request, reply) => {
      try {
        const result = await generateAiText({
          tenantId: request.tenant.id,
          personaId: request.body.personaId,
          scriptId: request.body.scriptId,
          message: request.body.message,
          conversationId: request.body.conversationId,
        });
        return sendSuccess(request, reply, result);
      } catch (error) {
        request.log.error(error);
        if (error instanceof ApiError) throw error;
        throw new ApiError(502, ERROR_CODES.ai.AI_RESPONSE_FAILED, "Erro ao gerar resposta de IA");
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

  // ──────────────────────────────────────────────────────────────────
  // TABULACOES
  // ──────────────────────────────────────────────────────────────────
  fastify.get("/tabulacoes", {
    schema: {
      response: {
        200: successEnvelopeSchema({ type: "array", items: tabulacaoSchema }),
        403: errorEnvelopeSchema([ERROR_CODES.users.FORBIDDEN_ROLE]),
        500: errorEnvelopeSchema([ERROR_CODES.tabulacoes.TABULACOES_LIST_FAILED]),
      },
    },
  }, async (request, reply) => {
    ensureAdminAccess(request.user?.role_name);
    const tenantId = request.tenant.id;
    try {
      const rows = await listTabulacoesByTenant(tenantId);
      return sendSuccess(request, reply, rows);
    } catch (err) {
      request.log.error(err);
      throw new ApiError(
        500,
        ERROR_CODES.tabulacoes.TABULACOES_LIST_FAILED,
        "Erro ao listar tabulações"
      );
    }
  });

  fastify.put<{
    Params: { clientId: string };
    Body: {
      name?: string;
      email?: string | null;
      document?: string | null;
      externalId?: string | null;
      metadata?: Record<string, unknown>;
    };
  }>("/clients/:clientId", {
    schema: {
      params: {
        type: "object",
        additionalProperties: false,
        required: ["clientId"],
        properties: { clientId: { type: "string", minLength: 1 } },
      },
      body: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string", minLength: 1, maxLength: 140 },
          email: { anyOf: [{ type: "string", maxLength: 140 }, { type: "null" }] },
          document: { anyOf: [{ type: "string", maxLength: 40 }, { type: "null" }] },
          externalId: { anyOf: [{ type: "string", maxLength: 120 }, { type: "null" }] },
          metadata: { type: "object", additionalProperties: true },
        },
      },
      response: {
        200: successEnvelopeSchema(masterClientSchema),
        403: errorEnvelopeSchema([ERROR_CODES.users.FORBIDDEN_ROLE]),
        404: errorEnvelopeSchema([ERROR_CODES.clients.CLIENT_NOT_FOUND]),
        500: errorEnvelopeSchema([ERROR_CODES.clients.CLIENT_UPDATE_FAILED]),
      },
    },
  }, async (request, reply) => {
    ensureAdminAccess(request.user?.role_name);
    const tenantId = request.tenant.id;
    try {
      const updated = await updateMasterClient({
        tenantId,
        clientId: request.params.clientId,
        ...request.body,
      });
      if (!updated) {
        throw new ApiError(404, ERROR_CODES.clients.CLIENT_NOT_FOUND, "Cliente não encontrado");
      }
      return sendSuccess(request, reply, updated);
    } catch (err) {
      request.log.error(err);
      if (err instanceof ApiError) throw err;
      throw new ApiError(
        500,
        ERROR_CODES.clients.CLIENT_UPDATE_FAILED,
        "Erro ao atualizar cliente"
      );
    }
  });

  fastify.post<{
    Body: { key?: string; label: string; description?: string };
  }>("/tabulacoes", {
    schema: {
      body: {
        type: "object",
        additionalProperties: false,
        required: ["label"],
        properties: {
          key: { type: "string", minLength: 1, maxLength: 64 },
          label: { type: "string", minLength: 1, maxLength: 120 },
          description: { type: "string", maxLength: 255 },
        },
      },
      response: {
        201: successEnvelopeSchema(tabulacaoSchema),
        400: errorEnvelopeSchema([ERROR_CODES.common.VALIDATION_ERROR]),
        403: errorEnvelopeSchema([ERROR_CODES.users.FORBIDDEN_ROLE]),
        409: errorEnvelopeSchema([ERROR_CODES.tabulacoes.TABULACAO_KEY_DUPLICATE]),
        500: errorEnvelopeSchema([ERROR_CODES.tabulacoes.TABULACAO_CREATE_FAILED]),
      },
    },
  }, async (request, reply) => {
    ensureAdminAccess(request.user?.role_name);
    const tenantId = request.tenant.id;
    const body = request.body;
    try {
      const created = await createTabulacao({
        tenantId,
        key: body.key ?? body.label,
        label: body.label,
        description: body.description,
      });
      return sendSuccess(request, reply, created, 201);
    } catch (err: any) {
      request.log.error(err);
      if (String(err?.message ?? "").includes("duplicate key value")) {
        throw new ApiError(
          409,
          ERROR_CODES.tabulacoes.TABULACAO_KEY_DUPLICATE,
          "Já existe uma tabulação com essa chave"
        );
      }
      throw new ApiError(
        500,
        ERROR_CODES.tabulacoes.TABULACAO_CREATE_FAILED,
        "Erro ao criar tabulação"
      );
    }
  });

  fastify.put<{
    Params: { tabulacaoId: string };
    Body: { key?: string; label?: string; description?: string | null; active?: boolean };
  }>("/tabulacoes/:tabulacaoId", {
    schema: {
      params: {
        type: "object",
        additionalProperties: false,
        required: ["tabulacaoId"],
        properties: { tabulacaoId: { type: "string", minLength: 1 } },
      },
      body: {
        type: "object",
        additionalProperties: false,
        properties: {
          key: { type: "string", minLength: 1, maxLength: 64 },
          label: { type: "string", minLength: 1, maxLength: 120 },
          description: { anyOf: [{ type: "string", maxLength: 255 }, { type: "null" }] },
          active: { type: "boolean" },
        },
      },
      response: {
        200: successEnvelopeSchema(tabulacaoSchema),
        403: errorEnvelopeSchema([ERROR_CODES.users.FORBIDDEN_ROLE]),
        404: errorEnvelopeSchema([ERROR_CODES.tabulacoes.TABULACAO_NOT_FOUND]),
        409: errorEnvelopeSchema([ERROR_CODES.tabulacoes.TABULACAO_KEY_DUPLICATE]),
        500: errorEnvelopeSchema([ERROR_CODES.tabulacoes.TABULACAO_UPDATE_FAILED]),
      },
    },
  }, async (request, reply) => {
    ensureAdminAccess(request.user?.role_name);
    const tenantId = request.tenant.id;
    try {
      const updated = await updateTabulacao({
        tenantId,
        tabulacaoId: request.params.tabulacaoId,
        ...request.body,
      });
      if (!updated) {
        throw new ApiError(
          404,
          ERROR_CODES.tabulacoes.TABULACAO_NOT_FOUND,
          "Tabulação não encontrada"
        );
      }
      return sendSuccess(request, reply, updated);
    } catch (err: any) {
      request.log.error(err);
      if (err instanceof ApiError) throw err;
      if (String(err?.message ?? "").includes("duplicate key value")) {
        throw new ApiError(
          409,
          ERROR_CODES.tabulacoes.TABULACAO_KEY_DUPLICATE,
          "Já existe uma tabulação com essa chave"
        );
      }
      throw new ApiError(
        500,
        ERROR_CODES.tabulacoes.TABULACAO_UPDATE_FAILED,
        "Erro ao atualizar tabulação"
      );
    }
  });

  fastify.delete<{
    Params: { tabulacaoId: string };
  }>("/tabulacoes/:tabulacaoId", {
    schema: {
      params: {
        type: "object",
        additionalProperties: false,
        required: ["tabulacaoId"],
        properties: { tabulacaoId: { type: "string", minLength: 1 } },
      },
      response: {
        200: successEnvelopeSchema({
          type: "object",
          additionalProperties: false,
          required: ["success"],
          properties: { success: { type: "boolean" } },
        }),
        403: errorEnvelopeSchema([ERROR_CODES.users.FORBIDDEN_ROLE]),
        404: errorEnvelopeSchema([ERROR_CODES.tabulacoes.TABULACAO_NOT_FOUND]),
        500: errorEnvelopeSchema([ERROR_CODES.tabulacoes.TABULACAO_DELETE_FAILED]),
      },
    },
  }, async (request, reply) => {
    ensureAdminAccess(request.user?.role_name);
    const tenantId = request.tenant.id;
    try {
      const ok = await deleteTabulacao(tenantId, request.params.tabulacaoId);
      if (!ok) {
        throw new ApiError(
          404,
          ERROR_CODES.tabulacoes.TABULACAO_NOT_FOUND,
          "Tabulação não encontrada"
        );
      }
      return sendSuccess(request, reply, { success: true });
    } catch (err) {
      request.log.error(err);
      if (err instanceof ApiError) throw err;
      throw new ApiError(
        500,
        ERROR_CODES.tabulacoes.TABULACAO_DELETE_FAILED,
        "Erro ao remover tabulação"
      );
    }
  });

  // ──────────────────────────────────────────────────────────────────
  // CLIENTS (cadastro mestre)
  // ──────────────────────────────────────────────────────────────────
  fastify.get<{
    Querystring: { search?: string; limit?: number };
  }>("/clients", {
    schema: {
      querystring: {
        type: "object",
        additionalProperties: false,
        properties: {
          search: { type: "string" },
          limit: { type: "number", minimum: 1, maximum: 200 },
        },
      },
      response: {
        200: successEnvelopeSchema({ type: "array", items: masterClientSchema }),
        403: errorEnvelopeSchema([ERROR_CODES.users.FORBIDDEN_ROLE]),
        500: errorEnvelopeSchema([ERROR_CODES.clients.CLIENTS_LIST_FAILED]),
      },
    },
  }, async (request, reply) => {
    ensureAdminAccess(request.user?.role_name);
    const tenantId = request.tenant.id;
    const q = request.query ?? {};
    try {
      const rows = await listMasterClientsByTenant({
        tenantId,
        search: q.search,
        limit: q.limit,
      });
      return sendSuccess(request, reply, rows);
    } catch (err) {
      request.log.error(err);
      throw new ApiError(
        500,
        ERROR_CODES.clients.CLIENTS_LIST_FAILED,
        "Erro ao listar clientes"
      );
    }
  });

  fastify.put<{
    Params: { clientId: string; phoneId: string };
    Body: {
      phoneE164?: string;
      label?: string | null;
      isPrimary?: boolean;
      isWhatsApp?: boolean;
      metadata?: Record<string, unknown>;
    };
  }>("/clients/:clientId/phones/:phoneId", {
    schema: {
      params: {
        type: "object",
        additionalProperties: false,
        required: ["clientId", "phoneId"],
        properties: {
          clientId: { type: "string", minLength: 1 },
          phoneId: { type: "string", minLength: 1 },
        },
      },
      body: {
        type: "object",
        additionalProperties: false,
        properties: {
          phoneE164: { type: "string", minLength: 4, maxLength: 30 },
          label: { anyOf: [{ type: "string", maxLength: 60 }, { type: "null" }] },
          isPrimary: { type: "boolean" },
          isWhatsApp: { type: "boolean" },
          metadata: { type: "object", additionalProperties: true },
        },
      },
      response: {
        200: successEnvelopeSchema(masterClientPhoneSchema),
        400: errorEnvelopeSchema([ERROR_CODES.common.VALIDATION_ERROR]),
        403: errorEnvelopeSchema([ERROR_CODES.users.FORBIDDEN_ROLE]),
        404: errorEnvelopeSchema([ERROR_CODES.clients.CLIENT_PHONE_NOT_FOUND]),
        500: errorEnvelopeSchema([ERROR_CODES.clients.CLIENT_PHONE_UPDATE_FAILED]),
      },
    },
  }, async (request, reply) => {
    ensureAdminAccess(request.user?.role_name);
    const tenantId = request.tenant.id;
    try {
      const updated = await updateMasterClientPhone({
        tenantId,
        clientId: request.params.clientId,
        phoneId: request.params.phoneId,
        ...request.body,
      });
      if (!updated) {
        throw new ApiError(
          404,
          ERROR_CODES.clients.CLIENT_PHONE_NOT_FOUND,
          "Telefone não encontrado"
        );
      }
      return sendSuccess(request, reply, updated);
    } catch (err: any) {
      request.log.error(err);
      if (err instanceof ApiError) throw err;
      if (String(err?.message ?? "").includes("INVALID_PHONE_E164")) {
        throw new ApiError(
          400,
          ERROR_CODES.common.VALIDATION_ERROR,
          "Telefone inválido"
        );
      }
      throw new ApiError(
        500,
        ERROR_CODES.clients.CLIENT_PHONE_UPDATE_FAILED,
        "Erro ao atualizar telefone do cliente"
      );
    }
  });

  fastify.post<{
    Body: {
      name: string;
      email?: string;
      document?: string;
      externalId?: string;
      metadata?: Record<string, unknown>;
    };
  }>("/clients", {
    schema: {
      body: {
        type: "object",
        additionalProperties: false,
        required: ["name"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 140 },
          email: { type: "string", maxLength: 140 },
          document: { type: "string", maxLength: 40 },
          externalId: { type: "string", maxLength: 120 },
          metadata: { type: "object", additionalProperties: true },
        },
      },
      response: {
        201: successEnvelopeSchema(masterClientSchema),
        403: errorEnvelopeSchema([ERROR_CODES.users.FORBIDDEN_ROLE]),
        500: errorEnvelopeSchema([ERROR_CODES.clients.CLIENT_CREATE_FAILED]),
      },
    },
  }, async (request, reply) => {
    ensureAdminAccess(request.user?.role_name);
    const tenantId = request.tenant.id;
    const body = request.body;
    try {
      const created = await createMasterClient({
        tenantId,
        name: body.name,
        email: body.email,
        document: body.document,
        externalId: body.externalId,
        metadata: body.metadata,
      });
      return sendSuccess(request, reply, created, 201);
    } catch (err) {
      request.log.error(err);
      throw new ApiError(
        500,
        ERROR_CODES.clients.CLIENT_CREATE_FAILED,
        "Erro ao criar cliente"
      );
    }
  });

  fastify.get<{
    Params: { clientId: string };
  }>("/clients/:clientId/phones", {
    schema: {
      params: {
        type: "object",
        additionalProperties: false,
        required: ["clientId"],
        properties: { clientId: { type: "string", minLength: 1 } },
      },
      response: {
        200: successEnvelopeSchema({ type: "array", items: masterClientPhoneSchema }),
        403: errorEnvelopeSchema([ERROR_CODES.users.FORBIDDEN_ROLE]),
        500: errorEnvelopeSchema([ERROR_CODES.clients.CLIENT_PHONES_LIST_FAILED]),
      },
    },
  }, async (request, reply) => {
    ensureAdminAccess(request.user?.role_name);
    const tenantId = request.tenant.id;
    try {
      const rows = await listMasterClientPhones({
        tenantId,
        clientId: request.params.clientId,
      });
      return sendSuccess(request, reply, rows);
    } catch (err) {
      request.log.error(err);
      throw new ApiError(
        500,
        ERROR_CODES.clients.CLIENT_PHONES_LIST_FAILED,
        "Erro ao listar telefones do cliente"
      );
    }
  });

  fastify.post<{
    Params: { clientId: string };
    Body: {
      phoneE164: string;
      label?: string;
      isPrimary?: boolean;
      isWhatsApp?: boolean;
      metadata?: Record<string, unknown>;
    };
  }>("/clients/:clientId/phones", {
    schema: {
      params: {
        type: "object",
        additionalProperties: false,
        required: ["clientId"],
        properties: { clientId: { type: "string", minLength: 1 } },
      },
      body: {
        type: "object",
        additionalProperties: false,
        required: ["phoneE164"],
        properties: {
          phoneE164: { type: "string", minLength: 4, maxLength: 30 },
          label: { type: "string", maxLength: 60 },
          isPrimary: { type: "boolean" },
          isWhatsApp: { type: "boolean" },
          metadata: { type: "object", additionalProperties: true },
        },
      },
      response: {
        201: successEnvelopeSchema(masterClientPhoneSchema),
        400: errorEnvelopeSchema([ERROR_CODES.common.VALIDATION_ERROR]),
        403: errorEnvelopeSchema([ERROR_CODES.users.FORBIDDEN_ROLE]),
        404: errorEnvelopeSchema([ERROR_CODES.clients.CLIENT_NOT_FOUND]),
        500: errorEnvelopeSchema([ERROR_CODES.clients.CLIENT_PHONE_CREATE_FAILED]),
      },
    },
  }, async (request, reply) => {
    ensureAdminAccess(request.user?.role_name);
    const tenantId = request.tenant.id;
    const body = request.body;
    try {
      const created = await createMasterClientPhone({
        tenantId,
        clientId: request.params.clientId,
        phoneE164: body.phoneE164,
        label: body.label,
        isPrimary: body.isPrimary,
        isWhatsApp: body.isWhatsApp,
        metadata: body.metadata,
      });
      return sendSuccess(request, reply, created, 201);
    } catch (err: any) {
      request.log.error(err);
      if (String(err?.message ?? "").includes("CLIENT_NOT_FOUND")) {
        throw new ApiError(
          404,
          ERROR_CODES.clients.CLIENT_NOT_FOUND,
          "Cliente não encontrado"
        );
      }
      if (String(err?.message ?? "").includes("INVALID_PHONE_E164")) {
        throw new ApiError(
          400,
          ERROR_CODES.common.VALIDATION_ERROR,
          "Telefone inválido"
        );
      }
      throw new ApiError(
        500,
        ERROR_CODES.clients.CLIENT_PHONE_CREATE_FAILED,
        "Erro ao criar telefone do cliente"
      );
    }
  });

  fastify.post<{
    Params: { flowId: string };
    Body: {
      variables?: Record<string, unknown>;
      startNodeId?: string;
      maxSteps?: number;
      userInput?: string | string[];
      awaitingStartedAt?: string;
      resumeReason?: "timeout" | "input";
      conversationId?: string;
      phone?: string;
      sessionId?: string;
      persistResponses?: boolean;
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
            userInput: {
              anyOf: [
                { type: "string" },
                { type: "array", items: { type: "string" } },
              ],
            },
            awaitingStartedAt: { type: "string", minLength: 1 },
            resumeReason: { type: "string", enum: ["timeout", "input"] },
            conversationId: { type: "string", minLength: 1 },
            phone: { type: "string", minLength: 1 },
            sessionId: { type: "string", minLength: 1 },
            persistResponses: { type: "boolean" },
          },
        },
        response: {
          200: successEnvelopeSchema({
            type: "object",
            additionalProperties: true,
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
              status: {
                type: "string",
                enum: ["completed", "stopped", "awaiting_input"],
              },
              stopReason: { type: "string" },
              visitedNodeIds: { type: "array", items: { type: "string" } },
              currentNodeId: { anyOf: [{ type: "string" }, { type: "null" }] },
              messages: { type: "array", items: { type: "string" } },
              outboundMessages: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    kind: { type: "string", enum: ["text", "interactive_buttons", "interactive_list"] },
                    body: { type: "string" },
                    buttons: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          label: { type: "string" },
                        },
                      },
                    },
                    listItems: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          label: { type: "string" },
                          description: { type: "string" },
                        },
                      },
                    },
                    listButtonText: { type: "string" },
                    listSectionTitle: { type: "string" },
                  },
                },
              },
              variables: { type: "object", additionalProperties: true },
              awaitingInput: { type: "object", additionalProperties: true },
              lastResponseEventId: { type: "string" },
              trace: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: true,
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

  fastify.get<{
    Querystring: {
      flowId?: string;
      nodeId?: string;
      questionKey?: string;
      conversationId?: string;
      from?: string;
      to?: string;
      limit?: number;
    };
  }>(
    "/reports/flow-responses",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            flowId: { type: "string" },
            nodeId: { type: "string" },
            questionKey: { type: "string" },
            conversationId: { type: "string" },
            from: { type: "string" },
            to: { type: "string" },
            limit: { type: "number", minimum: 1, maximum: 500 },
          },
        },
        response: {
          200: successEnvelopeSchema({
            type: "array",
            items: { type: "object", additionalProperties: true },
          }),
          403: errorEnvelopeSchema([ERROR_CODES.users.FORBIDDEN_ROLE]),
        },
      },
    },
    async (request, reply) => {
      ensureAdminAccess(request.user?.role_name);
      const tenantId = request.tenant.id;
      const q = request.query ?? {};
      try {
        const rows = await listFlowResponseEvents({
          tenantId,
          flowId: q.flowId,
          nodeId: q.nodeId,
          questionKey: q.questionKey,
          conversationId: q.conversationId,
          from: q.from,
          to: q.to,
          limit: q.limit,
        });
        return sendSuccess(request, reply, rows);
      } catch (err) {
        request.log.error(err);
        throw new ApiError(
          500,
          ERROR_CODES.reports.FLOW_RESPONSES_LIST_FAILED,
          "Erro ao listar respostas de fluxo"
        );
      }
    }
  );

  fastify.get<{
    Querystring: {
      flowId?: string;
      nodeId?: string;
      questionKey?: string;
      from?: string;
      to?: string;
    };
  }>(
    "/reports/flow-responses/aggregates",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            flowId: { type: "string" },
            nodeId: { type: "string" },
            questionKey: { type: "string" },
            from: { type: "string" },
            to: { type: "string" },
          },
        },
        response: {
          200: successEnvelopeSchema({
            type: "array",
            items: { type: "object", additionalProperties: true },
          }),
          403: errorEnvelopeSchema([ERROR_CODES.users.FORBIDDEN_ROLE]),
        },
      },
    },
    async (request, reply) => {
      ensureAdminAccess(request.user?.role_name);
      const tenantId = request.tenant.id;
      const q = request.query ?? {};
      try {
        const rows = await aggregateFlowResponseOptions({
          tenantId,
          flowId: q.flowId,
          nodeId: q.nodeId,
          questionKey: q.questionKey,
          from: q.from,
          to: q.to,
        });
        return sendSuccess(request, reply, rows);
      } catch (err) {
        request.log.error(err);
        throw new ApiError(
          500,
          ERROR_CODES.reports.FLOW_RESPONSES_AGGREGATE_FAILED,
          "Erro ao agregar respostas de fluxo"
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
            role_name: {
              type: "string",
              enum: [
                "platform_admin",
                "admin_local",
                "supervisor",
                "agente",
              ],
            },
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
      const tenantMeta = await getTenantById(request.tenant.id);
      const tenantType =
        tenantMeta?.tenant_type === "platform" ? "platform" : "customer";
      if (!isAllowedRoleForTenant(role_name, tenantType)) {
        throw new ApiError(
          400,
          ERROR_CODES.users.ROLE_REQUIRED,
          "Perfil não permitido neste tenant"
        );
      }
      if (
        role_name === "platform_admin" &&
        !isPlatformAdmin(request.user?.role_name)
      ) {
        throw new ApiError(
          403,
          ERROR_CODES.users.FORBIDDEN_ROLE,
          "Apenas platform_admin pode criar outro platform_admin"
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
    "/agent/twilio/content-templates",
    {
      schema: {
        response: {
          200: successEnvelopeSchema({
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["contentSid", "friendlyName", "language", "variables"],
              properties: {
                contentSid: { type: "string" },
                friendlyName: { type: "string" },
                language: { type: ["string", "null"] },
                variables: { type: "array", items: { type: "string" } },
              },
            },
          }),
          502: errorEnvelopeSchema([ERROR_CODES.whatsapp.WHATSAPP_TWILIO_CONTENT_TEMPLATES_FAILED]),
        },
      },
    },
    async (request, reply) => {
      try {
        const data = await listTwilioContentTemplatesForTenant(request.tenant.id);
        return sendSuccess(request, reply, data);
      } catch (error) {
        request.log.error(error);
        throw new ApiError(
          502,
          ERROR_CODES.whatsapp.WHATSAPP_TWILIO_CONTENT_TEMPLATES_FAILED,
          error instanceof Error ? error.message : "Erro ao listar templates Twilio Content"
        );
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
                lifecycle_status: { type: "string", enum: ["open", "closed_manual", "closed_window"] },
                closed_at: { type: "string" },
                closed_by: { type: "string" },
                last_customer_message_at: { type: "string" },
                window_expires_at: { type: "string" },
                outside_service_window: { type: "boolean" },
                requires_template_to_resume: { type: "boolean" },
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
      sender_name?: string;
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
            sender_name: { type: "string" },
          },
        },
        response: {
          200: successEnvelopeSchema({
            type: "object",
            additionalProperties: true,
          }),
          409: errorEnvelopeSchema([ERROR_CODES.agent.AGENT_MESSAGE_SEND_FAILED]),
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
          {
            ...request.body,
            senderName: request.body.sender_name || request.user?.name || request.user?.email,
          }
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
        if (error instanceof AgentConversationRuleError) {
          throw new ApiError(409, ERROR_CODES.agent.AGENT_MESSAGE_SEND_FAILED, error.message, {
            rule: error.code,
          });
        }
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
    Params: { conversationId: string };
  }>(
    "/agent/conversations/:conversationId/close",
    {
      schema: {
        params: conversationIdParamSchema,
        response: {
          200: successEnvelopeSchema({
            type: "object",
            additionalProperties: true,
          }),
          404: errorEnvelopeSchema([ERROR_CODES.agent.AGENT_CONVERSATION_NOT_FOUND]),
          500: errorEnvelopeSchema([ERROR_CODES.agent.AGENT_CONVERSATION_CREATE_FAILED]),
        },
      },
    },
    async (request, reply) => {
      const { conversationId } = request.params;
      try {
        const updated = await closeAgentConversation({
          tenantId: request.tenant.id,
          conversationId,
          closedBy: request.user?.name || request.user?.email,
        });
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
          ERROR_CODES.agent.AGENT_CONVERSATION_CREATE_FAILED,
          "Erro ao encerrar conversa"
        );
      }
    }
  );

  fastify.post<{
    Params: { conversationId: string };
    Body: {
      templateName?: string;
      templateParams?: Record<string, string>;
      botName?: string;
    };
  }>(
    "/agent/conversations/:conversationId/reopen",
    {
      schema: {
        params: conversationIdParamSchema,
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            templateName: { type: "string" },
            templateParams: { type: "object", additionalProperties: { type: "string" } },
            botName: { type: "string" },
          },
        },
        response: {
          200: successEnvelopeSchema({
            type: "object",
            additionalProperties: true,
          }),
          404: errorEnvelopeSchema([ERROR_CODES.agent.AGENT_CONVERSATION_NOT_FOUND]),
          409: errorEnvelopeSchema([ERROR_CODES.agent.AGENT_MESSAGE_SEND_FAILED]),
          500: errorEnvelopeSchema([ERROR_CODES.agent.AGENT_CONVERSATION_CREATE_FAILED]),
        },
      },
    },
    async (request, reply) => {
      const { conversationId } = request.params;
      try {
        const updated = await reopenAgentConversation({
          tenantId: request.tenant.id,
          conversationId,
          reopenedBy: request.user?.name || request.user?.email,
          templateName: request.body.templateName?.trim() || undefined,
          templateParams: request.body.templateParams ?? {},
          botName: request.body.botName?.trim() || undefined,
        });
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
        if (error instanceof AgentConversationRuleError) {
          throw new ApiError(409, ERROR_CODES.agent.AGENT_MESSAGE_SEND_FAILED, error.message, {
            rule: error.code,
          });
        }
        if (error instanceof ApiError) throw error;
        throw new ApiError(
          500,
          ERROR_CODES.agent.AGENT_CONVERSATION_CREATE_FAILED,
          "Erro ao reabrir conversa"
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

  // ── Platform (tenant principal — platform_admin) ─────────────────────
  fastify.get(
    "/platform/tenants",
    {
      schema: {
        response: {
          200: successEnvelopeSchema({
            type: "array",
            items: {
              type: "object",
              additionalProperties: true,
            },
          }),
          403: errorEnvelopeSchema([ERROR_CODES.platform.PLATFORM_FORBIDDEN]),
          500: errorEnvelopeSchema([ERROR_CODES.platform.TENANTS_LIST_FAILED]),
        },
      },
    },
    async (request, reply) => {
      ensurePlatformAdmin(request.user?.role_name);
      try {
        await ensurePlatformTenantSchema();
        const tenants = await listCustomerTenants();
        return sendSuccess(request, reply, tenants);
      } catch (error) {
        request.log.error(error);
        throw new ApiError(
          500,
          ERROR_CODES.platform.TENANTS_LIST_FAILED,
          "Erro ao listar tenants de clientes"
        );
      }
    }
  );

  fastify.post<{
    Body: {
      name: string;
      slug: string;
      segment?: TenantSegment;
      plan?: string;
      initial_admin_name: string;
      initial_admin_email: string;
      initial_admin_password: string;
    };
  }>(
    "/platform/tenants",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: [
            "name",
            "slug",
            "initial_admin_name",
            "initial_admin_email",
            "initial_admin_password",
          ],
          properties: {
            name: { type: "string", minLength: 2 },
            slug: { type: "string", minLength: 2 },
            segment: {
              type: "string",
              enum: ["pesquisa", "atendimento", "captacao", "vendas", "misto"],
            },
            plan: { type: "string" },
            initial_admin_name: { type: "string", minLength: 2 },
            initial_admin_email: { type: "string", minLength: 5 },
            initial_admin_password: { type: "string", minLength: 6 },
          },
        },
        response: {
          201: successEnvelopeSchema({
            type: "object",
            additionalProperties: true,
          }),
          400: errorEnvelopeSchema([
            ERROR_CODES.platform.TENANT_SLUG_INVALID,
            ERROR_CODES.users.ROLE_REQUIRED,
          ]),
          403: errorEnvelopeSchema([ERROR_CODES.platform.PLATFORM_FORBIDDEN]),
          409: errorEnvelopeSchema([
            ERROR_CODES.platform.TENANT_SLUG_EXISTS,
            ERROR_CODES.users.USER_EMAIL_ALREADY_EXISTS,
          ]),
          500: errorEnvelopeSchema([ERROR_CODES.platform.TENANT_CREATE_FAILED]),
        },
      },
    },
    async (request, reply) => {
      ensurePlatformAdmin(request.user?.role_name);
      const body = request.body;
      try {
        await ensurePlatformTenantSchema();
        const result = await createCustomerTenant({
          name: body.name,
          slug: body.slug,
          segment: body.segment ?? null,
          plan: body.plan,
          initialAdmin: {
            name: body.initial_admin_name,
            email: body.initial_admin_email,
            password: body.initial_admin_password,
          },
        });
        return sendSuccess(request, reply, result, 201);
      } catch (error) {
        request.log.error(error);
        if (error instanceof Error) {
          if (error.message === "SLUG_ALREADY_EXISTS") {
            throw new ApiError(
              409,
              ERROR_CODES.platform.TENANT_SLUG_EXISTS,
              "Já existe um tenant com este slug"
            );
          }
          if (error.message === "INVALID_SLUG") {
            throw new ApiError(
              400,
              ERROR_CODES.platform.TENANT_SLUG_INVALID,
              "Slug inválido"
            );
          }
        }
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          (error as { code?: string }).code === "23505"
        ) {
          throw new ApiError(
            409,
            ERROR_CODES.users.USER_EMAIL_ALREADY_EXISTS,
            "Já existe um usuário com este e-mail na plataforma"
          );
        }
        throw new ApiError(
          500,
          ERROR_CODES.platform.TENANT_CREATE_FAILED,
          "Erro ao criar tenant de cliente"
        );
      }
    }
  );

  fastify.get(
    "/platform/session",
    {
      schema: {
        response: {
          200: successEnvelopeSchema({
            type: "object",
            additionalProperties: false,
            required: [
              "home_tenant_id",
              "acting_tenant_id",
              "is_impersonating",
              "role_name",
            ],
            properties: {
              home_tenant_id: { type: "string" },
              acting_tenant_id: { type: "string" },
              is_impersonating: { type: "boolean" },
              role_name: { type: "string" },
              acting_tenant_name: { type: "string" },
            },
          }),
        },
      },
    },
    async (request, reply) => {
      const home = request.homeTenantId ?? request.user?.tenant_id ?? "";
      const acting = request.actingTenantId ?? request.tenant.id;
      let actingName = request.tenant.name;
      if (acting !== request.tenant.id) {
        const t = await getTenantById(acting);
        if (t) actingName = t.name;
      }
      return sendSuccess(request, reply, {
        home_tenant_id: home,
        acting_tenant_id: acting,
        is_impersonating: home !== acting,
        role_name: request.user?.role_name ?? "agente",
        acting_tenant_name: actingName,
      });
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