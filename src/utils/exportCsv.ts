import type { ActivityStreams } from "@shared/types";
import { makeRelSecAt } from "./streamTime";

export function generateCsv(streams: ActivityStreams): string {
  const headers = ['timestamp', 'latitude', 'longitude', 'altitude', 'speed', 'cadence', 'heartrate', 'power'];
  const rows: string[] = [headers.join(',')];

  // timestamp 컬럼은 "시작 기준 경과 초"로 정규화 — 일부 활동은 절대 epoch(초/밀리초)로
  // 저장돼 그대로 출력하면 컬럼 의미가 활동마다 들쭉날쭉했다(상대초가 일반적 케이스).
  const relSecAt = makeRelSecAt(streams.time);
  const len = streams.time?.length || streams.latlng?.length || 0;
  for (let i = 0; i < len; i++) {
    const row = [
      relSecAt(i) ?? '',
      streams.latlng?.[i]?.[0] ?? '',
      streams.latlng?.[i]?.[1] ?? '',
      streams.altitude?.[i] ?? '',
      streams.velocity_smooth?.[i] ?? '',
      streams.cadence?.[i] ?? '',
      streams.heartrate?.[i] ?? '',
      streams.watts?.[i] ?? '',
    ];
    rows.push(row.join(','));
  }

  return rows.join('\n');
}
