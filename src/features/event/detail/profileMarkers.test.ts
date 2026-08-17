import { describe, expect, it } from "vitest";

import {
  buildElevationProfile,
  classifyElevationQuality,
  classifyLane,
  cumulativeDistances,
  isProfileMarkerLane,
  readLaneColor,
  resolveWaypointsOnTrack,
  toElevationChartData,
} from "../../courseEngine";
import { parseGpxFull } from "./courseGpx";

/**
 * 이벤트 상세 고도 프로필이 코스엔진으로 이관되면서 지켜야 할 성질.
 *
 * 이관 전에는 이 화면의 차트 로직에 테스트가 하나도 없었다. 등간격 추출이 봉우리를 잘라내고,
 * 분류기가 표와 차트에서 달랐으며, 색이 hex 로 박혀 테마 전환에 반응하지 않았다.
 */

const GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
  <trk><trkseg>
    <trkpt lat="37.500" lon="127.000"><ele>10</ele></trkpt>
    <trkpt lat="37.505" lon="127.000"><ele>120</ele></trkpt>
    <trkpt lat="37.510" lon="127.000"><ele>60</ele></trkpt>
    <trkpt lat="37.515" lon="127.000"><ele>200</ele></trkpt>
    <trkpt lat="37.520" lon="127.000"><ele>40</ele></trkpt>
  </trkseg></trk>
  <wpt lat="37.505" lon="127.000"><ele>120</ele><name>남한산성 정상</name><type>KOM</type></wpt>
  <wpt lat="37.510" lon="127.000"><ele>60</ele><name>1차 보급</name><type>FOOD</type></wpt>
  <wpt lat="37.515" lon="127.000"><ele>200</ele><name>3번 지점</name><type>GENERIC</type></wpt>
</gpx>`;

function markers(course: ReturnType<typeof parseGpxFull>) {
  const cumulative = cumulativeDistances(course.points);
  return resolveWaypointsOnTrack(course.waypoints, course.points, cumulative)
    .filter((item) => isProfileMarkerLane(classifyLane(item.waypoint)))
    .map((item) => ({
      name: item.waypoint.name,
      lane: classifyLane(item.waypoint),
      distanceM: item.distanceFromStartM,
    }));
}

describe("이벤트 프로필 — 코스엔진 이관", () => {
  const course = parseGpxFull(GPX);

  it("차트 데이터가 거리·고도 쌍으로 나오고 봉우리를 잃지 않는다", () => {
    const data = toElevationChartData(buildElevationProfile(course.points, 300));
    expect(data.length).toBeGreaterThan(1);
    expect(Math.max(...data.map((point) => point.elevation))).toBe(200);
    expect(Math.min(...data.map((point) => point.elevation))).toBe(10);
    // 거리는 단조 증가해야 한다 — 프로필 x축이 뒤집히면 그래프가 망가진다.
    for (let index = 1; index < data.length; index += 1) {
      expect(data[index]!.distance).toBeGreaterThanOrEqual(data[index - 1]!.distance);
    }
  });

  it("구간(SEG)은 차트 마커에서 빠지고 정상·보급은 남는다", () => {
    const result = markers(course);
    expect(result.map((marker) => marker.name)).toEqual(["남한산성 정상", "1차 보급"]);
    expect(result.map((marker) => marker.lane)).toEqual(["KOM", "AID"]);
  });

  it("마커 거리는 트랙에 투영된 값이고 거리순으로 정렬된다", () => {
    const result = markers(course);
    expect(result[0]!.distanceM).toBeGreaterThan(0);
    expect(result[1]!.distanceM).toBeGreaterThan(result[0]!.distanceM);
  });

  it("표와 차트가 같은 분류기를 쓴다 — 예전에는 KOM 과 콤 으로 갈렸다", () => {
    expect(classifyLane({ name: "KOM 구간", type: "" })).toBe("KOM");
    expect(isProfileMarkerLane(classifyLane({ name: "KOM 구간", type: "" }))).toBe(true);
  });

  it("고도가 평평하면 차트 대신 안내를 띄울 수 있게 판정한다", () => {
    const flat = parseGpxFull(`<gpx><trk><trkseg>
      <trkpt lat="37.5" lon="127.0"><ele>10</ele></trkpt>
      <trkpt lat="37.501" lon="127.0"><ele>10.2</ele></trkpt>
    </trkseg></trk></gpx>`);
    expect(classifyElevationQuality(flat.points.map((point) => point.ele), "measured")).toBe("none");
    expect(classifyElevationQuality(course.points.map((point) => point.ele), "measured")).toBe("measured");
  });

  it("레인 색은 토큰에서 읽는다 — hex 를 박으면 테마 전환에 반응하지 않는다", () => {
    const colors = (["KOM", "AID", "CUT", "SEG"] as const).map(readLaneColor);
    expect(new Set(colors).size).toBe(4);
    expect(colors.every((color) => color.length > 0 && !color.startsWith("#c6f432"))).toBe(true);
  });
});
