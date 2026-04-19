"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
exports.testDbConnection = testDbConnection;
const pg_1 = require("pg");
const config_1 = require("./config");
exports.pool = new pg_1.Pool({
    host: config_1.PG_HOST,
    port: config_1.PG_PORT,
    user: config_1.PG_USER,
    password: config_1.PG_PASSWORD,
    database: config_1.PG_DATABASE,
});
async function testDbConnection() {
    const client = await exports.pool.connect();
    try {
        const { rows } = await client.query("SELECT NOW() as now");
        console.log("Postgres conectado. NOW():", rows[0].now);
    }
    finally {
        client.release();
    }
}
