import { describe, it, expect } from "vitest";
import type { Activity } from "@shared/types";
import { decideFirstSync, firstSyncStorageKey } from "./firstSync";

const NOW = Date.parse("2026-07-15T00:00:00Z");
const DAY = 86400000;

const run = (daysAgo: number): Activity =>
  ({ id: `r${daysAgo}`, type: "Run", startTime: NOW - daysAgo * DAY, summary: {} }) as unknown as Activity;

describe("decideFirstSync", () => {
  it("최근에 첫 러닝이 도착했으면 축하한다", () => {
    expect(decideFirstSync([run(1)], NOW, false)).toEqual({ action: "celebrate" });
  });

  it("14일 경계 안쪽은 축하", () => {
    expect(decideFirstSync([run(13)], NOW, false).action).toBe("celebrate");
  });

  it("오래된 이력이면 모달 없이 조용히 달성 처리 (소급 축하 폭탄 방지)", () => {
    const d = decideFirstSync([run(400), run(2)], NOW, false);
    expect(d).toEqual({ action: "mark-silently", reason: "backfill" });
  });

  it("가장 오래된 러닝을 기준으로 판정한다 — 최근 러닝이 있어도 소급이면 조용히", () => {
    expect(decideFirstSync([run(1), run(30)], NOW, false).action).toBe("mark-silently");
  });

  it("이미 발화했으면 아무것도 하지 않는다", () => {
    expect(decideFirstSync([run(1)], NOW, true)).toEqual({
      action: "none",
      reason: "already-celebrated",
    });
  });

  it("러닝이 없으면 아무것도 하지 않는다", () => {
    expect(decideFirstSync([], NOW, false)).toEqual({ action: "none", reason: "no-runs" });
  });
});

describe("firstSyncStorageKey", () => {
  it("uid 별로 분리된다", () => {
    expect(firstSyncStorageKey("abc")).not.toBe(firstSyncStorageKey("def"));
    expect(firstSyncStorageKey("abc")).toContain("abc");
  });
});
