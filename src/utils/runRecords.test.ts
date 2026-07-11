import { describe, it, expect } from "vitest";
import type { RunPrTable } from "@shared/types/personal-records";
import { distanceRecords, newRecordsForActivity } from "./runRecords";

const e = (value: number, activityId: string, startTime = 0) => ({
  value,
  activityId,
  date: "2026-07-01",
  startTime,
});

describe("distanceRecords", () => {
  it("모든 거리를 표시 순서대로, 각 거리의 최고(최소 초)를 낸다", () => {
    const run: RunPrTable = {
      "1km": [e(281, "a"), e(290, "b")],
      "5km": [e(1600, "c")],
    };
    const rows = distanceRecords(run);
    expect(rows.map((r) => r.distance)).toEqual(["1km", "5km", "10km", "half", "full"]);
    expect(rows[0].best?.value).toBe(281);
    expect(rows[1].best?.value).toBe(1600);
    expect(rows[2].best).toBeNull(); // 10km 기록 없음 — 자리는 남긴다
    expect(rows[3].best).toBeNull(); // half
    expect(rows[4].best).toBeNull(); // full
  });

  it("정렬이 뒤섞여 있어도 최소값을 고른다 (방어적)", () => {
    const rows = distanceRecords({ "1km": [e(300, "x"), e(275, "y"), e(288, "z")] });
    expect(rows[0].best?.activityId).toBe("y");
  });

  it("run 이 없으면 전부 자리만 남긴다 (5거리)", () => {
    const rows = distanceRecords(undefined);
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.best === null)).toBe(true);
  });
});

describe("newRecordsForActivity", () => {
  it("이 활동이 현행 최고면 배너 대상, 직전 최고 대비 단축 초를 계산", () => {
    const run: RunPrTable = {
      "5km": [e(1600, "today"), e(1641, "old")],
    };
    const news = newRecordsForActivity(run, "today");
    expect(news).toHaveLength(1);
    expect(news[0]).toEqual({ distance: "5km", timeSec: 1600, improvedBySec: 41 });
  });

  it("이 활동이 최고가 아니면 배너 없음", () => {
    const run: RunPrTable = { "5km": [e(1600, "someone"), e(1650, "today")] };
    expect(newRecordsForActivity(run, "today")).toEqual([]);
  });

  it("이 활동이 유일 기록이면 improvedBySec 는 null (첫 기록)", () => {
    const run: RunPrTable = { "1km": [e(280, "today")] };
    expect(newRecordsForActivity(run, "today")[0].improvedBySec).toBeNull();
  });

  it("여러 거리에서 동시에 기록을 세우면 모두 반환", () => {
    const run: RunPrTable = {
      "1km": [e(275, "today"), e(280, "old")],
      "5km": [e(1600, "today")],
      "10km": [e(3500, "other")],
    };
    const news = newRecordsForActivity(run, "today");
    expect(news.map((n) => n.distance)).toEqual(["1km", "5km"]);
  });

  it("직전 최고는 '이 활동보다 느린 것 중 가장 빠른 것'이다", () => {
    const run: RunPrTable = {
      "10km": [e(3400, "today"), e(3410, "b"), e(3600, "c")],
    };
    // 직전 최고는 3410 (b) — 3400 보다 느린 것 중 최소
    expect(newRecordsForActivity(run, "today")[0].improvedBySec).toBe(10);
  });

  // 동률 처리 (코드리뷰 지적) — 더 빠르지 않은데 "신기록"이라 말하면 거짓말이다.
  it("직전 최고와 동률이면 배너 없음 — 갱신이 아니다", () => {
    const run: RunPrTable = { "5km": [e(1600, "today"), e(1600, "old")] };
    expect(newRecordsForActivity(run, "today")).toEqual([]);
  });

  // 코드리뷰 지적 — 스트림 보간 값은 소수라 그대로 두면 "41.2999999초 단축" 이 공유된다.
  it("단축 초는 정수로 반올림한다 (공유 문구에 그대로 들어간다)", () => {
    const run: RunPrTable = { "5km": [e(1600.1, "today"), e(1641.4, "old")] };
    expect(newRecordsForActivity(run, "today")[0].improvedBySec).toBe(41);
  });

  // null(첫 기록) 과 0(1초 미만 단축) 은 다른 의미다 — 섞으면 소비처가 "첫 기록이에요" 라고
  // 거짓말한다. 세 상태를 구분한다.
  it("0.5초 미만 단축은 0 — null(첫 기록) 이 아니다", () => {
    const run: RunPrTable = { "5km": [e(1600.1, "today"), e(1600.4, "old")] };
    expect(newRecordsForActivity(run, "today")[0].improvedBySec).toBe(0);
  });

  it("직전 최고가 없을 때만 null (첫 기록)", () => {
    const run: RunPrTable = { "5km": [e(1600, "today")] };
    expect(newRecordsForActivity(run, "today")[0].improvedBySec).toBeNull();
  });

  it("동률이 섞여도 결과가 결정적이다 — 입력 순서가 바뀌어도 같은 답", () => {
    const a: RunPrTable = { "5km": [e(1600, "x"), e(1600, "y")] };
    const b: RunPrTable = { "5km": [e(1600, "y"), e(1600, "x")] };
    expect(newRecordsForActivity(a, "x")).toEqual(newRecordsForActivity(b, "x"));
    expect(newRecordsForActivity(a, "y")).toEqual(newRecordsForActivity(b, "y"));
  });
});
