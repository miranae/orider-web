import { describe, expect, it } from "vitest";

import {
  activeLanes,
  buildElevationProfile,
  buildRouteLegs,
  classifyElevationQuality,
  classifyLane,
  computeTrackStats,
  cumulativeDistances,
  describeWaypoints,
  fillMissingElevations,
  haversineMeters,
  isLaneVisibleIn,
  isProfileMarkerLane,
  laneLabelKey,
  lanesForContext,
  nearestPointIndex,
  parseGpx,
  parseGpxName,
  profileIndexForSourceIndex,
  resolveWaypointsOnTrack,
  routePointRole,
  type TrackPoint,
} from "./index";

function track(...entries: Array<[lat: number, lon: number, ele: number]>): TrackPoint[] {
  return entries.map(([lat, lon, ele]) => ({ lat, lon, ele }));
}

describe("geo", () => {
  it("서울-부산 거리를 실제 값 근처로 계산한다", () => {
    const distance = haversineMeters(37.5665, 126.978, 35.1796, 129.0756);
    expect(distance).toBeGreaterThan(320_000);
    expect(distance).toBeLessThan(330_000);
  });

  it("누적 거리는 0에서 시작하고 단조 증가한다", () => {
    const cumulative = cumulativeDistances(track([37.5, 127.0, 0], [37.51, 127.0, 0], [37.52, 127.0, 0]));
    expect(cumulative[0]).toBe(0);
    expect(cumulative[1]).toBeGreaterThan(0);
    expect(cumulative[2]).toBeGreaterThan(cumulative[1]!);
  });

  it("빈 트랙과 단일 점을 안전하게 처리한다", () => {
    expect(cumulativeDistances([])).toEqual([]);
    expect(cumulativeDistances(track([37.5, 127.0, 0]))).toEqual([0]);
    expect(nearestPointIndex([], { lat: 37.5, lon: 127.0 })).toEqual({ index: -1, distanceM: Infinity });
  });

  it("fromIndex 이전 구간은 탐색하지 않는다", () => {
    const points = track([37.5, 127.0, 0], [37.6, 127.0, 0], [37.5, 127.0, 0]);
    expect(nearestPointIndex(points, { lat: 37.5, lon: 127.0 }).index).toBe(0);
    expect(nearestPointIndex(points, { lat: 37.5, lon: 127.0 }, 1).index).toBe(2);
  });
});

describe("computeTrackStats", () => {
  it("획득고도와 손실고도를 분리해 집계한다", () => {
    const stats = computeTrackStats(track([37.5, 127.0, 10], [37.501, 127.0, 30], [37.502, 127.0, 20]));
    expect(stats.elevationGainM).toBe(20);
    expect(stats.elevationLossM).toBe(10);
    expect(stats.maxElevationM).toBe(30);
    expect(stats.minElevationM).toBe(10);
    expect(stats.distanceM).toBeGreaterThan(200);
  });

  it("평균 경사는 순 고도차가 아니라 획득고도 기준이다", () => {
    // 올라갔다 같은 높이로 내려오는 코스 — 순 고도차는 0 이지만 평균 경사는 0 이 아니어야 한다.
    const stats = computeTrackStats(track([37.5, 127.0, 0], [37.505, 127.0, 100], [37.51, 127.0, 0]));
    expect(stats.elevationGainM).toBe(100);
    expect(stats.avgGradePct).toBeGreaterThan(0);
  });

  it("비현실적인 경사(100% 이상)는 최대 경사에서 제외한다", () => {
    const stats = computeTrackStats(track([37.5, 127.0, 0], [37.50001, 127.0, 500]));
    expect(stats.maxGradePct).toBe(0);
  });

  it("점이 2개 미만이면 0으로 채운 통계를 돌려준다", () => {
    expect(computeTrackStats([]).distanceM).toBe(0);
    expect(computeTrackStats(track([37.5, 127.0, 10])).elevationGainM).toBe(0);
  });
});

describe("classifyElevationQuality", () => {
  it("고도 변화가 1m 미만이면 표본이 없는 것으로 본다", () => {
    expect(classifyElevationQuality([10, 10, 10.5], "measured")).toBe("none");
    expect(classifyElevationQuality([0, 0, 0], "estimated")).toBe("none");
  });

  it("유효한 표본에는 출처를 그대로 붙인다", () => {
    expect(classifyElevationQuality([10, 40], "measured")).toBe("measured");
    expect(classifyElevationQuality([10, 40], "estimated")).toBe("estimated");
  });

  it("표본이 2개 미만이면 none", () => {
    expect(classifyElevationQuality([10], "measured")).toBe("none");
    expect(classifyElevationQuality([], "measured")).toBe("none");
  });
});

