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
export function sampleChartSeries(points: readonly ChartSeriesPoint[], range: readonly [number, number], width: number, policy: ChartSamplingPolicy = "conservative", grid?: ChartSamplingGrid): ChartSeriesPoint[] {
  const [start, end] = range;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  if (grid) return sampleAnchoredSeries(points, range, grid, policy);
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

export interface ChartSamplingGrid { origin: number; binWidth: number }
export function chartSamplingGrid(range: readonly [number, number], width: number, origin: number): ChartSamplingGrid {
  const limit = Math.max(CHART_PRESENTATION_DENSITY.minPoints, Math.min(CHART_PRESENTATION_DENSITY.maxPoints, Math.floor(Math.max(0, width) / CHART_PRESENTATION_DENSITY.pixelsPerPoint)));
  return { origin, binWidth: (range[1] - range[0]) / Math.max(1, limit - CHART_PRESENTATION_DENSITY.edgePoints - 3) };
}

/** 전체 bin과 양끝 한 bin을 포함한다. 원본/평균 전환 shortcut 없이 한 표본 bin은 자연히 원값이다. */
function sampleAnchoredSeries(points: readonly ChartSeriesPoint[], range: readonly [number, number], grid: ChartSamplingGrid, policy: ChartSamplingPolicy): ChartSeriesPoint[] {
  const { origin, binWidth } = grid;
  if (!Number.isFinite(binWidth) || binWidth <= 0 || !Number.isFinite(origin)) return [];
  const firstBin = Math.floor((range[0] - origin) / binWidth) - 1;
  const lastBin = Math.ceil((range[1] - origin) / binWidth);
  const start = origin + firstBin * binWidth, end = origin + (lastBin + 1) * binWidth;
  type Bin = { index: number; sum: number; count: number; first: number; last: number; run: number; blocked: boolean };
  const sparseCrossings: ChartSeriesPoint[][] = [];
  const output: ChartSeriesPoint[] = [], conservative = new Map<number, Bin>();
  let runBins: Bin[] = [], runId = 0, runFirst: number | null = null, runLast = 0, previous: ChartSeriesPoint | null = null;
  let before: ChartSeriesPoint | null = null, after: ChartSeriesPoint | null = null;
  const binIndex = (x: number) => Math.floor((x - origin) / binWidth);
  const blockBoundary = (x: number) => {
    const index = binIndex(x);
    if (index < firstBin || index > lastBin) return;
    const bin = conservative.get(index) ?? { index, sum: 0, count: 0, first: x, last: x, run: runId, blocked: true };
    bin.blocked = true; conservative.set(index, bin);
  };
  const flush = () => {
    const rendered: ChartSeriesPoint[] = [];
    if (runBins.length) {
      if (before) rendered.push(before);
      const singleRunBin = runFirst != null && binIndex(runFirst) === binIndex(runLast);
      for (const bin of runBins) {
        const mean = bin.sum / bin.count;
        if (singleRunBin && bin.first !== bin.last) rendered.push({ x: bin.first, y: mean }, { x: bin.last, y: mean });
        else rendered.push({ x: Math.max(bin.first, Math.min(bin.last, origin + (bin.index + .5) * binWidth)), y: mean });
      }
      if (after) rendered.push(after);
    } else if (before && after) { rendered.push(before, after); sparseCrossings.push([before, after]); }
    if (policy === 'preserve-runs' && rendered.length) {
      if (output.length && output[output.length - 1]!.y != null) output.push({ x: rendered[0]!.x, y: null });
      output.push(...rendered);
    }
    runBins = []; runFirst = null; before = null; after = null; runId++;
  };
  for (const point of points) {
    if (!Number.isFinite(point.x)) { if (previous) blockBoundary(previous.x); flush(); previous = null; continue; }
    if (previous && point.x < previous.x) { blockBoundary(previous.x); blockBoundary(point.x); flush(); }
    const index = binIndex(point.x), inWindow = index >= firstBin && index <= lastBin;
    if (point.y == null || !Number.isFinite(point.y)) {
      flush();
      if (inWindow) {
        const bin = conservative.get(index) ?? { index, sum: 0, count: 0, first: point.x, last: point.x, run: runId, blocked: true };
        bin.blocked = true; conservative.set(index, bin);
        if (policy === 'preserve-runs' && (output.length === 0 || output[output.length - 1]!.y != null)) output.push({ x: point.x, y: null });
      }
      previous = point; continue;
    }
    runFirst ??= point.x; runLast = point.x;
    if (point.x < start) before = point;
    else if (point.x >= end) after ??= point;
    if (inWindow) {
      let bin = runBins[runBins.length - 1];
      if (!bin || bin.index !== index) { bin = { index, sum: 0, count: 0, first: point.x, last: point.x, run: runId, blocked: false }; runBins.push(bin); }
      bin.sum += point.y; bin.count++; bin.last = point.x;
      const combined = conservative.get(index);
      if (combined) { if (combined.run !== runId) combined.blocked = true; combined.sum += point.y; combined.count++; combined.last = point.x; }
      else conservative.set(index, { ...bin });
    }
    previous = point;
  }
  flush();
  if (policy === 'preserve-runs') return output;
  if (conservative.size === 0 && sparseCrossings.length === 1) return sparseCrossings[0]!;
  return Array.from({ length: lastBin - firstBin + 1 }, (_, offset) => {
    const index = firstBin + offset, bin = conservative.get(index);
    return { x: bin ? Math.max(bin.first, Math.min(bin.last, origin + (index + .5) * binWidth)) : origin + (index + .5) * binWidth, y: bin && !bin.blocked && bin.count ? bin.sum / bin.count : null };
  });
}
