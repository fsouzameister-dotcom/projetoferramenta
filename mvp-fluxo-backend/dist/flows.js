"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listFlowsByTenant = listFlowsByTenant;
exports.getFlowById = getFlowById;
exports.createFlow = createFlow;
const db_1 = require("./db");
// Listar flows de um tenant
async function listFlowsByTenant(tenantId) {
    const { rows } = await db_1.pool.query(`SELECT * FROM flows WHERE tenant_id = $1 ORDER BY created_at DESC`, [tenantId]);
    return rows;
}
// Buscar flow por ID
async function getFlowById(flowId) {
    const { rows } = await db_1.pool.query(`SELECT * FROM flows WHERE id = $1`, [flowId]);
    return rows[0] || null;
}
async function createFlow(input) {
    const { tenantId, name, channel } = input;
    const { rows } = await db_1.pool.query(`
    INSERT INTO flows (tenant_id, name, channel)
    VALUES ($1, $2, $3)
    RETURNING *
    `, [tenantId, name, channel]);
    return rows[0];
}
