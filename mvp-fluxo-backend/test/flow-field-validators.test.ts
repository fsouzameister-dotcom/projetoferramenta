import assert from "node:assert";
import { describe, test } from "node:test";

import {
  formatCpf,
  matchesInboundTrigger,
  validateFlowField,
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

  test("rejeita CPF só com dígitos sem máscara", () => {
    const r = validateFlowField("cpf", "39053344705");
    assert.strictEqual(r.ok, false);
  });

  test("rejeita telefone sem máscara", () => {
    const r = validateFlowField("phone_br", "119992007226");
    assert.strictEqual(r.ok, false);
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
  });
});
