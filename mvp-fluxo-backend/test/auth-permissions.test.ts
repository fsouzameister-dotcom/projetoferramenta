import assert from "node:assert";
import { describe, test } from "node:test";

import {
  defaultPermissionsForRole,
  hasPermission,
  resolveEffectivePermissions,
} from "../src/auth-permissions";

describe("auth-permissions", () => {
  test("admin_local recebe permissões padrão exceto plataforma e canais técnicos", () => {
    const perms = defaultPermissionsForRole("admin_local");
    assert.ok(perms.includes("users"));
    assert.ok(perms.includes("roles"));
    assert.ok(perms.includes("campaigns"));
    assert.ok(!perms.includes("platform_tenants"));
    assert.ok(!perms.includes("whatsapp"));
    assert.ok(!perms.includes("inbound"));
  });

  test("admin_local não obtém whatsapp mesmo com permissão salva no perfil", () => {
    assert.strictEqual(
      hasPermission(["whatsapp", "flows"], "whatsapp", "admin_local"),
      false
    );
  });

  test("supervisor padrão não gerencia usuários nem campanhas", () => {
    const perms = defaultPermissionsForRole("supervisor");
    assert.ok(perms.includes("monitoring"));
    assert.ok(!perms.includes("users"));
    assert.ok(!perms.includes("campaigns"));
  });

  test("resolveEffectivePermissions usa json salvo no perfil", () => {
    const perms = resolveEffectivePermissions({
      roleName: "supervisor",
      storedPermissions: ["reports", "monitoring"],
    });
    assert.deepStrictEqual(perms, ["reports", "monitoring"]);
  });

  test("platform_admin ignora restrições", () => {
    assert.strictEqual(
      hasPermission([], "platform_tenants", "platform_admin"),
      true
    );
  });
});
