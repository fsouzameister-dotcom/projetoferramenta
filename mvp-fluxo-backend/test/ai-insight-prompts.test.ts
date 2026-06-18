import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInsightSystemPrompt,
  parseInsightResultFromModel,
} from "../src/ai-insight-prompts.js";

test("buildInsightSystemPrompt compõe base + template + override", () => {
  const prompt = buildInsightSystemPrompt({
    templateSystemPrompt: "Foque em NPS.",
    promptOverride: "Priorize fila comercial.",
  });
  assert.match(prompt, /JSON válido/);
  assert.match(prompt, /Foque em NPS/);
  assert.match(prompt, /Priorize fila comercial/);
});

test("parseInsightResultFromModel normaliza campos do JSON", () => {
  const parsed = parseInsightResultFromModel(
    {
      summary: "Resumo executivo.",
      highlights: ["Bom tempo de resposta"],
      risks: ["Abandono alto"],
      opportunities: ["Treinar equipe"],
      metrics: { totalConversas: 12 },
    },
    ""
  );
  assert.equal(parsed.summary, "Resumo executivo.");
  assert.deepEqual(parsed.highlights, ["Bom tempo de resposta"]);
  assert.equal(parsed.metrics.totalConversas, 12);
});

test("parseInsightResultFromModel usa texto bruto quando JSON inválido", () => {
  const parsed = parseInsightResultFromModel(null, "Texto livre do modelo");
  assert.equal(parsed.summary, "Texto livre do modelo");
  assert.deepEqual(parsed.highlights, []);
});