describe("buildElevationProfile", () => {
  it("목표 표본 수 이하면 그대로 둔다", () => {
    const points = track([37.5, 127.0, 0], [37.501, 127.0, 10]);
    expect(buildElevationProfile(points, 600)).toHaveLength(2);
  });

  it("축약해도 봉우리와 골짜기를 잃지 않는다", () => {
    // 등간격 추출이면 표본 사이에 끼어 사라질 위치에 정상과 골짜기를 둔다.
    const points: TrackPoint[] = [];
    for (let index = 0; index < 1_000; index += 1) {
      points.push({ lat: 37.5 + index * 0.0001, lon: 127.0, ele: 100 });
    }
    points[377]!.ele = 950;
    points[404]!.ele = 5;

    const profile = buildElevationProfile(points, 40);

    expect(profile.length).toBeLessThanOrEqual(40);
    const elevations = profile.map((sample) => sample.elevationM);
    expect(Math.max(...elevations)).toBe(950);
    expect(Math.min(...elevations)).toBe(5);
  });

  it("첫 점과 끝 점을 항상 포함하고 순서를 유지한다", () => {
    const points: TrackPoint[] = Array.from({ length: 500 }, (_, index) => ({
      lat: 37.5 + index * 0.0001,
      lon: 127.0,
      ele: index,
    }));

    const profile = buildElevationProfile(points, 30);

    expect(profile[0]!.sourceIndex).toBe(0);
    expect(profile[profile.length - 1]!.sourceIndex).toBe(499);
    for (let index = 1; index < profile.length; index += 1) {
      expect(profile[index]!.sourceIndex).toBeGreaterThan(profile[index - 1]!.sourceIndex);
      expect(profile[index]!.distanceM).toBeGreaterThanOrEqual(profile[index - 1]!.distanceM);
    }
  });

  it("목표 표본 수가 아주 작아도 상한을 지킨다", () => {
    const points: TrackPoint[] = Array.from({ length: 100 }, (_, index) => ({
      lat: 37.5 + index * 0.0001, lon: 127.0, ele: index,
    }));
    expect(buildElevationProfile(points, 3)).toHaveLength(2);
    expect(buildElevationProfile(points, 2)).toHaveLength(2);
    expect(buildElevationProfile(points, 1)).toHaveLength(1);
    expect(buildElevationProfile(points, 8).length).toBeLessThanOrEqual(8);
  });

  it("빈 트랙은 빈 프로필", () => {
    expect(buildElevationProfile([], 100)).toEqual([]);
    expect(profileIndexForSourceIndex([], 3)).toBe(-1);
  });
});

