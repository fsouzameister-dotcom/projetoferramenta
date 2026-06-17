import assert from "node:assert";
import { describe, test } from "node:test";

import { buildCtwaSourceKey, parseCtwaReferral } from "../src/ctwa-referral";

describe("ctwa-referral", () => {
  test("parseCtwaReferral extrai campos do anúncio", () => {
    const parsed = parseCtwaReferral({
      source_type: "ad",
      source_id: "120212345678901234",
      source_url: "https://fb.me/xyz",
      headline: "Pesquisa Fox",
      ctwa_clid: "clid-abc",
    });
    assert.ok(parsed);
    assert.strictEqual(parsed?.sourceId, "120212345678901234");
    assert.strictEqual(parsed?.sourceType, "ad");
    assert.strictEqual(buildCtwaSourceKey(parsed!), "ad_120212345678901234");
  });

  test("buildCtwaSourceKey usa clid quando não há source_id", () => {
    const parsed = parseCtwaReferral({ source_type: "ad", ctwa_clid: "clid-xyz" });
    assert.ok(parsed);
    assert.strictEqual(buildCtwaSourceKey(parsed!), "clid_clid-xyz");
  });

  test("parseCtwaReferral retorna null sem sinais", () => {
    assert.strictEqual(parseCtwaReferral({}), null);
    assert.strictEqual(parseCtwaReferral(null), null);
  });

  test("buildCtwaSourceKey default sem ids", () => {
    const parsed = parseCtwaReferral({ source_type: "ad", headline: "Só título" });
    assert.ok(parsed);
    assert.strictEqual(buildCtwaSourceKey(parsed!), "default");
  });
});
