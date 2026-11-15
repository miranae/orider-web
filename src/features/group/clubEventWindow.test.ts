import { describe, expect, it } from "vitest";
import { clubEventQuery, clubEventWindow, compareClubEvents, OPEN_START_GRACE_MS } from "./clubEventWindow";

const now = Date.UTC(2026, 10, 15, 3, 0);
describe("클럽 이벤트 구간 (#1620)", () => {
  it("시작이 지난 OPEN 은 지난 이벤트, 예정 OPEN·진행 중은 다가오는 이벤트", () => {
    expect(clubEventWindow("OPEN", now - OPEN_START_GRACE_MS - 1, now)).toBe("past");
    expect(clubEventWindow("OPEN", now + 60_000, now)).toBe("upcoming");
    expect(clubEventWindow("LIVE", now - 86_400_000, now)).toBe("upcoming");
    expect(clubEventWindow("FINISHED", now + 1, now)).toBe("past");
    expect(clubEventWindow("CANCELLED", now + 1, now)).toBe("past");
    expect(clubEventWindow("DRAFT", now + 1, now)).toBeNull();
  });
  it("늦게 출발하는 모임은 유예 시간·종료 시각까지 다가오는 이벤트, 시각을 모르면 숨기지 않는다", () => {
    expect(clubEventWindow("OPEN", now - 60_000, now)).toBe("upcoming");
    expect(clubEventWindow("OPEN", now - 86_400_000, now, now + 1)).toBe("upcoming");
    expect(clubEventWindow("OPEN", now - 60_000, now, now - 1)).toBe("past");
    expect(clubEventWindow("OPEN", 0, now)).toBe("upcoming");
  });
  it("다가오는 것은 진행 중 먼저·가까운 순, 지난 것은 최근 순", () => {
    const rows = [
      { id: "later", status: "OPEN", at: now + 2 }, { id: "live", status: "LIVE", at: now - 5 }, { id: "soon", status: "OPEN", at: now + 1 },
    ];
    expect([...rows].sort((a, b) => compareClubEvents("upcoming", a, b)).map(r => r.id)).toEqual(["live", "soon", "later"]);
    const past = [{ id: "old", status: "FINISHED", at: 1 }, { id: "recent", status: "OPEN", at: 3 }, { id: "mid", status: "CANCELLED", at: 2 }];
    expect([...past].sort((a, b) => compareClubEvents("past", a, b)).map(r => r.id)).toEqual(["recent", "mid", "old"]);
  });
  it("구간을 모르는 서버도 같은 상태·정렬로 읽는다", () => {
    expect(clubEventQuery("upcoming")).toEqual({ timeWindow: "upcoming", statuses: ["OPEN", "LIVE"], descending: false });
    expect(clubEventQuery("past")).toEqual({ timeWindow: "past", statuses: ["OPEN", "FINISHED", "CANCELLED"], descending: true });
  });
});
