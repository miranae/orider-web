import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { routeHasElevation, type CourseRoutingResult } from "../services/courseRouting";
import { routeToGpx } from "../utils/routeGpx";

/**
 * 빌더 경로가 지켜야 할 불변식.
 *
 * 예전에는 이 파일이 `CreateCoursePage.tsx` 를 문자열로 읽어 특정 코드 조각의 존재/부재를
 * 단언했다. 그 방식은 리팩터링을 막을 뿐 불변식을 지키지 못했고(문구만 바꿔도 통과하고,
 * 무해한 재배치에도 깨졌다), 정작 막으려던 오염은 제품이 안내하던 우회로에서 그대로
 * 일어나고 있었다. 이제 지켜야 할 성질을 동작으로 검증한다.
 */

function route(coordinates: CourseRoutingResult["geometry"]["coordinates"], elevationIncluded?: boolean): CourseRoutingResult {
  return {
    contractVersion: 1,
    geometry: { type: "LineString", coordinates },
    ...(elevationIncluded === undefined ? {} : { elevationIncluded }),
    distanceM: 1_000,
    durationSeconds: 300,
    attribution: "test",
  };
}

describe("빌더 경로를 고도 없이 저장하지 않는다", () => {
  it("고도가 온전할 때만 저장을 연다", () => {
    expect(routeHasElevation(route([[127, 37, 40], [128, 38, 90]], true))).toBe(true);
  });

  it("옛 2D 응답(필드 없음)은 고도 없음으로 본다 — 캐시에 24시간 남을 수 있다", () => {
    expect(routeHasElevation(route([[127, 37], [128, 38]]))).toBe(false);
  });

  it("플래그가 참이어도 좌표가 2D 면 고도 없음으로 본다", () => {
    expect(routeHasElevation(route([[127, 37], [128, 38]], true))).toBe(false);
  });

  it("일부 좌표만 고도를 가지면 고도 없음으로 본다", () => {
    expect(routeHasElevation(route([[127, 37, 40], [128, 38]], true))).toBe(false);
  });

  it("플래그가 거짓이면 좌표가 3D 여도 저장하지 않는다", () => {
    expect(routeHasElevation(route([[127, 37, 40], [128, 38, 90]], false))).toBe(false);
  });
});

describe("GPX 내보내기가 고도를 잃지 않는다", () => {
  it("3D 좌표는 ele 로 함께 굽는다 — 내보내 다시 올려도 고도가 살아 있어야 한다", () => {
    const xml = routeToGpx("코스", [[127, 37, 40], [128, 38, 90.5]]);
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    expect(doc.querySelector("parsererror")).toBeNull();
    const elevations = [...doc.getElementsByTagName("ele")].map((node) => node.textContent);
    expect(elevations).toEqual(["40", "90.5"]);
  });

  it("고도가 없으면 지어내지 않는다", () => {
    expect(routeToGpx("코스", [[127, 37], [128, 38]])).not.toContain("<ele>");
  });

  it("고도 자리에 숫자가 아닌 값이 오면 거절한다", () => {
    expect(() => routeToGpx("코스", [[127, 37, Number.NaN], [128, 38, 90]])).toThrow();
  });
});

describe("빌더 화면의 경계", () => {
  const source = readFileSync(join(process.cwd(), "src/pages/CreateCoursePage.tsx"), "utf8");

  it("라우팅은 서버 어댑터만 경유한다 — 지도 제공자를 직접 부르지 않는다", () => {
    expect(source).toContain("requestCourseRoute(functions");
    expect(source).not.toContain("api.mapbox.com/directions");
    expect(source).not.toContain("graphhopper.com");
  });

  it("경로 좌표를 계측이나 클라이언트 로그에 싣지 않는다", () => {
    expect(source).not.toMatch(/track\([^)]*(waypoints|coordinates|geometry)/);
    expect(source).not.toMatch(/logClientError\([^)]*(waypoints|coordinates|geometry)/);
  });

  it("빈 좌표 입력을 거절한다", () => {
    expect(source).toContain("if (!manualLat.trim() || !manualLng.trim()");
  });
});