describe("resolveWaypointsOnTrack", () => {
  const outAndBack = track(
    [37.500, 127.0, 0],
    [37.505, 127.0, 50],
    [37.510, 127.0, 100],
    [37.505, 127.0, 50],
    [37.500, 127.0, 0],
  );

  it("왕복 코스에서 순서를 지정하면 인덱스가 역전되지 않는다", () => {
    const cumulative = cumulativeDistances(outAndBack);
    // 같은 좌표가 갈 때와 올 때 두 번 나온다. 전역 최근접 탐색이면 세 번째 경유지가 인덱스 1 에 붙는다.
    const waypoints = [
      { lat: 37.500, lon: 127.0 },
      { lat: 37.510, lon: 127.0 },
      { lat: 37.505, lon: 127.0 },
    ];

    const resolved = resolveWaypointsOnTrack(waypoints, outAndBack, cumulative, { ordered: true });

    expect(resolved.map((item) => item.trackIndex)).toEqual([0, 2, 3]);
    for (let index = 1; index < resolved.length; index += 1) {
      expect(resolved[index]!.distanceFromStartM).toBeGreaterThanOrEqual(resolved[index - 1]!.distanceFromStartM);
    }
  });

  it("도착점임을 알려주면 순환 코스의 도착점이 끝 인덱스로 간다", () => {
    // 같은 인덱스부터 다시 찾으면 도착점이 인덱스 0 에 매핑되어 전체 거리가 0 이 된다.
    const loop = track(
      [37.500, 127.0, 0],
      [37.505, 127.0, 50],
      [37.510, 127.0, 100],
      [37.500, 127.0, 0],
    );
    const cumulative = cumulativeDistances(loop);
    const resolved = resolveWaypointsOnTrack(
      [{ lat: 37.500, lon: 127.0 }, { lat: 37.500, lon: 127.0 }],
      loop,
      cumulative,
      { ordered: true, lastIsDestination: true },
    );

    expect(resolved[0]!.trackIndex).toBe(0);
    expect(resolved[1]!.trackIndex).toBe(3);
    expect(resolved[1]!.distanceFromStartM).toBeGreaterThan(0);
    expect(resolved[1]!.distanceFromStartM).toBeCloseTo(cumulative[3]!, 5);
  });

  it("열린 코스에서는 도착점 신호가 있어도 끝으로 옮기지 않는다", () => {
    // 트랙 종점이 멀리 있으면 보정 대상이 아니다. 근접성을 보지 않으면 도착점이
    // 코스 반대편 끝으로 날아간다.
    const openCourse = track(
      [37.500, 127.0, 0],
      [37.505, 127.0, 50],
      [37.510, 127.0, 100],
    );
    const cumulative = cumulativeDistances(openCourse);
    const resolved = resolveWaypointsOnTrack(
      [{ lat: 37.500, lon: 127.0 }, { lat: 37.500, lon: 127.0 }],
      openCourse,
      cumulative,
      { ordered: true, lastIsDestination: true },
    );
    expect(resolved.map((item) => item.trackIndex)).toEqual([0, 0]);
    expect(resolved[1]!.distanceFromStartM).toBe(0);
  });

  it("도착점 신호가 없으면 순환 코스에서도 마지막 POI 를 끝으로 옮기지 않는다", () => {
    // 출발지에 카페와 화장실이 함께 있는 경우. 데이터만 보고는 "도착점"과 구분할 수 없다.
    const loop = track(
      [37.500, 127.0, 0],
      [37.505, 127.0, 50],
      [37.510, 127.0, 100],
      [37.500, 127.0, 0],
    );
    const cumulative = cumulativeDistances(loop);
    const resolved = resolveWaypointsOnTrack(
      [{ lat: 37.500, lon: 127.0 }, { lat: 37.500, lon: 127.0 }],
      loop,
      cumulative,
      { ordered: true },
    );
    expect(resolved.map((item) => item.trackIndex)).toEqual([0, 0]);
  });

  it("촘촘한 트랙에서도 같은 자리의 POI 는 같은 점에 남는다", () => {
    // 점 간격이 10m 안팎인 실제 트랙. 폐합 보정이 여기까지 번지면 쉼터의 카페·화장실이
    // 서로 다른 점에 붙어 구간 거리가 왜곡된다.
    const dense: TrackPoint[] = Array.from({ length: 40 }, (_, index) => ({
      lat: 37.5 + index * 0.0001, lon: 127.0, ele: 10,
    }));
    const cumulative = cumulativeDistances(dense);
    const resolved = resolveWaypointsOnTrack(
      [{ lat: 37.5, lon: 127.0 }, { lat: 37.5, lon: 127.0 }, { lat: 37.5, lon: 127.0 }],
      dense,
      cumulative,
      { ordered: true },
    );
    expect(resolved.map((item) => item.trackIndex)).toEqual([0, 0, 0]);
  });

  it("도착점 신호가 있어도 중간 경유지는 옮기지 않는다", () => {
    const loop = track(
      [37.500, 127.0, 0],
      [37.505, 127.0, 50],
      [37.510, 127.0, 100],
      [37.500, 127.0, 0],
    );
    const cumulative = cumulativeDistances(loop);
    // 마지막 경유지는 정상 지점 — 폐합점이 아니므로 보정 대상이 아니다.
    const resolved = resolveWaypointsOnTrack(
      [{ lat: 37.500, lon: 127.0 }, { lat: 37.500, lon: 127.0 }, { lat: 37.510, lon: 127.0 }],
      loop,
      cumulative,
      { ordered: true, lastIsDestination: true },
    );
    expect(resolved.map((item) => item.trackIndex)).toEqual([0, 0, 2]);
  });

  it("같은 위치의 경유지 여럿은 같은 점에 투영된다 — 억지로 뒤로 밀지 않는다", () => {
    // 쉼터 하나에 카페·화장실이 같이 있는 경우. 다음 트랙 점이 100m 넘게 떨어진
    // 희소한 트랙에서 억지로 전진시키면 거리·구간 고도가 크게 왜곡된다.
    const sparse = track([37.500, 127.0, 0], [37.501, 127.0, 10]);
    const cumulative = cumulativeDistances(sparse);
    const resolved = resolveWaypointsOnTrack(
      [{ lat: 37.5, lon: 127.0 }, { lat: 37.5, lon: 127.0 }, { lat: 37.5, lon: 127.0 }],
      sparse,
      cumulative,
      { ordered: true },
    );
    expect(resolved.map((item) => item.trackIndex)).toEqual([0, 0, 0]);
    expect(resolved.every((item) => item.distanceFromStartM === 0)).toBe(true);
  });

  it("순서를 신뢰할 수 없는 입력은 거리순으로 정렬한다", () => {
    const cumulative = cumulativeDistances(outAndBack);
    const resolved = resolveWaypointsOnTrack(
      [{ lat: 37.510, lon: 127.0 }, { lat: 37.500, lon: 127.0 }],
      outAndBack,
      cumulative,
    );
    expect(resolved[0]!.distanceFromStartM).toBeLessThan(resolved[1]!.distanceFromStartM);
  });

  it("트랙에서 떨어진 경유지는 offTrack 거리로 드러난다", () => {
    const cumulative = cumulativeDistances(outAndBack);
    const [resolved] = resolveWaypointsOnTrack([{ lat: 37.6, lon: 127.0 }], outAndBack, cumulative);
    expect(resolved!.offTrackM).toBeGreaterThan(9_000);
  });

  it("빈 트랙에는 빈 결과", () => {
    expect(resolveWaypointsOnTrack([{ lat: 37.5, lon: 127.0 }], [], [])).toEqual([]);
  });
});

