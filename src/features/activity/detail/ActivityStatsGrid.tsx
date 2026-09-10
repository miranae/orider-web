import type { TFunction } from "i18next";
import type React from "react";
import type { ActivitySummary } from "@shared/types";
import { Text } from "../../../theme/components";
import { resolveDuration } from "../../../utils/activityTime";
import { MetricExplainerTrigger } from "../../../components/common/MetricExplainer";
import type { InterpretationContext, MetricKey } from "../../../utils/metricInterpretation";
import { formatDuration, formatPace, formatSwimPace, type SportCategory } from "./activityDetailUtils";
import type { StripStat, SummaryStripStats } from "./summaryStripStats";

type ActivityStatsGridProps = {
  summary: ActivitySummary;
  /**
   * 서버 `activity_metrics` 우선으로 결정된 표시값 (#885 §2). 서버가 null 이면 대시로 비우고,
   * 서버 문서를 아직 못 읽었으면 기기 요약값 + "기기 요약" 잠정 표식.
   */
  stats: SummaryStripStats;
  sport: SportCategory;
  /**
   * 지표 해설(ⓘ)에 쓸 개인화 컨텍스트. 없으면 해설 트리거를 붙이지 않는다 —
   * 근거 없는 개인화 문장을 지어내지 않기 위해(설계 문서 §3.2).
   */
  interpretationContext?: InterpretationContext;
  movingTimeSec?: number | null;
  pauseTimeSec?: number | null;
  elapsedTimeMillis?: number | null;
  displayAvgKph: number;
  displayAvgImplausible: boolean;
  avgSpeedImplausible: boolean;
  maxSpeedImplausible: boolean;
  showElevation: boolean;
  distVal: (meters: number) => React.ReactNode;
  distUnit: string;
  speedVal: (kph: number) => React.ReactNode;
  speedUnit: string;
  elevVal: (meters: number) => React.ReactNode;
  elevUnit: string;
  t: TFunction<"activity">;
};

const gridCellStyle = {
  borderRight: "1px solid var(--line-soft)",
  borderBottom: "1px solid var(--line-soft)",
} as const;

const baselineStyle = {
  display: "flex",
  alignItems: "baseline",
  gap: "var(--space-1)",
  minWidth: 0,
  whiteSpace: "nowrap",
} as const;

function MetricCell({
  label,
  children,
  sub,
  title,
  provisionalLabel,
  explain,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  sub?: React.ReactNode;
  title?: string;
  /** 서버 정본이 아직 없어 기기 요약을 보여주는 중임을 밝히는 문구. */
  provisionalLabel?: string;
  /** 지정되면 셀 전체가 지표 해설 시트를 여는 탭 타깃이 된다. */
  explain?: { metric: MetricKey; context: InterpretationContext; sport: SportCategory };
}) {
  const body = (
    <>
      <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-2)" }}>
        {label}
      </Text>
      <div style={baselineStyle} title={title}>
        {children}
      </div>
      {sub && (
        <div className="text-[length:var(--fs-xs)] mt-1" style={{ color: "var(--ink-3)" }}>
          {sub}
        </div>
      )}
      {provisionalLabel && (
        <div className="text-[length:var(--fs-xs)] mt-1" style={{ color: "var(--ink-3)" }} data-testid="stat-provisional">
          {provisionalLabel}
        </div>
      )}
    </>
  );

  return (
    <div className="min-w-0 p-4 sm:p-5" style={gridCellStyle}>
      {explain ? (
        <MetricExplainerTrigger
          metric={explain.metric}
          context={explain.context}
          sport={explain.sport}
          scope="activity"
        >
          {body}
        </MetricExplainerTrigger>
      ) : (
        body
      )}
    </div>
  );
}

function Value({ children }: { children: React.ReactNode }) {
  return <Text variant="dataLarge">{children}</Text>;
}

function Unit({ children }: { children: React.ReactNode }) {
  return <Text variant="unit">{children}</Text>;
}

