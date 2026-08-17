import { describe, expect, it } from "vitest";

import { ELEVATION_PLOT_AXIS_WIDTH, shouldReserveRightGutter } from "./ElevationChart";

/**
 * 차트 아래에 거리축을 공유하는 띠를 그리는 화면은 좌우 플롯 폭이 같아야 한다.
 * 오른쪽만 좁으면 띠의 핍이 프로필 위치와 체계적으로 어긋난다.
 */
describe("shouldReserveRightGutter", () => {
  it("바깥 레인을 그리면 오른쪽에도 자리를 잡는다", () => {
    expect(shouldReserveRightGutter({ reserveLaneGutter: true })).toBe(true);
  });

  it("차트 안에 마커를 찍어도 자리를 잡는다", () => {
    expect(shouldReserveRightGutter({ markerCount: 3 })).toBe(true);
  });

  it("오버레이 레인을 분리한 경우에도 잡는다", () => {
    expect(shouldReserveRightGutter({ separateOverlayLanes: true })).toBe(true);
  });

  it("아무것도 없으면 잡지 않는다 — 기존 화면 레이아웃은 그대로", () => {
    expect(shouldReserveRightGutter({})).toBe(false);
    expect(shouldReserveRightGutter({ markerCount: 0, reserveLaneGutter: false })).toBe(false);
  });

  it("축 폭 상수는 화면이 띠를 들여쓸 때 쓰는 값과 같아야 한다", () => {
    expect(ELEVATION_PLOT_AXIS_WIDTH).toBe(54);
  });
});
