import "dotenv/config";

import { buildApp } from "./app";
import { testDbConnection } from "./db";
import { testRedisConnection } from "./redis";

async function main() {
  const app = await buildApp();

  try {
    await testDbConnection();
    await testRedisConnection();

    const port = Number(process.env.PORT || 3000);
    await app.listen({ port, host: "0.0.0.0" });
    console.log(`API rodando em http://0.0.0.0:${port}`);
  } catch (err) {
    app.log.error(err);
    await app.close();
    process.exit(1);
  }
}

main();
