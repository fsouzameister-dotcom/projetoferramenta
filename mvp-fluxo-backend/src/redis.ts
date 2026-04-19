import Redis from "ioredis";
import { REDIS_HOST, REDIS_PORT } from "./config";

export const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
});

export async function testRedisConnection() {
  try {
    await redis.set("mvp:test", "ok", "EX", 10);
    const value = await redis.get("mvp:test");
    console.log("Redis conectado. Teste (write ok):", value);
  } catch (err: unknown) {
    const msg = String((err as { message?: string })?.message || err);
    if (msg.includes("READONLY")) {
      console.warn("Redis conectado, mas em modo replica (somente leitura).");
    } else {
      console.error("Erro ao conectar no Redis:", err);
      throw err;
    }
  }
}
