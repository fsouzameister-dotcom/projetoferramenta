import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  executeEncerramentoNode,
  parseEncerramentoConfig,
} from "../src/encerramento";

describe("encerramento", () => {
  it("parse reason_key padrão", () => {
    const p = parseEncerramentoConfig({});
    assert.equal(p.reasonKey, "flow_completed");
  });

  it("execute encerra com variáveis e mensagem", () => {
    const vars: Record<string, unknown> = {};
    const r = executeEncerramentoNode({
      config: { end_message: "Obrigado!", reason_key: "pesquisa_ok" },
      variables: vars,
    });
    assert.equal(vars.flow_status, "ended");
    assert.equal(vars.flow_end_reason, "pesquisa_ok");
    assert.equal(r.nextNodeId, null);
    assert.equal(r.message, "Obrigado!");
    assert.equal(r.details.flowEnded, true);
  });
});
