import { describe, expect, it } from "vitest";

import {
  buildCourseWaypointLaneGroups,
  buildCourseWaypointRows,
  waypointPipAnchorStyle,
  type StoredCourseWaypoint,
} from "./courseWaypoints";

function waypoint(partial: Partial<StoredCourseWaypoint>): StoredCourseWaypoint {
  return {
    name: null,
    type: null,
    note: null,
    latitude: 37.5,
    longitude: 127.0,
    distanceFromStartMeters: 0,
    ...partial,
  };
}

describe("buildCourseWaypointRows", () => {
  it("거리순으로 정렬한다", () => {
    const rows = buildCourseWaypointRows([
      waypoint({ name: "정상", distanceFromStartMeters: 31_200 }),
      waypoint({ name: "GS25", distanceFromStartMeters: 18_400 }),
    ]);
    expect(rows.map((row) => row.name)).toEqual(["GS25", "정상"]);
    expect(rows[0]!.km).toBeCloseTo(18.4, 5);
  });

  it("편의점·카페를 편의(AID) 레인으로 분류한다", () => {
    const rows = buildCourseWaypointRows([
      waypoint({ name: "GS25 하남미사점", distanceFromStartMeters: 1_000 }),
      waypoint({ name: "산성리 카페", distanceFromStartMeters: 2_000 }),
      waypoint({ name: "이름 없음", type: "CONVENIENCE", distanceFromStartMeters: 3_000 }),
    ]);
    expect(rows.map((row) => row.lane)).toEqual(["AID", "AID", "AID"]);
  });

  it("컷오프는 대회 전용이라 코스에서 제외한다", () => {
    const rows = buildCourseWaypointRows([
      waypoint({ name: "컷오프 관문", type: "CUT", distanceFromStartMeters: 5_000 }),
      waypoint({ name: "남한산성 정상", distanceFromStartMeters: 6_000 }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.lane).toBe("KOM");
  });

  it("이름이 비면 null 로 둔다 — 표시 문구는 화면이 정한다", () => {
    const [row] = buildCourseWaypointRows([waypoint({ name: "   ", distanceFromStartMeters: 100 })]);
    expect(row!.name).toBeNull();
  });

  it("좌표나 거리가 깨진 경유지는 버린다", () => {
    expect(buildCourseWaypointRows([
      waypoint({ name: "a", latitude: Number.NaN }),
      waypoint({ name: "b", distanceFromStartMeters: -5 }),
      waypoint({ name: "c", longitude: Number.POSITIVE_INFINITY }),
    ])).toEqual([]);
  });

  it("좌표 범위를 벗어난 경유지도 버린다 — 지도가 유효 영역 밖으로 날아간다", () => {
    expect(buildCourseWaypointRows([
      waypoint({ name: "a", latitude: 91 }),
      waypoint({ name: "b", latitude: -90.5 }),
      waypoint({ name: "c", longitude: 181 }),
      waypoint({ name: "d", longitude: -200 }),
    ])).toEqual([]);
  });

  it("비어 있거나 undefined 면 빈 배열", () => {
    expect(buildCourseWaypointRows(undefined)).toEqual([]);
    expect(buildCourseWaypointRows([])).toEqual([]);
  });
});

describe("waypointPipAnchorStyle", () => {
  it("가운데 지점은 실제 거리 비율을 그대로 쓴다", () => {
    expect(waypointPipAnchorStyle(0.5)).toEqual({ left: "50%" });
    expect(waypointPipAnchorStyle(0.02)).toEqual({ left: "2%" });
    expect(waypointPipAnchorStyle(0.98)).toEqual({ left: "98%" });
  });

  it("가장자리 근처를 끝점으로 몰지 않는다 — 200km 코스에서 2%는 4km 다", () => {
    expect(waypointPipAnchorStyle(0.02).transform).toBeUndefined();
    expect(waypointPipAnchorStyle(0.98).transform).toBeUndefined();
  });

  it("정확히 양 끝일 때만 앵커를 안쪽으로 돌린다", () => {
    expect(waypointPipAnchorStyle(0)).toEqual({ left: "0%", transform: "translate(0, -50%)" });
    expect(waypointPipAnchorStyle(1)).toEqual({ left: "100%", transform: "translate(-100%, -50%)" });
  });
});

describe("buildCourseWaypointLaneGroups", () => {
  it("내용이 있는 레인만 돌려준다 — 편의점만 있는 개인 코스는 레인 하나", () => {
    const rows = buildCourseWaypointRows([
      waypoint({ name: "CU 망월점", distanceFromStartMeters: 12_000 }),
      waypoint({ name: "스타벅스 하남", distanceFromStartMeters: 13_000 }),
    ]);
    const groups = buildCourseWaypointLaneGroups(rows, 42_000);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.lane).toBe("AID");
    expect(groups[0]!.items).toHaveLength(2);
  });

  it("위치 비율을 0~1 로 계산하고 원본 인덱스를 유지한다", () => {
    const rows = buildCourseWaypointRows([
      waypoint({ name: "출발 편의점", distanceFromStartMeters: 0 }),
      waypoint({ name: "정상", distanceFromStartMeters: 21_000 }),
    ]);
    const groups = buildCourseWaypointLaneGroups(rows, 42_000);
    const all = groups.flatMap((group) => group.items);
    expect(all.find((item) => item.name === "출발 편의점")!.ratio).toBe(0);
    expect(all.find((item) => item.name === "정상")!.ratio).toBeCloseTo(0.5, 5);
    // 인덱스는 정렬된 rows 기준 — 표와 레인이 같은 항목을 가리켜야 한다.
    expect(all.map((item) => item.index).sort()).toEqual([0, 1]);
  });

  it("총 거리가 0이면 비율을 0으로 둔다", () => {
    const rows = buildCourseWaypointRows([waypoint({ name: "카페", distanceFromStartMeters: 500 })]);
    expect(buildCourseWaypointLaneGroups(rows, 0)[0]!.items[0]!.ratio).toBe(0);
  });
});
