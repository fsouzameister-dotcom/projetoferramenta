import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  detectHumanHandoffRequest,
  findPreferredHandoffNodeId,
} from "../src/flow-human-handoff";

describe("flow-human-handoff", () => {
  it("detecta pedido de humano", () => {
    assert.equal(detectHumanHandoffRequest("Me passe para um humano"), true);
    assert.equal(detectHumanHandoffRequest("quero falar com um atendente"), true);
    assert.equal(detectHumanHandoffRequest("Não fui transferido ainda"), true);
    assert.equal(detectHumanHandoffRequest("???"), true);
    assert.equal(detectHumanHandoffRequest("meu email é teste@x.com"), false);
  });

  it("encontra node transferir geral", () => {
    const id = findPreferredHandoffNodeId([
      {
        id: "a",
        type: "transferir_agente",
        name: "Transferir comercial",
        config: { queue: "Comercial" },
      },
      {
        id: "b",
        type: "transferir_agente",
        name: "Transferir geral",
        config: { queue: "Geral" },
      },
    ]);
    assert.equal(id, "b");
  });
});