export function ActivityStatsGrid({
  summary: s,
  stats,
  sport,
  interpretationContext,
  movingTimeSec,
  pauseTimeSec,
  elapsedTimeMillis,
  displayAvgKph,
  displayAvgImplausible,
  avgSpeedImplausible,
  maxSpeedImplausible,
  showElevation,
  distVal,
  distUnit,
  speedVal,
  speedUnit,
  elevVal,
  elevUnit,
  t,
}: ActivityStatsGridProps) {
  const duration = resolveDuration({
    ridingTimeMillis: s.ridingTimeMillis,
    elapsedTimeMillis,
    movingTimeSec,
    pauseTimeSec,
  });

  /** 서버 정본이 아직 없어 기기 요약을 쓰는 셀에만 붙는 문구. */
  const provisional = (stat: StripStat) => (stat.provisional ? t("stat.deviceSummary") : undefined);
  const round = (v: number | null) => (v != null ? Math.round(v) : null);

  /** 러닝에서만 해설을 붙인다 — 사이클·수영 해설 콘텐츠는 아직 집필되지 않았다. */
  const explainFor = (metric: MetricKey) =>
    sport === "run" && interpretationContext
      ? { metric, context: interpretationContext, sport }
      : undefined;

  /** 평균 파워 셀 — NP 보조줄은 서버 metrics.np 단일 출처 (#885 §3). */
  const avgPowerCell = stats.avgPower.value != null && (sport === "ride" || sport === "run")
    ? (
      <MetricCell
        label={t("stat.avgPower")}
        sub={stats.np.value != null ? `NP ${round(stats.np.value)}` : undefined}
        provisionalLabel={provisional(stats.avgPower)}
      >
        <Value>{round(stats.avgPower.value)}</Value>
        <Unit>W</Unit>
      </MetricCell>
    )
    : null;

  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6"
      data-testid="activity-stats-grid"
    >
        {sport !== "other" && (
          <MetricCell label={t("stat.distance")} provisionalLabel={provisional(stats.distanceM)}>
            {stats.distanceM.value == null ? (
              <Value>--</Value>
            ) : sport === "swim" ? (
              <>
                <Value>{Math.round(stats.distanceM.value)}</Value>
                <Unit>m</Unit>
              </>
            ) : (
              <>
                <Value>{distVal(stats.distanceM.value)}</Value>
                <Unit>{distUnit}</Unit>
              </>
            )}
          </MetricCell>
        )}

        <MetricCell
          label={duration.usingMoving ? t("stat.movingTime") : t("stat.elapsedTime")}
        >
          <Value>{formatDuration(duration.displayMs)}</Value>
        </MetricCell>

        {sport === "ride" && (
          <MetricCell
            label={t("stat.avgSpeed")}
            title={displayAvgImplausible
              ? t("stat.dataWarningRaw", { value: displayAvgKph.toFixed(1) })
              : (duration.usingMoving ? t("stat.movingAvgTotal", { total: s.averageSpeed.toFixed(1) }) : undefined)}
            provisionalLabel={provisional(stats.avgSpeedKph)}
          >
            {displayAvgImplausible || stats.avgSpeedKph.value == null ? (
              <Value>--</Value>
            ) : (
              <>
                <Value>{speedVal(stats.avgSpeedKph.value)}</Value>
                <Unit>{speedUnit}</Unit>
              </>
            )}
          </MetricCell>
        )}

        {sport === "run" && s.averageSpeed > 0 && (
          <MetricCell
            label={t("stat.avgPace")}
            title={avgSpeedImplausible ? t("stat.dataWarningRaw", { value: s.averageSpeed.toFixed(1) }) : undefined}
            provisionalLabel={provisional(stats.avgSpeedKph)}
            explain={explainFor("pace")}
          >
            {avgSpeedImplausible || !stats.avgSpeedKph.value ? (
              <Value>--</Value>
            ) : (
              <>
                <Value>{formatPace(stats.avgSpeedKph.value)}</Value>
                <Unit>/km</Unit>
              </>
            )}
          </MetricCell>
        )}

        {sport === "swim" && s.averageSpeed > 0 && (
          <MetricCell
            label={t("stat.avgPace")}
            title={avgSpeedImplausible ? t("stat.dataWarningRaw", { value: s.averageSpeed.toFixed(1) }) : undefined}
            provisionalLabel={provisional(stats.avgSpeedKph)}
          >
            {avgSpeedImplausible || !stats.avgSpeedKph.value ? (
              <Value>--</Value>
            ) : (
              <>
                <Value>{formatSwimPace(stats.avgSpeedKph.value)}</Value>
                <Unit>/100m</Unit>
              </>
            )}
          </MetricCell>
        )}

        {sport === "ride" && s.maxSpeed > 0 && (
          <MetricCell
            label={t("stat.maxSpeed")}
            title={maxSpeedImplausible ? t("stat.dataWarningRaw", { value: s.maxSpeed.toFixed(1) }) : undefined}
            provisionalLabel={provisional(stats.maxSpeedKph)}
          >
            {maxSpeedImplausible || stats.maxSpeedKph.value == null ? (
              <Value>--</Value>
            ) : (
              <>
                <Value>{speedVal(stats.maxSpeedKph.value)}</Value>
                <Unit>{speedUnit}</Unit>
              </>
            )}
          </MetricCell>
        )}

        {sport === "run" && s.maxSpeed > 0 && (
          <MetricCell
            label={t("stat.maxPace")}
            title={maxSpeedImplausible ? t("stat.dataWarningRaw", { value: s.maxSpeed.toFixed(1) }) : undefined}
            provisionalLabel={provisional(stats.maxSpeedKph)}
          >
            {maxSpeedImplausible || !stats.maxSpeedKph.value ? (
              <Value>--</Value>
            ) : (
              <>
                <Value>{formatPace(stats.maxSpeedKph.value)}</Value>
                <Unit>/km</Unit>
              </>
            )}
          </MetricCell>
        )}

        {sport === "swim" && s.maxSpeed > 0 && (
          <MetricCell
            label={t("stat.maxPace")}
            title={maxSpeedImplausible ? t("stat.dataWarningRaw", { value: s.maxSpeed.toFixed(1) }) : undefined}
            provisionalLabel={provisional(stats.maxSpeedKph)}
          >
            {maxSpeedImplausible || !stats.maxSpeedKph.value ? (
              <Value>--</Value>
            ) : (
              <>
                <Value>{formatSwimPace(stats.maxSpeedKph.value)}</Value>
                <Unit>/100m</Unit>
              </>
            )}
          </MetricCell>
        )}

        {/* 상승·하강 중 하나라도 값이 있으면 칸을 낸다. 상승이 null 이라고 칸을 숨기면
            서버가 준 하강까지 함께 묻히고, 모름이 "없음"으로 보인다 (#2237). */}
        {showElevation && (stats.elevationGainM.value != null || stats.elevationLossM.value != null) && (
          <MetricCell
            label={t("stat.elev")}
            /* 누적 하강은 기기 요약에 없는 서버 전용 값 — 있을 때만 보조줄로. */
            sub={stats.elevationLossM.value != null
              ? `${t("stat.elevLoss")} ${elevVal(stats.elevationLossM.value)}${elevUnit}`
              : undefined}
            provisionalLabel={provisional(stats.elevationGainM)}
          >
            {stats.elevationGainM.value != null ? (
              <>
                <Value>{elevVal(stats.elevationGainM.value)}</Value>
                <Unit>{elevUnit}</Unit>
              </>
            ) : (
              <Value>--</Value>
            )}
          </MetricCell>
        )}

        {stats.avgHr.value != null ? (
          <MetricCell
            label={t("stat.avgHr")}
            sub={stats.maxHr.value != null ? `${t("page.max")} ${round(stats.maxHr.value)}` : undefined}
            provisionalLabel={provisional(stats.avgHr)}
          >
            <Value>{round(stats.avgHr.value)}</Value>
            <Unit>bpm</Unit>
          </MetricCell>
        ) : avgPowerCell}

        {stats.avgHr.value != null && avgPowerCell}

        {stats.avgCadence.value != null && sport === "ride" && (
          <MetricCell label={t("stat.avgCadence")} provisionalLabel={provisional(stats.avgCadence)}>
            <Value>{round(stats.avgCadence.value)}</Value>
            <Unit>rpm</Unit>
          </MetricCell>
        )}

        {stats.avgCadence.value != null && sport === "run" && (
          <MetricCell label={t("stat.cadence")} provisionalLabel={provisional(stats.avgCadence)} explain={explainFor("cadence")}>
            <Value>{round(stats.avgCadence.value)}</Value>
            <Unit>spm</Unit>
          </MetricCell>
        )}

        {stats.avgCadence.value != null && sport === "swim" && (
          <MetricCell label={t("stat.avgStroke")} provisionalLabel={provisional(stats.avgCadence)}>
            <Value>{round(stats.avgCadence.value)}</Value>
            <Unit>spm</Unit>
          </MetricCell>
        )}

        {s.tss != null && (
          <MetricCell
            label={sport === "run" ? t("stat.runLoad") : sport === "swim" ? "sTSS" : "TSS"}
            explain={explainFor("rtss")}
          >
            <Value>{Math.round(s.tss)}</Value>
          </MetricCell>
        )}

        {s.swolf != null && sport === "swim" && (
          <MetricCell label="SWOLF">
            <Value>{Math.round(s.swolf)}</Value>
          </MetricCell>
        )}

        {stats.caloriesKcal.value != null && (
          <MetricCell label={t("stat.calories")} provisionalLabel={provisional(stats.caloriesKcal)}>
            <Value>{Math.round(stats.caloriesKcal.value).toLocaleString()}</Value>
            <Unit>kcal</Unit>
          </MetricCell>
        )}
    </div>
  );
}
