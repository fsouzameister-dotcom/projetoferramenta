import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getTenantSlugIssue,
  normalizeTenantSlug,
  slugifyTenantName,
} from "../src/tenant-slug";

describe("tenant-slug", () => {
  it("slugifyTenantName remove acentos e espaços", () => {
    assert.equal(slugifyTenantName("Fox Pesquisas"), "fox-pesquisas");
    assert.equal(slugifyTenantName("São Paulo Vendas"), "sao-paulo-vendas");
  });

  it("normalizeTenantSlug limpa caracteres inválidos", () => {
    assert.equal(normalizeTenantSlug("  Pesquisas_XYZ  "), "pesquisas-xyz");
  });

  it("rejeita slug curto", () => {
    assert.equal(getTenantSlugIssue("a"), "INVALID_SLUG");
  });

  it("aceita slug válido", () => {
    assert.equal(getTenantSlugIssue("fox-pesquisas"), null);
  });
});
