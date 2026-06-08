import assert from "node:assert";
import { describe, test } from "node:test";

import { buildCaptureRetryPrompt, resolveFlowTemplate } from "../src/flow-template";

describe("flow-template", () => {
  test("resolveFlowTemplate substitui variáveis do fluxo", () => {
    const text = resolveFlowTemplate(
      "Qual o nome do(a) filho(a) {{filho_indice}}?",
      { filho_indice: 1 }
    );
    assert.strictEqual(text, "Qual o nome do(a) filho(a) 1?");
  });

  test("buildCaptureRetryPrompt interpola invalid_prompt com variáveis", () => {
    const retry = buildCaptureRetryPrompt(
      { filho_indice: 2 },
      "Não entendi. Qual o nome do(a) filho(a) {{filho_indice}}?",
      ""
    );
    assert.strictEqual(
      retry,
      "Não entendi. Qual o nome do(a) filho(a) 2?"
    );
  });

  test("buildCaptureRetryPrompt inclui pergunta renderizada quando existir", () => {
    const retry = buildCaptureRetryPrompt(
      { filho_indice: 1 },
      "Use DD/MM/AAAA.",
      "Qual a data de nascimento do(a) filho(a) 1?"
    );
    assert.strictEqual(
      retry,
      "Use DD/MM/AAAA.\n\nQual a data de nascimento do(a) filho(a) 1?"
    );
  });
});
