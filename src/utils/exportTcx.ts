import type { Activity, ActivityStreams } from "@shared/types";
import { cadenceWriter, type CadenceWriter, type ExportCadenceUnit } from "./exportCadence";
import { exportSportOf } from "./exportSport";
import { resolveRecordedElapsedMs, usesVerifiedActivityTime } from "./prepareActivityFileStreams";
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
  const recordedClock = unit !== "relative_sec";
  const summary = activity.summary;
  let lapTimer = 0;
  const nativeLapClock = (streams.laps ?? []).map(lap => {
    const timerStart = lapTimer;
    lapTimer += lap.durationMs / 1000;
    return {
      start: ((lap.startTimeMs ?? NaN) - startMs) / 1000,
      end: ((lap.endTimeMs ?? NaN) - startMs) / 1000,
      timerStart,
      timerEnd: lapTimer,
    };
  });
  const boundedLaps = nativeLapClock.length > 0 && nativeLapClock.every((lap, index) =>
    Number.isFinite(lap.start) && Number.isFinite(lap.end) && lap.end > lap.start
    && lap.start >= (nativeLapClock[index - 1]?.end ?? 0));
  // Where both clocks have identical origins and offsets, the stored samples can
  // be attached to those laps without resolving the legacy clock convention.
  const coincidentClocks = boundedLaps && nativeLapClock.every(lap => lap.start === lap.timerStart && lap.end === lap.timerEnd);
  const activityTime = verifiedRelativeClock || recordedClock || coincidentClocks || activity.source === "strava";
  const hasNativeLapTimes = nativeLapClock.some(lap => Number.isFinite(lap.start) || Number.isFinite(lap.end));
  const ambiguousNativeClock = !activityTime && hasNativeLapTimes;
  const relSecAt = (index: number) => {
    const value = streams.time?.[index];
    if (value == null || !Number.isFinite(value)) return relativeAt(index);
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
  const lastObservation = timedAt(indices.length - 1);
  const recordedDuration = resolveRecordedElapsedMs(activity, Math.max(summary.ridingTimeMillis || 0,
    Math.round((lastObservation ?? 0) * 1000)));
  const onlyLap = streams.laps?.length === 1 ? streams.laps[0] : undefined;
  const fullActivityLap = onlyLap != null && onlyLap.durationMs > 0 && onlyLap.durationMs === recordedDuration
    && (onlyLap.startTimeMs == null || onlyLap.startTimeMs === startMs)
    && (onlyLap.endTimeMs == null || onlyLap.endTimeMs === startMs + recordedDuration);
  const laps: Array<{ start: number; endTime: number; duration: number; distance: number; first: number; end: number }> = [];
  let hasUnassigned = false;
  let canKeepRecordedLaps = true;
  let sharedClockPrefix = true;
  for (const [lapIndex, lap] of (streams.laps ?? []).entries()) {
    const clock = nativeLapClock[lapIndex];
    sharedClockPrefix &&= clock != null && clock.start === clock.timerStart && clock.end === clock.timerEnd;
    const clockMatchesTrack = !ambiguousNativeClock || sharedClockPrefix;
    const duration = (lap.durationMs || 0) / 1000;
    const recordedEnd = (activityTime || ambiguousNativeClock) && typeof lap.endTimeMs === "number" && Number.isFinite(lap.endTimeMs)
      ? (lap.endTimeMs - startMs) / 1000 : undefined;
    const recordedStart = (activityTime || ambiguousNativeClock) && typeof lap.startTimeMs === "number" && Number.isFinite(lap.startTimeMs)
      ? (lap.startTimeMs - startMs) / 1000 : undefined;
    const start = fullActivityLap && recordedStart == null ? 0 : recordedStart ?? previousEnd;
    const end = recordedEnd ?? start + duration;
    const hasRecordedBounds = (recordedStart != null && recordedEnd != null) || fullActivityLap;
    const canAssignTrack = clockMatchesTrack && (!(activityTime || hasNativeLapTimes) || hasRecordedBounds);
    if (canAssignTrack && recordedStart != null) {
      const first = next;
      while (next < indices.length && (timedAt(next) ?? Infinity) < recordedStart) next++;
      hasUnassigned ||= next > first;
    }
    const first = next;
    while (canAssignTrack && next < indices.length) {
      const time = timedAt(next) ?? Infinity;
      if (time > end) break;
      next++;
    }
    // A duration-only lap can retain its recorded metrics, but its track on an
    // elapsed clock is unknown without a recorded boundary.
    canKeepRecordedLaps &&= (!(activityTime || hasNativeLapTimes) || recordedStart != null || fullActivityLap);
    const validDistance = typeof lap.distanceKm === "number" && Number.isFinite(lap.distanceKm) && lap.distanceKm >= 0;
    laps.push({ start, endTime: end, duration, distance: validDistance ? lap.distanceKm * 1000 : 0,
      first, end: next });
    previousEnd = end;
  }
  hasUnassigned ||= laps.length > 0 && (next < indices.length || !canKeepRecordedLaps);
  const validRecordedDuration = recordedDuration != null;
  const summaryLapDuration = activityTime || (!ambiguousNativeClock && summary.ridingTimeMillis === recordedDuration)
    ? recordedDuration : undefined;
  const requiresCsv = !laps.length && activityTime && !validRecordedDuration
    && lastObservation != null && lastObservation > (summary.ridingTimeMillis || 0) / 1000;
  const canExportAllAsTcx = typeof summary.distance === "number" && Number.isFinite(summary.distance) && summary.distance >= 0
    && summaryLapDuration != null;
  const lapCoversActivity = laps.length === 1 && (fullActivityLap
    || (recordedDuration != null && laps[0]?.start === 0 && laps[0].endTime === recordedDuration / 1000
      && onlyLap?.startTimeMs === startMs && onlyLap.endTimeMs === startMs + recordedDuration));
  return {
    hasUnassigned,
    canExportAllAsTcx,
    canKeepRecordedLaps: laps.length > 0 && canKeepRecordedLaps,
    hasUnallocatedCalories: laps.length > 0 && !lapCoversActivity && Number.isFinite(streams.calories) && (streams.calories ?? 0) > 0
      && canExportAllAsTcx,
    requiresCsv,
    render(mode: TcxLapMode): string {
      if (requiresCsv) throw new Error("TCX_ELAPSED_UNAVAILABLE");
      if (laps.length && !canKeepRecordedLaps && (mode === "recorded" || !canExportAllAsTcx)) throw new Error("TCX_LAP_CLOCK_UNAVAILABLE");
      if (mode === "activity" && !canExportAllAsTcx) throw new Error("TCX_ACTIVITY_CLOCK_UNAVAILABLE");
      const lines = [...header];
      if (laps.length && (mode === "recorded" || !canExportAllAsTcx)) {
        for (const lap of laps) {
          const calories = lapCoversActivity ? streams.calories ?? 0 : 0;
          writeLap(lines, startMs + lap.start * 1000, lap.duration, lap.distance, calories, lap.first, lap.end);
        }
      } else {
        const duration = ((mode === "activity" ? summaryLapDuration
          : activityTime ? recordedDuration ?? summary.ridingTimeMillis : summary.ridingTimeMillis) || 0) / 1000;
        writeLap(lines, startMs, duration, summary.distance || 0, streams.calories || 0, 0, indices.length);

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
