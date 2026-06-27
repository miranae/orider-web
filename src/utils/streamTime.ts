/**
 * streams.time 단위 정규화 헬퍼 — 내보내기(TCX/GPX/FIT/CSV) 공용.
 *
 * 배경: `streams.time` 의 의미가 데이터 소스마다 다르다.
 *  - Strava: 시작 기준 "상대 초"(0, 1, 2, …)
 *  - 일부 활동(O-Rider 등): "절대 epoch" — 초(~1.7e9) 또는 밀리초(~1.7e12)
 * 이를 구분하지 않고 `startTime + t*1000` 하면 절대 epoch 가 들어올 때 트랙포인트 시간이
 * 서기 5만년대로 오버플로우(TCX/GPX)하거나 FIT uint32 타임스탬프가 손상된다.
 *
 * 첫 유효 샘플의 크기로 단위를 판정해 "시작 기준 상대 초"로 환산하는 접근자를 돌려준다.
 * 절대값은 첫 샘플을 0으로 재기준화하므로, 트랙포인트 절대시각은 항상 activity.startTime
 * (헤더와 동일 기준) 위에서 누적된다.
 */
export type StreamTimeArray = ReadonlyArray<number | null | undefined> | undefined;

/** time 배열 → `(i) => 시작 기준 상대 초 | null` 접근자. */
export function makeRelSecAt(time: StreamTimeArray): (i: number) => number | null {
  const first = time?.find((v) => v != null) ?? undefined;
  const mode: "absMs" | "absSec" | "rel" =
    first == null ? "rel" : first > 1e12 ? "absMs" : first > 1e9 ? "absSec" : "rel";
  const base = first ?? 0;
  return (i: number): number | null => {
    const raw = time?.[i];
    if (raw == null) return null;
    if (mode === "absMs") return (raw - base) / 1000; // 절대 밀리초
    if (mode === "absSec") return raw - base;          // 절대 초
    return raw;                                        // 상대 초(이미 0 기준)
  };
}
