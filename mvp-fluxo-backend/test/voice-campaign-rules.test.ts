import test from "node:test";
import assert from "node:assert/strict";
import {
  clampMaxAttempts,
  clampRetryIntervalMinutes,
  prepareVoiceContacts,
  resolveContactAfterAttempt,
  suggestColumn,
} from "../src/voice-campaign-rules";

const now = new Date("2026-10-02T12:00:00.000Z");

test("resolveContactAfterAttempt: atendida sem tabulação conclui", () => {
  const r = resolveContactAfterAttempt({ callAnswered: true, attempts: 1, maxAttempts: 5, retryIntervalMinutes: 60, now });
  assert.deepEqual(r, { status: "done", nextAttemptAt: null });
});

test("resolveContactAfterAttempt: não atendida agenda nova tentativa pelo intervalo", () => {
  const r = resolveContactAfterAttempt({ callAnswered: false, attempts: 2, maxAttempts: 5, retryIntervalMinutes: 60, now });
  assert.equal(r.status, "retry");
  assert.equal(r.nextAttemptAt?.toISOString(), "2026-10-02T13:00:00.000Z");
});

test("resolveContactAfterAttempt: esgota ao atingir o máximo", () => {
  const r = resolveContactAfterAttempt({ callAnswered: false, attempts: 5, maxAttempts: 5, retryIntervalMinutes: 60, now });
  assert.deepEqual(r, { status: "exhausted", nextAttemptAt: null });
});

test("resolveContactAfterAttempt: desfecho da tabulação prevalece", () => {
  const retry = resolveContactAfterAttempt({
    callAnswered: true,
    attempts: 1,
    maxAttempts: 5,
    retryIntervalMinutes: 30,
    outcome: "retry",
    now,
  });
  assert.equal(retry.status, "retry");
  assert.equal(retry.nextAttemptAt?.toISOString(), "2026-10-02T12:30:00.000Z");
  const dnc = resolveContactAfterAttempt({
    callAnswered: false,
    attempts: 1,
    maxAttempts: 5,
    retryIntervalMinutes: 30,
    outcome: "do_not_call",
    now,
  });
  assert.deepEqual(dnc, { status: "do_not_call", nextAttemptAt: null });
});

test("clamps de tentativas e intervalo", () => {
  assert.equal(clampMaxAttempts("abc"), 5);
  assert.equal(clampMaxAttempts(0), 1);
  assert.equal(clampMaxAttempts(99), 20);
  assert.equal(clampRetryIntervalMinutes(undefined), 60);
  assert.equal(clampRetryIntervalMinutes(1), 5);
  assert.equal(clampRetryIntervalMinutes(999999), 7 * 24 * 60);
});

test("prepareVoiceContacts: normaliza, deduplica e aponta inválidos", () => {
  const r = prepareVoiceContacts({
    rows: [
      { Nome: "Ana", Telefone: "(11) 99200-7226" },
      { Nome: "Ana 2", Telefone: "5511992007226" },
      { Nome: "Bruno", Telefone: "11 5444-4625" },
      { Nome: "X", Telefone: "123" },
    ],
    phoneColumn: "Telefone",
    nameColumn: "Nome",
  });
  assert.deepEqual(
    r.contacts.map((c) => [c.phone, c.name]),
    [
      ["11992007226", "Ana"],
      ["1154444625", "Bruno"],
    ]
  );
  assert.equal(r.duplicates, 1);
  assert.deepEqual(r.invalid, [{ line: 5, value: "123" }]);
});

test("suggestColumn ignora acento e caixa", () => {
  assert.equal(suggestColumn(["Código", "Número Celular", "NOME"], ["telefone", "celular"]), "Número Celular");
  assert.equal(suggestColumn(["Código", "NOME"], ["nome"]), "NOME");
  assert.equal(suggestColumn(["a", "b"], ["telefone"]), null);
});
