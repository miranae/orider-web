/**
 * 홈 요약 정본 응답 픽스처 (#2237 리뷰).
 *
 * 테스트가 **서버가 실제로 내려주는 모양**만 쓰게 한다. 이전에는 테스트가 웹이 잘못 선언한
 * 이름(`rideCount`/`distanceKm`/`movingSec`)으로 픽스처를 만들었고, 그래서 타입이 서버와
 * 어긋난 채 전부 통과했다.
 *
 * @sync-with orider-g1-web/functions/src/api/routes/home-summary-aggregate.ts#HomeSummaryTotals
 * @sync-with orider-g1-web/functions/src/api/routes/home.ts (봉투 `data` 의 rolling7d·calendar·timezone·rollingWindowMs)
 *
 * 이름·단위가 서버에서 바뀌면 여기부터 고친다 — 화면 쪽에 흩어진 값이 아니라 이 한 곳이다.
 */

/** 서버 `HomeSummaryTotals` 그대로. 거리는 미터, 이동시간은 밀리초다. */
export interface ServerHomeSummaryTotals {
  activityCount: number;
  distanceMeters: number;
  movingMillis: number;
  elevationGainMeters: number;
}

/** 최근 7일 합계 한 벌. 3회 · 42.0km · 1시간 · 120m. */
export const serverHomeTotals: ServerHomeSummaryTotals = {
  activityCount: 3,
  distanceMeters: 42_000,
  movingMillis: 3_600_000,
  elevationGainMeters: 120,
};

/**
 * 옛 웹 필드명으로만 채운 페이로드. **서버는 이 모양을 내려준 적이 없다** — 파서가 이것을
 * "값 없음" 으로 읽는지 지키는 데만 쓴다(회귀 가드).
 */
export const legacyWebHomeTotals = {
  rideCount: 3,
  distanceKm: 42,
  movingSec: 3_600,
  elevationGainMeters: 120,
} as const;

/** 봉투 `data` 모양. `calendar` 버킷은 `key` + 같은 합계 모양이다. */
export function serverHomeSummaryData(
  totals: ServerHomeSummaryTotals = serverHomeTotals,
): Record<string, unknown> {
  return {
    rolling7d: {
      period: {
        start: 1_700_000_000_000 - 7 * 24 * 60 * 60 * 1000,
        end: 1_700_000_000_000,
        timezone: "Asia/Seoul",
        asOf: 1_700_000_000_000,
        rule: "rolling",
      },
      totals,
    },
    calendar: {
      week: { key: "w_2026-W36", totals },
      month: { key: "m_2026-09", totals },
      year: null,
    },
    timezone: "Asia/Seoul",
    rollingWindowMs: 7 * 24 * 60 * 60 * 1000,
  };
}
