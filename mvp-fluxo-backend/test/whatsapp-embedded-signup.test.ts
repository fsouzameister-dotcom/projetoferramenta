import assert from "node:assert";
import { describe, test } from "node:test";

import {
  EmbeddedSignupError,
  onboardEmbeddedSignup,
  type GraphFetch,
} from "../src/whatsapp-embedded-signup";

function mockFetchSequence(
  responses: Array<{ ok: boolean; body: unknown }>
): GraphFetch {
  let i = 0;
  return async () => {
    const next = responses[i++];
    if (!next) {
      throw new Error(`fetch inesperado (chamada #${i})`);
    }
    return {
      ok: next.ok,
      json: async () => next.body,
    } as Response;
  };
}

describe("whatsapp-embedded-signup", () => {
  test("onboard troca code, subscribe, register e persiste canal", async () => {
    const fetchFn = mockFetchSequence([
      { ok: true, body: { access_token: "EAA_TEST_TOKEN" } },
      { ok: true, body: { success: true } },
      { ok: true, body: { success: true } },
      { ok: true, body: { display_phone_number: "+5511999999999" } },
    ]);

    let persistedPin: string | undefined;
    const result = await onboardEmbeddedSignup(
      {
        tenantId: "00000000-0000-4000-8000-000000000099",
        code: "EXCHANGE_CODE",
        wabaId: "111",
        phoneNumberId: "222",
        label: "Fox WA",
      },
      {
        fetchFn,
        appId: "app123",
        appSecret: "secret123",
        generatePin: () => "581063",
        createChannel: async (input) => {
          persistedPin = input.twoStepPin;
          assert.equal(input.accessToken, "EAA_TEST_TOKEN");
          assert.equal(input.wabaId, "111");
          assert.equal(input.phoneNumberId, "222");
          assert.equal(input.displayPhoneNumber, "+5511999999999");
          return { channelId: "ch-1", phoneNumberId: "222" };
        },
      }
    );

    assert.equal(result.channelId, "ch-1");
    assert.equal(result.wabaId, "111");
    assert.equal(persistedPin, "581063");
  });

  test("falha no exchange propaga EmbeddedSignupError", async () => {
    const fetchFn = mockFetchSequence([
      {
        ok: false,
        body: { error: { message: "Invalid verification code", code: 100 } },
      },
    ]);

    await assert.rejects(
      () =>
        onboardEmbeddedSignup(
          {
            tenantId: "t1",
            code: "bad",
            wabaId: "1",
            phoneNumberId: "2",
          },
          { fetchFn, appId: "a", appSecret: "s", generatePin: () => "000000" }
        ),
      (err: unknown) => {
        assert.ok(err instanceof EmbeddedSignupError);
        assert.equal(err.step, "exchange");
        return true;
      }
    );
  });

  test("sem appId/appSecret → config error", async () => {
    await assert.rejects(
      () =>
        onboardEmbeddedSignup(
          {
            tenantId: "t1",
            code: "c",
            wabaId: "1",
            phoneNumberId: "2",
          },
          {
            appId: "",
            appSecret: "",
            fetchFn: mockFetchSequence([]),
          }
        ),
      (err: unknown) => {
        assert.ok(err instanceof EmbeddedSignupError);
        assert.equal(err.step, "config");
        return true;
      }
    );
  });
});
