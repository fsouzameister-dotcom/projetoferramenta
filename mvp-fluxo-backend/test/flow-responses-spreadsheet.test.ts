import assert from "node:assert";
import { describe, test } from "node:test";

import { buildReportColumnsFromNodes } from "../src/flow-report-columns";

describe("flow-responses-spreadsheet", () => {
  test("monta colunas na ordem do fluxo com nome do node", () => {
    const columns = buildReportColumnsFromNodes([
      {
        id: "start",
        type: "inicio",
        name: "Início",
        is_start: true,
        config: { next_node_id: "cap1" },
      },
      {
        id: "cap1",
        type: "capturar_entrada",
        name: "Quer cadastrar?",
        config: {
          variableName: "quer_cadastrar",
          next_node_id: "recv1",
        },
      },
      {
        id: "recv1",
        type: "receber_mensagem",
        name: "Nome completo",
        config: {
          variableName: "nome_completo",
          prompt_key: "nome_completo",
          next_node_id: "end",
        },
      },
    ]);

    assert.equal(columns.length, 2);
    assert.equal(columns[0].header, "Quer cadastrar?");
    assert.equal(columns[0].questionKey, "quer_cadastrar");
    assert.equal(columns[1].header, "Nome completo");
    assert.equal(columns[1].questionKey, "nome_completo");
  });
});
