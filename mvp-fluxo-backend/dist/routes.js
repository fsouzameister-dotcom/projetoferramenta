"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupRoutes = setupRoutes;
const flowsService = __importStar(require("./flows"));
const nodesService = __importStar(require("./nodes"));
async function setupRoutes(app) {
    // ==================== FLOWS ====================
    // GET /tenants/:tenantId/flows
    app.get("/tenants/:tenantId/flows", async (request, reply) => {
        try {
            const { tenantId } = request.params;
            const flows = await flowsService.listFlowsByTenant(tenantId);
            reply.send({ data: flows });
        }
        catch (error) {
            console.error("Erro ao listar flows:", error);
            reply.status(500).send({ error: "Erro ao listar flows" });
        }
    });
    // GET /flows/:flowId
    app.get("/flows/:flowId", async (request, reply) => {
        try {
            const { flowId } = request.params;
            const flow = await flowsService.getFlowById(flowId);
            if (!flow) {
                return reply.status(404).send({ error: "Flow não encontrado" });
            }
            reply.send({ data: flow });
        }
        catch (error) {
            console.error("Erro ao buscar flow:", error);
            reply.status(500).send({ error: "Erro ao buscar flow" });
        }
    });
    // POST /tenants/:tenantId/flows
    app.post("/tenants/:tenantId/flows", async (request, reply) => {
        try {
            const { tenantId } = request.params;
            const { name, channel } = request.body;
            const flow = await flowsService.createFlow({
                tenantId,
                name,
                channel,
            });
            reply.status(201).send({ data: flow });
        }
        catch (error) {
            console.error("Erro ao criar flow:", error);
            reply.status(500).send({ error: "Erro ao criar flow" });
        }
    });
    // ==================== NODES ====================
    // GET /flows/:flowId/nodes
    app.get("/flows/:flowId/nodes", async (request, reply) => {
        try {
            const { flowId } = request.params;
            const nodes = await nodesService.listNodesByFlow(flowId);
            reply.send({ data: nodes });
        }
        catch (error) {
            console.error("Erro ao listar nodes:", error);
            reply.status(500).send({ error: "Erro ao listar nodes" });
        }
    });
    // POST /flows/:flowId/nodes
    app.post("/flows/:flowId/nodes", async (request, reply) => {
        try {
            const { flowId } = request.params;
            const { type, name, config, is_start } = request.body;
            const node = await nodesService.createNode({
                flowId,
                type,
                name,
                config,
                isStart: is_start ?? false,
            });
            reply.status(201).send({ data: node });
        }
        catch (error) {
            console.error("Erro ao criar node:", error);
            reply.status(500).send({ error: "Erro ao criar node" });
        }
    });
    // PUT /flows/:flowId/nodes/:nodeId
    app.put("/flows/:flowId/nodes/:nodeId", async (request, reply) => {
        try {
            const { nodeId } = request.params;
            const { name, type, config, is_start } = request.body;
            const updatedNode = await nodesService.updateNode(nodeId, {
                name,
                type,
                config,
                is_start,
            });
            reply.send({ data: updatedNode });
        }
        catch (error) {
            console.error("Erro ao atualizar node:", error);
            reply.status(500).send({ error: "Erro ao atualizar node" });
        }
    });
    // DELETE /flows/:flowId/nodes/:nodeId
    app.delete("/flows/:flowId/nodes/:nodeId", async (request, reply) => {
        try {
            const { nodeId } = request.params;
            await nodesService.deleteNode(nodeId);
            reply.send({ success: true });
        }
        catch (error) {
            console.error("Erro ao deletar node:", error);
            reply.status(500).send({ error: "Erro ao deletar node" });
        }
    });
}
