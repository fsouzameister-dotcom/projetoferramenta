"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redis = void 0;
exports.testRedisConnection = testRedisConnection;
const ioredis_1 = __importDefault(require("ioredis"));
const config_1 = require("./config");
exports.redis = new ioredis_1.default({
    host: config_1.REDIS_HOST,
    port: config_1.REDIS_PORT,
});
async function testRedisConnection() {
    try {
        await exports.redis.set("mvp:test", "ok", "EX", 10);
        const value = await exports.redis.get("mvp:test");
        console.log("Redis conectado. Teste (write ok):", value);
    }
    catch (err) {
        const msg = String(err?.message || err);
        if (msg.includes("READONLY")) {
            console.warn("Redis conectado, mas em modo replica (somente leitura).");
        }
        else {
            console.error("Erro ao conectar no Redis:", err);
            throw err;
        }
    }
}
