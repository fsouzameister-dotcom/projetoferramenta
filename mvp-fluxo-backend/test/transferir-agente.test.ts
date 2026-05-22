import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  executeTransferirAgenteNode,
  parseTransferirAgenteConfig,
} from "../src/transferir-agente";

describe("transferir_agente", () => {
  it("parse usa fila padrão Geral", () => {
    const p = parseTransferirAgenteConfig({});
    assert.equal(p.queue, "Geral");
    assert.equal(p.nextNodeId, null);
  });

  it("execute sem conversa define variáveis e mensagem", () => {
    const vars: Record<string, unknown> = {};
    const r = executeTransferirAgenteNode({
      config: { queue: "Pesquisa", priority: "alta" },
      variables: vars,
      handoffApplied: false,
    });
    assert.equal(vars.handoff_queue, "Pesquisa");
    assert.equal(vars.handoff_requested, true);
    assert.equal(r.details.handoffApplied, false);
    assert.equal(r.stopFlow, true);
    assert.match(String(r.message), /Pesquisa/);
  });

  it("execute com next_node_id continua fluxo", () => {
    const vars: Record<string, unknown> = {};
    const r = executeTransferirAgenteNode({
      config: { queue: "Vendas", next_node_id: "next-uuid" },
      variables: vars,
    });
    assert.equal(r.nextNodeId, "next-uuid");
    assert.equal(r.stopFlow, false);
  });
});
