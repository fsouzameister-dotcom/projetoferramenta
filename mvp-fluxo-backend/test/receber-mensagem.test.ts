import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildReceberMensagemAwaiting,
  parseReceberMensagemConfig,
  toCapturarEntradaConfigFromReceber,
} from "../src/receber-mensagem";

describe("receber_mensagem", () => {
  it("parse aplica defaults", () => {
    const p = parseReceberMensagemConfig({}, "node-abc12345");
    assert.equal(p.variableName, "mensagem_recebida");
    assert.ok(p.promptKey.startsWith("recebimento_"));
    assert.equal(p.waitHint, "");
    assert.equal(p.nextNodeId, null);
  });

  it("toCapturarEntradaConfigFromReceber força modo texto e repassa timeout", () => {
    const receber = parseReceberMensagemConfig(
      {
        wait_hint: "Envie sua dúvida",
        variableName: "texto_cliente",
        promptKey: "duvida",
        wait_timeout_seconds: 90,
        next_node_id_on_timeout: "timeout-node",
      },
      "n1"
    );
    const raw = toCapturarEntradaConfigFromReceber(receber);
    assert.equal(raw.inputMode, "text");
    assert.equal(raw.variableName, "texto_cliente");
    assert.equal(raw.prompt, "Envie sua dúvida");
    assert.equal(raw.promptKey, "duvida");
    assert.equal(raw.wait_timeout_seconds, 90);
    assert.equal(raw.next_node_id_on_timeout, "timeout-node");
  });

  it("buildReceberMensagemAwaiting expõe prompt e variável", () => {
    const awaiting = buildReceberMensagemAwaiting("n1", {
      wait_hint: "Aguardando…",
      variableName: "msg",
      promptKey: "inbound",
    });
    assert.equal(awaiting.nodeId, "n1");
    assert.equal(awaiting.variableName, "msg");
    assert.ok(awaiting.prompt.includes("Aguardando"));
  });
});
