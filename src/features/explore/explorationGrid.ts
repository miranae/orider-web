/**
 * explorationGrid — 탐험 그리드(이슈 #363). VeloViewer Explorer-tile/max-square 방식을 참고해
 * 클라이언트 집계로 구현: 개인 히트맵(#413)이 이미 만든 z14 방문 타일 집합
 * (`aggregateVisitedTileCells`)을 재사용해 (a) 방문 타일 폴리곤 오버레이, (b) 방문 타일 수 +
 * 맥스 스퀘어(연속 방문 타일 정사각 블록) 크기를 계산한다.
 *
 * 지역 전체 타일 모집단 대비 탐험 %는 "지역 경계 + 그 안의 전체 타일 수"를 아는 서버 집계
 * 없이는 계산할 수 없다(이 웹은 지역 폴리곤 데이터를 갖고 있지 않음). 그래서 %는 구현하지
 * 않고, 방문 타일 개수 + 맥스 스퀘어 K×K 로 대체한다 — VeloViewer 도 동일 지표를 핵심으로
 * 제공한다.
 */
import {
  PERSONAL_HEATMAP_ZOOM,
  aggregateVisitedTileCells,
  aggregateVisitedTileCellsAsync,
  type PersonalHeatmapAggregationOptions,
  type VisitedTileCell,
} from "./personalHeatmap";

export { PERSONAL_HEATMAP_ZOOM as EXPLORATION_GRID_ZOOM };
export type { VisitedTileCell };

export interface MaxSquareResult {
  size: number;
  anchor: VisitedTileCell | null;
}

export interface ExplorationGridResult {
  tiles: VisitedTileCell[];
  tileCount: number;
  maxSquare: number;
}

/**
 * 방문 타일 좌표 집합에서 연속된 정사각 블록의 최대 한 변 길이(타일 수)를 구한다
 * (표준 "maximal square in binary matrix" DP, 희소 좌표라 Map 기반). 중복 좌표는 자동 dedup,
 * 빈 입력은 size 0.
 */
export function computeMaxSquare(cells: Iterable<VisitedTileCell>): MaxSquareResult {
  const seen = new Set<string>();
  const ordered: VisitedTileCell[] = [];
  for (const cell of cells) {
    const key = `${cell.x}:${cell.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(cell);
  }
  if (ordered.length === 0) return { size: 0, anchor: null };

  // x 오름차순 -> 동일 x 내 y 오름차순으로 정렬하면 (x-1,y), (x,y-1), (x-1,y-1) 이
  // 항상 현재 셀보다 먼저 처리되어 한 번의 순회로 DP 를 채울 수 있다.
  ordered.sort((a, b) => a.x - b.x || a.y - b.y);
  const dp = new Map<string, number>();
  let best = 0;
  let anchor: VisitedTileCell | null = null;
  for (const { x, y } of ordered) {
    const hasNeighbors = seen.has(`${x - 1}:${y}`) && seen.has(`${x}:${y - 1}`) && seen.has(`${x - 1}:${y - 1}`);
    const size = hasNeighbors
      ? Math.min(dp.get(`${x - 1}:${y}`)!, dp.get(`${x}:${y - 1}`)!, dp.get(`${x - 1}:${y - 1}`)!) + 1
      : 1;
    dp.set(`${x}:${y}`, size);
    if (size > best) {
      best = size;
      anchor = { x: x - size + 1, y: y - size + 1 };
    }
  }
  return { size: best, anchor };
}

export function aggregateExplorationGrid(
  activities: Parameters<typeof aggregateVisitedTileCells>[0],
  zoom = PERSONAL_HEATMAP_ZOOM,
  options: PersonalHeatmapAggregationOptions = {},
): ExplorationGridResult {
  const tiles = aggregateVisitedTileCells(activities, zoom, options);
  return { tiles, tileCount: tiles.length, maxSquare: computeMaxSquare(tiles).size };
}

export async function aggregateExplorationGridAsync(
  activities: Parameters<typeof aggregateVisitedTileCellsAsync>[0],
  zoom = PERSONAL_HEATMAP_ZOOM,
  batchSize = 20,
  options: PersonalHeatmapAggregationOptions = {},
): Promise<ExplorationGridResult> {
  const tiles = await aggregateVisitedTileCellsAsync(activities, zoom, batchSize, options);
  return { tiles, tileCount: tiles.length, maxSquare: computeMaxSquare(tiles).size };
}

/** z14 슬리피 타일 (x,y) -> lng/lat 사각형 경계. 지도 오버레이 폴리곤 렌더링용. */
export function tileToLngLatBounds(x: number, y: number, zoom: number): { west: number; south: number; east: number; north: number } {
  const scale = 2 ** zoom;
  const lngOf = (tx: number) => (tx / scale) * 360 - 180;
  const latOf = (ty: number) => {
    const n = Math.PI - (2 * Math.PI * ty) / scale;
    return (180 / Math.PI) * Math.atan(Math.sinh(n));
  };
  return { west: lngOf(x), east: lngOf(x + 1), north: latOf(y), south: latOf(y + 1) };
}
