import assert from "node:assert";
import { describe, test } from "node:test";

import {
  computeAvailableSlotsForDate,
  zonedWallTimeToUtc,
} from "../src/appointment-availability";

const TZ = "America/Sao_Paulo"; // UTC-3, sem horário de verão desde 2019

describe("appointment-availability", () => {
  test("zonedWallTimeToUtc converte horário local para instante UTC", () => {
    const date = zonedWallTimeToUtc(2026, 8, 21, 13, 30, TZ);
    assert.equal(date.toISOString(), "2026-08-21T16:30:00.000Z");
  });

  test("modo pool: gera slots respeitando duração e capacidade", () => {
    const slots = computeAvailableSlotsForDate({
      dateStr: "2026-08-21", // sexta-feira
      service: { durationMinutes: 30, capacityMode: "pool", poolCapacity: 2, timezone: TZ },
      rules: [{ resourceId: null, weekday: 5, startTime: "13:00", endTime: "14:00" }],
      resources: [],
      busy: [],
      blocks: [],
      now: new Date("2026-08-01T00:00:00Z"),
    });
    assert.deepEqual(
      slots.map((s) => s.start),
      ["2026-08-21T16:00:00.000Z", "2026-08-21T16:30:00.000Z"]
    );
    assert.ok(slots.every((s) => s.resourceId === null));
  });

  test("modo pool: exclui slot quando capacidade está esgotada", () => {
    const slots = computeAvailableSlotsForDate({
      dateStr: "2026-08-21",
      service: { durationMinutes: 30, capacityMode: "pool", poolCapacity: 1, timezone: TZ },
      rules: [{ resourceId: null, weekday: 5, startTime: "13:00", endTime: "14:00" }],
      resources: [],
      busy: [{ resourceId: null, start: "2026-08-21T16:00:00.000Z", end: "2026-08-21T16:30:00.000Z" }],
      blocks: [],
      now: new Date("2026-08-01T00:00:00Z"),
    });
    assert.deepEqual(
      slots.map((s) => s.start),
      ["2026-08-21T16:30:00.000Z"]
    );
  });

  test("modo resource: cada recurso livre gera seu próprio slot", () => {
    const slots = computeAvailableSlotsForDate({
      dateStr: "2026-08-21",
      service: { durationMinutes: 60, capacityMode: "resource", poolCapacity: 1, timezone: TZ },
      rules: [{ resourceId: null, weekday: 5, startTime: "09:00", endTime: "10:00" }],
      resources: [
        { id: "r1", name: "Sala 1" },
        { id: "r2", name: "Sala 2" },
      ],
      busy: [{ resourceId: "r1", start: "2026-08-21T12:00:00.000Z", end: "2026-08-21T13:00:00.000Z" }],
      blocks: [],
      now: new Date("2026-08-01T00:00:00Z"),
    });
    assert.deepEqual(
      slots.map((s) => s.resourceId),
      ["r2"]
    );
  });

  test("respeita bloqueio pontual (feriado/manutenção)", () => {
    const slots = computeAvailableSlotsForDate({
      dateStr: "2026-08-21",
      service: { durationMinutes: 30, capacityMode: "pool", poolCapacity: 5, timezone: TZ },
      rules: [{ resourceId: null, weekday: 5, startTime: "13:00", endTime: "14:00" }],
      resources: [],
      busy: [],
      blocks: [{ resourceId: null, start: "2026-08-21T00:00:00.000Z", end: "2026-08-22T00:00:00.000Z" }],
      now: new Date("2026-08-01T00:00:00Z"),
    });
    assert.equal(slots.length, 0);
  });

  test("respeita lead mínimo (não oferece horário muito próximo/passado)", () => {
    const slots = computeAvailableSlotsForDate({
      dateStr: "2026-08-21",
      service: { durationMinutes: 30, capacityMode: "pool", poolCapacity: 1, timezone: TZ },
      rules: [{ resourceId: null, weekday: 5, startTime: "13:00", endTime: "14:00" }],
      resources: [],
      busy: [],
      blocks: [],
      now: new Date("2026-08-21T16:15:00.000Z"),
      minLeadMinutes: 60,
    });
    assert.deepEqual(slots, []);
  });
});