describe("buildRouteLegs", () => {
  it("구간 거리의 합이 경유지 사이 총 거리와 일치한다", () => {
    const points = track([37.500, 127.0, 0], [37.505, 127.0, 100], [37.510, 127.0, 60]);
    const cumulative = cumulativeDistances(points);
    const resolved = resolveWaypointsOnTrack(
      [{ lat: 37.500, lon: 127.0 }, { lat: 37.505, lon: 127.0 }, { lat: 37.510, lon: 127.0 }],
      points,
      cumulative,
      { ordered: true },
    );

    const legs = buildRouteLegs(resolved, points, cumulative);

    expect(legs).toHaveLength(2);
    expect(legs[0]!.elevationGainM).toBe(100);
    expect(legs[1]!.elevationLossM).toBe(40);
    const total = legs.reduce((sum, leg) => sum + leg.distanceM, 0);
    expect(total).toBeCloseTo(cumulative[cumulative.length - 1]!, 5);
  });

  it("경유지가 1개 이하면 구간이 없다", () => {
    expect(buildRouteLegs([], [], [])).toEqual([]);
  });
});

describe("describeWaypoints", () => {
  const line = track([37.500, 127.0, 0], [37.505, 127.0, 20], [37.510, 127.0, 10]);
  const cumulative = cumulativeDistances(line);

  it("역할과 분류를 함께 붙인다 — 출발점이면서 분류가 없는 경우와 보급지가 공존한다", () => {
    const resolved = resolveWaypointsOnTrack(
      [
        { lat: 37.500, lon: 127.0, name: "출발", type: "" },
        { lat: 37.505, lon: 127.0, name: "GS25 하남점", type: "" },
        { lat: 37.510, lon: 127.0, name: "도착", type: "" },
      ],
      line,
      cumulative,
      { ordered: true },
    );

    const described = describeWaypoints(resolved);

    expect(described.map((item) => item.role)).toEqual(["start", "via", "finish"]);
    expect(described[1]!.lane).toBe("AID");
    expect(activeLanes(described)).toEqual(["AID", "SEG"]);
  });

  it("좌표뿐인 라우팅 제어점에는 레인을 붙이지 않는다", () => {
    const resolved = resolveWaypointsOnTrack(
      [{ lat: 37.500, lon: 127.0 }, { lat: 37.510, lon: 127.0 }],
      line,
      cumulative,
      { ordered: true },
    );

    const described = describeWaypoints(resolved);

    expect(described.every((item) => item.lane === null)).toBe(true);
    expect(activeLanes(described)).toEqual([]);
  });

  it("보급지만 있는 개인 코스는 레인이 하나만 활성된다", () => {
    const resolved = resolveWaypointsOnTrack(
      [{ lat: 37.505, lon: 127.0, name: "한강 카페", type: "CAFE" }],
      line,
      cumulative,
    );
    expect(activeLanes(describeWaypoints(resolved))).toEqual(["AID"]);
  });

  it("컷오프는 코스 문맥에서 걸러지고 대회 문맥에서만 나온다", () => {
    const resolved = resolveWaypointsOnTrack(
      [
        { lat: 37.500, lon: 127.0, name: "컷오프 관문", type: "CUT" },
        { lat: 37.510, lon: 127.0, name: "정상", type: "" },
      ],
      line,
      cumulative,
      { ordered: true },
    );
    const described = describeWaypoints(resolved);

    expect(activeLanes(described, "course")).toEqual(["KOM"]);
    expect(activeLanes(described, "event")).toEqual(["KOM", "CUT"]);
  });
});

