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
});
