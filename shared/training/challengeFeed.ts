/**
 * 챌린지 피드 — /discover 의 '도전 가능한 다음 기록' 결정적 생성기 (이슈 #491, 설계서 §5/§6 P1).
 *
 * 공개 프론트엔드에 남기는 클라이언트 추정 로직이다. 입력은 화면에 필요한 세그먼트/PDC 요약이며,
 * 권위 있는 서버 분석·랭킹 판정·개인정보 접근 제어는 백엔드 책임이다.
 *
 * 학습 불필요. 보유 데이터(세그먼트 overview + 내 베스트 effort + PDC + riderType)만으로
 * 결정적으로 카드를 만든다. 각 카드는 #487 predictSegmentTimeSec 로 '예상 완주시간'을 붙인다.
 *
 * 이 순수 모듈은 PDC 구동 세그먼트 3카테고리를 담당:
 *   - beatPr   : 이미 탄 세그먼트 중 PDC 예상이 내 베스트보다 빠른(=개선 여지) 것
 *   - strength : riderType 강점에 맞는 세그먼트(클라이머→경사, 스프린터→짧고 평지 등)
 *   - newPlace : 아직 안 탄 주목 세그먼트(등급/거리)
 * 동네 레전드(legend)·인기 코스는 데이터 형태가 달라 UI 레이어에서 결합한다.
 *
 * 결정성: 모든 정렬이 tie-break(점수→거리→id)까지 완전 결정적이라 같은 입력 → 같은 피드.
 */
import { predictSegmentTimeSec } from "./segmentPrediction";

export interface FeedSegment {
  id: string;
  name: string;
  distanceM: number;
  avgGradePct: number;
  climbCategory: number;
  city?: string;
}

export interface ChallengeFeedInput {
  segments: readonly FeedSegment[];
  /** 세그먼트 id → 내 베스트 elapsed(초). 안 탄 세그먼트는 없음. */
  myBestSecBySegment: Readonly<Record<string, number>>;
  cp: number | null;
  wPrime: number | null;
  riderWeightKg: number | null;
  /** riderType.type 문자열(예: "Climber"). 없으면 null. */
  riderType: string | null;
  /** 카테고리별 카드 수 상한(기본 6). */
  limitPerCategory?: number;
}

export interface ChallengeCard {
  segmentId: string;
  name: string;
  distanceM: number;
  avgGradePct: number;
  climbCategory: number;
  city?: string;
  /** PDC 예상 완주시간(초). */
  predictedSec: number;
  /** 내 현재 베스트(초). 안 탄 세그먼트면 null. */
  currentBestSec: number | null;
  /** 예상 대비 단축 가능 초(베스트−예상). 양수면 개선 여지. 베스트 없으면 null. */
  improvementSec: number | null;
}

export interface ChallengeFeed {
  beatPr: ChallengeCard[];
  strength: ChallengeCard[];
  newPlace: ChallengeCard[];
}

const DEFAULT_LIMIT = 6;
/** strength/newPlace 후보의 최소 거리(m) — 너무 짧은 잡음 세그먼트 제외. */
const MIN_DISTANCE_M = 200;

/** id 사전순 결정적 비교. */
function byId(a: { segmentId: string }, b: { segmentId: string }): number {
  return a.segmentId < b.segmentId ? -1 : a.segmentId > b.segmentId ? 1 : 0;
}

/** riderType 강점에 맞는 세그먼트인지 판정(결정적 규칙). */
export function matchesStrength(seg: FeedSegment, riderType: string | null): boolean {
  const g = seg.avgGradePct;
  const d = seg.distanceM;
  switch (riderType) {
    case "Climber":
      return g >= 5 || seg.climbCategory >= 1;
    case "Puncher":
      return d <= 3000 && g >= 4;
    case "RoadSprinter":
    case "TrackSprinter":
      return d <= 2000 && g < 3;
    case "TimeTrialist":
      return d >= 5000 && Math.abs(g) < 3;
    case "AllRounder":
      return seg.climbCategory >= 1 || (d >= 3000 && g >= 2);
    default:
      // 미분류/null — 주목할 클라임 위주.
      return seg.climbCategory >= 1;
  }
}

function predictFor(seg: FeedSegment, input: ChallengeFeedInput): number | null {
  return predictSegmentTimeSec({
    distanceM: seg.distanceM,
    avgGradePct: seg.avgGradePct,
    cp: input.cp ?? 0,
    wPrime: input.wPrime ?? 0,
    riderWeightKg: input.riderWeightKg ?? 0,
  });
}

function toCard(seg: FeedSegment, predictedSec: number, currentBestSec: number | null): ChallengeCard {
  return {
    segmentId: seg.id,
    name: seg.name,
    distanceM: seg.distanceM,
    avgGradePct: seg.avgGradePct,
    climbCategory: seg.climbCategory,
    ...(seg.city != null ? { city: seg.city } : {}),
    predictedSec,
    currentBestSec,
    improvementSec: currentBestSec != null ? currentBestSec - predictedSec : null,
  };
}

/**
 * 챌린지 피드를 생성한다. PDC(cp/weight) 가 유효하지 않으면 예상시간을 못 내므로 빈 피드.
 */
export function buildChallengeFeed(input: ChallengeFeedInput): ChallengeFeed {
  const limit = input.limitPerCategory ?? DEFAULT_LIMIT;
  const empty: ChallengeFeed = { beatPr: [], strength: [], newPlace: [] };
  // PDC 미비면 예상 불가 → 빈 피드(호출부에서 비PDC 폴백 처리).
  if (!(input.cp && input.cp > 0) || !(input.riderWeightKg && input.riderWeightKg > 0)) return empty;

  const beatPr: ChallengeCard[] = [];
  const strength: ChallengeCard[] = [];
  const newPlace: ChallengeCard[] = [];

  for (const seg of input.segments) {
    if (!(seg.distanceM >= MIN_DISTANCE_M)) continue;
    const predicted = predictFor(seg, input);
    if (predicted == null) continue;
    const best = input.myBestSecBySegment[seg.id];
    const ridden = typeof best === "number" && Number.isFinite(best) && best > 0;

    if (ridden) {
      // 개선 여지: 예상이 베스트보다 빠르면(여유 1초 이상) 깰 수 있다.
      if (predicted < best - 1) beatPr.push(toCard(seg, predicted, best));
    } else {
      // 안 탄 세그먼트: 주목할 곳(등급/거리) 신규.
      if (seg.climbCategory >= 1 || seg.distanceM >= 1000) newPlace.push(toCard(seg, predicted, null));
    }
    // 강점: 타든 안 타든 riderType 매칭.
    if (matchesStrength(seg, input.riderType)) strength.push(toCard(seg, predicted, ridden ? best : null));
  }

  // 정렬(결정적):
  // beatPr — 단축 가능 초 desc → id
  beatPr.sort((a, b) => (b.improvementSec! - a.improvementSec!) || byId(a, b));
  // strength — 등급 desc → 거리 desc → id (강점 도전감)
  strength.sort((a, b) => (b.climbCategory - a.climbCategory) || (b.distanceM - a.distanceM) || byId(a, b));
  // newPlace — 등급 desc → 거리 desc → id
  newPlace.sort((a, b) => (b.climbCategory - a.climbCategory) || (b.distanceM - a.distanceM) || byId(a, b));

  return {
    beatPr: beatPr.slice(0, limit),
    strength: strength.slice(0, limit),
    newPlace: newPlace.slice(0, limit),
  };
}
