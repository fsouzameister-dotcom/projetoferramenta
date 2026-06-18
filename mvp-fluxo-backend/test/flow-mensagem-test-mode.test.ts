import test from "node:test";
import assert from "node:assert/strict";

test("buildMensagemTestAwaiting via executeFlow mensagem testMode", async () => {
  const { parseMensagemNodeConfig, executeMensagemNode } = await import(
    "../src/mensagem-outbound.js"
  );

  const config = {
    content: "Bora?",
    interactive_type: "buttons",
    buttons: [
      { id: "btn_1", label: "Sim" },
      { id: "btn_2", label: "Não" },
    ],
    next_node_id: "next-node",
  };

  const parsed = parseMensagemNodeConfig(config);
  assert.equal(parsed.interactiveType, "buttons");
  const result = executeMensagemNode({
    config,
    variables: {},
    resolveTemplate: (t) => t,
  });
  assert.equal(result.outboundMessages[0]?.kind, "interactive_buttons");
});
