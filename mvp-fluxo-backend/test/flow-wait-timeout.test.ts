import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyResponseTimeoutVariables,
  isWaitTimeoutElapsed,
  parseFlowMessageSendDelayConfig,
  parseFlowWaitTimeoutConfig,
} from "../src/flow-wait-timeout";

describe("flow-wait-timeout", () => {
  it("parse wait timeout e saída on timeout", () => {
    const p = parseFlowWaitTimeoutConfig({
      wait_timeout_seconds: 120,
      next_node_id_on_timeout: "node-timeout",
    });
    assert.equal(p.waitTimeoutSeconds, 120);
    assert.equal(p.nextNodeIdOnTimeout, "node-timeout");
  });

  it("timeout desligado quando segundos = 0", () => {
    const p = parseFlowWaitTimeoutConfig({ wait_timeout_seconds: 0 });
    assert.equal(p.waitTimeoutSeconds, 0);
    assert.equal(p.nextNodeIdOnTimeout, null);
  });

  it("isWaitTimeoutElapsed após prazo", () => {
    const started = new Date(Date.now() - 61_000).toISOString();
    assert.equal(isWaitTimeoutElapsed(started, 60), true);
    assert.equal(isWaitTimeoutElapsed(started, 120), false);
  });

  it("send delay em mensagem (antes de enviar)", () => {
    const d = parseFlowMessageSendDelayConfig({ send_delay_seconds: 5 });
    assert.equal(d.sendDelaySeconds, 5);
    const legacy = parseFlowMessageSendDelayConfig({ delay_after_seconds: 3 });
    assert.equal(legacy.sendDelaySeconds, 3);
  });

  it("applyResponseTimeoutVariables", () => {
    const vars: Record<string, unknown> = {};
    applyResponseTimeoutVariables(vars, "mensagem_recebida");
    assert.equal(vars.response_timed_out, true);
    assert.equal(vars.mensagem_recebida_timed_out, true);
  });
});
