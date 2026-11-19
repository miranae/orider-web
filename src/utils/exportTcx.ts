import type { Activity, ActivityStreams } from "@shared/types";
import { cadenceWriter, type CadenceWriter, type ExportCadenceUnit } from "./exportCadence";
import { exportSportOf } from "./exportSport";
import { usesVerifiedActivityTime } from "./prepareActivityFileStreams";
import { makeRelSecAt } from "./streamTime";
import { detectTimestampUnit } from "./timestampUnit";

/** @param cadenceUnit 활동 지표의 저장 케이던스 단위 — 러닝 케이던스를 한 발 기준으로 바꾸는 데 쓴다. */
export function generateTcx(activity: Activity, streams: ActivityStreams, cadenceUnit?: ExportCadenceUnit): string {
  const sport = exportSportOf(activity);
  const cadence = cadenceWriter(sport, cadenceUnit);
  const startDate = new Date(activity.startTime);
  const startMs = startDate.getTime();
  const len = streams.time?.length || streams.latlng?.length || 0;

  // streams.time 단위 정규화(상대 초) — 공용 헬퍼. 절대 epoch 입력 시 트랙포인트 시간이
  // 서기 5만년대로 오버플로우하던 버그 방지. 랩 분할/트랙포인트 시간이 동일 기준으로 계산된다.
  const relativeAt = makeRelSecAt(streams.time);
  const firstTime = streams.time?.find(value => Number.isFinite(value));
  const unit = firstTime == null ? "relative_sec" : detectTimestampUnit(firstTime);
  const recordedClock = streams.laps?.some(lap => Number.isFinite(lap.startTimeMs) || Number.isFinite(lap.endTimeMs)) && firstTime != null;
  const activityTime = usesVerifiedActivityTime(streams) || recordedClock;
  const relSecAt = (index: number) => {
    const value = streams.time?.[index];
    if (!recordedClock || value == null || !Number.isFinite(value)) return relativeAt(index);
    if (unit === "epoch_ms") return (value - startMs) / 1000;
    if (unit === "epoch_sec") return value - startMs / 1000;
    return value;
  };

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:ext="http://www.garmin.com/xmlschemas/ActivityExtension/v2">',
    '<Activities>',
    `<Activity Sport="${sport.tcxSport}">`,
    `<Id>${startDate.toISOString()}</Id>`,
  ];

  const indices = Array.from({ length: len }, (_, index) => index).filter(index =>
    !activityTime || streams.latlng?.[index] != null || Number.isFinite(streams.distance?.[index])
    || Number.isFinite(streams.altitude?.[index]) || Number.isFinite(streams.heartrate?.[index])
    || Number.isFinite(streams.watts?.[index]) || cadence.whole(streams.cadence?.[index]) != null);
  const writeLap = (when: number, duration: number, distance: number, calories: number, first: number, end: number) => {
    openLap(lines, when, duration, distance, calories);
    if (first < end) {
      lines.push('<Track>');
      for (const index of indices.slice(first, end)) writeTrackpoint(lines, streams, index, startMs, relSecAt(index), cadence);
      lines.push('</Track>');
    }
    lines.push('</Lap>');
  };

  let next = 0;
  let previousEnd = 0;
  let unassigned = false;
  const timedAt = (cursor: number) => {
    const index = indices[cursor];
    return index == null ? null : relSecAt(index) ?? index;
  };
  const laps = streams.laps?.map(lap => {
    const duration = (lap.durationMs || 0) / 1000;
    const recordedEnd = activityTime && typeof lap.endTimeMs === "number" && Number.isFinite(lap.endTimeMs)
      ? (lap.endTimeMs - startMs) / 1000 : undefined;
    const recordedStart = activityTime && typeof lap.startTimeMs === "number" && Number.isFinite(lap.startTimeMs)
      ? (lap.startTimeMs - startMs) / 1000 : recordedEnd == null ? undefined : recordedEnd - duration;
    const start = recordedStart ?? (activityTime ? previousEnd : Math.max(timedAt(next) ?? previousEnd, previousEnd));
    const end = recordedEnd ?? start + duration;
    previousEnd = end;
    const first = next;
    const nextTime = timedAt(next);
    if (recordedStart != null && nextTime != null && nextTime < recordedStart) unassigned = true;
    while (next < indices.length && (timedAt(next) ?? Infinity) <= end) next++;
    return { start, duration, distance: (lap.distanceKm || 0) * 1000, first, end: next };
  });

  if (laps?.length && !unassigned && next === indices.length) {
    for (const lap of laps) writeLap(startMs + lap.start * 1000, lap.duration, lap.distance, 0, lap.first, lap.end);
  } else {
    // A TCX track requires a lap with a distance. Use the recorded activity total when points
    // fall outside the recorded laps, rather than inventing distances for extra laps.
    writeLap(startMs, (activity.summary.ridingTimeMillis || 0) / 1000, activity.summary.distance || 0,
      streams.calories || 0, 0, indices.length);
  }

  lines.push('</Activity>', '</Activities>', '</TrainingCenterDatabase>');
  return lines.join('\n');
}

