export type ChartIndexRange = readonly [number, number];

/** Coordinates keep their original sample positions; invalid points are never compacted. */
export function analysisCoordinates(data: readonly { distance: number }[], elapsedSeconds: readonly number[] | undefined, elapsed: boolean, imperial: boolean) {
  const validElapsed = elapsed && elapsedSeconds?.length === data.length && elapsedSeconds.every((value, index) => Number.isFinite(value) && value >= 0 && (!index || value > elapsedSeconds[index - 1]!));
  return { elapsed: !!validElapsed, values: validElapsed ? elapsedSeconds!.map(value => value / 60) : data.map(point => point.distance / (imperial ? 1609.344 : 1000)) };
}

export function orderedChartRange(range: ChartIndexRange | null | undefined, length: number): [number, number] | null {
  if (!range || !range.every(Number.isInteger)) return null;
  const first = Math.max(0, Math.min(length - 1, Math.min(...range)));
  const last = Math.max(0, Math.min(length - 1, Math.max(...range)));
  return first < last ? [first, last] : null;
}

export function nearestAnalysisIndex(axis: readonly number[], value: number, range?: ChartIndexRange | null): number | null {
  let best: number | null = null;
  let difference = Infinity;
  const first = range?.[0] ?? 0, last = range?.[1] ?? axis.length - 1;
  for (let index = first; index <= last; index++) {
    const delta = Math.abs(axis[index]! - value);
    if (Number.isFinite(delta) && delta < difference) { difference = delta; best = index; }
  }
  return best;
}

export function analysisDomain(axis: readonly number[], range?: ChartIndexRange | null): [number, number] {
  const finite = axis.filter(Number.isFinite);
  const full: [number, number] = [finite[0] ?? 0, finite.length ? Math.max(...finite) : 1];
  if (!(full[1] > full[0])) full[1] = full[0] + 1;
  if (!range) return full;
  const start = axis[range[0]], end = axis[range[1]];
  return Number.isFinite(start) && Number.isFinite(end) && end! > start! ? [start!, end!] : full;
}

/** A null separator marks an unobserved long interval; source indices remain explicit. */
export function analysisPlotPoints(axis: readonly number[], values: readonly (number | null)[]) {
  const deltas = axis.slice(1).map((value, index) => value - axis[index]!).filter(value => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  const maxGap = (deltas[Math.floor(deltas.length / 2)] ?? Infinity) * 3;
  const points: Array<{ x: number; y: number | null; sourceIndex: number | null }> = [];
  values.forEach((value, index) => {
    if (index && axis[index]! - axis[index - 1]! > maxGap) points.push({ x: (axis[index]! + axis[index - 1]!) / 2, y: null, sourceIndex: null });
    points.push({ x: axis[index]!, y: value != null && Number.isFinite(value) ? value : null, sourceIndex: index });
  });
  return points;
}
