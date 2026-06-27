/**
 * CohortRankingCard — 코호트(전체·성별·연령대) 대비 FTP·W/kg·VO2max 백분위/랭킹.
 *
 * G9 (2026-06-06) — Riduck "My Status 랭킹" 대응.
 *
 * 서버(cohort-percentiles.ts)가 주 1회 집계한 `stats/percentiles_bike` 단일 공개 doc 을
 *  읽어, 사용자 pdc_bike 의 ftpEst·20m W/kg·vo2maxEst 를 코호트 구간표(breakpoints)에
 *  매핑해 "상위 X%" 로 표시. 코호트 선택(전체/성별/연령대) 가능.
 *
 * stats doc 없거나 사용자 pdc 없으면 렌더 안 함. 디자인 프리미티브/토큰만, 한국어.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, Chip, Text } from "../theme/components";
import type { PdcDoc } from "@shared/types/pdc";
import type {
  CohortPercentiles,
  CohortBreakpoints,
  CohortKey,
} from "@shared/types/cohort-percentiles";
import { percentileOf } from "@shared/training/cohortPercentile";

interface UserDemographics {
  gender?: string | null;
  birthYear?: number | null;
}

/** percentile(하위 N%) → 색. RiderTypeCard.percentileColor 와 동일 톤. */
function percentileColor(p: number): string {
  if (p >= 75) return "var(--lime)";
  if (p >= 50) return "var(--aqua)";
  if (p >= 25) return "var(--amber)";
  return "var(--ink-3)";
}

/** 프로필에서 연령대 코호트 키 추정 (birthYear → 버킷). */
function ageBucketKey(birthYear: number | null | undefined): CohortKey | null {
  if (birthYear == null || !Number.isFinite(birthYear)) return null;
  const age = birthYear >= 1900 && birthYear <= 2100
    ? new Date().getFullYear() - birthYear
    : birthYear;
  if (!Number.isFinite(age) || age < 5 || age > 120) return null;
  if (age < 20) return "u20";
  if (age < 30) return "20s";
  if (age < 40) return "30s";
  if (age < 50) return "40s";
  if (age < 60) return "50s";
  return "60plus";
}

function genderKey(gender: string | null | undefined): CohortKey | null {
  if (typeof gender !== "string") return null;
  const s = gender.trim().toLowerCase();
  if (s === "male" || s === "m" || s === "남" || s === "남성") return "male";
  if (s === "female" || s === "f" || s === "여" || s === "여성") return "female";
  return null;
}

/** breakpoints 에서 percentile + "전체 폴백 여부". 선택 코호트 없으면 all 로 폴백. */
function resolveBreakpoints(
  cohorts: Record<string, CohortBreakpoints>,
  cohort: CohortKey,
): { bp: CohortBreakpoints | null; fellBack: boolean } {
  const sel = cohorts[cohort];
  if (sel && Object.keys(sel).length > 0) return { bp: sel, fellBack: false };
  const all = cohorts.all;
  if (cohort !== "all" && all && Object.keys(all).length > 0) {
    return { bp: all, fellBack: true };
  }
  return { bp: all ?? null, fellBack: cohort !== "all" };
}

interface MetricRow {
  key: "ftp" | "wkg20m" | "vo2max";
  labelKey: string;
  value: number | null;
  display: string;
  unit: string;
}