describe("레인 문맥", () => {
  it("코스는 컷오프를 노출하지 않고 대회는 노출한다", () => {
    expect(lanesForContext("course")).toEqual(["KOM", "AID", "SEG"]);
    expect(lanesForContext("event")).toEqual(["KOM", "AID", "CUT", "SEG"]);
    expect(isLaneVisibleIn("CUT", "course")).toBe(false);
    expect(isLaneVisibleIn("CUT", "event")).toBe(true);
  });

  it("같은 분류라도 코스에서는 편의, 대회에서는 보급으로 부른다", () => {
    expect(laneLabelKey("AID", "course")).toBe("detail.lane.amenity");
    expect(laneLabelKey("AID", "event")).toBe("detail.lane.aid");
    expect(laneLabelKey("KOM", "course")).toBe(laneLabelKey("KOM", "event"));
  });
});

describe("routePointRole", () => {
  it("첫 점은 출발, 마지막 점은 도착, 나머지는 경유", () => {
    expect(routePointRole(0, 3)).toBe("start");
    expect(routePointRole(1, 3)).toBe("via");
    expect(routePointRole(2, 3)).toBe("finish");
  });

  it("점이 하나뿐이면 출발로만 본다", () => {
    expect(routePointRole(0, 1)).toBe("start");
  });
});

describe("classifyLane", () => {
  it("유형 코드를 이름보다 먼저 본다", () => {
    expect(classifyLane({ name: "이름 없음", type: "FOOD" })).toBe("AID");
    expect(classifyLane({ name: "이름 없음", type: "cutoff" })).toBe("CUT");
    expect(classifyLane({ name: "이름 없음", type: "SUMMIT" })).toBe("KOM");
  });

  it("영어 이름도 한국어와 같은 레인으로 분류한다", () => {
    expect(classifyLane({ name: "Aid Station 1", type: "" })).toBe(classifyLane({ name: "1차 보급", type: "" }));
    expect(classifyLane({ name: "Summit", type: "" })).toBe(classifyLane({ name: "정상", type: "" }));
    expect(classifyLane({ name: "Cutoff", type: "" })).toBe(classifyLane({ name: "컷오프", type: "" }));
  });

  it("표와 차트가 같은 답을 낸다 — KOM 표기가 갈리지 않는다", () => {
    // 이전에는 표가 "KOM", 차트가 "콤" 을 찾아 같은 지점의 분류가 어긋났다.
    expect(classifyLane({ name: "KOM 구간", type: "" })).toBe("KOM");
    expect(isProfileMarkerLane(classifyLane({ name: "KOM 구간", type: "" }))).toBe(true);
  });

  it("개인 코스의 편의점·카페·식당도 보급으로 분류한다", () => {
    expect(classifyLane({ name: "GS25 팔당점", type: "" })).toBe("AID");
    expect(classifyLane({ name: "한강 카페", type: "" })).toBe("AID");
    expect(classifyLane({ name: "기사식당", type: "" })).toBe("AID");
    expect(classifyLane({ name: "이름 없음", type: "CONVENIENCE" })).toBe("AID");
    expect(classifyLane({ name: "이름 없음", type: "cafe" })).toBe("AID");
  });

  it("영어 이름은 단어 단위로 맞춘다 — 부분 문자열 오탐을 막는다", () => {
    // "Forest Summit" 의 rest, "Shortcut" 의 cut 처럼 다른 단어에 끼어 있는 철자를
    // 키워드로 오인하면 엉뚱한 보급소·컷오프가 화면에 뜬다.
    expect(classifyLane({ name: "Forest Summit", type: "" })).toBe("KOM");
    expect(classifyLane({ name: "Shortcut", type: "" })).toBe("SEG");
    expect(classifyLane({ name: "Crestwood", type: "" })).toBe("SEG");
    expect(classifyLane({ name: "Restaurant Row", type: "" })).toBe("SEG");
    expect(classifyLane({ name: "Cucumber Farm", type: "" })).toBe("SEG");
    expect(classifyLane({ name: "Peakwood Trail", type: "" })).toBe("SEG");
  });

  it("단어로 떨어져 있으면 정상 분류한다", () => {
    expect(classifyLane({ name: "Rest Area", type: "" })).toBe("AID");
    expect(classifyLane({ name: "CU 망월점", type: "" })).toBe("AID");
    expect(classifyLane({ name: "Cut Off Gate", type: "" })).toBe("CUT");
  });

  it("한국어는 띄어쓰기 없이 붙어도 잡는다", () => {
    expect(classifyLane({ name: "1차보급소", type: "" })).toBe("AID");
    expect(classifyLane({ name: "남한산성정상", type: "" })).toBe("KOM");
  });

  it("판정하지 못하면 SEG 이고 차트 마커에서 제외된다", () => {
    expect(classifyLane({ name: "3번 지점", type: "GENERIC" })).toBe("SEG");
    expect(isProfileMarkerLane("SEG")).toBe(false);
  });
});

