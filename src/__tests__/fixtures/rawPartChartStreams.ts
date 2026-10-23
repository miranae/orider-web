import type { ActivityStreams } from "@shared/types";

/** 측정 주기가 다른 센서를 같은 1초 축에 담는 raw_parts 응답 형태. */
export function rawPartChartStreams(): ActivityStreams {
  const count = 601;
  return {
    time: Array.from({ length: count }, (_, index) => index),
    distance: Array.from({ length: count }, (_, index) => index * 5),
    altitude: Array.from({ length: count }, (_, index) => index % 5 === 0 && (index <= 120 || index >= 200) ? 50 + index / 20 : null),
    velocity_smooth: Array.from({ length: count }, () => 5),
    heartrate: Array.from({ length: count }, (_, index) => index % 23 === 0 ? null : 120 + index % 20),
    cadence: Array.from({ length: count }, (_, index) => index % 17 === 0 ? null : index % 13 === 0 ? 0 : 80),
  } as unknown as ActivityStreams;
}
