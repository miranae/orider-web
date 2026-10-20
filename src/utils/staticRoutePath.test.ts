import { describe, expect, it } from "vitest";
import { buildStaticRoutePath } from "./staticRoutePath";

function pixels(positions: [number, number][]) {
  return [...(buildStaticRoutePath(positions) ?? "").matchAll(/[ML] ([\d.-]+) ([\d.-]+)/g)]
    .map(match => [Number(match[1]), Number(match[2])]);
}

describe("buildStaticRoutePath", () => {
  it("실제 정사각형 경로를 가로 카드에서도 정사각형으로 유지한다", () => {
    const longitudeSpan = 0.003 / Math.cos(37.0015 * Math.PI / 180);
    const points = pixels([[37, 127], [37, 127 + longitudeSpan], [37.003, 127 + longitudeSpan], [37.003, 127]]);
    const xs = points.map(point => point[0]!);
    const ys = points.map(point => point[1]!);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(Math.max(...ys) - Math.min(...ys), 1);
    expect((Math.max(...xs) + Math.min(...xs)) / 2).toBe(160);
    expect((Math.max(...ys) + Math.min(...ys)) / 2).toBe(80);
  });

  it("수직과 수평 경로는 중앙에 표시한다", () => {
    expect(pixels([[37, 127], [37.003, 127]]).map(point => point[0])).toEqual([160, 160]);
    expect(pixels([[37, 127], [37, 127.003]]).map(point => point[1])).toEqual([80, 80]);
  });

  it("중복 좌표는 유한한 중앙점으로 표시한다", () => {
    expect(pixels([[37, 127], [37, 127]])).toEqual([[160, 80], [160, 80]]);
  });

  it("날짜 변경선을 통과하는 짧은 경로도 비율을 유지한다", () => {
    const points = pixels([[0, 179.999], [0.002, -179.999]]);
    expect(points[1]![0]! - points[0]![0]!).toBeCloseTo(points[0]![1]! - points[1]![1]!, 1);
  });

  it("독립 구간과 잘못된 좌표 양옆을 연결하지 않는다", () => {
    expect(buildStaticRoutePath([[37, 127], [37.001, 127], [37.002, 127], [37.003, 127]], [2])?.match(/M/g)).toHaveLength(2);
    const path = buildStaticRoutePath([[37, 127], [37.001, 127], [NaN, 127], [37.003, 127]]);
    expect(path?.match(/M/g)).toHaveLength(2);
    expect(path).not.toMatch(/NaN|Infinity/);
    expect(buildStaticRoutePath([])).toBeNull();
    expect(buildStaticRoutePath([[NaN, 127], [91, 127]])).toBeNull();
    expect(pixels([[37, Infinity], [37, 127], [37.001, 127]])).toHaveLength(2);
  });
});
