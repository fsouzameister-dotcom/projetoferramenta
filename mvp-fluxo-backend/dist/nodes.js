"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listNodesByFlow = listNodesByFlow;
exports.createNode = createNode;
exports.updateNode = updateNode;
exports.deleteNode = deleteNode;
const db_1 = require("./db");
async function listNodesByFlow(flowId, tenantId) {
    const client = await db_1.pool.connect();
    try {
        const flowCheck = await client.query(`SELECT id FROM flows WHERE id = $1 AND tenant_id = $2`, [flowId, tenantId]);
        if (flowCheck.rows.length === 0) {
            throw new Error("Flow not found or does not belong to this tenant");
        }
        const result = await client.query(`SELECT * FROM nodes WHERE flow_id = $1`, [flowId]);
        return result.rows;
    }
    finally {
        client.release();
    }
}
async function createNode(data, tenantId) {
    const client = await db_1.pool.connect();
    try {
        const flowCheck = await client.query(`SELECT id FROM flows WHERE id = $1 AND tenant_id = $2`, [data.flowId, tenantId]);
        if (flowCheck.rows.length === 0) {
            throw new Error("Flow not found or does not belong to this tenant");
        }
        const result = await client.query(`INSERT INTO nodes (id, flow_id, type, name, config, is_start) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5) RETURNING *`, [
            data.flowId,
            data.type,
            data.name,
            data.config ?? {},
            data.isStart ?? false,
        ]);
        return result.rows[0];
    }
    finally {
        client.release();
    }
}
async function updateNode(nodeId, data, tenantId, flowId) {
    const client = await db_1.pool.connect();
    try {
        const nodeCheck = await client.query(`SELECT n.id FROM nodes n JOIN flows f ON n.flow_id = f.id WHERE n.id = $1 AND f.id = $2 AND f.tenant_id = $3`, [nodeId, flowId, tenantId]);
        if (nodeCheck.rows.length === 0) {
            throw new Error("Node not found or does not belong to this tenant");
        }
        const setClauses = [];
        const values = [];
        let paramIndex = 1;
        if (data.type !== undefined) {
            setClauses.push(`type = $${paramIndex++}`);
            values.push(data.type);
        }
        if (data.name !== undefined) {
            setClauses.push(`name = $${paramIndex++}`);
            values.push(data.name);
        }
        if (data.config !== undefined) {
            setClauses.push(`config = $${paramIndex++}`);
            values.push(data.config);
        }
        if (data.is_start !== undefined) {
            setClauses.push(`is_start = $${paramIndex++}`);
            values.push(data.is_start);
        }
        if (setClauses.length === 0) {
            return null;
        }
        values.push(nodeId);
        const result = await client.query(`UPDATE nodes SET ${setClauses.join(", ")} WHERE id = $${paramIndex} RETURNING *`, values);
        return result.rows[0] || null;
    }
    finally {
        client.release();
    }
}
async function deleteNode(nodeId, tenantId, flowId) {
    const client = await db_1.pool.connect();
    try {
        const nodeCheck = await client.query(`SELECT n.id FROM nodes n JOIN flows f ON n.flow_id = f.id WHERE n.id = $1 AND f.id = $2 AND f.tenant_id = $3`, [nodeId, flowId, tenantId]);
        if (nodeCheck.rows.length === 0) {
            throw new Error("Node not found or does not belong to this tenant");
        }
        await client.query(`DELETE FROM nodes WHERE id = $1`, [nodeId]);
    }
    finally {
        client.release();
    }
}
