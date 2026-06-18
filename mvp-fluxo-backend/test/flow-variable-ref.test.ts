import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeFlowVariableName,
  normalizeMensagemTestUserInput,
} from "../src/flow-executor-utils.js";

test("normalizeFlowVariableName remove chaves duplicadas e espaços", () => {
  assert.equal(normalizeFlowVariableName("{{{{mensagem_recebida}}}}"), "mensagem_recebida");
  assert.equal(normalizeFlowVariableName("{{mensagem recebida}}"), "mensagem_recebida");
  assert.equal(normalizeFlowVariableName("mensagem_recebida"), "mensagem_recebida");
});

test("normalizeMensagemTestUserInput mapeia id do botão para label", () => {
  const parsed = {
    interactiveType: "buttons" as const,
    buttons: [
      { id: "btn_1", label: "Sim" },
      { id: "btn_2", label: "Não" },
    ],
    listItems: [],
  };
  assert.equal(normalizeMensagemTestUserInput(parsed, "btn_1"), "Sim");
  assert.equal(normalizeMensagemTestUserInput(parsed, "Sim"), "Sim");
});
