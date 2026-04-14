import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

export const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT || 6379),
});

export async function testRedisConnection() {
  try {
    // Tentamos escrever, mas se der READONLY não vamos derrubar o servidor
    await redis.set("mvp:test", "ok", "EX", 10);
    const value = await redis.get("mvp:test");
    console.log("Redis conectado. Teste (write ok):", value);
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (msg.includes("READONLY")) {
      console.warn("Redis conectado, mas em modo replica (somente leitura).");
    } else {
      console.error("Erro ao conectar no Redis:", err);
      throw err; // outros erros ainda derrubam
    }
  }
}