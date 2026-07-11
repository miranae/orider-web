import { describe, it, expect } from "vitest";
import { calcFeasibility } from "./feasibility";

const base = {
  course: { dist: 40, elev: 400 },
  target: { eventType: "time", targetDurationMin: 80 },
  snap: { ftp: 250, weightKg: 70 },
};

describe("calcFeasibility 입력 가드 (#539)", () => {
  it("completion 이벤트 → on_track", () => {
    expect(calcFeasibility({ ...base, target: { eventType: "completion" } }).label).toBe("on_track");
  });

  it("targetDurationMin<=0 → on_track", () => {
    expect(calcFeasibility({ ...base, target: { eventType: "time", targetDurationMin: 0 } }).label).toBe("on_track");
  });

  it("거리 0/누락 → on_track (requiredWkg 비현실 저평가 방지)", () => {
    expect(calcFeasibility({ ...base, course: { dist: 0, elev: 400 } }).label).toBe("on_track");
  });

  it("체중 0/누락 → on_track (myWkg=Infinity/NaN 차단)", () => {
    expect(calcFeasibility({ ...base, snap: { ftp: 250, weightKg: 0 } }).label).toBe("on_track");
  });

  it("FTP 0 → on_track", () => {
    expect(calcFeasibility({ ...base, snap: { ftp: 0, weightKg: 70 } }).label).toBe("on_track");
  });

  it("음수 상승고도 → 0 처리, NaN 없이 유효 라벨", () => {
    const r = calcFeasibility({ ...base, course: { dist: 40, elev: -500 } });
    expect(["easy", "on_track", "stretch", "risky"]).toContain(r.label);
    expect(r.requiredWkg == null || Number.isFinite(r.requiredWkg)).toBe(true);
  });

  it("정상 입력 → 유한 requiredWkg + 유효 라벨", () => {
    const r = calcFeasibility(base);
    expect(["easy", "on_track", "stretch", "risky"]).toContain(r.label);
    expect(Number.isFinite(r.requiredWkg!)).toBe(true);
  });

  it("등반 항에 m/h 값을 중복 변환하지 않는다", () => {
    const r = calcFeasibility({
      course: { dist: 40, elev: 1000 },
      target: { eventType: "time", targetDurationMin: 90 },
      snap: { ftp: 420, weightKg: 70 },
    });
    expect(r.requiredWkg).toBeCloseTo(5.53, 2);
    expect(r.model).toBe("aggregate");
  });

  it("같은 거리·상승고도라도 짧고 가파른 클라임을 더 어렵게 판정한다", () => {
    const common = {
      target: { eventType: "time", targetDurationMin: 90 },
      snap: { ftp: 300, weightKg: 70 },
    };
    const gradual = calcFeasibility({
      ...common,
      course: { dist: 30, elev: 400, climbs: [{ gain: 400, dist: 20_000, cat: 1 }] },
    });
    const steep = calcFeasibility({
      ...common,
      course: { dist: 30, elev: 400, climbs: [{ gain: 400, dist: 5_000, cat: 3 }] },
    });

    expect(gradual.model).toBe("climb_structure");
    expect(steep.model).toBe("climb_structure");
    expect(steep.requiredWkg!).toBeGreaterThan(gradual.requiredWkg!);
  });

  it("유효하지 않은 클라임 구조는 aggregate 경로로 안전하게 폴백한다", () => {
    const result = calcFeasibility({
      ...base,
      course: { ...base.course, climbs: [{ gain: 400, dist: 50_000, cat: 3 }] },
    });
    expect(result.model).toBe("aggregate");
    expect(result.requiredWkg).toBeCloseTo(calcFeasibility(base).requiredWkg!, 2);
  });

  it("부분 유효 배열은 sanitizer를 거쳐 유효 클라임만 계산한다", () => {
    const mixed = calcFeasibility({
      ...base,
      course: {
        ...base.course,
        climbs: [null, { gain: 'x', dist: 1000, cat: 2 }, { gain: 200, dist: 4000, cat: 3 }] as never,
      },
    });
    expect(mixed.model).toBe("climb_structure");
    expect(Number.isFinite(mixed.requiredWkg)).toBe(true);
  });
});
