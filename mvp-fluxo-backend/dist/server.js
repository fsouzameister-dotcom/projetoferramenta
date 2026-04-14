"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const db_1 = require("./db");
const redis_1 = require("./redis");
const flows_1 = require("./flows");
const nodes_1 = require("./nodes");
dotenv_1.default.config();
const fastify = (0, fastify_1.default)({
    logger: true,
});
// ──────────────────────────────────────────────────────────────────
// CORS
// ──────────────────────────────────────────────────────────────────
fastify.register(cors_1.default, {
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
fastify.get("/tenants/:tenantId/flows", async (request, reply) => {
    const { tenantId } = request.params;
    try {
        const flows = await (0, flows_1.listFlowsByTenant)(tenantId);
        return { data: flows };
    }
    catch (err) {
        request.log.error(err);
        reply.code(500);
        return { error: "Erro ao listar flows" };
    }
});
fastify.get("/flows/:flowId", async (request, reply) => {
    const { flowId } = request.params;
    try {
        const flows = await (0, flows_1.listFlowsByTenant)("1be433d5-f15b-4764-9a85-e88f3bc88732");
        const flow = flows.find((f) => f.id === flowId);
        if (!flow) {
            reply.code(404);
            return { error: "Flow não encontrado" };
        }
        return { data: flow };
    }
    catch (err) {
        request.log.error(err);
        reply.code(500);
        return { error: "Erro ao buscar flow" };
    }
});
fastify.post("/tenants/:tenantId/flows", async (request, reply) => {
    const { tenantId } = request.params;
    const { name, channel } = request.body;
    if (!name || !channel) {
        reply.code(400);
        return { error: "Campos 'name' e 'channel' são obrigatórios." };
    }
    try {
        const flow = await (0, flows_1.createFlow)({
            tenantId,
            name,
            channel,
        });
        reply.code(201);
        return { data: flow };
    }
    catch (err) {
        request.log.error(err);
        reply.code(500);
        return { error: "Erro ao criar flow" };
    }
});
// ──────────────────────────────────────────────────────────────────
// NODES
// ──────────────────────────────────────────────────────────────────
fastify.get("/flows/:flowId/nodes", async (request, reply) => {
    const { flowId } = request.params;
    try {
        const nodes = await (0, nodes_1.listNodesByFlow)(flowId);
        return { data: nodes };
    }
    catch (err) {
        request.log.error(err);
        reply.code(500);
        return { error: "Erro ao listar nodes" };
    }
});
fastify.post("/flows/:flowId/nodes", async (request, reply) => {
    const { flowId } = request.params;
    const { type, name, config, is_start } = request.body;
    if (!type || !name) {
        reply.code(400);
        return { error: "Campos 'type' e 'name' são obrigatórios." };
    }
    try {
        const node = await (0, nodes_1.createNode)({
            flowId,
            type,
            name,
            config: config ?? {},
            isStart: is_start ?? false,
        });
        reply.code(201);
        return { data: node };
    }
    catch (err) {
        request.log.error(err);
        reply.code(500);
        return { error: "Erro ao criar node" };
    }
});
// ──────────────────────────────────────────────────────────────────
// ATUALIZAR NODE
// ──────────────────────────────────────────────────────────────────
fastify.put("/flows/:flowId/nodes/:nodeId", async (request, reply) => {
    const { nodeId } = request.params;
    const { type, name, config, is_start } = request.body;
    try {
        const node = await (0, nodes_1.updateNode)(nodeId, {
            type,
            name,
            config,
            is_start,
        });
        return { data: node };
    }
    catch (err) {
        request.log.error(err);
        reply.code(500);
        return { error: "Erro ao atualizar node" };
    }
});
// ──────────────────────────────────────────────────────────────────
// DELETAR NODE
// ──────────────────────────────────────────────────────────────────
fastify.delete("/flows/:flowId/nodes/:nodeId", async (request, reply) => {
    const { nodeId } = request.params;
    try {
        await (0, nodes_1.deleteNode)(nodeId);
        return { success: true };
    }
    catch (err) {
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
        await (0, db_1.testDbConnection)();
        await (0, redis_1.testRedisConnection)();
        const port = Number(process.env.PORT || 3000);
        await fastify.listen({ port, host: "0.0.0.0" });
        console.log(`API rodando em http://localhost:${port}`);
    }
    catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
}
start();
