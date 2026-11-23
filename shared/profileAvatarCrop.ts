/**
 * 프로필 사진 영역 선택 규칙(#1827). 앱 공용 `ProfileAvatarPolicy`(orider-g1-app #3845)의
 * crop 함수와 같은 결과를 내야 한다 — 값·경계·NaN 처리까지 그대로 옮긴다.
 *
 * 좌표는 방향(EXIF)을 반영한 원본 사진의 픽셀 좌표다.
 */

/** 원본 사진에서 잘라 낼 정사각 영역(정수 픽셀). */
export interface ProfileAvatarCrop {
  x: number;
  y: number;
  side: number;
}

/**
 * 영역 선택 화면의 상태.
 * zoom 1 이면 짧은 변이 정사각형을 꽉 채운다(예전 가운데 자르기와 같은 크기).
 * centerX·centerY 는 자르는 정사각형의 중심.
 */
export interface ProfileAvatarCropState {
  zoom: number;
  centerX: number;
  centerY: number;
}

/** 꽉 채움 대비 최대 확대 배율. */
export const CROP_MAX_ZOOM = 4;

/** 확대해도 자르는 정사각형의 한 변이 이 픽셀 아래로 내려가지 않는다. */
export const CROP_MIN_SIDE_PX = 128;

const EPSILON = 1e-6;

const validSize = (width: number, height: number) => width > 0 && height > 0;

function clampTo(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function cropSide(width: number, height: number, zoom: number): number {
  return Math.min(width, height) / zoom;
}

/** 사진 크기에 따른 최대 배율 — CROP_MAX_ZOOM 과 CROP_MIN_SIDE_PX 중 먼저 닿는 쪽, 최소 1. */
export function cropMaxZoom(width: number, height: number): number {
  return Math.max(1, Math.min(CROP_MAX_ZOOM, Math.min(width, height) / CROP_MIN_SIDE_PX));
}

/** 첫 상태 — 꽉 채운 가운데. 사진 크기가 0 이하이면 null. */
export function initialCropState(width: number, height: number): ProfileAvatarCropState | null {
  if (!validSize(width, height)) return null;
  return { zoom: 1, centerX: width / 2, centerY: height / 2 };
}

/** 배율은 1..최대, 중심은 정사각형이 사진 안에 머무르는 범위로. NaN 은 첫 상태 값으로 되돌린다. */
export function clampCrop(width: number, height: number, state: ProfileAvatarCropState): ProfileAvatarCropState | null {
  if (!validSize(width, height)) return null;
  const zoom = Number.isNaN(state.zoom) ? 1 : clampTo(state.zoom, 1, cropMaxZoom(width, height));
  const half = cropSide(width, height, zoom) / 2;
  const centerX = Number.isNaN(state.centerX) ? width / 2 : clampTo(state.centerX, half, width - half);
  const centerY = Number.isNaN(state.centerY) ? height / 2 : clampTo(state.centerY, half, height - half);
  return { zoom, centerX, centerY };
}

/**
 * 사진을 화면에서 dx·dy 만큼 끌었을 때의 상태. 사진이 오른쪽으로 가면 자르는 영역은 왼쪽으로 간다.
 * viewSide 는 화면 정사각 틀의 한 변(화면 단위) — 끈 거리를 사진 픽셀로 바꾸는 데 쓴다.
 */
export function panCrop(
  width: number,
  height: number,
  state: ProfileAvatarCropState,
  dx: number,
  dy: number,
  viewSide: number,
): ProfileAvatarCropState | null {
  const current = clampCrop(width, height, state);
  if (!current) return null;
  if (!(viewSide > 0)) return current;
  const pixelsPerView = cropSide(width, height, current.zoom) / viewSide;
  const moveX = Number.isFinite(dx) ? dx : 0;
  const moveY = Number.isFinite(dy) ? dy : 0;
  return clampCrop(width, height, {
    ...current,
    centerX: current.centerX - moveX * pixelsPerView,
    centerY: current.centerY - moveY * pixelsPerView,
  });
}

/** 틀 가운데를 기준으로 factor 배 확대(1 미만이면 축소)한 상태. */
export function zoomCrop(width: number, height: number, state: ProfileAvatarCropState, factor: number): ProfileAvatarCropState | null {
  const current = clampCrop(width, height, state);
  if (!current) return null;
  if (!(factor > 0) || !Number.isFinite(factor)) return current;
  return clampCrop(width, height, { ...current, zoom: current.zoom * factor });
}

/**
 * 화면에 사진을 그릴 배율(화면 단위 / 사진 픽셀). 사진 전체를 (가로×배율, 세로×배율)로 그리고
 * `틀 중심 - 중심 좌표×배율` 에 놓으면 자르는 중심이 틀 가운데에 온다.
 */
export function cropDisplayScale(width: number, height: number, state: ProfileAvatarCropState, viewSide: number): number | null {
  const current = clampCrop(width, height, state);
  if (!current || !(viewSide > 0) || !Number.isFinite(viewSide)) return null;
  return viewSide / cropSide(width, height, current.zoom);
}

/** 상태를 실제로 잘라 낼 정수 픽셀 영역으로 — 항상 사진 안쪽 정사각형. 크기가 0 이하이면 null. */
export function cropRegion(width: number, height: number, state: ProfileAvatarCropState): ProfileAvatarCrop | null {
  const current = clampCrop(width, height, state);
  if (!current) return null;
  const shortSide = Math.min(width, height);
  const side = clampTo(Math.round(cropSide(width, height, current.zoom)), 1, shortSide);
  // 부동소수 오차로 한 픽셀 밀리지 않도록 아주 작은 여유를 두고 내린다(가운데 자르기의 정수 나눗셈과 같다).
  const x = clampTo(Math.floor(current.centerX - side / 2 + EPSILON), 0, width - side);
  const y = clampTo(Math.floor(current.centerY - side / 2 + EPSILON), 0, height - side);
  return { x, y, side };
}
