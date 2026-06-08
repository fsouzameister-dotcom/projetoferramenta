import assert from "node:assert";
import { describe, test } from "node:test";

import { normalizeCampaignPhoneE164, phoneDigitsOnly } from "../src/campaign-phone";

describe("campaign-phone", () => {
  test("phoneDigitsOnly remove caracteres não numéricos", () => {
    assert.strictEqual(phoneDigitsOnly("+55 (11) 99200-7226"), "5511992007226");
  });

  test("normalizeCampaignPhoneE164 aceita celular BR sem DDI", () => {
    assert.strictEqual(normalizeCampaignPhoneE164("11992007226"), "+5511992007226");
  });

  test("normalizeCampaignPhoneE164 aceita telefone com DDI", () => {
    assert.strictEqual(normalizeCampaignPhoneE164("+5511992007226"), "+5511992007226");
  });

  test("normalizeCampaignPhoneE164 rejeita número curto", () => {
    assert.strictEqual(normalizeCampaignPhoneE164("12345"), null);
  });
});
