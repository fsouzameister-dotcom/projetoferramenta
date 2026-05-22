import "dotenv/config";

import { buildApp } from "./app";
import { HOST } from "./config";
import { testDbConnection } from "./db";
import { testRedisConnection } from "./redis";
import { startFlowWaitScheduler } from "./flow-wait-scheduler";

async function main() {
  const app = await buildApp();

  try {
    await testDbConnection();
    await testRedisConnection();

    const port = Number(process.env.PORT || 3000);
    await app.listen({ port, host: HOST });
    startFlowWaitScheduler();
    console.log(`API rodando em http://${HOST}:${port}`);
  } catch (err) {
    app.log.error(err);
    await app.close();
    process.exit(1);
  }
}

main();
