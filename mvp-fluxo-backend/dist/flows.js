"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listFlowsByTenant = listFlowsByTenant;
exports.createFlow = createFlow;
const db_1 = require("./db");
async function listFlowsByTenant(tenantId) {
    const client = await db_1.pool.connect();
    try {
        const result = await client.query(`SELECT id, tenant_id, name, channel FROM flows WHERE tenant_id = $1`, [tenantId]);
        return result.rows;
    }
    finally {
        client.release();
    }
}
async function createFlow(data) {
    const client = await db_1.pool.connect();
    try {
        const result = await client.query(`INSERT INTO flows (id, tenant_id, name, channel) VALUES (gen_random_uuid(), $1, $2, $3) RETURNING *`, [data.tenantId, data.name, data.channel]);
        return result.rows[0];
    }
    finally {
        client.release();
    }
}
