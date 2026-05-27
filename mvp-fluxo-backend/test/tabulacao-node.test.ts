import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { executeTabulacaoNode, parseTabulacaoNodeConfig } from "../src/tabulacao-node";

describe("tabulacao-node", () => {
  it("parseia config com fallback", () => {
    const parsed = parseTabulacaoNodeConfig({
      tabulacao_label: "Abandono no meio",
      variable_name: "status_final",
    });
    assert.equal(parsed.tabulacaoKey, "tabulacao");
    assert.equal(parsed.tabulacaoLabel, "Abandono no meio");
    assert.equal(parsed.variableName, "status_final");
    assert.equal(parsed.questionKey, "tabulacao");
  });

  it("executa e preenche variáveis", () => {
    const vars: Record<string, unknown> = {};
    const result = executeTabulacaoNode({
      config: {
        tabulacao_key: "recusa",
        tabulacao_label: "Recusa",
        variable_name: "desfecho",
        next_node_id: "node-2",
      },
      variables: vars,
    });
    assert.equal(result.nextNodeId, "node-2");
    assert.deepEqual(result.selectedOption, { id: "recusa", label: "Recusa" });
    assert.equal(vars.desfecho, "recusa");
    assert.equal(vars.flow_tabulacao, "recusa");
  });
});
