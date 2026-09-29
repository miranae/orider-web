import { useCallback, useMemo, useState } from "react";
import type { ActivityStreams } from "@shared/types";
import type { SplitRow } from "@shared/types/activity-metrics";
import { detectConsistentTimestampUnit } from "../../../utils/timestampUnit";

export interface RunSplitLocation {
  routeRange?: { startIndex: number; endIndex: number };
  chartRange?: [number, number];
  markerPosition: [number, number] | null;
}

/** 서버 km 구간을 관측 거리(m)의 시작값부터 위치에만 대응한다. 페이스는 다시 계산하지 않는다. */
export function resolveRunSplitLocation(
  split: Pick<SplitRow, "km"> | null,
  streams: Pick<ActivityStreams, "distance" | "time" | "latlng" | "altitude"> | null,
  sampled: ReadonlyArray<{ distance: number }>,
  observedDistanceKm: number | null = null,
): RunSplitLocation | null {
  const distance = streams?.distance;
  const time = streams?.time;
  if (!split || !Number.isFinite(split.km) || split.km <= 0 || !distance || distance.length < 2
    || !time || time.length !== distance.length || detectConsistentTimestampUnit(time) == null) return null;
  for (let index = 0; index < distance.length; index++) {
    const value = distance[index];
    if (value == null || !Number.isFinite(value) || value < 0 || !Number.isFinite(time[index]) || (index > 0 && (value < distance[index - 1]!
      || time[index]! < time[index - 1]!))) return null;
  }
  if (!(time[time.length - 1]! > time[0]!)) return null;
  const baseline = distance[0]!;
  const startDistance = baseline + (Math.ceil(split.km) - 1) * 1000;
  const targetEnd = baseline + split.km * 1000;
  const lastDistance = distance[distance.length - 1]!;
  // 마지막 부분 구간만 자를 수 있다. 2.3km 축을 2.3m처럼 오인하거나 잘린 전체 km를 연결하지 않는다.
  if (targetEnd > lastDistance && (observedDistanceKm == null || !Number.isFinite(observedDistanceKm)
    || observedDistanceKm <= 0 || Math.ceil(observedDistanceKm) !== Math.ceil(split.km)
    || Math.floor(observedDistanceKm) !== Math.ceil(split.km) - 1
    // 공개 지표의 0.01km 반올림과 첫 관측 오프셋만 허용한다. 잘린 스트림은 마지막 구간도 연결하지 않는다.
    || Math.abs((lastDistance - baseline) - observedDistanceKm * 1000) > 10)) return null;
  const endDistance = Math.min(targetEnd, lastDistance);
  if (!(endDistance > startDistance)) return null;
  // 경계를 둘러싼 관측점을 사용한다. 정지 중 같은 거리도 보존해 실제 경로 인덱스를 유지한다.
  const bounds = (values: ReadonlyArray<number>): [number, number] | undefined => {
    if (values.length < 2 || Array.from(values).some((value, index) => !Number.isFinite(value)
      || (index > 0 && value < values[index - 1]!))
      || values[0]! > startDistance || values[values.length - 1]! < endDistance) return undefined;
    let start = 0;
    for (let index = 1; index < values.length && values[index]! <= startDistance; index++) start = index;
    const end = values.findIndex((value, index) => index > start && value >= endDistance);
    return end > start ? [start, end] : undefined;
  };
  const raw = bounds(distance);
  if (!raw) return null;
  const latlng = streams?.latlng;
  const validPosition = (position: unknown): position is [number, number] => Array.isArray(position)
    && position.length === 2 && Number.isFinite(position[0]) && Number.isFinite(position[1])
    && Math.abs(position[0]) <= 90 && Math.abs(position[1]) <= 180;
  const routeRange = latlng?.length === distance.length
    && Array.from(latlng.slice(raw[0], raw[1] + 1)).every(validPosition)
    ? { startIndex: raw[0], endIndex: raw[1] } : undefined;
  const altitude = streams?.altitude;
  const chartRange = altitude?.length === distance.length
    && Array.from(altitude.slice(raw[0], raw[1] + 1)).every(value => value != null && Number.isFinite(value))
    ? bounds(sampled.map(point => point.distance)) : undefined;
  if (!routeRange && !chartRange) return null;
  return { routeRange, chartRange, markerPosition: routeRange ? latlng![raw[1]]! : null };
}

export function useRunSplitLocation(
  activityId: string | undefined,
  loadedActivityId: string | undefined,
  enabled: boolean,
  streams: ActivityStreams | null,
  sampled: ReadonlyArray<{ distance: number }>,
  observedDistanceKm: number | null = null,
) {
  const [selection, setSelection] = useState<{ activityId: string | undefined; split: SplitRow | null }>({ activityId, split: null });
  // 같은 페이지 인스턴스에서 활동이 바뀌면 첫 렌더부터 과거 구간을 지운다.
  if (selection.activityId !== activityId) setSelection({ activityId, split: null });
  const onSelectSplit = useCallback((split: SplitRow | null) => {
    setSelection({ activityId, split });
  }, [activityId]);
  const location = useMemo(() => enabled && activityId === loadedActivityId && selection.activityId === activityId
    ? resolveRunSplitLocation(selection.split, streams, sampled, observedDistanceKm) : null,
  [enabled, activityId, loadedActivityId, selection, streams, sampled, observedDistanceKm]);
  return { location, onSelectSplit };
}