export default function CohortRankingCard({
  pdc,
  stats,
  demographics,
}: {
  pdc: PdcDoc;
  stats: CohortPercentiles;
  demographics: UserDemographics;
}) {
  const { t } = useTranslation("fitness");

  const myGender = genderKey(demographics.gender);
  const myAge = ageBucketKey(demographics.birthYear);

  // 코호트 선택 옵션 — 전체 + (프로필 있으면) 성별/연령대.
  const cohortOptions = useMemo(() => {
    const opts: Array<{ key: CohortKey; labelKey: string }> = [
      { key: "all", labelKey: "ranking.cohort.all" },
    ];
    if (myGender) opts.push({ key: myGender, labelKey: `ranking.cohort.${myGender}` });
    if (myAge) opts.push({ key: myAge, labelKey: `ranking.cohort.${myAge}` });
    return opts;
  }, [myGender, myAge]);

  const [cohort, setCohort] = useState<CohortKey>(myGender ?? "all");

  const ftpEst = pdc.pdcModel?.ftpEst ?? null;
  const wkg20m = pdc.wPerKgAtKey?.["20m"] ?? null;
  const vo2max = pdc.vo2maxEst ?? null;

  const rows: MetricRow[] = [
    { key: "ftp", labelKey: "ranking.metric.ftp", value: ftpEst, display: ftpEst != null ? String(Math.round(ftpEst)) : "—", unit: "W" },
    { key: "wkg20m", labelKey: "ranking.metric.wkg", value: wkg20m, display: wkg20m != null ? wkg20m.toFixed(1) : "—", unit: "W/kg" },
    { key: "vo2max", labelKey: "ranking.metric.vo2max", value: vo2max, display: vo2max != null ? String(vo2max) : "—", unit: "ml/kg/min" },
  ];

  // 매핑 가능한 row 가 하나도 없으면 카드 미표시.
  const mapped = rows.map((r) => {
    if (r.value == null) return { ...r, percentile: null as number | null, fellBack: false };
    const { bp, fellBack } = resolveBreakpoints(stats.metrics[r.key].cohorts, cohort);
    const percentile = bp ? percentileOf(r.value, bp) : null;
    return { ...r, percentile, fellBack };
  });
  const anyMapped = mapped.some((m) => m.percentile != null);
  if (!anyMapped) return null;

  const anyFellBack = mapped.some((m) => m.percentile != null && m.fellBack);

  return (
    <Card padding="none" style={{ marginTop: "var(--space-4)", padding: "16px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
        <Text as="div" variant="eyebrow">{t("ranking.title")}</Text>
        {/* 코호트 선택 */}
        <div style={{ display: "flex", gap: "var(--space-1)", flexWrap: "wrap" }}>
          {cohortOptions.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setCohort(opt.key)}
              style={{
                cursor: "pointer",
                background: "none",
                border: "none",
                padding: 0,
              }}
              aria-pressed={cohort === opt.key}
            >
              <Chip variant={cohort === opt.key ? "accent" : "default"}>
                {t(opt.labelKey)}
              </Chip>
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        {mapped.map((m) => (
          <div key={m.key} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <div style={{ width: 64, flexShrink: 0 }}>
              <Text as="div" variant="eyebrow" style={{ color: "var(--ink-3)" }}>{t(m.labelKey)}</Text>
            </div>
            <div style={{ width: 92, flexShrink: 0, display: "flex", alignItems: "baseline", gap: "var(--space-1)" }}>
              <Text variant="dataLarge">{m.display}</Text>
              <Text variant="unit">{m.unit}</Text>
            </div>
            <div style={{ flex: 1, height: 6, borderRadius: "var(--r-sm)", background: "var(--bg-2)", overflow: "hidden" }}>
              {m.percentile != null && (
                <div style={{ width: `${m.percentile}%`, height: "100%", background: percentileColor(m.percentile) }} />
              )}
            </div>
            <div style={{ width: 72, flexShrink: 0, textAlign: "right" }}>
              {m.percentile != null ? (
                <Text variant="dataLarge" style={{ color: percentileColor(m.percentile) }}>
                  {t("ranking.topPct", { pct: 100 - m.percentile })}
                </Text>
              ) : (
                <Text as="span" variant="mono" style={{ color: "var(--ink-4)" }}>—</Text>
              )}
            </div>
          </div>
        ))}
      </div>

      <Text as="div" variant="eyebrow" style={{ marginTop: "var(--space-3)", color: "var(--ink-4)" }}>
        {anyFellBack
          ? t("ranking.footerFallback", { n: stats.sampleSize })
          : t("ranking.footer", { n: stats.sampleSize })}
      </Text>
    </Card>
  );
}
