import type { Activity, ActivityStreams } from "@shared/types";
import { cadenceWriter, type CadenceWriter, type ExportCadenceUnit } from "./exportCadence";
import { exportSportOf } from "./exportSport";
import { usesVerifiedActivityTime } from "./prepareActivityFileStreams";
import { makeRelSecAt } from "./streamTime";

/** @param cadenceUnit 활동 지표의 저장 케이던스 단위 — 러닝 케이던스를 한 발 기준으로 바꾸는 데 쓴다. */
export function generateTcx(activity: Activity, streams: ActivityStreams, cadenceUnit?: ExportCadenceUnit): string {
  const sport = exportSportOf(activity);
  const cadence = cadenceWriter(sport, cadenceUnit);
  const startDate = new Date(activity.startTime);
  const startMs = startDate.getTime();
  const len = streams.time?.length || streams.latlng?.length || 0;

  // streams.time 단위 정규화(상대 초) — 공용 헬퍼. 절대 epoch 입력 시 트랙포인트 시간이
  // 서기 5만년대로 오버플로우하던 버그 방지. 랩 분할/트랙포인트 시간이 동일 기준으로 계산된다.
  const relSecAt = makeRelSecAt(streams.time);

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:ext="http://www.garmin.com/xmlschemas/ActivityExtension/v2">',
    '<Activities>',
    `<Activity Sport="${sport.tcxSport}">`,
    `<Id>${startDate.toISOString()}</Id>`,
  ];

  const closeLapWithTrack = (first: number, end: number) => {
    if (first < end) {
      lines.push('<Track>');
      for (let index = first; index < end; index++) writeTrackpoint(lines, streams, index, startMs, relSecAt(index), cadence);
      lines.push('</Track>');
    }
    lines.push('</Lap>');
  };

  // Preserve recorded lap boundaries and retain observations between distinct laps.
  if (streams.laps?.length) {
    let trackIdx = 0;
    let previousLapEnd = 0;
    const activityTime = usesVerifiedActivityTime(streams);
    const timeAt = (index: number) => relSecAt(index) ?? index;
    const distanceBefore = (end: number) => {
      for (let index = Math.min(end, streams.distance?.length ?? 0) - 1; index >= 0; index--) {
        const value = streams.distance?.[index];
        if (typeof value === "number" && Number.isFinite(value)) return value;
      }
      return undefined;
    };
    const writeUnassigned = (before: number) => {
      const first = trackIdx;
      while (trackIdx < len && timeAt(trackIdx) < before) trackIdx++;
      if (trackIdx === first) return;
      const firstTime = timeAt(first);
      const initialDistance = distanceBefore(first) ?? streams.distance?.slice(first, trackIdx).find(value => Number.isFinite(value));
      const finalDistance = distanceBefore(trackIdx);
      const distance = initialDistance != null && finalDistance != null ? Math.max(0, finalDistance - initialDistance) : 0;
      openLap(lines, startMs + firstTime * 1000, timeAt(trackIdx - 1) - firstTime, distance, 0);
      closeLapWithTrack(first, trackIdx);
    };

    for (const lap of streams.laps) {
      const lapSeconds = (lap.durationMs || 0) / 1000;
      const recordedStart = activityTime && typeof lap.startTimeMs === "number" && Number.isFinite(lap.startTimeMs)
        ? (lap.startTimeMs - startMs) / 1000 : undefined;
      const lapStart = recordedStart ?? (activityTime ? previousLapEnd : (relSecAt(trackIdx) ?? 0));
      const lapEnd = activityTime && typeof lap.endTimeMs === "number" && Number.isFinite(lap.endTimeMs)
        ? (lap.endTimeMs - startMs) / 1000 : lapStart + lapSeconds;
      if (recordedStart !== undefined) writeUnassigned(lapStart);
      openLap(lines, startMs + lapStart * 1000, lapSeconds, (lap.distanceKm || 0) * 1000, 0);
      const first = trackIdx;
      while (trackIdx < len && timeAt(trackIdx) <= lapEnd) trackIdx++;
      closeLapWithTrack(first, trackIdx);
      previousLapEnd = lapEnd;
    }
    writeUnassigned(Infinity);
  } else {
    openLap(lines, startMs, (activity.summary.ridingTimeMillis || 0) / 1000, activity.summary.distance || 0, streams.calories || 0);
    closeLapWithTrack(0, len);
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
