"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redis = void 0;
exports.testRedisConnection = testRedisConnection;
const ioredis_1 = __importDefault(require("ioredis"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.redis = new ioredis_1.default({
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT || 6379),
});
async function testRedisConnection() {
    try {
        // Tentamos escrever, mas se der READONLY não vamos derrubar o servidor
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
            throw err; // outros erros ainda derrubam
        }
    }
}
