import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  executeContadorPassagensNode,
  parseContadorPassagensConfig,
} from "../src/contador-passagens";

describe("contador_passagens", () => {
  it("parse defaults", () => {
    const p = parseContadorPassagensConfig({}, "node-abc12345");
    assert.equal(p.limitePassagens, 3);
    assert.ok(p.variableName.startsWith("contador_"));
    assert.equal(p.increment, 1);
  });

  it("incrementa e segue within até ultrapassar limite", () => {
    const vars: Record<string, unknown> = {};
    const cfg = {
      limite_passagens: 2,
      variableName: "erros",
      next_node_id_within: "retry-node",
      next_node_id_exceeded: "block-node",
    };

    let r = executeContadorPassagensNode({
      config: cfg,
      nodeId: "n1",
      variables: vars,
    });
    assert.equal(vars.erros, 1);
    assert.equal(r.nextNodeId, "retry-node");
    assert.equal(r.details.exceeded, false);

    r = executeContadorPassagensNode({ config: cfg, nodeId: "n1", variables: vars });
    assert.equal(vars.erros, 2);
    assert.equal(r.nextNodeId, "retry-node");

    r = executeContadorPassagensNode({ config: cfg, nodeId: "n1", variables: vars });
    assert.equal(vars.erros, 3);
    assert.equal(r.nextNodeId, "block-node");
    assert.equal(r.details.exceeded, true);
    assert.equal(vars.erros_ultrapassou, true);
  });
});
