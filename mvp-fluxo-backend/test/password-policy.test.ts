import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertPasswordPolicy,
  getPasswordPolicyError,
  isPasswordValid,
  PasswordPolicyError,
} from "../src/password-policy";

describe("password-policy", () => {
  it("aceita senha forte", () => {
    assert.equal(isPasswordValid("Senha@123"), true);
    assert.equal(getPasswordPolicyError("Senha@123"), null);
  });

  it("rejeita senha curta", () => {
    assert.equal(isPasswordValid("Ab1!"), false);
  });

  it("rejeita sem maiúscula", () => {
    assert.equal(isPasswordValid("senha@123"), false);
  });

  it("rejeita sem número", () => {
    assert.equal(isPasswordValid("Senha@abc"), false);
  });

  it("rejeita sem especial", () => {
    assert.equal(isPasswordValid("Senha1234"), false);
  });

  it("assertPasswordPolicy lança erro tipado", () => {
    assert.throws(() => assertPasswordPolicy("fraca"), PasswordPolicyError);
  });
});
