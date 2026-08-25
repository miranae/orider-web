import { describe, expect, it } from "vitest";
import type { Activity } from "@shared/types";
import { filterByDiscipline, getDiscipline, getDisciplineOrNull } from "./disciplineFilter";

function act(type: string | undefined): Activity {
  return { id: type ?? "none", type } as unknown as Activity;
}

describe("getDiscipline (웹 표시용 · bike 폴백 유지)", () => {
  it("Strava sport_type 을 종목으로 판정한다", () => {
    expect(getDiscipline("Ride")).toBe("bike");
    expect(getDiscipline("VirtualRide")).toBe("bike");
    expect(getDiscipline("Run")).toBe("run");
    expect(getDiscipline("TrailRun")).toBe("run");
    expect(getDiscipline("Swim")).toBe("swim");
    // 하위 종목 — 부분 문자열 시절 걸렸던 값이라 정확 일치 표에 반드시 있어야 한다.
    expect(getDiscipline("OpenWaterSwim")).toBe("swim");
    expect(getDiscipline("PoolSwim")).toBe("swim");
  });

  it("트레킹·걷기는 러닝 (서버 판정과 일치)", () => {
    expect(getDiscipline("Hike")).toBe("run");
    expect(getDiscipline("Walk")).toBe("run");
  });

  it("부분 문자열로 매칭하지 않는다", () => {
    // 옛 substring 분류기는 "VirtualRowing" 을 러닝으로 걸었다.
    expect(getDisciplineOrNull("VirtualRowing")).toBeNull();
    expect(getDisciplineOrNull("Rideshare")).toBeNull();
  });

  it("미지 종목은 표시용으로 bike 폴백 (잔여 갭 — 문서화된 동작)", () => {
    expect(getDiscipline("Yoga")).toBe("bike");
    expect(getDiscipline(undefined)).toBe("bike");
    // 미상 여부가 필요한 호출자는 OrNull 을 쓴다.
    expect(getDisciplineOrNull("Yoga")).toBeNull();
    expect(getDisciplineOrNull(undefined)).toBeNull();
  });
});

describe("filterByDiscipline", () => {
  const activities = [
    act("Ride"), act("VirtualRide"), act("Run"), act("Hike"), act("Walk"),
    act("Swim"), act("Yoga"), act("WeightTraining"), act(undefined),
  ];

  it("종목 축별로 정확 일치 활동만 고른다", () => {
    expect(filterByDiscipline(activities, "bike").map((a) => a.type)).toEqual(["Ride", "VirtualRide"]);
    expect(filterByDiscipline(activities, "run").map((a) => a.type)).toEqual(["Run", "Hike", "Walk"]);
    expect(filterByDiscipline(activities, "swim").map((a) => a.type)).toEqual(["Swim"]);
  });

  it("미지 종목·type 부재는 어느 축에도 들어가지 않는다", () => {
    const all = [
      ...filterByDiscipline(activities, "bike"),
      ...filterByDiscipline(activities, "run"),
      ...filterByDiscipline(activities, "swim"),
    ].map((a) => a.type);
    expect(all).not.toContain("Yoga");
    expect(all).not.toContain("WeightTraining");
    expect(all).not.toContain(undefined);
  });

  it("tri 는 기존 동작(사이클 목록)을 보존한다", () => {
    // 화면마다 tri 의 의미가 다르다 — FitnessPage 는 호출 전에 전체로 분기하고
    // DashboardPage 는 이 함수에 그대로 넘긴다. 통일은 이 트랙 범위 밖.
    expect(filterByDiscipline(activities, "tri").map((a) => a.type)).toEqual(["Ride", "VirtualRide"]);
  });
});
