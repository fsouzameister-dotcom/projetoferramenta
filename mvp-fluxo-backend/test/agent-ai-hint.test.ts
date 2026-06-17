import assert from "node:assert";
import { describe, test } from "node:test";

import {
  buildAgentHintFallback,
  buildAgentHintUserPrompt,
  isLikelyCustomerFacingHint,
  normalizeAgentHintText,
} from "../src/agent-ai-hint";

describe("agent-ai-hint", () => {
  test("buildAgentHintUserPrompt pede dica ao agente", () => {
    const prompt = buildAgentHintUserPrompt({
      contactName: "Maria",
      tags: ["vip"],
      recentMessages: ["Quero cancelar"],
    });
    assert.match(prompt, /AGENTE/i);
    assert.match(prompt, /Maria/);
    assert.match(prompt, /Quero cancelar/);
  });

  test("buildAgentHintFallback orienta o agente", () => {
    const hint = buildAgentHintFallback({
      contactName: "João",
      tags: [],
      recentMessages: ["Estou muito insatisfeito com o atraso"],
    });
    assert.match(hint, /Valide/i);
    assert.doesNotMatch(hint, /Como posso ajudar/i);
  });

  test("isLikelyCustomerFacingHint detecta mensagem ao cliente", () => {
    assert.strictEqual(isLikelyCustomerFacingHint("Olá Maria, como posso ajudar?"), true);
    assert.strictEqual(
      isLikelyCustomerFacingHint("Confirme com o cliente o motivo do contato antes de ofertar."),
      false
    );
  });

  test("normalizeAgentHintText remove aspas e limita tamanho", () => {
    assert.strictEqual(normalizeAgentHintText('"Confirme o pedido."'), "Confirme o pedido.");
    assert.strictEqual(normalizeAgentHintText("x".repeat(300)).length, 220);
  });
});
