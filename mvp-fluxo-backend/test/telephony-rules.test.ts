import assert from "node:assert";
import { describe, test } from "node:test";

import { defaultPermissionsForRole } from "../src/auth-permissions";
import { resolveRoutePermission } from "../src/route-permissions";
import {
  computeCallDurations,
  mapDialStatusToCallStatus,
  normalizeBrPhone,
  sipUsernameForUser,
} from "../src/telephony-rules";

describe("telephony-rules", () => {
  test("normalizeBrPhone aceita celular em vários formatos", () => {
    for (const raw of ["11992007226", "(11) 99200-7226", "+55 11 99200-7226", "5511992007226", "011992007226"]) {
      assert.deepStrictEqual(normalizeBrPhone(raw), { digits: "11992007226", kind: "mobile" }, raw);
    }
  });

  test("normalizeBrPhone aceita fixo e rejeita serviços especiais", () => {
    assert.deepStrictEqual(normalizeBrPhone("1154444625"), { digits: "1154444625", kind: "landline" });
    assert.deepStrictEqual(normalizeBrPhone("01154444625"), { digits: "1154444625", kind: "landline" });
    assert.strictEqual(normalizeBrPhone("08007770000"), null);
    assert.strictEqual(normalizeBrPhone("0900123456"), null);
    assert.strictEqual(normalizeBrPhone("190"), null);
    assert.strictEqual(normalizeBrPhone("001155551234"), null);
    assert.strictEqual(normalizeBrPhone("1112345678"), null);
    assert.strictEqual(normalizeBrPhone("11892007226"), null);
    assert.strictEqual(normalizeBrPhone(""), null);
    assert.strictEqual(normalizeBrPhone(undefined), null);
  });

  test("mapDialStatusToCallStatus traduz resultados do Asterisk", () => {
    assert.strictEqual(mapDialStatusToCallStatus("ANSWER"), "answered");
    assert.strictEqual(mapDialStatusToCallStatus("noanswer"), "no_answer");
    assert.strictEqual(mapDialStatusToCallStatus("BUSY"), "busy");
    assert.strictEqual(mapDialStatusToCallStatus("CANCEL"), "cancelled");
    assert.strictEqual(mapDialStatusToCallStatus("CONGESTION"), "failed");
    assert.strictEqual(mapDialStatusToCallStatus(""), "failed");
  });

  test("computeCallDurations separa toque e conversa", () => {
    assert.deepStrictEqual(computeCallDurations({ dialedSeconds: "47", answeredSeconds: "38" }), {
      ringSeconds: 9,
      talkSeconds: 38,
    });
    assert.deepStrictEqual(computeCallDurations({ dialedSeconds: "", answeredSeconds: undefined }), {
      ringSeconds: 0,
      talkSeconds: 0,
    });
  });

  test("sipUsernameForUser gera nome estável a partir do uuid", () => {
    assert.strictEqual(
      sipUsernameForUser("3F2504E0-4F89-11D3-9A0C-0305E82C3301"),
      "ag_3f2504e04f8911d39a0c0305e82c3301"
    );
    assert.throws(() => sipUsernameForUser("x"));
  });

  test("permissão telephony: rota admin e perfis padrão", () => {
    assert.strictEqual(resolveRoutePermission("/api/admin/telephony/calls"), "telephony");
    assert.strictEqual(resolveRoutePermission("/api/agent/telephony/session"), null);
    assert.ok(defaultPermissionsForRole("admin_local").includes("telephony"));
    assert.ok(defaultPermissionsForRole("supervisor").includes("telephony"));
    assert.ok(!defaultPermissionsForRole("agente").includes("telephony"));
  });
});
