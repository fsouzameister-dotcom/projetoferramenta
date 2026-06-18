import test from "node:test";
import assert from "node:assert/strict";
import { collectFlowEditorWarnings } from "../../mvp-fluxo-frontend/src/lib/flow-editor-validation.ts";

test("conversa com transitions não gera aviso de saída ausente", () => {
  const warnings = collectFlowEditorWarnings([
    {
      id: "c1",
      data: {
        label: "Saudação",
        type: "conversa",
        config: {
          transitions: [{ id: "t1", next_node_id: "c2", condition: "interesse" }],
        },
      },
    },
    {
      id: "c2",
      data: {
        label: "Próximo",
        type: "mensagem",
        config: { next_node_id: "c3" },
      },
    },
    {
      id: "c3",
      data: { label: "Fim", type: "encerramento", config: {} },
    },
  ]);
  assert.equal(
    warnings.some((w) => w.nodeId === "c1" && w.message.includes("Sem conexão")),
    false
  );
});

test("conversa global sem transitions não gera aviso de saída ausente", () => {
  const warnings = collectFlowEditorWarnings([
    {
      id: "g1",
      data: {
        label: "Atalhos globais",
        type: "conversa",
        config: { isGlobal: true, transitions: [] },
      },
    },
  ]);
  assert.equal(warnings.length, 0);
});

test("conversa sem transitions nem default ainda gera aviso", () => {
  const warnings = collectFlowEditorWarnings([
    {
      id: "bad",
      data: {
        label: "Conversa solta",
        type: "conversa",
        config: { transitions: [] },
      },
    },
  ]);
  assert.equal(
    warnings.some((w) => w.nodeId === "bad" && w.message.includes("Sem conexão")),
    true
  );
});