describe("fillMissingElevations", () => {
  it("사이가 비면 선형 보간한다", () => {
    expect(fillMissingElevations([0, null, null, 30]).elevations).toEqual([0, 10, 20, 30]);
  });

  it("앞뒤 끝이 비면 가장 가까운 유효 값으로 잇는다", () => {
    const { elevations } = fillMissingElevations([null, null, 50, 60, null]);
    expect(elevations).toEqual([50, 50, 50, 60, 60]);
  });

  it("전부 유효하면 그대로 둔다", () => {
    expect(fillMissingElevations([10, 20, 30])).toEqual({ elevations: [10, 20, 30], hasElevation: true });
  });

  it("빠진 구간이 길면 보간하지 않는다 — 시작·끝만 있는 트랙은 가짜 프로필이 된다", () => {
    // 수천 점에 두 점만 고도가 있으면 직선으로 이어져 언덕이 통째로 사라진다.
    const sparse: (number | null)[] = new Array(200).fill(null);
    sparse[0] = 10;
    sparse[199] = 400;
    expect(fillMissingElevations(sparse)).toEqual({
      elevations: sparse.map(() => 0),
      hasElevation: false,
    });
  });

  it("한두 점 빠진 정도는 메운다", () => {
    const values: (number | null)[] = [10, null, 30, 40, null, null, 70];
    const { elevations, hasElevation } = fillMissingElevations(values);
    expect(hasElevation).toBe(true);
    expect(elevations[1]).toBe(20);
    expect(elevations.every((value) => Number.isFinite(value))).toBe(true);
  });

  it("앞뒤 끝이 길게 비어도 고도 없음으로 본다", () => {
    const trailing: (number | null)[] = [10, 20, ...new Array(50).fill(null)];
    expect(fillMissingElevations(trailing).hasElevation).toBe(false);
  });

  it("유효 표본이 부족하면 고도 없음으로 본다", () => {
    expect(fillMissingElevations([null, null])).toEqual({ elevations: [0, 0], hasElevation: false });
    expect(fillMissingElevations([42, null, null])).toEqual({ elevations: [0, 0, 0], hasElevation: false });
    expect(fillMissingElevations([])).toEqual({ elevations: [], hasElevation: false });
  });
});

