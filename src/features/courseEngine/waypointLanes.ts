/**
 * 코스엔진 — 웨이포인트 유형(레인) 분류.
 *
 * 이전에는 분류기가 두 벌이었고 서로 다른 답을 냈다. 이벤트 상세의 표는 `"KOM"` 을 찾고
 * 차트 마커 필터는 `"콤"` 을 찾아서, 같은 웨이포인트가 표에는 KOM 으로 나오고 차트에는 아예
 * 찍히지 않는 불일치가 가능했다. 게다가 둘 다 한국어 문자열 매칭이라 영어 로케일에서는 전부
 * 기본값으로 떨어졌다.
 *
 * 여기서 하나로 합치고, 판정 순서를 (1) 유형 코드 → (2) 다국어 키워드 로 명시한다.
 * 유형 코드가 있으면 로케일과 무관하게 같은 답이 나온다.
 */

export type WpLane = "KOM" | "AID" | "CUT" | "SEG";

export const LANE_DEFS: Record<WpLane, { labelKey: string; color: string; icon: string }> = {
  KOM: { labelKey: "detail.lane.kom", color: "var(--lime)", icon: "⛰️" },
  AID: { labelKey: "detail.lane.aid", color: "var(--aqua)", icon: "🍌" },
  CUT: { labelKey: "detail.lane.cut", color: "var(--rose)", icon: "⏱️" },
  SEG: { labelKey: "detail.lane.seg", color: "var(--amber)", icon: "🏁" },
};

export const LANE_ORDER: WpLane[] = ["KOM", "AID", "CUT", "SEG"];

/**
 * 레인을 쓰는 문맥. 코스와 대회는 같은 분류를 쓰지만 노출하는 레인과 부르는 이름이 다르다.
 *
 * - 컷오프는 정원·제한시간이 있어야 성립하는 **대회 전용** 개념이다. 개인 코스에 컷오프가 보이면
 *   사용자는 이 코스에 참가 신청이 있다고 오해한다.
 * - 대회의 "보급"은 공식 보급소지만, 개인 코스에서 같은 분류에 들어오는 것은 편의점·카페·식당이다.
 *   같은 분류, 다른 이름으로 부른다.
 *
 * 분류기는 문맥과 무관하게 4종을 전부 판정하고, 걸러내는 것은 화면의 몫이다.
 */
export type LaneContext = "course" | "event";

const CONTEXT_LANES: Record<LaneContext, WpLane[]> = {
  course: ["KOM", "AID", "SEG"],
  event: ["KOM", "AID", "CUT", "SEG"],
};

const CONTEXT_LABEL_KEYS: Record<LaneContext, Partial<Record<WpLane, string>>> = {
  // 코스 문맥에서 AID 는 "보급"이 아니라 "편의" — 편의점·카페·식당을 포괄한다.
  course: { AID: "detail.lane.amenity" },
  event: {},
};

/** 이 문맥에서 노출할 레인 목록(순서 포함). */
export function lanesForContext(context: LaneContext): WpLane[] {
  return CONTEXT_LANES[context];
}

/** 이 문맥에서 이 레인을 노출하는가. 코스에서 컷오프를 거르는 데 쓴다. */
export function isLaneVisibleIn(lane: WpLane, context: LaneContext): boolean {
  return CONTEXT_LANES[context].includes(lane);
}

/** 문맥에 맞는 번역 키. 문맥별 예외가 없으면 기본 키를 쓴다. */
export function laneLabelKey(lane: WpLane, context: LaneContext): string {
  return CONTEXT_LABEL_KEYS[context][lane] ?? LANE_DEFS[lane].labelKey;
}

/**
 * 레인별 테마 토큰과, 토큰을 읽지 못할 때 쓸 대체값.
 *
 * Chart.js 캔버스는 CSS 변수를 해석하지 못한다. 그렇다고 화면 코드에 hex 를 박으면 테마 전환에
 * 반응하지 않으므로(이벤트 상세가 그 상태였다), 그릴 때 토큰을 실제 값으로 읽어서 넘긴다.
 */
