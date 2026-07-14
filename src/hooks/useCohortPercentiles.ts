/**
 * useCohortPercentiles — `stats/percentiles_bike` 단일 공개 doc 구독.
 *
 * G9 (2026-06-06)
 *
 * 서버(cohort-percentiles.ts)가 주 1회 cron 으로 집계한 코호트(전체·성별·연령대)별
 *  FTP·W/kg·VO2max 백분위 구간표. 로그인 사용자 누구나 read (firestore rules: stats 공개).
 *  doc 1회 read 후 클라가 percentileOf 로 자기 값의 백분위를 로컬 매핑.
 */

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { firestore } from "../services/firebase";
import { logClientError } from "../services/errorLogger";
import type { CohortPercentiles } from "@shared/types/cohort-percentiles";

export type CohortDistributionKey = "overallAbility" | "anaerobicAbility" | "aerobicAbility" | "enduranceAbility" | "vo2max";

interface CohortDensityDistributionBase {
  approximateSampleSize: number;
  bins: Array<{ from: number; to: number; densityLevel: 1 | 2 | 3 | 4 | 5 }>;
  privacy: { minimumCellSize: 5; exactCountsPublished: false; method: "adjacent_merge_relative_density_v1" };
  computedAt: number;
}

export type AbilityDensityDistribution = CohortDensityDistributionBase & {
  basis: "coggan_score_v1";
  domain: [0, 100];
};

export type Vo2maxDensityDistribution = CohortDensityDistributionBase & {
  basis: "vo2max_ml_kg_min";
  domain: [20, 95];
};

export type CohortDensityDistribution = AbilityDensityDistribution | Vo2maxDensityDistribution;
export type CohortDistributions = {
  overallAbility?: AbilityDensityDistribution;
  anaerobicAbility?: AbilityDensityDistribution;
  aerobicAbility?: AbilityDensityDistribution;
  enduranceAbility?: AbilityDensityDistribution;
  vo2max?: Vo2maxDensityDistribution;
};
export type CohortPercentilesWithDistributions = CohortPercentiles & { distributions?: CohortDistributions };

const DISTRIBUTION_KEYS: CohortDistributionKey[] = ["overallAbility", "anaerobicAbility", "aerobicAbility", "enduranceAbility", "vo2max"];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseDensityDistribution<K extends CohortDistributionKey>(key: K, value: unknown): CohortDistributions[K] | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.basis !== "string" || candidate.basis.trim().length === 0) return null;
  if (!Array.isArray(candidate.domain) || candidate.domain.length !== 2) return null;
  const [domainFrom, domainTo] = candidate.domain;
  if (!isFiniteNumber(domainFrom) || !isFiniteNumber(domainTo) || domainFrom >= domainTo) return null;
  const isAbility = key !== "vo2max";
  const expectedBasis = isAbility ? "coggan_score_v1" : "vo2max_ml_kg_min";
  const expectedDomain: [number, number] = isAbility ? [0, 100] : [20, 95];
  if (candidate.basis !== expectedBasis || domainFrom !== expectedDomain[0] || domainTo !== expectedDomain[1]) return null;
  if (!isFiniteNumber(candidate.approximateSampleSize)
    || !Number.isInteger(candidate.approximateSampleSize)
    || candidate.approximateSampleSize < 20
    || candidate.approximateSampleSize % 10 !== 0) return null;
  if (!Array.isArray(candidate.bins) || candidate.bins.length === 0) return null;
  const privacy = candidate.privacy;
  if (!privacy || typeof privacy !== "object") return null;
  const privacyRecord = privacy as Record<string, unknown>;
  if (privacyRecord.minimumCellSize !== 5
    || privacyRecord.exactCountsPublished !== false
    || privacyRecord.method !== "adjacent_merge_relative_density_v1") return null;
  if (!isFiniteNumber(candidate.computedAt) || candidate.computedAt <= 0) return null;

  let previousTo = domainFrom;
  const bins: CohortDensityDistribution["bins"] = [];
  for (const rawBin of candidate.bins) {
    if (!rawBin || typeof rawBin !== "object") return null;
    const bin = rawBin as Record<string, unknown>;
    if (!isFiniteNumber(bin.from) || !isFiniteNumber(bin.to) || bin.from >= bin.to) return null;
    if (!Number.isInteger(bin.densityLevel) || ![1, 2, 3, 4, 5].includes(bin.densityLevel as number)) return null;
    if (bin.from < domainFrom || bin.to > domainTo || bin.from !== previousTo) return null;
    bins.push({ from: bin.from, to: bin.to, densityLevel: bin.densityLevel as 1 | 2 | 3 | 4 | 5 });
    previousTo = bin.to;
  }
  if (previousTo !== domainTo) return null;

  return {
    basis: candidate.basis,
    domain: [domainFrom, domainTo],
    approximateSampleSize: candidate.approximateSampleSize,
    bins,
    privacy: { minimumCellSize: 5, exactCountsPublished: false, method: "adjacent_merge_relative_density_v1" },
    computedAt: candidate.computedAt,
  } as CohortDistributions[K];
}

export function parseCohortDistributions(value: unknown): CohortDistributions | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const parsed: CohortDistributions = {};
  for (const key of DISTRIBUTION_KEYS) {
    const distribution = parseDensityDistribution(key, source[key]);
    if (distribution) Object.assign(parsed, { [key]: distribution });
  }
  return Object.keys(parsed).length > 0 ? parsed : undefined;
}

export type UseCohortPercentilesState =
  | { status: "loading"; stats: null }
  | { status: "missing"; stats: null }
  | { status: "ready"; stats: CohortPercentilesWithDistributions };

export function useCohortPercentiles(enabled: boolean): UseCohortPercentilesState {
  const [state, setState] = useState<UseCohortPercentilesState>({ status: "loading", stats: null });

  useEffect(() => {
    if (!enabled) {
      setState({ status: "loading", stats: null });
      return undefined;
    }
    setState({ status: "loading", stats: null });
    const unsub = onSnapshot(
      doc(firestore, "stats", "percentiles_bike"),
      (snap) => {
        if (!snap.exists()) {
          setState({ status: "missing", stats: null });
          return;
        }
        const data = snap.data() as CohortPercentiles;
        const distributions = parseCohortDistributions((snap.data() as Record<string, unknown>).distributions);
        setState({ status: "ready", stats: { ...data, ...(distributions ? { distributions } : {}) } });
      },
      (err) => {
        logClientError("useCohortPercentiles", err, {});
        setState({ status: "missing", stats: null });
      },
    );
    return () => unsub();
  }, [enabled]);

  return state;
}