function openLap(lines: string[], startMs: number, duration: number, distance: number, calories: number) {
  const caloriesField = Number.isFinite(calories) ? Math.round(Math.max(0, Math.min(65535, calories))) : 0;
  lines.push(`<Lap StartTime="${new Date(startMs).toISOString()}">`,
    `<TotalTimeSeconds>${duration}</TotalTimeSeconds>`, `<DistanceMeters>${distance}</DistanceMeters>`,
    `<Calories>${caloriesField}</Calories>`, '<Intensity>Active</Intensity>', '<TriggerMethod>Manual</TriggerMethod>');
}

function writeTrackpoint(lines: string[], streams: ActivityStreams, i: number, startMs: number, relSec: number | null, cadence: CadenceWriter) {
  const time = relSec != null ? new Date(startMs + relSec * 1000).toISOString() : new Date(startMs).toISOString();
  lines.push('<Trackpoint>');
  lines.push(`<Time>${time}</Time>`);
  const ll = streams.latlng?.[i];
  if (ll) {
    lines.push('<Position>');
    lines.push(`<LatitudeDegrees>${ll[0]}</LatitudeDegrees>`);
    lines.push(`<LongitudeDegrees>${ll[1]}</LongitudeDegrees>`);
    lines.push('</Position>');
  }
  if (streams.altitude?.[i] != null) {
    lines.push(`<AltitudeMeters>${streams.altitude[i]}</AltitudeMeters>`);
  }
  if (streams.distance?.[i] != null) {
    lines.push(`<DistanceMeters>${streams.distance[i]}</DistanceMeters>`);
  }
  if (streams.heartrate?.[i] != null) {
    lines.push('<HeartRateBpm>');
    lines.push(`<Value>${streams.heartrate[i]}</Value>`);
    lines.push('</HeartRateBpm>');
  }
  const cad = cadence.whole(streams.cadence?.[i]);
  // Trackpoint <Cadence> 는 자전거 rpm 이다. 러닝은 TPX 확장의 RunCadence(한 발 기준)에 싣는다.
  if (cad != null && !cadence.footCadence) {
    lines.push(`<Cadence>${cad}</Cadence>`);
  }
  const runCadence = cadence.footCadence ? cad : null;
  if (streams.watts?.[i] != null || runCadence != null) {
    lines.push('<Extensions>');
    lines.push('<ext:TPX>');
    if (runCadence != null) lines.push(`<ext:RunCadence>${runCadence}</ext:RunCadence>`);
    if (streams.watts?.[i] != null) lines.push(`<ext:Watts>${streams.watts[i]}</ext:Watts>`);
    lines.push('</ext:TPX>');
    lines.push('</Extensions>');
  }
  lines.push('</Trackpoint>');
}
