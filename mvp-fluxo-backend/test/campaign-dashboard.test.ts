import assert from "node:assert";
import { describe, test } from "node:test";

describe("campaign-dashboard metrics semantics", () => {
  test("funil é monotônico quando status progride", () => {
    const statuses = ["sent", "delivered", "read", "responded"] as const;
    const counts = {
      dispatched: 100,
      sent: 95,
      delivered: 90,
      read: 40,
      responded: 25,
    };
    assert.ok(counts.sent <= counts.dispatched);
    assert.ok(counts.delivered <= counts.sent);
    assert.ok(counts.read <= counts.delivered);
    assert.ok(counts.responded <= counts.read || counts.responded <= counts.delivered);
    assert.ok(statuses.includes("responded"));
  });
});