describe("parseGpx", () => {
  const gpxWithElevation = `<?xml version="1.0" encoding="UTF-8"?>
    <gpx version="1.1" creator="orider">
      <metadata><name>메타 이름</name></metadata>
      <trk><name>남산 코스</name><trkseg>
        <trkpt lat="37.5" lon="127.0"><ele>10</ele></trkpt>
        <trkpt lat="37.501" lon="127.001"><ele>30</ele></trkpt>
        <trkpt lat="37.502" lon="127.002"><ele>20</ele></trkpt>
      </trkseg></trk>
      <wpt lat="37.5005" lon="127.0005"><ele>15</ele><name>1차 보급</name><type>FOOD</type></wpt>
      <rte><rtept lat="37.5001" lon="127.0001"><name>제어점</name></rtept></rte>
    </gpx>`;

  it("트랙·관심지점·제어점을 분리해 읽는다", () => {
    const parsed = parseGpx(gpxWithElevation);

    expect(parsed.points).toHaveLength(3);
    expect(parsed.latlng).toEqual([[37.5, 127.0], [37.501, 127.001], [37.502, 127.002]]);
    expect(parsed.waypoints).toEqual([
      { lat: 37.5005, lon: 127.0005, ele: 15, name: "1차 보급", type: "FOOD" },
    ]);
    expect(parsed.routePoints).toHaveLength(1);
    expect(parsed.routePoints[0]!.name).toBe("제어점");
  });

  it("통계를 함께 계산한다", () => {
    const parsed = parseGpx(gpxWithElevation);
    expect(parsed.stats.elevationGainM).toBe(20);
    expect(parsed.stats.elevationLossM).toBe(10);
    expect(parsed.stats.maxElevationM).toBe(30);
    expect(parsed.stats.distanceM).toBeGreaterThan(250);
  });

  it("<ele> 가 없으면 hasElevation 이 false — 평지로 오독되는 것을 막는다", () => {
    const parsed = parseGpx(`<gpx>
      <trk><trkseg>
        <trkpt lat="37.5" lon="127.0" />
        <trkpt lat="37.501" lon="127.001" />
      </trkseg></trk>
    </gpx>`);

    expect(parsed.points).toHaveLength(2);
    expect(parsed.hasElevation).toBe(false);
    expect(parsed.stats.elevationGainM).toBe(0);
  });

  it("빠진 <ele> 를 0 으로 채우지 않고 이웃 값으로 보간한다", () => {
    // 0 으로 채우면 그 지점만 해수면까지 급락했다 복귀하는 절벽이 생겨
    // 획득·손실고도가 크게 부풀고 프로필이 망가진다.
    const parsed = parseGpx(`<gpx>
      <trk><trkseg>
        <trkpt lat="37.500" lon="127.0"><ele>100</ele></trkpt>
        <trkpt lat="37.501" lon="127.0" />
        <trkpt lat="37.502" lon="127.0"><ele>140</ele></trkpt>
      </trkseg></trk>
    </gpx>`);

    expect(parsed.hasElevation).toBe(true);
    expect(parsed.points.map((point) => point.ele)).toEqual([100, 120, 140]);
    expect(parsed.stats.elevationGainM).toBe(40);
    expect(parsed.stats.elevationLossM).toBe(0);
    expect(parsed.stats.minElevationM).toBe(100);
  });

  it("유효 표본이 2개 미만이면 고도가 없는 것으로 본다", () => {
    const parsed = parseGpx(`<gpx>
      <trk><trkseg>
        <trkpt lat="37.5" lon="127.0"><ele>10</ele></trkpt>
        <trkpt lat="37.501" lon="127.001" />
        <trkpt lat="37.502" lon="127.002" />
      </trkseg></trk>
    </gpx>`);

    expect(parsed.hasElevation).toBe(false);
    expect(parsed.points.every((point) => point.ele === 0)).toBe(true);
  });

  it("고도가 온전하면 hasElevation 이 true", () => {
    expect(parseGpx(gpxWithElevation).hasElevation).toBe(true);
  });

  it("빈 GPX 와 좌표가 깨진 포인트를 안전하게 처리한다", () => {
    const parsed = parseGpx(`<gpx><trk><trkseg>
      <trkpt lat="abc" lon="127.0"><ele>10</ele></trkpt>
    </trkseg></trk></gpx>`);

    expect(parsed.points).toEqual([]);
    expect(parsed.waypoints).toEqual([]);
    expect(parsed.hasElevation).toBe(false);
    expect(parsed.stats.distanceM).toBe(0);
  });

  it("트랙 이름을 우선하고 없으면 메타데이터 이름을 쓴다", () => {
    expect(parseGpxName(gpxWithElevation)).toBe("남산 코스");
    expect(parseGpxName(`<gpx><metadata><name>메타만</name></metadata></gpx>`)).toBe("메타만");
    expect(parseGpxName(`<gpx />`)).toBeNull();
  });
});
