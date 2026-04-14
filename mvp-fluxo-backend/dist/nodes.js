"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listNodesByFlow = listNodesByFlow;
exports.createNode = createNode;
exports.updateNode = updateNode;
exports.deleteNode = deleteNode;
const db_1 = require("./db");
// Listar nodes de um fluxo
async function listNodesByFlow(flowId) {
    const { rows } = await db_1.pool.query(`SELECT * FROM nodes WHERE flow_id = $1 ORDER BY created_at ASC`, [flowId]);
    return rows;
}
async function createNode(input) {
    const { flowId, type, name, config, isStart } = input;
    const { rows } = await db_1.pool.query(`
    INSERT INTO nodes (flow_id, type, name, config, is_start)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
    `, [flowId, type, name, config, isStart ?? false]);
    return rows[0];
}
async function updateNode(nodeId, input) {
    const { type, name, config, is_start } = input;
    const { rows } = await db_1.pool.query(`
    UPDATE nodes
    SET 
      type = COALESCE($1, type),
      name = COALESCE($2, name),
      config = COALESCE($3, config),
      is_start = COALESCE($4, is_start),
      updated_at = NOW()
    WHERE id = $5
    RETURNING *
    `, [type, name, config, is_start, nodeId]);
    if (!rows.length) {
        throw new Error("Node não encontrado");
    }
    return rows[0];
}
// Deletar node
async function deleteNode(nodeId) {
    await db_1.pool.query(`DELETE FROM nodes WHERE id = $1`, [nodeId]);
}
