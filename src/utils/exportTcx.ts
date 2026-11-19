import type { Activity, ActivityStreams } from "@shared/types";
import { cadenceWriter, type CadenceWriter, type ExportCadenceUnit } from "./exportCadence";
import { exportSportOf } from "./exportSport";
import { usesVerifiedActivityTime } from "./prepareActivityFileStreams";
import { makeRelSecAt } from "./streamTime";
import { detectTimestampUnit } from "./timestampUnit";

export type TcxLapMode = "recorded" | "activity";

export function generateTcx(activity: Activity, streams: ActivityStreams, cadenceUnit?: ExportCadenceUnit): string {
  return prepareTcxExport(activity, streams, cadenceUnit).render("recorded");
}

/** @param cadenceUnit 활동 지표의 저장 케이던스 단위 — 러닝 케이던스를 한 발 기준으로 바꾸는 데 쓴다. */
export function prepareTcxExport(activity: Activity, streams: ActivityStreams, cadenceUnit?: ExportCadenceUnit) {
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
  const verifiedRelativeClock = usesVerifiedActivityTime(streams);
  const recordedClock = unit !== "relative_sec" && streams.laps?.some(lap => Number.isFinite(lap.startTimeMs) || Number.isFinite(lap.endTimeMs));
  const activityTime = verifiedRelativeClock || recordedClock;
  const relSecAt = (index: number) => {
    const value = streams.time?.[index];
    if (!recordedClock || value == null || !Number.isFinite(value)) return relativeAt(index);
    if (unit === "epoch_ms") return (value - startMs) / 1000;
    if (unit === "epoch_sec") return value - startMs / 1000;
    return value;
  };

  const header = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:ext="http://www.garmin.com/xmlschemas/ActivityExtension/v2">',
    '<Activities>',
    `<Activity Sport="${sport.tcxSport}">`,
    `<Id>${startDate.toISOString()}</Id>`,
  ];

  const indices = Array.from({ length: len }, (_, index) => index).filter(index =>
    !activityTime || streams.latlng?.[index] != null || Number.isFinite(streams.distance?.[index])
    || Number.isFinite(streams.altitude?.[index]) || Number.isFinite(streams.heartrate?.[index])
    || Number.isFinite(streams.watts?.[index]) || Number.isFinite(streams.velocity_smooth?.[index]) || cadence.whole(streams.cadence?.[index]) != null);
  const writeTrack = (lines: string[], first: number, end: number) => {
    if (first === end) return;
    lines.push('<Track>');
    for (const index of indices.slice(first, end)) writeTrackpoint(lines, streams, index, startMs, relSecAt(index), cadence);
    lines.push('</Track>');
  };
  const writeLap = (lines: string[], when: number, duration: number, distance: number, calories: number, first: number, end: number) => {
    openLap(lines, when, duration, distance, calories);
    writeTrack(lines, first, end);
    lines.push('</Lap>');
  };

  let next = 0;
  let previousEnd = 0;
  const timedAt = (cursor: number) => {
    const index = indices[cursor];
    return index == null ? null : relSecAt(index) ?? index;
  };
  const laps: Array<{ start: number; duration: number; distance: number; first: number; end: number }> = [];
  let hasUnassigned = false;
  for (const lap of streams.laps ?? []) {
    const duration = (lap.durationMs || 0) / 1000;
    const recordedEnd = activityTime && typeof lap.endTimeMs === "number" && Number.isFinite(lap.endTimeMs)
      ? (lap.endTimeMs - startMs) / 1000 : undefined;
    const recordedStart = activityTime && typeof lap.startTimeMs === "number" && Number.isFinite(lap.startTimeMs)
      ? (lap.startTimeMs - startMs) / 1000 : undefined;
    const nextObservedStart = Math.max(timedAt(next) ?? previousEnd, previousEnd);
    const contiguous = verifiedRelativeClock && (laps.length === 0 || nextObservedStart - previousEnd < duration);
    const start = recordedStart ?? (recordedEnd != null || contiguous ? previousEnd : nextObservedStart);
    const end = recordedEnd ?? start + duration;
    if (recordedStart != null) {
      const first = next;
      while (next < indices.length && (timedAt(next) ?? Infinity) < recordedStart) next++;
      hasUnassigned ||= next > first;
    }
    const first = next;
    while (next < indices.length && (timedAt(next) ?? Infinity) <= end) next++;
    const validDistance = typeof lap.distanceKm === "number" && Number.isFinite(lap.distanceKm) && lap.distanceKm >= 0;
    laps.push({ start, duration, distance: validDistance ? lap.distanceKm * 1000 : 0, first, end: next });
    previousEnd = end;
  }
  hasUnassigned ||= laps.length > 0 && next < indices.length;
  const summary = activity.summary;
  const elapsed = summary.elapsedTimeMillis;
  const recordedDuration = typeof elapsed === "number" && Number.isFinite(elapsed) && elapsed >= 0 ? elapsed
    : Number.isFinite(activity.endTime) && activity.endTime >= startMs ? activity.endTime - startMs : summary.ridingTimeMillis;
  const canExportAllAsTcx = typeof summary.distance === "number" && Number.isFinite(summary.distance) && summary.distance >= 0
    && typeof recordedDuration === "number" && Number.isFinite(recordedDuration) && recordedDuration >= 0;
  return {
    hasUnassigned,
    canExportAllAsTcx,
    render(mode: TcxLapMode): string {
      const lines = [...header];
      if (laps.length && (mode === "recorded" || !canExportAllAsTcx)) {
        for (const lap of laps) writeLap(lines, startMs + lap.start * 1000, lap.duration, lap.distance, 0, lap.first, lap.end);
      } else {
        const duration = (laps.length ? recordedDuration : summary.ridingTimeMillis) || 0;
        writeLap(lines, startMs, duration / 1000, summary.distance || 0, streams.calories || 0, 0, indices.length);
      }
      lines.push('</Activity>', '</Activities>', '</TrainingCenterDatabase>');
      return lines.join('\n');
    },
  };
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
  const speed = streams.velocity_smooth?.[i];
  const hasSpeed = typeof speed === "number" && Number.isFinite(speed) && speed >= 0;
  if (hasSpeed || streams.watts?.[i] != null || runCadence != null) {
    lines.push('<Extensions>');
    lines.push('<ext:TPX>');
    if (hasSpeed) lines.push(`<ext:Speed>${speed}</ext:Speed>`);
    if (runCadence != null) lines.push(`<ext:RunCadence>${runCadence}</ext:RunCadence>`);
    if (streams.watts?.[i] != null) lines.push(`<ext:Watts>${streams.watts[i]}</ext:Watts>`);
    lines.push('</ext:TPX>');
    lines.push('</Extensions>');
  }
  lines.push('</Trackpoint>');
}
