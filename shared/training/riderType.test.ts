import { describe, expect, it } from "vitest";
import {
  classifyRider,
  estimateAbility,
  RIDER_TYPE_LABELS_KO,
  type RiderType,
} from "./riderType";

describe("classifyRider", () => {
  it("폭발형 + 무거운 체급 → 스프린터 (axisX 음수, axisY 음수)", () => {
    // 5s/1m 매우 강함, 20m 평범, 체중 무거움 → TrackSprinter 또는 RoadSprinter
    const r = classifyRider({
      wPerKgAtKey: { "5s": 20, "1m": 10, "5m": 4.5, "20m": 3.6 },
      weightKg: 88,
    });
    expect(r.axisX).toBeLessThan(0); // 폭발 우위
    expect(r.axisY).toBeLessThan(0); // 무거움 → 절대파워 성향
    expect(["TrackSprinter", "RoadSprinter"]).toContain(r.type);
    expect(r.confidence).toBeGreaterThan(0.8);
  });

  it("가벼운 체급 + 장시간 W/kg 강세 → 클라이머 (axisX 양수, axisY 양수)", () => {
    const r = classifyRider({
      wPerKgAtKey: { "5s": 12, "1m": 7, "5m": 5.6, "20m": 5.4 },
      weightKg: 58,
    });
    expect(r.axisX).toBeGreaterThan(0); // 지속 우위
    expect(r.axisY).toBeGreaterThan(0); // 가벼움 → W/kg 성향
    expect(r.type).toBe("Climber");
  });

  it("20분 지속 강세 + 보통 체급 → 타임트라이얼리스트 (axisX 양수)", () => {
    const r = classifyRider({
      wPerKgAtKey: { "5s": 11, "1m": 6, "5m": 4.8, "20m": 4.6 },
      weightKg: 75,
    });
    expect(r.axisX).toBeGreaterThan(0);
    expect(r.type).toBe("TimeTrialist");
  });

  it("데이터 부족(키 1개) → Unclassified, confidence 낮음", () => {
    const r = classifyRider({ wPerKgAtKey: { "20m": 4.0 }, weightKg: 70 });
    expect(r.type).toBe("Unclassified");
    expect(r.confidence).toBeLessThan(0.3);
  });

  it("체중 없음 → Unclassified", () => {
    const r = classifyRider({
      wPerKgAtKey: { "5s": 18, "1m": 9, "5m": 4.5, "20m": 3.8 },
      weightKg: null,
    });
    expect(r.type).toBe("Unclassified");
  });

  it("wPerKgAtKey null → Unclassified, confidence 0", () => {
    const r = classifyRider({ wPerKgAtKey: null, weightKg: 70 });
    expect(r.type).toBe("Unclassified");
    expect(r.confidence).toBe(0);
  });

  it("axisX/axisY 는 [-1,1] 범위", () => {
    const r = classifyRider({
      wPerKgAtKey: { "5s": 24, "1m": 12, "5m": 7, "20m": 6.5 },
      weightKg: 50,
    });
    expect(r.axisX).toBeGreaterThanOrEqual(-1);
    expect(r.axisX).toBeLessThanOrEqual(1);
    expect(r.axisY).toBeGreaterThanOrEqual(-1);
    expect(r.axisY).toBeLessThanOrEqual(1);
  });

  it("모든 타입에 한국어 라벨이 존재", () => {
    const types: RiderType[] = [
      "RoadSprinter", "TrackSprinter", "AllRounder",
      "Puncher", "Climber", "TimeTrialist", "Unclassified",
    ];
    for (const t of types) {
      expect(RIDER_TYPE_LABELS_KO[t].label).toBeTruthy();
      expect(RIDER_TYPE_LABELS_KO[t].desc).toBeTruthy();
    }
  });
});

describe("estimateAbility", () => {
  it("null 입력 → null", () => {
    expect(estimateAbility(null)).toBeNull();
  });

  it("비교 가능한 duration 없음(0 W/kg) → null", () => {
    expect(estimateAbility({ "5s": 0 })).toBeNull();
  });

  it("표 상한 이상이면 99 백분위로 캡", () => {
    const a = estimateAbility({ "20m": 7.0 });
    expect(a).not.toBeNull();
    expect(a!.byDuration[0]!.percentile).toBe(99);
  });

  it("표 하한 이하이면 1 백분위로 바닥", () => {
    const a = estimateAbility({ "20m": 1.0 });
    expect(a!.byDuration[0]!.percentile).toBe(1);
  });

  it("중간값은 선형보간 — 20m 4.4 → 55 백분위", () => {
    const a = estimateAbility({ "20m": 4.4 });
    expect(a!.byDuration[0]!.percentile).toBe(55);
  });

  it("overallPercentile 은 duration 백분위 평균", () => {
    const a = estimateAbility({ "5s": 16.8, "20m": 4.4 });
    expect(a).not.toBeNull();
    expect(a!.byDuration).toHaveLength(2);
    // 5s 16.8 → 55, 20m 4.4 → 55, 평균 55
    expect(a!.overallPercentile).toBe(55);
  });
});
