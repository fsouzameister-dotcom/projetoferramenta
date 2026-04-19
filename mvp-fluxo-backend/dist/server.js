"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const app_1 = require("./app");
const db_1 = require("./db");
const redis_1 = require("./redis");
async function main() {
    const app = await (0, app_1.buildApp)();
    try {
        await (0, db_1.testDbConnection)();
        await (0, redis_1.testRedisConnection)();
        const port = Number(process.env.PORT || 3000);
        await app.listen({ port, host: "0.0.0.0" });
        console.log(`API rodando em http://0.0.0.0:${port}`);
    }
    catch (err) {
        app.log.error(err);
        await app.close();
        process.exit(1);
    }
}
main();
