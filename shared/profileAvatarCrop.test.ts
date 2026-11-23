import { describe, expect, it } from "vitest";
import {
  CROP_MAX_ZOOM,
  CROP_MIN_SIDE_PX,
  cropDisplayScale,
  cropMaxZoom,
  cropRegion,
  initialCropState,
  panCrop,
  zoomCrop,
  type ProfileAvatarCropState,
} from "./profileAvatarCrop";

function region(width: number, height: number, state: ProfileAvatarCropState | null) {
  return cropRegion(width, height, state!);
}

describe("profileAvatarCrop", () => {
  it("첫 상태는 예전 자동 가운데 자르기와 같은 영역이다", () => {
    const initial = (w: number, h: number) => region(w, h, initialCropState(w, h));
    expect(initial(500, 300)).toEqual({ x: 100, y: 0, side: 300 });
    expect(initial(300, 403)).toEqual({ x: 0, y: 51, side: 300 });
    expect(initial(7, 7)).toEqual({ x: 0, y: 0, side: 7 });
    expect(initial(1, 1)).toEqual({ x: 0, y: 0, side: 1 });
    for (const w of [1, 2, 3, 99, 512, 1001, 3024, 4032]) {
      for (const h of [1, 2, 5, 100, 513, 3024, 4031]) {
        const side = Math.min(w, h);
        expect(initial(w, h), `${w}x${h}`).toEqual({
          x: Math.floor((w - side) / 2),
          y: Math.floor((h - side) / 2),
          side,
        });
      }
    }
    expect(initialCropState(0, 10)).toBeNull();
    expect(initialCropState(10, -1)).toBeNull();
  });

  it("크기가 잘못되면 영역이 없다", () => {
    const state = { zoom: 1, centerX: 0, centerY: 0 };
    expect(cropRegion(0, 10, state)).toBeNull();
    expect(panCrop(10, 0, state, 1, 1, 100)).toBeNull();
    expect(zoomCrop(-1, 10, state, 2)).toBeNull();
    expect(cropDisplayScale(0, 0, state, 100)).toBeNull();
    expect(cropDisplayScale(10, 10, state, 0)).toBeNull();
  });

  it("끌어도 사진이 틀을 항상 덮는다 — 꽉 채운 상태에서는 긴 변 쪽으로만 움직인다", () => {
    const start = initialCropState(1000, 500)!;
    // 사진을 오른쪽으로 크게 끌면 영역은 왼쪽 끝에 붙는다. 세로는 움직일 수 없다.
    expect(region(1000, 500, panCrop(1000, 500, start, 10_000, 300, 250))).toEqual({ x: 0, y: 0, side: 500 });
    expect(region(1000, 500, panCrop(1000, 500, start, -10_000, -300, 250))).toEqual({ x: 500, y: 0, side: 500 });
  });

  it("끈 거리(화면 단위)는 틀 크기와 배율에 맞춰 사진 픽셀로 바뀐다", () => {
    const start = initialCropState(1000, 500)!;
    // 틀 250 = 사진 500px → 1 = 2px. 사진을 왼쪽으로 50 끌면 영역은 오른쪽으로 100px.
    const moved = panCrop(1000, 500, start, -50, 0, 250)!;
    expect(moved.centerX).toBe(600);
    expect(region(1000, 500, moved)).toEqual({ x: 350, y: 0, side: 500 });
    // 2배 확대하면 영역이 250px 이라 1 = 1px.
    const zoomed = zoomCrop(1000, 500, start, 2)!;
    const zoomedMoved = panCrop(1000, 500, zoomed, 0, -50, 250)!;
    expect(zoomedMoved.centerY).toBe(300);
    expect(region(1000, 500, zoomedMoved)).toEqual({ x: 375, y: 175, side: 250 });
  });

  it("배율은 꽉 채움과 최대 사이로 고정된다", () => {
    const start = initialCropState(4000, 3000)!;
    expect(zoomCrop(4000, 3000, start, 0.2)!.zoom).toBe(1);
    const max = zoomCrop(4000, 3000, start, 100)!;
    expect(max.zoom).toBe(CROP_MAX_ZOOM);
    expect(region(4000, 3000, max)).toEqual({ x: 1625, y: 1125, side: 750 });
    let state = start;
    for (let i = 0; i < 20; i++) state = zoomCrop(4000, 3000, state, 1.3)!;
    expect(state.zoom).toBe(CROP_MAX_ZOOM);
  });

  it("작은 사진은 자르는 변이 최소 변 아래로 내려가지 않을 만큼만, 128px 이하는 전혀 확대되지 않는다", () => {
    const max = zoomCrop(300, 256, initialCropState(300, 256)!, 100)!;
    expect(max.zoom).toBe(2);
    expect(region(300, 256, max)!.side).toBe(CROP_MIN_SIDE_PX);
    const tiny = initialCropState(50, 80)!;
    expect(zoomCrop(50, 80, tiny, 3)!.zoom).toBe(1);
    expect(region(50, 80, tiny)).toEqual({ x: 0, y: 15, side: 50 });
    for (const [w, h] of [[128, 128], [128, 4000], [4000, 100], [1, 1]] as const) {
      expect(cropMaxZoom(w, h)).toBe(1);
      expect(zoomCrop(w, h, initialCropState(w, h)!, 4)!.zoom, `${w}x${h}`).toBe(1);
    }
    expect(cropMaxZoom(512, 512)).toBe(CROP_MAX_ZOOM);
    expect(cropMaxZoom(384, 1000)).toBe(3);
  });

  it("확대 후 끝으로 옮긴 뒤 줄이면 영역이 사진 안으로 다시 들어온다", () => {
    let state = initialCropState(1000, 800)!;
    state = zoomCrop(1000, 800, state, 4)!;
    state = panCrop(1000, 800, state, 10_000, 10_000, 100)!;
    expect(region(1000, 800, state)).toEqual({ x: 0, y: 0, side: 200 });
    state = zoomCrop(1000, 800, state, 0.25)!;
    expect(region(1000, 800, state)).toEqual({ x: 0, y: 0, side: 800 });
    expect(state.centerX).toBe(400);
  });

  it("NaN·무한대·범위 밖 값이 들어와도 영역은 항상 사진 안쪽 정사각형이다", () => {
    const sizes = [[1, 1], [3, 7000], [7000, 3], [640, 480], [4032, 3024]] as const;
    const states: ProfileAvatarCropState[] = [
      { zoom: NaN, centerX: NaN, centerY: NaN },
      { zoom: -5, centerX: -1e9, centerY: 1e9 },
      { zoom: Infinity, centerX: -Infinity, centerY: Infinity },
      { zoom: 0, centerX: 0, centerY: 0 },
    ];
    for (const [w, h] of sizes) {
      for (const state of states) {
        const crop = region(w, h, state)!;
        const label = `${w}x${h} ${JSON.stringify(state)}`;
        expect(Number.isInteger(crop.x) && Number.isInteger(crop.y) && Number.isInteger(crop.side), label).toBe(true);
        expect(crop.side >= 1 && crop.side <= Math.min(w, h), label).toBe(true);
        expect(crop.x >= 0 && crop.x + crop.side <= w, label).toBe(true);
        expect(crop.y >= 0 && crop.y + crop.side <= h, label).toBe(true);
      }
      const start = initialCropState(w, h)!;
      expect(panCrop(w, h, start, NaN, NaN, 100)).toEqual(start);
      expect(panCrop(w, h, start, Infinity, -Infinity, 100)).toEqual(start);
      expect(zoomCrop(w, h, start, NaN)).toEqual(start);
      expect(zoomCrop(w, h, start, Infinity)).toEqual(start);
      expect(zoomCrop(w, h, start, -2)).toEqual(start);
      expect(panCrop(w, h, start, 5, 5, 0)).toEqual(start);
      expect(panCrop(w, h, start, 5, 5, NaN)).toEqual(start);
    }
  });

  it("화면 배율은 틀 한 변이 자르는 영역 한 변과 같아지게 한다", () => {
    const start = initialCropState(1000, 500)!;
    expect(cropDisplayScale(1000, 500, start, 250)).toBe(0.5);
    expect(cropDisplayScale(1000, 500, zoomCrop(1000, 500, start, 2)!, 250)).toBe(1);
  });
});
