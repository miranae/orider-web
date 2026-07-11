import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  zonePaceRange,
  paceToZone,
  formatPaceSec,
  formatPaceRange,
  resolveThresholdPace,
  zoneCoefficients,
  type PaceZone,
} from "./workoutPace";

// 임계 페이스 5'00"/km = 300 sec/km 를 기준 사례로 사용.
const THRESHOLD = 300;

describe("zonePaceRange", () => {
  it("임계 페이스보다 Z1 은 느리고 Z5 는 빠르다", () => {
    const z1 = zonePaceRange(THRESHOLD, 1)!;
    const z5 = zonePaceRange(THRESHOLD, 5)!;
    expect(z1.fastSecPerKm).toBeGreaterThan(THRESHOLD); // 느림 = 큰 sec
    expect(z5.slowSecPerKm).toBeLessThan(THRESHOLD); // 빠름 = 작은 sec
  });

  it("각 존에서 fast < slow (빠른 쪽이 작은 sec)", () => {
    for (const z of [1, 2, 3, 4, 5] as PaceZone[]) {
      const r = zonePaceRange(THRESHOLD, z)!;
      expect(r.fastSecPerKm).toBeLessThan(r.slowSecPerKm);
    }
  });

  it("존이 낮아질수록 느려진다 (Z5 → Z1 단조 증가)", () => {
    const paces = ([5, 4, 3, 2, 1] as PaceZone[]).map((z) => zonePaceRange(THRESHOLD, z)!.fastSecPerKm);
    for (let i = 1; i < paces.length; i++) {
      expect(paces[i]!).toBeGreaterThan(paces[i - 1]!);
    }
  });

  it("Z4 는 임계 페이스를 포함한다 (역치 존)", () => {
    const z4 = zonePaceRange(THRESHOLD, 4)!;
    expect(z4.fastSecPerKm).toBeLessThanOrEqual(THRESHOLD);
    expect(z4.slowSecPerKm).toBeGreaterThanOrEqual(THRESHOLD);
  });

  it("인접 존의 경계가 연속이다", () => {
    for (const z of [2, 3, 4, 5] as PaceZone[]) {
      const faster = zoneCoefficients(z);
      const slower = zoneCoefficients((z - 1) as PaceZone);
      expect(faster[1]).toBeCloseTo(slower[0], 5);
    }
  });

  it("임계 페이스가 없거나 0 이면 null", () => {
    expect(zonePaceRange(null, 2)).toBeNull();
    expect(zonePaceRange(undefined, 2)).toBeNull();
    expect(zonePaceRange(0, 2)).toBeNull();
    expect(zonePaceRange(-10, 2)).toBeNull();
  });
});

describe("paceToZone", () => {
  it("임계보다 빠르면 Z5, 임계 근처면 Z4", () => {
    expect(paceToZone(THRESHOLD * 0.93, THRESHOLD)).toBe(5);
    expect(paceToZone(THRESHOLD, THRESHOLD)).toBe(4);
  });

  it("느려질수록 존이 낮아진다", () => {
    expect(paceToZone(THRESHOLD * 1.1, THRESHOLD)).toBe(3);
    expect(paceToZone(THRESHOLD * 1.2, THRESHOLD)).toBe(2);
    expect(paceToZone(THRESHOLD * 1.35, THRESHOLD)).toBe(1);
  });

  it("Z1 보다도 느린 아주 느린 페이스는 Z1 으로 흡수", () => {
    expect(paceToZone(THRESHOLD * 2, THRESHOLD)).toBe(1);
  });

  it("zonePaceRange 와 왕복 정합 — 각 존 범위 중앙값은 같은 존으로 판정", () => {
    for (const z of [1, 2, 3, 4, 5] as PaceZone[]) {
      const r = zonePaceRange(THRESHOLD, z)!;
      const mid = (r.fastSecPerKm + r.slowSecPerKm) / 2;
      expect(paceToZone(mid, THRESHOLD)).toBe(z);
    }
  });

  it("입력이 유효하지 않으면 null", () => {
    expect(paceToZone(300, null)).toBeNull();
    expect(paceToZone(0, THRESHOLD)).toBeNull();
  });
});

describe("formatPaceSec / formatPaceRange", () => {
  it("초를 M'SS\" 로 표기", () => {
    expect(formatPaceSec(300)).toBe(`5'00"`);
    expect(formatPaceSec(340)).toBe(`5'40"`);
    expect(formatPaceSec(281)).toBe(`4'41"`);
  });

  it("반올림으로 60초가 되면 분을 올린다", () => {
    expect(formatPaceSec(299.7)).toBe(`5'00"`);
  });

  it("유효하지 않은 값은 하이픈", () => {
    expect(formatPaceSec(0)).toBe("-");
    expect(formatPaceSec(Number.NaN)).toBe("-");
  });

  it("범위는 빠른 쪽을 먼저 표기", () => {
    expect(formatPaceRange({ fastSecPerKm: 275, slowSecPerKm: 295 })).toBe(`4'35"–4'55"`);
  });
});

describe("resolveThresholdPace", () => {
  beforeEach(() => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("확정 임계값이 있으면 그대로 사용", () => {
    const r = resolveThresholdPace(THRESHOLD, 280)!;
    expect(r.source).toBe("confirmed");
    expect(r.thresholdPaceSecPerKm).toBe(THRESHOLD);
  });

  it("확정값이 없으면 20분 최고 페이스에서 추정하며, 추정 임계는 더 느리다", () => {
    const best20 = 285;
    const r = resolveThresholdPace(null, best20)!;
    expect(r.source).toBe("estimated");
    expect(r.thresholdPaceSecPerKm).toBeGreaterThan(best20); // 느림 = 큰 sec
    expect(r.thresholdPaceSecPerKm).toBe(Math.round(best20 / 0.95));
  });

  it("둘 다 없으면 null", () => {
    expect(resolveThresholdPace(null, null)).toBeNull();
    expect(resolveThresholdPace(0, 0)).toBeNull();
  });

  it("출처를 로깅한다", () => {
    const spy = vi.spyOn(console, "debug");
    resolveThresholdPace(THRESHOLD, null);
    expect(spy).toHaveBeenCalledWith(
      "[workoutPace.resolveThresholdPace]",
      expect.objectContaining({ source: "confirmed", thresholdPaceSecPerKm: THRESHOLD }),
    );
  });
});
