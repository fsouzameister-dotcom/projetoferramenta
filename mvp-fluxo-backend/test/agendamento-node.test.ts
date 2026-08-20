import "dotenv/config";
import assert from "node:assert";
import { describe, test } from "node:test";

import {
  formatDateLabel,
  formatSlotLabel,
  formatSlotTime,
  parseAgendamentoNodeConfig,
  parseUserDateInput,
} from "../src/agendamento-node";

const TZ = "America/Sao_Paulo"; // UTC-3, sem horário de verão desde 2019

describe("agendamento-node", () => {
  describe("parseUserDateInput", () => {
    const now = new Date("2026-08-20T12:00:00Z"); // 20/08/2026, 09:00 em SP

    test("aceita 'hoje' e 'amanhã'", () => {
      assert.equal(parseUserDateInput("hoje", now, TZ), "2026-08-20");
      assert.equal(parseUserDateInput("amanhã", now, TZ), "2026-08-21");
      assert.equal(parseUserDateInput("Amanha", now, TZ), "2026-08-21");
    });

    test("aceita formato DD/MM assumindo ano corrente", () => {
      assert.equal(parseUserDateInput("21/08", now, TZ), "2026-08-21");
    });

    test("DD/MM sem ano e já passado no ano corrente assume o próximo ano", () => {
      assert.equal(parseUserDateInput("01/01", now, TZ), "2027-01-01");
    });

    test("aceita formato DD/MM/AAAA e DD/MM/AA", () => {
      assert.equal(parseUserDateInput("21/08/2026", now, TZ), "2026-08-21");
      assert.equal(parseUserDateInput("21/08/26", now, TZ), "2026-08-21");
    });

    test("aceita formato ISO YYYY-MM-DD", () => {
      assert.equal(parseUserDateInput("2026-08-21", now, TZ), "2026-08-21");
    });

    test("retorna null para entradas inválidas", () => {
      assert.equal(parseUserDateInput("não sei", now, TZ), null);
      assert.equal(parseUserDateInput("32/13", now, TZ), null);
      assert.equal(parseUserDateInput("", now, TZ), null);
    });
  });

  test("formatDateLabel converte YYYY-MM-DD para DD/MM/AAAA", () => {
    assert.equal(formatDateLabel("2026-08-21"), "21/08/2026");
  });

  test("formatSlotTime formata horário no fuso do serviço", () => {
    assert.equal(formatSlotTime("2026-08-21T16:30:00.000Z", TZ), "13:30");
  });

  test("formatSlotLabel inclui recurso quando presente", () => {
    assert.equal(
      formatSlotLabel({ start: "2026-08-21T16:30:00.000Z", end: "", resourceId: null }, TZ),
      "13:30"
    );
    assert.equal(
      formatSlotLabel(
        { start: "2026-08-21T16:30:00.000Z", end: "", resourceId: "r1", resourceName: "Sala 1" },
        TZ
      ),
      "13:30 — Sala 1"
    );
  });

  describe("parseAgendamentoNodeConfig", () => {
    test("aplica valores padrão quando config está vazia", () => {
      const config = parseAgendamentoNodeConfig({}, "node-1");
      assert.equal(config.serviceId, "");
      assert.equal(config.variableName, "agendamento");
      assert.equal(config.maxSlotsShown, 8);
      assert.equal(config.next_node_id, null);
      assert.equal(config.noSlotsNextNodeId, null);
      assert.ok(config.askDatePrompt.length > 0);
    });

    test("respeita valores customizados", () => {
      const config = parseAgendamentoNodeConfig(
        {
          serviceId: "svc-1",
          variableName: "exame",
          maxSlotsShown: 3,
          next_node_id: "node-2",
          noSlotsNextNodeId: "node-3",
          clientNameVariable: "nome_cliente",
        },
        "node-1"
      );
      assert.equal(config.serviceId, "svc-1");
      assert.equal(config.variableName, "exame");
      assert.equal(config.maxSlotsShown, 3);
      assert.equal(config.next_node_id, "node-2");
      assert.equal(config.noSlotsNextNodeId, "node-3");
      assert.equal(config.clientNameVariable, "nome_cliente");
    });
  });
});
