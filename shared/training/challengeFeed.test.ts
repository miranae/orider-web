import { describe, expect, it } from "vitest";
import { buildChallengeFeed, matchesStrength, type FeedSegment, type ChallengeFeedInput } from "./challengeFeed";

const seg = (id: string, distanceM: number, avgGradePct: number, climbCategory = 0): FeedSegment => ({
  id,
  name: `seg-${id}`,
  distanceM,
  avgGradePct,
  climbCategory,
});

const base: Omit<ChallengeFeedInput, "segments" | "myBestSecBySegment"> = {
  cp: 250,
  wPrime: 20000,
  riderWeightKg: 70,
  riderType: "Climber",
};

describe("matchesStrength", () => {
  it("클라이머는 경사/등급 세그먼트", () => {
    expect(matchesStrength(seg("a", 5000, 7, 2), "Climber")).toBe(true);
    expect(matchesStrength(seg("b", 5000, 1, 0), "Climber")).toBe(false);
  });
  it("스프린터는 짧고 평평한 세그먼트", () => {
    expect(matchesStrength(seg("a", 1500, 1), "RoadSprinter")).toBe(true);
    expect(matchesStrength(seg("b", 5000, 1), "RoadSprinter")).toBe(false);
  });
  it("TT는 길고 평평한 세그먼트", () => {
    expect(matchesStrength(seg("a", 8000, 1), "TimeTrialist")).toBe(true);
    expect(matchesStrength(seg("b", 2000, 1), "TimeTrialist")).toBe(false);
  });
  it("미분류/null 은 클라임 위주", () => {
    expect(matchesStrength(seg("a", 5000, 7, 1), null)).toBe(true);
    expect(matchesStrength(seg("b", 5000, 1, 0), null)).toBe(false);
  });
});

describe("buildChallengeFeed", () => {
  it("PDC 미비(cp/weight)면 빈 피드", () => {
    const r = buildChallengeFeed({ ...base, cp: 0, segments: [seg("a", 5000, 7, 2)], myBestSecBySegment: {} });
    expect(r).toEqual({ beatPr: [], strength: [], newPlace: [] });
    const r2 = buildChallengeFeed({ ...base, riderWeightKg: 0, segments: [seg("a", 5000, 7, 2)], myBestSecBySegment: {} });
    expect(r2.beatPr.length).toBe(0);
  });

  it("탄 세그먼트에서 예상<베스트면 beatPr", () => {
    const s = seg("a", 5000, 7, 2);
    // 매우 느린 베스트(9999초) → 예상이 훨씬 빠름 → 개선 여지.
    const r = buildChallengeFeed({ ...base, segments: [s], myBestSecBySegment: { a: 9999 } });
    expect(r.beatPr.map((c) => c.segmentId)).toContain("a");
    const card = r.beatPr.find((c) => c.segmentId === "a")!;
    expect(card.currentBestSec).toBe(9999);
    expect(card.improvementSec).toBeGreaterThan(0);
    expect(card.predictedSec).toBeLessThan(9999);
  });

  it("이미 충분히 빠른 베스트면 beatPr 제외", () => {
    const s = seg("a", 5000, 7, 2);
    // 베스트 1초 → 예상이 더 빠를 수 없음 → 개선 여지 없음.
    const r = buildChallengeFeed({ ...base, segments: [s], myBestSecBySegment: { a: 1 } });
    expect(r.beatPr.map((c) => c.segmentId)).not.toContain("a");
  });

  it("안 탄 주목 세그먼트는 newPlace, currentBest null", () => {
    const s = seg("a", 5000, 7, 2);
    const r = buildChallengeFeed({ ...base, segments: [s], myBestSecBySegment: {} });
    expect(r.newPlace.map((c) => c.segmentId)).toContain("a");
    expect(r.newPlace[0]!.currentBestSec).toBeNull();
    expect(r.newPlace[0]!.improvementSec).toBeNull();
  });

  it("클라이머 강점 세그먼트가 strength 에 등급 desc 정렬", () => {
    const segs = [seg("low", 5000, 6, 1), seg("hc", 5000, 9, 5), seg("flat", 5000, 1, 0)];
    const r = buildChallengeFeed({ ...base, riderType: "Climber", segments: segs, myBestSecBySegment: {} });
    expect(r.strength[0]!.segmentId).toBe("hc"); // 등급 높은 것 먼저
    expect(r.strength.map((c) => c.segmentId)).not.toContain("flat");
  });

  it("결정적 — 입력 순서 무관 동일 피드", () => {
    const segs = [seg("a", 5000, 7, 2), seg("b", 4000, 8, 3), seg("c", 6000, 6, 1)];
    const r1 = buildChallengeFeed({ ...base, segments: segs, myBestSecBySegment: {} });
    const r2 = buildChallengeFeed({ ...base, segments: [...segs].reverse(), myBestSecBySegment: {} });
    expect(r1.strength.map((c) => c.segmentId)).toEqual(r2.strength.map((c) => c.segmentId));
    expect(r1.newPlace.map((c) => c.segmentId)).toEqual(r2.newPlace.map((c) => c.segmentId));
  });

  it("너무 짧은 세그먼트(<200m) 제외", () => {
    const r = buildChallengeFeed({ ...base, segments: [seg("tiny", 100, 7, 2)], myBestSecBySegment: {} });
    expect(r.newPlace.length).toBe(0);
    expect(r.strength.length).toBe(0);
  });

  it("limitPerCategory 적용", () => {
    const segs = Array.from({ length: 10 }, (_, i) => seg(`s${i}`, 5000, 7, 2));
    const r = buildChallengeFeed({ ...base, segments: segs, myBestSecBySegment: {}, limitPerCategory: 3 });
    expect(r.newPlace.length).toBe(3);
    expect(r.strength.length).toBe(3);
  });
});
