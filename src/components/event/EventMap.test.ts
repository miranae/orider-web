import { describe, expect, it } from "vitest";
import { visibleOverallRank } from "./EventMap";

// 운영자 대시보드 지도는 표(ParticipantTable pendingFinish)와 같은 순위 규칙을 쓴다(#4078).
describe("visibleOverallRank", () => {
  it("hides a finisher's rank until results are confirmed", () => {
    expect(visibleOverallRank({ status: "FINISHED", overallRank: 1 }, true)).toBeNull();
    expect(visibleOverallRank({ status: "finished", overallRank: 1 }, true)).toBeNull();
  });

  it("keeps the live rank of riders still on course and every rank outside the pending-finish view", () => {
    expect(visibleOverallRank({ status: "RIDING", overallRank: 3 }, true)).toBe(3);
    expect(visibleOverallRank({ status: "FINISHED", overallRank: 1 })).toBe(1);
  });
});
