import { describe, expect, it } from "vitest";

import { legacySensorMeasurementsCoverSession } from "./legacySensorCoverage";

function valuesAt(length: number, indexes: readonly number[], value = 150): number[] {
  const values = Array(length).fill(0);
  for (const index of indexes) values[index] = value;
  return values;
}

function spreadIndexes(length: number, count: number): number[] {
  return Array.from({ length: count }, (_, index) => Math.round(index * (length - 1) / (count - 1)));
}

describe("legacy sensor temporal coverage", () => {
  it.each([
    [2, 7_200],
    [4, 14_400],
  ])("accepts measurements spread across a whole 3,600s session on a %i Hz route", (rateHz, length) => {
    const routeTime = Array.from({ length }, (_, index) => index / rateHz);
    const inferredValues = valuesAt(3_600, spreadIndexes(3_600, 54));
    const alignedValues = valuesAt(length, spreadIndexes(length, 54));

    expect(legacySensorMeasurementsCoverSession({
      channel: "heart_rate", values: inferredValues, routeTime, trustedDurationSec: 3_600,
    })).toBe(true);
    expect(legacySensorMeasurementsCoverSession({
      channel: "heart_rate", values: alignedValues, routeTime, trustedDurationSec: 3_600,
    })).toBe(true);
  });

  it("accepts the 4 Hz inference ceiling and rejects a faster inferred channel", () => {
    expect(legacySensorMeasurementsCoverSession({
      channel: "heart_rate",
      values: valuesAt(400, spreadIndexes(400, 20)),
      trustedDurationSec: 100,
    })).toBe(true);
    expect(legacySensorMeasurementsCoverSession({
      channel: "heart_rate",
      values: valuesAt(401, spreadIndexes(401, 20)),
      trustedDurationSec: 100,
    })).toBe(false);
  });

  it("distinguishes evenly sparse measurements from the same count clustered in one fragment", () => {
    const length = 1_077;
    const evenlySpread = valuesAt(length, spreadIndexes(length, 54));
    const clustered = valuesAt(length, Array.from({ length: 54 }, (_, index) => 400 + index));

    expect(legacySensorMeasurementsCoverSession({
      channel: "heart_rate", values: evenlySpread, routeTime: spreadIndexes(length, length),
    })).toBe(true);
    expect(legacySensorMeasurementsCoverSession({
      channel: "heart_rate", values: clustered, routeTime: spreadIndexes(length, length),
    })).toBe(false);
  });

  it("accepts report-like whole-session HR and cadence counts without using count density", () => {
    const length = 1_077;
    const routeTime = Array.from({ length }, (_, index) => index);

    expect(legacySensorMeasurementsCoverSession({
      channel: "heart_rate", values: valuesAt(length, spreadIndexes(length, 54)), routeTime,
    })).toBe(true);
    expect(legacySensorMeasurementsCoverSession({
      channel: "cadence", values: valuesAt(length, spreadIndexes(length, 228), 85), routeTime,
    })).toBe(true);
  });

  it("requires time or aligned shape evidence and always rejects one sample", () => {
    expect(legacySensorMeasurementsCoverSession({
      channel: "heart_rate", values: [150], trustedDurationSec: 1,
    })).toBe(false);
    expect(legacySensorMeasurementsCoverSession({
      channel: "heart_rate", values: [150, 0, 150],
    })).toBe(false);
    expect(legacySensorMeasurementsCoverSession({
      channel: "heart_rate", values: [150, 151, 152],
    })).toBe(false);
    expect(legacySensorMeasurementsCoverSession({
      channel: "heart_rate", values: [150, 151, 152], hasAlignedShapeEvidence: true,
    })).toBe(true);
    expect(legacySensorMeasurementsCoverSession({
      channel: "heart_rate", values: [150, 151, 152], routeTime: [0, 1, Number.NaN],
    })).toBe(false);
  });

  it("accepts the HR edge boundary and rejects a missing start just beyond it", () => {
    const routeTime = Array.from({ length: 1_000 }, (_, index) => index);
    const boundary = valuesAt(1_000, [100, 200, 300, 400, 500, 600, 700, 899]);
    const beyond = valuesAt(1_000, [101, 200, 300, 400, 500, 600, 700, 899]);

    expect(legacySensorMeasurementsCoverSession({ channel: "heart_rate", values: boundary, routeTime }))
      .toBe(true);
    expect(legacySensorMeasurementsCoverSession({ channel: "heart_rate", values: beyond, routeTime }))
      .toBe(false);
  });

  it("rejects a long HR outage while allowing the same zero run as cadence coasting", () => {
    const routeTime = Array.from({ length: 1_000 }, (_, index) => index);
    const values = Array.from({ length: 1_000 }, (_, index) => index >= 395 && index <= 605 ? 0 : 90);

    expect(legacySensorMeasurementsCoverSession({ channel: "heart_rate", values, routeTime }))
      .toBe(false);
    expect(legacySensorMeasurementsCoverSession({ channel: "cadence", values, routeTime }))
      .toBe(true);
  });

  it("allows cadence-only coasting edges that remain within its whole-session bounds", () => {
    const routeTime = Array.from({ length: 1_000 }, (_, index) => index);
    const values = Array.from({ length: 1_000 }, (_, index) => index >= 150 && index < 850 ? 85 : 0);

    expect(legacySensorMeasurementsCoverSession({ channel: "heart_rate", values, routeTime }))
      .toBe(false);
    expect(legacySensorMeasurementsCoverSession({ channel: "cadence", values, routeTime }))
      .toBe(true);
  });
});
