/** 가져온 원본 포인트의 관측 축. 녹화 전체성이나 1Hz 격자를 주장하지 않는다. */
export type ImportedSensorChannel = "heartrate" | "watts" | "cadence";
export type ImportedSensorObservationsV1 = {
  version: 1;
  source: "parsed_import_points";
  state: "available";
  timeUnit: "relative_milliseconds";
  originEpochMs: number;
  timeMs: number[];
  /** GPS subset의 동일 센서 원점 기준 시각. 빈 배열은 GPS 미관측이다. */
  routeTimeMs?: number[];
  heartrate: Array<number | null>;
  watts: Array<number | null>;
  cadence: Array<number | null>;
} | {
  version: 1;
  source: "parsed_import_points";
  state: "unavailable";
  reason: "invalid_timestamps";
};

export function validateImportedSensorObservations(value: unknown, expectedLength?: number): ImportedSensorObservationsV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v.version !== 1 || v.source !== "parsed_import_points") return null;
  if (v.state === "unavailable") return v.reason === "invalid_timestamps" ? value as ImportedSensorObservationsV1 : null;
  if (v.state !== "available" || v.timeUnit !== "relative_milliseconds"
    || !Number.isSafeInteger(v.originEpochMs) || (v.originEpochMs as number) <= 0
    || !Array.isArray(v.timeMs) || v.timeMs.length < 2
    || expectedLength != null && (Array.isArray(v.routeTimeMs) ? v.routeTimeMs.length : v.timeMs.length) !== expectedLength) return null;
  const axis = v.timeMs;
  for (let i = 0; i < axis.length; i++) {
    if (!Object.prototype.hasOwnProperty.call(axis, i) || !Number.isSafeInteger(axis[i])
      || axis[i] < 0 || (i === 0 ? axis[i] !== 0 : axis[i] <= axis[i - 1])
      || !Number.isSafeInteger((v.originEpochMs as number) + axis[i])) return null;
  }
  if (Object.prototype.hasOwnProperty.call(v, "routeTimeMs")) {
    if (!Array.isArray(v.routeTimeMs)) return null;
    const observed = new Set(axis);
    for (let i = 0; i < v.routeTimeMs.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(v.routeTimeMs, i) || !observed.has(v.routeTimeMs[i])
        || i > 0 && v.routeTimeMs[i] <= v.routeTimeMs[i - 1]) return null;
    }
  }
  for (const channel of ["heartrate", "watts", "cadence"] as const) {
    const values = v[channel];
    if (!Array.isArray(values) || values.length !== axis.length) return null;
    for (let i = 0; i < values.length; i++) {
      const n = values[i];
      if (!Object.prototype.hasOwnProperty.call(values, i) || !(n === null
        || typeof n === "number" && Number.isFinite(n) && (channel === "heartrate" ? n > 0 : n >= 0))) return null;
    }
  }
  return value as ImportedSensorObservationsV1;
}

/** 결측 전후를 연결하지 않도록 원본 슬롯 구간과 지속시간을 함께 반환한다. */
export function selectImportedSensorObservationSeries(value: unknown, channel: ImportedSensorChannel) {
  const block = validateImportedSensorObservations(value);
  if (!block || block.state !== "available") return null;
  // 기존 sample-time의 3배 간격 정책을 사용하되 짝수 표본은 하위 중앙값으로
  // 기준 간격을 정한다. [1,99]의 긴 공백이 정상 99초 측정으로 승격되지 않는다.
  // 간격 하나뿐이면 기록 주기를 판단할 수 없어 구간 시간은 미확인이다.
  const steps = block.timeMs.slice(1).map((t, i) => (t - block.timeMs[i]!) / 1000).sort((a, b) => a - b);
  const baseline = steps.length >= 2 ? steps[Math.floor((steps.length - 1) / 2)]! : 0;
  const values: number[] = [], time: number[] = [], durationsSec: number[] = [], segmentStarts: boolean[] = [];
  let previous = -2;
  for (let i = 0; i < block.timeMs.length; i++) {
    const n = block[channel][i];
    if (n == null) continue;
    const dt = i + 1 < block.timeMs.length ? (block.timeMs[i + 1]! - block.timeMs[i]!) / 1000 : 0;
    values.push(n);
    time.push(block.timeMs[i]! / 1000);
    durationsSec.push(baseline === 0 ? 0 : dt > baseline * 3 ? baseline : dt);
    segmentStarts.push(i !== previous + 1 || previous >= 0 && (block.timeMs[i]! - block.timeMs[previous]!) / 1000 > baseline * 3);
    previous = i;
  }
  return values.length ? { values, time, durationsSec, segmentStarts } : null;
}
