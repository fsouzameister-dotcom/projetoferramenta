import "dotenv/config";
import assert from "node:assert";
import { after, describe, test } from "node:test";

import { buildApp } from "../src/app";

describe("API smoke", () => {
  const appPromise = buildApp({ logger: false });

  after(async () => {
    const app = await appPromise;
    await app.close();
  });

  test("GET /health retorna ok", async () => {
    const app = await appPromise;
    const res = await app.inject({ method: "GET", url: "/health" });
    assert.strictEqual(res.statusCode, 200);
    const payload = JSON.parse(res.payload);
    assert.strictEqual(payload.data.status, "ok");
    assert.ok(payload.meta.requestId);
  });

  test("GET /api/flows sem x-tenant-id retorna 400", async () => {
    const app = await appPromise;
    const res = await app.inject({ method: "GET", url: "/api/flows" });
    assert.strictEqual(res.statusCode, 400);
    const payload = JSON.parse(res.payload);
    assert.strictEqual(payload.error.code, "TENANT_HEADER_REQUIRED");
  });

  test("GET /api/flows com tenant inexistente retorna 404", async () => {
    const app = await appPromise;
    const res = await app.inject({
      method: "GET",
      url: "/api/flows",
      headers: { "x-tenant-id": "00000000-0000-0000-0000-000000000000" },
    });
    assert.strictEqual(res.statusCode, 404);
    const payload = JSON.parse(res.payload);
    assert.strictEqual(payload.error.code, "TENANT_NOT_FOUND");
  });
});
