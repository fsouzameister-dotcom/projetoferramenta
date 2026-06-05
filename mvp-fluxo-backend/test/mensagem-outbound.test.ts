import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  executeMensagemNode,
  formatMensagemBodyWithListFallback,
  formatMensagemBodyWithButtonFallback,
  parseMensagemButtons,
  parseMensagemListItems,
  parseMensagemNodeConfig,
} from "../src/mensagem-outbound";

describe("mensagem-outbound", () => {
  it("parseMensagemButtons ignora vazios e limita a 3", () => {
    const buttons = parseMensagemButtons([
      { label: "Sim" },
      { label: "" },
      { id: "nao", label: "Não" },
      { label: "Talvez" },
      { label: "Extra" },
    ]);
    assert.equal(buttons.length, 3);
    assert.equal(buttons[0].label, "Sim");
    assert.equal(buttons[0].id, "sim");
    assert.deepEqual(buttons[1], { id: "nao", label: "Não" });
  });

  it("trunca label em 20 caracteres", () => {
    const [b] = parseMensagemButtons([{ label: "A".repeat(30) }]);
    assert.equal(b.label.length, 20);
  });

  it("parseMensagemListItems limita a 10 itens", () => {
    const items = parseMensagemListItems(
      Array.from({ length: 12 }).map((_, i) => ({ label: `Opção ${i + 1}` }))
    );
    assert.equal(items.length, 10);
  });

  it("executeMensagemNode retorna interactive_buttons", () => {
    const result = executeMensagemNode({
      config: {
        content: "Olá {{nome}}",
        buttons: [{ id: "opt_a", label: "Opção A" }],
      },
      variables: { nome: "Maria" },
      resolveTemplate: (t) => t.replace("{{nome}}", "Maria"),
    });
    assert.equal(result.outboundMessages.length, 1);
    assert.deepEqual(result.outboundMessages[0], {
      kind: "interactive_buttons",
      body: "Olá Maria",
      buttons: [{ id: "opt_a", label: "Opção A" }],
    });
  });

  it("executeMensagemNode retorna text sem botões", () => {
    const result = executeMensagemNode({
      config: { content: "Oi" },
      variables: {},
      resolveTemplate: (t) => t,
    });
    assert.deepEqual(result.outboundMessages[0], { kind: "text", body: "Oi" });
  });

  it("parseMensagemNodeConfig aceita campo legado message", () => {
    const parsed = parseMensagemNodeConfig({ message: "Cadastrar-se" });
    assert.equal(parsed.content, "Cadastrar-se");
  });

  it("executeMensagemNode retorna interactive_list", () => {
    const result = executeMensagemNode({
      config: {
        content: "Escolha uma opção",
        interactive_type: "list",
        list_items: [
          { id: "suporte", label: "Suporte", description: "Falar com suporte" },
          { id: "comercial", label: "Comercial" },
        ],
        list_button_text: "Abrir lista",
      },
      variables: {},
      resolveTemplate: (t) => t,
    });
    assert.deepEqual(result.outboundMessages[0], {
      kind: "interactive_list",
      body: "Escolha uma opção",
      listItems: [
        { id: "suporte", label: "Suporte", description: "Falar com suporte" },
        { id: "comercial", label: "Comercial", description: undefined },
      ],
      listButtonText: "Abrir lista",
      listSectionTitle: "Opções",
    });
  });

  it("formatMensagemBodyWithButtonFallback anexa lista", () => {
    const body = formatMensagemBodyWithButtonFallback("Escolha:", [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ]);
    assert.match(body, /1\. A/);
    assert.match(body, /2\. B/);
  });

  it("formatMensagemBodyWithListFallback anexa lista com descrição", () => {
    const body = formatMensagemBodyWithListFallback("Escolha:", [
      { id: "a", label: "A", description: "Primeira" },
      { id: "b", label: "B" },
    ]);
    assert.match(body, /1\. A — Primeira/);
    assert.match(body, /2\. B/);
  });

  it("parseMensagemNodeConfig lê reply_buttons legado", () => {
    const cfg = parseMensagemNodeConfig({
      text: "x",
      reply_buttons: [{ label: "Ok" }],
      send_delay_seconds: 2,
    });
    assert.equal(cfg.content, "x");
    assert.equal(cfg.sendDelaySeconds, 2);
    assert.equal(cfg.buttons.length, 1);
  });
});
