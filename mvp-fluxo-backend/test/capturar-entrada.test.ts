import assert from "node:assert";
import { describe, test } from "node:test";

import {
  formatCapturarEntradaPrompt,
  parseCapturarEntradaConfig,
  resolveCapturarEntradaInput,
} from "../src/capturar-entrada";
import { ApiError } from "../src/http";

describe("capturar_entrada", () => {
  const baseConfig = {
    prompt: "Escolha até três opções:",
    promptKey: "interesses",
    inputMode: "multi_choice",
    minSelections: 1,
    maxSelections: 3,
    variableName: "interesses",
    options: [
      { id: "fin", label: "Financiamento" },
      { id: "seg", label: "Seguro" },
      { id: "srv", label: "Serviços" },
      { id: "pec", label: "Peças" },
    ],
    next_node_id: "next-1",
  };

  test("parseCapturarEntradaConfig aplica defaults de multi_choice", () => {
    const parsed = parseCapturarEntradaConfig(baseConfig, "node-abc");
    assert.strictEqual(parsed.inputMode, "multi_choice");
    assert.strictEqual(parsed.maxSelections, 3);
    assert.strictEqual(parsed.promptKey, "interesses");
    assert.strictEqual(parsed.options.length, 4);
  });

  test("formatCapturarEntradaPrompt inclui instrução e opções", () => {
    const parsed = parseCapturarEntradaConfig(baseConfig, "node-abc");
    const text = formatCapturarEntradaPrompt(parsed);
    assert.ok(text.includes("Escolha até três opções"));
    assert.ok(text.includes("Financiamento"));
    assert.ok(text.includes("[fin]"));
  });

  test("resolveCapturarEntradaInput aceita ids em array", () => {
    const parsed = parseCapturarEntradaConfig(baseConfig, "node-abc");
    const resolved = resolveCapturarEntradaInput(parsed, ["fin", "seg"]);
    assert.deepStrictEqual(resolved.value, ["fin", "seg"]);
    assert.strictEqual(resolved.selectedOptions.length, 2);
    assert.strictEqual(resolved.nextNodeId, "next-1");
  });

  test("resolveCapturarEntradaInput aceita texto separado por vírgula", () => {
    const parsed = parseCapturarEntradaConfig(baseConfig, "node-abc");
    const resolved = resolveCapturarEntradaInput(parsed, "fin, srv");
    assert.deepStrictEqual(resolved.value, ["fin", "srv"]);
  });

  test("rejeita mais opções que maxSelections", () => {
    const parsed = parseCapturarEntradaConfig(baseConfig, "node-abc");
    assert.throws(
      () => resolveCapturarEntradaInput(parsed, ["fin", "seg", "srv", "pec"]),
      (err: unknown) => err instanceof ApiError && err.statusCode === 400
    );
  });

  test("rejeita opção inválida", () => {
    const parsed = parseCapturarEntradaConfig(baseConfig, "node-abc");
    assert.throws(
      () => resolveCapturarEntradaInput(parsed, ["xyz"]),
      (err: unknown) => err instanceof ApiError && err.statusCode === 400
    );
  });

  test("single_choice aceita uma opção por label", () => {
    const parsed = parseCapturarEntradaConfig(
      { ...baseConfig, inputMode: "single_choice", maxSelections: 1 },
      "node-abc"
    );
    const resolved = resolveCapturarEntradaInput(parsed, "Seguro");
    assert.strictEqual(resolved.value, "seg");
  });

  test("single_choice aceita variação sem hífen (Fox Cadastrar-se)", () => {
    const parsed = parseCapturarEntradaConfig(
      {
        prompt: "Responda Cadastrar-se ou Agora não",
        inputMode: "single_choice",
        variableName: "quer_cadastrar",
        options: [
          { id: "cadastrar-se", label: "Cadastrar-se" },
          { id: "agora-nao", label: "Agora não" },
        ],
      },
      "node-fox"
    );
    const sim = resolveCapturarEntradaInput(parsed, "cadastrar se");
    assert.strictEqual(sim.value, "cadastrar-se");
    const nao = resolveCapturarEntradaInput(parsed, "agora nao");
    assert.strictEqual(nao.value, "agora-nao");
  });
});
