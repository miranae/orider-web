/**
 * 크로스 종목 통합 부하 기여도 (설계 문서 §3.7) — orider 고유 차별점.
 *
 * 가민 커넥트는 기기 종속 단일 뷰, 런나는 러닝 전용, 스트라바는 부하 해석이 없다.
 * "이 러닝이 내 통합 체력의 몇 %를 만들고 있는가"를 말해주는 서비스는 없다.
 *
 * 데이터 원천은 **서버가 산출한 `users/{uid}/fitness/current`** (UserFitness) 다.
 * `TriFitnessView` 처럼 활동+스트림에서 클라이언트가 재계산하면 대시보드에서 너무 비싸다.
 *
 * 반올림 주의: 세 종목 pct 를 독립 반올림하면 합이 101 이 될 수 있다. 가장 큰 조각에서
 * 오차를 흡수해 항상 합 100 을 보장한다 (도넛 호가 겹치거나 벌어지지 않도록).
 */
import type { UserFitness } from "@shared/types";

export type ContribDiscipline = "bike" | "run" | "swim";

export interface ContributionSlice {
  discipline: ContribDiscipline;
  ctl: number;
  /** 정수 퍼센트. 세 조각의 합은 항상 100 (총 CTL 이 0 이면 전부 0). */
  pct: number;
}

export interface CrossDisciplineContribution {
  totalCtl: number;
  slices: ContributionSlice[];
  /** 기여도 내림차순 1위 종목. 총 CTL 이 0 이면 null. */
  dominant: ContribDiscipline | null;
  /** 둘 이상의 종목에 부하가 있는가 — 아니면 카드를 띄울 이유가 없다. */
  isMultiDiscipline: boolean;
}

const ORDER: ContribDiscipline[] = ["bike", "run", "swim"];

export function computeContribution(fitness: UserFitness | null | undefined): CrossDisciplineContribution | null {
  if (!fitness?.breakdown) return null;

  const ctls = ORDER.map((d) => ({
    discipline: d,
    ctl: Math.max(0, fitness.breakdown[d]?.ctl ?? 0),
  }));
  const totalCtl = ctls.reduce((s, c) => s + c.ctl, 0);

  if (totalCtl <= 0) {
    return {
      totalCtl: 0,
      slices: ctls.map((c) => ({ ...c, pct: 0 })),
      dominant: null,
      isMultiDiscipline: false,
    };
  }

  const raw = ctls.map((c) => ({ ...c, exact: (c.ctl / totalCtl) * 100 }));
  const slices: ContributionSlice[] = raw.map((c) => ({
    discipline: c.discipline,
    ctl: c.ctl,
    pct: Math.round(c.exact),
  }));

  // 반올림 오차를 가장 큰 조각이 흡수 — 합을 정확히 100 으로 맞춘다.
  const drift = 100 - slices.reduce((s, c) => s + c.pct, 0);
  if (drift !== 0) {
    const biggest = slices.reduce((a, b) => (b.pct > a.pct ? b : a));
    biggest.pct = Math.max(0, biggest.pct + drift);
  }

  const withLoad = slices.filter((s) => s.ctl > 0);
  const dominant = slices.reduce((a, b) => (b.ctl > a.ctl ? b : a)).discipline;

  return {
    totalCtl: Math.round(totalCtl * 10) / 10,
    slices,
    dominant,
    isMultiDiscipline: withLoad.length >= 2,
  };
}

/** 특정 종목의 기여 조각 조회. */
export function sliceFor(
  contribution: CrossDisciplineContribution,
  discipline: ContribDiscipline,
): ContributionSlice {
  return contribution.slices.find((s) => s.discipline === discipline)!;
}