const LANE_CSS_VARS: Record<WpLane, { variable: string; fallback: string }> = {
  KOM: { variable: "--lime", fallback: "oklch(0.80 0.115 192)" },
  AID: { variable: "--aqua", fallback: "oklch(0.78 0.13 210)" },
  CUT: { variable: "--rose", fallback: "oklch(0.72 0.16 20)" },
  SEG: { variable: "--amber", fallback: "oklch(0.80 0.14 75)" },
};

/**
 * 레인 색을 캔버스에 넘길 수 있는 실제 값으로 읽는다.
 * 브라우저 밖(테스트·서버 렌더)에서는 대체값을 돌려준다.
 */
export function readLaneColor(lane: WpLane): string {
  const { variable, fallback } = LANE_CSS_VARS[lane];
  if (typeof window === "undefined" || typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(variable).trim() || fallback;
}

/**
 * GPX `<type>` 등에 들어오는 유형 코드 → 레인. 로케일과 무관하게 우선 적용한다.
 *
 * 보급(AID)은 대회의 공식 보급소만이 아니라 개인 코스의 편의점·카페·식당까지 포함한다.
 * 개인이 만든 코스에서 "어디서 먹고 쉬는가"는 대회의 보급소와 같은 역할을 한다.
 */
const TYPE_CODE_LANE: Record<string, WpLane> = {
  FOOD: "AID",
  AID: "AID",
  WATER: "AID",
  REST: "AID",
  CAFE: "AID",
  RESTAURANT: "AID",
  CONVENIENCE: "AID",
  STORE: "AID",
  SHOP: "AID",
  MART: "AID",
  TOILET: "AID",
  KOM: "KOM",
  SUMMIT: "KOM",
  CLIMB: "KOM",
  CUT: "CUT",
  CUTOFF: "CUT",
  TIMECUT: "CUT",
};

/**
 * 유형 코드가 없을 때만 쓰는 이름 키워드. 한국어·영어를 함께 둔다.
 * 새 표현을 추가할 때는 반드시 양쪽 로케일을 같이 채울 것 — 한쪽만 채우면 예전의 로케일 의존
 * 분류 문제가 그대로 재발한다.
 */
const NAME_KEYWORD_LANES: Array<{ lane: WpLane; keywords: string[] }> = [
  {
    lane: "AID",
    keywords: [
      "보급", "급수", "휴게", "편의점", "카페", "식당", "마트", "화장실", "쉼터",
      "aid", "water", "feed", "rest", "cafe", "coffee", "store", "mart", "food", "toilet",
      // 국내 코스에서 실제로 가장 많이 적히는 상호들
      "gs25", "cu ", "세븐일레븐", "이마트24", "스타벅스",
    ],
  },
  { lane: "KOM", keywords: ["정상", "고개", "업힐", "kom", "summit", "climb", "peak"] },
  { lane: "CUT", keywords: ["컷", "관문", "제한", "cut", "cutoff", "checkpoint"] },
];

export interface ClassifiableWaypoint {
  name: string;
  type: string;
}

/** 웨이포인트를 레인으로 분류한다. 판정하지 못하면 `SEG`. */
export function classifyLane(waypoint: ClassifiableWaypoint): WpLane {
  const typeCode = (waypoint.type || "").trim().toUpperCase();
  const byCode = TYPE_CODE_LANE[typeCode];
  if (byCode) return byCode;

  const name = (waypoint.name || "").toLowerCase();
  if (name) {
    for (const { lane, keywords } of NAME_KEYWORD_LANES) {
      if (keywords.some((keyword) => name.includes(keyword))) return lane;
    }
  }
  return "SEG";
}

/**
 * 고도 프로필 위에 마커로 찍을 만한 웨이포인트인지. 구간(`SEG`) 은 수가 많아 차트를 뒤덮으므로
 * 제외한다. 표에는 전부 나오고 차트에만 걸러진다는 점이 이전 구현과 동일하되, 이제 표와 차트가
 * **같은 분류기**를 쓰므로 둘의 답이 어긋나지 않는다.
 */
export function isProfileMarkerLane(lane: WpLane): boolean {
  return lane !== "SEG";
}
