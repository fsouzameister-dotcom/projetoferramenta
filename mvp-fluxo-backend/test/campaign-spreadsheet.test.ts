import assert from "node:assert";
import { describe, test } from "node:test";

import { findPhoneColumn, parseSpreadsheetBuffer } from "../src/campaign-spreadsheet";

describe("campaign-spreadsheet", () => {
  test("findPhoneColumn detecta coluna Telefone", () => {
    assert.strictEqual(findPhoneColumn(["Nome", "Telefone", "Cidade"]), "Telefone");
  });

  test("findPhoneColumn ignora acentos e espaços", () => {
    assert.strictEqual(findPhoneColumn(["Teléfone"]), "Teléfone");
  });

  test("parseSpreadsheetBuffer lê CSV com headers e linhas", () => {
    const csv = "Nome,Telefone\nJoão,11999998888\n";
    const parsed = parseSpreadsheetBuffer(Buffer.from(csv, "utf8"), "lista.csv");
    assert.deepStrictEqual(parsed.headers, ["Nome", "Telefone"]);
    assert.strictEqual(parsed.rows.length, 1);
    assert.strictEqual(parsed.rows[0]?.Nome, "João");
    assert.strictEqual(parsed.rows[0]?.Telefone, "11999998888");
  });
});
