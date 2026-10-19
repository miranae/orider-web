import { CHART_PRESENTATION_DENSITY } from "./chartPresentation";

export interface ChartSeriesPoint { x: number; y: number | null }
export type ChartSamplingPolicy = "conservative" | "preserve-runs";

/**
 * 같은 bin의 서로 다른 연속 run은 합치지 않는다. 빈 bin에 가짜 결측도 만들지 않는다.
 * limit은 평균 bin 예산이다. 실제 gap과 짧은 run의 양끝을 보존하므로 총점 hard cap은 아니다.
 * 정상 단조 좌표 입력에서 총점은 binCount + 3 * runCount 이하이며, 전달된 표본 수보다 늘어나지 않는다.
 * 공개 sampler는 비유한·역행 입력의 단절 경계와 필요한 화면 양끝 교점을 별도로 추가한다.
 */
function sampleContinuousRuns(points: readonly ChartSeriesPoint[], start: number, end: number, binCount: number): ChartSeriesPoint[] {
  const sampled: ChartSeriesPoint[] = [];
  let run: ChartSeriesPoint[] = [];
  const flush = () => {
    if (!run.length) return;
    const bins: { index: number; sum: number; count: number; first: number; last: number }[] = [];
    for (const point of run) {
      const index = Math.min(binCount - 1, Math.floor((point.x - start) / (end - start) * binCount));
      let bin = bins[bins.length - 1];
      if (!bin || bin.index !== index) { bin = { index, sum: 0, count: 0, first: point.x, last: point.x }; bins.push(bin); }
      bin.sum += point.y!; bin.count++; bin.last = point.x;
    }
    if (bins.length === 1 && run.length > 1 && run[0]!.x !== run[run.length - 1]!.x) {
      // 점 반경이 0이어도 짧은 run이 보이도록 실제 양끝 사이에 그 run의 평균을 표시한다.
      const mean = bins[0]!.sum / bins[0]!.count;
      sampled.push({ x: run[0]!.x, y: mean }, { x: run[run.length - 1]!.x, y: mean });
    } else {
      for (const bin of bins) sampled.push({ x: Math.max(bin.first, Math.min(bin.last, start + (bin.index + 0.5) * (end - start) / binCount)), y: bin.sum / bin.count });
    }
    run = [];
  };
  for (const point of points) {
    if (point.y != null) { run.push(point); continue; }
    flush();
    if (sampled.length === 0 || sampled[sampled.length - 1]!.y != null) sampled.push(point);
  }
  flush();
  return sampled;
}

/** 표시 전용 표본 평균. 표의 시간 가중 평균이나 원본 표본은 변경하지 않는다. */
export function sampleChartSeries(points: readonly ChartSeriesPoint[], range: readonly [number, number], width: number, policy: ChartSamplingPolicy = "conservative"): ChartSeriesPoint[] {
  const [start, end] = range;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const limit = Math.max(CHART_PRESENTATION_DENSITY.minPoints, Math.min(CHART_PRESENTATION_DENSITY.maxPoints, Math.floor(Math.max(0, width) / CHART_PRESENTATION_DENSITY.pixelsPerPoint)));
  // 모든 기록이 같은 bin 경계를 사용한다. 양끝 교점은 평균 분모에 넣지 않는다.
  const binCount = limit - CHART_PRESENTATION_DENSITY.edgePoints;
  const visible: ChartSeriesPoint[] = [];
  const anchors: [{ point: ChartSeriesPoint; segment: number }[], { point: ChartSeriesPoint; segment: number }[]] = [[], []];
  let sourceSegment = 0;
  let firstVisibleSegment: number | null = null;
  let lastVisibleSegment: number | null = null;
  const append = (point: ChartSeriesPoint) => { visible.push(point); firstVisibleSegment ??= sourceSegment; lastVisibleSegment = sourceSegment; };
  let previous: ChartSeriesPoint | null = null;
  for (const point of points) {
    if (!Number.isFinite(point.x)) {
      if (previous && visible.length) append({ x: Math.max(start, Math.min(end, previous.x)), y: null });
      sourceSegment++;
      previous = null;
      continue;
    }
    if (previous && point.x < previous.x) {
      if (visible.length) append({ x: Math.max(start, Math.min(end, previous.x)), y: null });
      sourceSegment++;
      if (point.x >= start && point.x <= end) append({ x: point.x, y: null });
    }
    if (previous && point.x > previous.x && previous.y != null && point.y != null && Number.isFinite(previous.y) && Number.isFinite(point.y)) {
      for (const [index, edge] of [start, end].entries()) {
        if (previous.x < edge && point.x > edge) anchors[index]!.push({ point: { x: edge, y: previous.y + (point.y - previous.y) * (edge - previous.x) / (point.x - previous.x) }, segment: sourceSegment });
      }
    }
    if (point.x >= start && point.x <= end) append({ x: point.x, y: point.y != null && Number.isFinite(point.y) ? point.y : null });
    if (point.y == null || !Number.isFinite(point.y)) sourceSegment++;
    previous = point;
  }
  // 여러 분리된 선분이 같은 경계를 통과하면 임의로 한 선분을 선택하지 않는다.
  const onlyLeft = anchors[0].length === 1 ? anchors[0][0] : undefined;
  const onlyRight = anchors[1].length === 1 ? anchors[1][0] : undefined;
  const left = onlyLeft && (firstVisibleSegment != null ? onlyLeft.segment === firstVisibleSegment : onlyLeft.segment === onlyRight?.segment) ? [onlyLeft.point] : [];
  const right = onlyRight && (lastVisibleSegment != null ? onlyRight.segment === lastVisibleSegment : onlyRight.segment === onlyLeft?.segment) ? [onlyRight.point] : [];
  if (visible.length + left.length + right.length <= limit) return [...left, ...visible, ...right];
  if (policy === "preserve-runs") return [...left, ...sampleContinuousRuns(visible, start, end, binCount), ...right];
  const bins = Array.from({ length: binCount }, () => ({ sum: 0, count: 0, segment: -1, blocked: false }));
  let segment = 0;
  for (const point of visible) {
    const index = Math.min(binCount - 1, Math.floor((point.x - start) / (end - start) * binCount));
    const bin = bins[index]!;
    if (point.y == null) { bin.blocked = true; segment++; continue; }
    if (bin.segment !== -1 && bin.segment !== segment) bin.blocked = true;
    bin.segment = segment;
    bin.sum += point.y;
    bin.count++;
  }
  return [...left, ...bins.map((bin, index) => ({ x: start + (index + 0.5) * (end - start) / binCount, y: !bin.blocked && bin.count ? bin.sum / bin.count : null })), ...right];
}
