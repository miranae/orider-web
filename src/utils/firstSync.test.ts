import { describe, it, expect } from "vitest";
import type { Activity } from "@shared/types";
import { decideFirstSync, firstSyncStorageKey } from "./firstSync";

const NOW = Date.parse("2026-07-15T00:00:00Z");
const DAY = 86400000;
/** DashboardPage 가 쓰는 창(8주)과 동일. */
const WINDOW = 56 * DAY;

const run = (daysAgo: number): Activity =>
  ({ id: `r${daysAgo}`, type: "Run", startTime: NOW - daysAgo * DAY, summary: {} }) as unknown as Activity;

/** 계정이 창보다 어린 = 창이 전체 이력을 덮는 신규 사용자. */
const newAccount = { historyWindowMs: WINDOW, accountCreatedMs: NOW - 10 * DAY };

describe("decideFirstSync", () => {
  it("최근에 첫 러닝이 도착했으면 축하한다", () => {
    expect(decideFirstSync([run(1)], NOW, false, newAccount)).toEqual({ action: "celebrate" });
  });

  it("14일 경계 안쪽은 축하", () => {
    expect(decideFirstSync([run(13)], NOW, false, newAccount).action).toBe("celebrate");
  });

  it("오래된 이력이면 모달 없이 조용히 달성 처리 (소급 축하 폭탄 방지)", () => {
    const d = decideFirstSync([run(40), run(2)], NOW, false, newAccount);
    expect(d).toEqual({ action: "mark-silently", reason: "backfill" });
  });

  it("가장 오래된 러닝을 기준으로 판정한다 — 최근 러닝이 있어도 소급이면 조용히", () => {
    expect(decideFirstSync([run(1), run(30)], NOW, false, newAccount).action).toBe("mark-silently");
  });

  it("이미 발화했으면 아무것도 하지 않는다", () => {
    expect(decideFirstSync([run(1)], NOW, true, newAccount)).toEqual({
      action: "none",
      reason: "already-celebrated",
    });
  });

  it("러닝이 없으면 아무것도 하지 않는다", () => {
    expect(decideFirstSync([], NOW, false, newAccount)).toEqual({ action: "none", reason: "no-runs" });
  });

  // 이력 창 잘림 — 복귀 러너 오발화 방지 (코드리뷰 지적).
  it("계정이 조회 창보다 오래됐으면 축하하지 않는다 — 창 밖 러닝을 볼 수 없다", () => {
    // 1년 된 계정, 창(8주) 안에는 어제 달린 러닝 하나뿐. 오래 쉬었다 복귀한 러너의 모습과 같다.
    const d = decideFirstSync([run(1)], NOW, false, {
      historyWindowMs: WINDOW,
      accountCreatedMs: NOW - 365 * DAY,
    });
    expect(d).toEqual({ action: "mark-silently", reason: "history-truncated" });
  });

  // 프로필 로딩 레이스 (코드리뷰 지적) — null 은 "오래된 계정"이 아니라 "아직 모름"이다.
  // 여기서 플래그를 세우면 프로필이 늦게 도착한 신규 사용자가 축하를 영구히 잃는다.
  it("계정 생성일을 모르면 플래그도 세우지 않는다 — 다음 렌더에서 다시 판정", () => {
    const d = decideFirstSync([run(1)], NOW, false, { historyWindowMs: WINDOW, accountCreatedMs: null });
    expect(d).toEqual({ action: "none", reason: "profile-unknown" });
  });

  it("프로필이 늦게 도착해도 축하를 받는다 — 레이스 회귀", () => {
    // 1차 렌더: 프로필 미도착 → 아무것도 안 함(락 없음).
    const first = decideFirstSync([run(1)], NOW, false, {
      historyWindowMs: WINDOW,
      accountCreatedMs: undefined,
    });
    expect(first.action).toBe("none");
    // 2차 렌더: 프로필 도착 → 여전히 alreadyMarked=false 이므로 축하가 살아 있다.
    expect(decideFirstSync([run(1)], NOW, false, newAccount).action).toBe("celebrate");
  });
});

describe("firstSyncStorageKey", () => {
  it("uid 별로 분리된다", () => {
    expect(firstSyncStorageKey("abc")).not.toBe(firstSyncStorageKey("def"));
    expect(firstSyncStorageKey("abc")).toContain("abc");
  });
});
