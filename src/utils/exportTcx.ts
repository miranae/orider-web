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

  // 랩 정보가 있으면 랩별 Lap 생성, 없으면 전체를 단일 Lap으로
  if (streams.laps && streams.laps.length > 0) {
    let trackIdx = 0;
    let previousLapEnd = 0;
    const activityTime = usesVerifiedActivityTime(streams);
    for (const [lapIndex, lap] of streams.laps.entries()) {
      const lapSeconds = (lap.durationMs || 0) / 1000;
      const lapDistanceM = (lap.distanceKm || 0) * 1000;
      lines.push('<Lap>');
      lines.push(`<TotalTimeSeconds>${lapSeconds}</TotalTimeSeconds>`);
      lines.push(`<DistanceMeters>${lapDistanceM}</DistanceMeters>`);
      lines.push('<Track>');

      // 현재 랩에 해당하는 트랙포인트 수 추정 (상대 초 기반)
      const lapStart = typeof lap.startTimeMs === "number" && Number.isFinite(lap.startTimeMs)
        ? (lap.startTimeMs - startMs) / 1000
        : activityTime ? previousLapEnd : (relSecAt(trackIdx) ?? 0);
      const lapEndTime = typeof lap.endTimeMs === "number" && Number.isFinite(lap.endTimeMs)
        ? (lap.endTimeMs - startMs) / 1000
        : lapStart + lapSeconds;
      previousLapEnd = lapEndTime;
      const isLastLap = lapIndex === streams.laps.length - 1;
      while (trackIdx < len) {
        const tSec = relSecAt(trackIdx) ?? trackIdx;
        if (!isLastLap && tSec > lapEndTime) break;
        writeTrackpoint(lines, streams, trackIdx, startMs, relSecAt(trackIdx), cadence);
        trackIdx++;
      }

      lines.push('</Track>', '</Lap>');
    }
  } else {
    lines.push('<Lap>');
    lines.push(`<TotalTimeSeconds>${(activity.summary.ridingTimeMillis || 0) / 1000}</TotalTimeSeconds>`);
    lines.push(`<DistanceMeters>${activity.summary.distance || 0}</DistanceMeters>`);
    lines.push(`<Calories>${streams.calories || 0}</Calories>`);
    lines.push('<Track>');

    for (let i = 0; i < len; i++) {
      writeTrackpoint(lines, streams, i, startMs, relSecAt(i), cadence);
    }

    lines.push('</Track>', '</Lap>');
  }

  lines.push('</Activity>', '</Activities>', '</TrainingCenterDatabase>');
  return lines.join('\n');
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
