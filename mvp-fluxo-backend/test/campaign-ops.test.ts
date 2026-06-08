import assert from "node:assert";
import { describe, test } from "node:test";

import {
  buildTemplateParams,
  nextStatusAfterStaleSending,
} from "../src/campaign-utils";
import { renderTemplatePreview } from "../src/campaign-utils";

describe("campaign-ops", () => {
  test("buildTemplateParams mapeia colunas da planilha", () => {
    const params = buildTemplateParams(
      { "1": "Nome", "2": "Cidade" },
      { Nome: "Maria", Cidade: "SP" }
    );
    assert.deepStrictEqual(params, { "1": "Maria", "2": "SP" });
  });

  test("nextStatusAfterStaleSending retenta uma vez antes de falhar", () => {
    assert.deepStrictEqual(nextStatusAfterStaleSending(0), { status: "pending" });
    assert.deepStrictEqual(nextStatusAfterStaleSending(1), {
      status: "failed",
      errorDescription: "Timeout no envio (stale sending)",
    });
  });

  test("renderTemplatePreview substitui variáveis do template", () => {
    const preview = renderTemplatePreview(
      "Olá {{1}}, bem-vindo à {{2}}!",
      { "1": "Nome", "2": "Empresa" },
      { Nome: "Ana", Empresa: "Fox" }
    );
    assert.strictEqual(preview, "Olá Ana, bem-vindo à Fox!");
  });
});
