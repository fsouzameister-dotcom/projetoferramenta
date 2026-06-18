import assert from "node:assert";
import { describe, test } from "node:test";

import {
  formatCpf,
  matchesInboundTrigger,
  validateFlowField,
  valuesMatchForFlowDecision,
} from "../src/flow-field-validators";

describe("flow-field-validators", () => {
  test("valida CPF e formata", () => {
    const r = validateFlowField("cpf", "390.533.447-05");
    assert.strictEqual(r.ok, true);
    if (r.ok) assert.strictEqual(r.normalized, formatCpf("39053344705"));
  });

  test("rejeita CPF inválido", () => {
    const r = validateFlowField("cpf", "111.111.111-11");
    assert.strictEqual(r.ok, false);
  });

  test("aceita CPF com ou sem máscara e normaliza", () => {
    const masked = validateFlowField("cpf", "390.533.447-05");
    assert.strictEqual(masked.ok, true);
    if (masked.ok) {
      assert.strictEqual(masked.normalized, formatCpf("39053344705"));
    }

    const digits = validateFlowField("cpf", "39053344705");
    assert.strictEqual(digits.ok, true);
    if (digits.ok) {
      assert.strictEqual(digits.normalized, formatCpf("39053344705"));
    }
  });

  test("aceita telefone em formatos variados e normaliza", () => {
    const cases = [
      ["(11) 99999-8888", "(11) 99999-8888"],
      ["(11)99999-8888", "(11) 99999-8888"],
      ["11999998888", "(11) 99999-8888"],
      ["11 99999-8888", "(11) 99999-8888"],
      ["+55 11 99999-8888", "(11) 99999-8888"],
    ] as const;

    for (const [input, expected] of cases) {
      const r = validateFlowField("phone_br", input);
      assert.strictEqual(r.ok, true, `entrada: ${input}`);
      if (r.ok) assert.strictEqual(r.normalized, expected, `entrada: ${input}`);
    }
  });

  test("aceita data em formatos variados e normaliza para ISO", () => {
    const cases = [
      ["15/03/1990", "1990-03-15"],
      ["15-03-1990", "1990-03-15"],
      ["15.03.1990", "1990-03-15"],
      ["5/3/1990", "1990-03-05"],
      ["15031990", "1990-03-15"],
      ["1990-03-15", "1990-03-15"],
    ] as const;

    for (const [input, expected] of cases) {
      const r = validateFlowField("date_br", input);
      assert.strictEqual(r.ok, true, `entrada: ${input}`);
      if (r.ok) assert.strictEqual(r.normalized, expected, `entrada: ${input}`);
    }
  });

  test("rejeita data e telefone inválidos", () => {
    assert.strictEqual(validateFlowField("date_br", "31/02/1990").ok, false);
    assert.strictEqual(validateFlowField("phone_br", "123").ok, false);
    assert.strictEqual(validateFlowField("cpf", "123").ok, false);
  });

  test("aceita renda R$ 7000,00 e número simples", () => {
    const withSymbol = validateFlowField("money_br", "R$ 7000,00");
    assert.strictEqual(withSymbol.ok, true);
    if (withSymbol.ok) {
      assert.strictEqual(withSymbol.normalized, "R$ 7.000,00");
    }

    const plain = validateFlowField("money_br", "7000");
    assert.strictEqual(plain.ok, true);
    if (plain.ok) assert.strictEqual(plain.normalized, "R$ 7.000,00");
  });

  test("aceita renda com separador de milhar", () => {
    const r = validateFlowField("money_br", "R$ 3.500,00");
    assert.strictEqual(r.ok, true);
    if (r.ok) assert.strictEqual(r.normalized, "R$ 3.500,00");
  });

  test("matchesInboundTrigger cadastrar-se", () => {
    assert.strictEqual(
      matchesInboundTrigger("Cadastrar-se", ["cadastrar-se"]),
      true
    );
    assert.strictEqual(
      matchesInboundTrigger("  cadastrar se  ", ["cadastrar-se"]),
      true
    );
    assert.strictEqual(matchesInboundTrigger("oi", ["cadastrar-se"]), false);
    assert.strictEqual(
      matchesInboundTrigger("Olá! Quero conhecer o ClientOn.", ["quero conhecer o clienton"]),
      true
    );
  });

  test("valuesMatchForFlowDecision Fox entrada", () => {
    assert.strictEqual(valuesMatchForFlowDecision("Cadastrar-se", "cadastrar-se"), true);
    assert.strictEqual(valuesMatchForFlowDecision("cadastrar", "cadastrar-se"), true);
    assert.strictEqual(valuesMatchForFlowDecision("Agora não", "agora-nao"), true);
    assert.strictEqual(valuesMatchForFlowDecision("agora nao", "agora-nao"), true);
    assert.strictEqual(valuesMatchForFlowDecision("oi", "cadastrar-se"), false);
    assert.strictEqual(valuesMatchForFlowDecision("oi", "agora-nao"), false);
  });
});
