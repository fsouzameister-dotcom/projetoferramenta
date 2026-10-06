import test from "node:test";
import assert from "node:assert/strict";
import {
  clampMaxAttempts,
  clampRetryIntervalMinutes,
  parseCallbackAt,
  prepareVoiceContacts,
  resolveContactAfterAttempt,
  resolveContactAfterResult,
  suggestColumn,
} from "../src/voice-campaign-rules";
import { classifyCallResult } from "../src/telephony-rules";

const now = new Date("2026-10-02T12:00:00.000Z");

test("classifyCallResult: sinalização da operadora", () => {
  assert.equal(classifyCallResult("ANSWER", "16"), "answered");
  assert.equal(classifyCallResult("NOANSWER", "19"), "no_answer");
  assert.equal(classifyCallResult("BUSY", "17"), "busy");
  assert.equal(classifyCallResult("CHANUNAVAIL", "1"), "invalid_number");
  assert.equal(classifyCallResult("CONGESTION", "28"), "invalid_number");
  assert.equal(classifyCallResult("CONGESTION", "17"), "busy");
  assert.equal(classifyCallResult("CHANUNAVAIL", "20"), "unavailable");
  assert.equal(classifyCallResult("CHANUNAVAIL", "27"), "unavailable");
  assert.equal(classifyCallResult("CANCEL", "0"), "cancelled");
  assert.equal(classifyCallResult("CONGESTION", "34"), "carrier_failure");
  assert.equal(classifyCallResult("", ""), "carrier_failure");
});

test("resolveContactAfterResult: destinos automáticos", () => {
  const base = { attempts: 1, maxAttempts: 5, retryIntervalMinutes: 60, now };
  assert.equal(resolveContactAfterResult({ ...base, result: "answered" }), null);
  assert.deepEqual(resolveContactAfterResult({ ...base, result: "invalid_number" }), { status: "invalid", nextAttemptAt: null });
  assert.equal(
    resolveContactAfterResult({ ...base, result: "busy" })?.nextAttemptAt?.toISOString(),
    "2026-10-02T12:15:00.000Z"
  );
  assert.equal(
    resolveContactAfterResult({ ...base, result: "no_answer" })?.nextAttemptAt?.toISOString(),
    "2026-10-02T13:00:00.000Z"
  );
  assert.deepEqual(resolveContactAfterResult({ ...base, attempts: 5, result: "voicemail" }), {
    status: "exhausted",
    nextAttemptAt: null,
  });
});

test("resolveContactAfterAttempt: retorno agendado não esgota", () => {
  const callbackAt = new Date("2026-10-03T15:00:00.000Z");
  assert.deepEqual(
    resolveContactAfterAttempt({
      callAnswered: true,
      attempts: 5,
      maxAttempts: 5,
      retryIntervalMinutes: 60,
      outcome: "callback",
      callbackAt,
      now,
    }),
    { status: "retry", nextAttemptAt: callbackAt }
  );
});

test("parseCallbackAt: só futuro e até 60 dias", () => {
  assert.equal(parseCallbackAt("2026-10-03T15:00:00.000Z", now)?.toISOString(), "2026-10-03T15:00:00.000Z");
  assert.equal(parseCallbackAt("2026-10-01T15:00:00.000Z", now), null);
  assert.equal(parseCallbackAt("2027-01-01T15:00:00.000Z", now), null);
  assert.equal(parseCallbackAt("x", now), null);
  assert.equal(parseCallbackAt(undefined, now), null);
});

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
