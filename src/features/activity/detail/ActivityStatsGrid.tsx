import type { TFunction } from "i18next";
import type React from "react";
import type { ActivitySummary } from "@shared/types";
import { Text } from "../../../theme/components";
import { resolveDuration } from "../../../utils/activityTime";
import { MetricExplainerTrigger } from "../../../components/common/MetricExplainer";
import type { InterpretationContext, MetricKey } from "../../../utils/metricInterpretation";
import { formatDuration, formatPace, formatSwimPace, type SportCategory } from "./activityDetailUtils";

type ActivityStatsGridProps = {
  summary: ActivitySummary;
  sport: SportCategory;
  /**
   * 지표 해설(ⓘ)에 쓸 개인화 컨텍스트. 없으면 해설 트리거를 붙이지 않는다 —
   * 근거 없는 개인화 문장을 지어내지 않기 위해(설계 문서 §3.2).
   */
  interpretationContext?: InterpretationContext;
  avgPowerValue: number | null;
  normalizedPowerValue: number | null;
  movingTimeSec?: number | null;
  pauseTimeSec?: number | null;
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

const lastCellStyle = {
  borderBottom: "1px solid var(--line-soft)",
} as const;

const baselineStyle = {
  display: "flex",
  alignItems: "baseline",
  gap: "var(--space-1)",
} as const;

function MetricCell({
  label,
  children,
  sub,
  title,
  last = false,
  explain,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  sub?: React.ReactNode;
  title?: string;
  last?: boolean;
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
    </>
  );

  return (
    <div className="p-4 sm:p-5" style={last ? lastCellStyle : gridCellStyle}>
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

function Value({ children, compact = false }: { children: React.ReactNode; compact?: boolean }) {
  return <Text variant={compact ? "dataMedium" : "dataLarge"}>{children}</Text>;
}

function Unit({ children }: { children: React.ReactNode }) {
  return <Text variant="unit">{children}</Text>;
}

export function ActivityStatsGrid({
  summary: s,
  sport,
  interpretationContext,
  avgPowerValue,
  normalizedPowerValue,
  movingTimeSec,
  pauseTimeSec,
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
    movingTimeSec,
    pauseTimeSec,
  });

  const showAdditionalRow =
    (s.averageHeartRate != null && avgPowerValue != null && (sport === "ride" || sport === "run")) ||
    s.maxSpeed > 0 ||
    s.averageCadence != null;

  /** 러닝에서만 해설을 붙인다 — 사이클·수영 해설 콘텐츠는 아직 집필되지 않았다. */
  const explainFor = (metric: MetricKey) =>
    sport === "run" && interpretationContext
      ? { metric, context: interpretationContext, sport }
      : undefined;

  return (
    <div>
      <div className="grid grid-cols-3 sm:grid-cols-6" style={{ borderBottom: "none" }}>
        {sport !== "other" && (
          <MetricCell label={t("stat.distance")}>
            {sport === "swim" ? (
              <>
                <Value>{Math.round(s.distance)}</Value>
                <Unit>m</Unit>
              </>
            ) : (
              <>
                <Value>{distVal(s.distance)}</Value>
                <Unit>{distUnit}</Unit>
              </>
            )}
          </MetricCell>
        )}

        <MetricCell
          label={t("stat.movingTime")}
          sub={duration.usingMoving ? t("stat.movingTimeTotal", { elapsed: formatDuration(duration.elapsedMs), pause: formatDuration(duration.pauseMs!) }) : undefined}
        >
          <Value>{formatDuration(duration.displayMs)}</Value>
        </MetricCell>

        {sport === "ride" && (
          <MetricCell
            label={t("stat.avgSpeed")}
            title={displayAvgImplausible
              ? t("stat.dataWarningRaw", { value: displayAvgKph.toFixed(1) })
              : (duration.usingMoving ? t("stat.movingAvgTotal", { total: s.averageSpeed.toFixed(1) }) : undefined)}
          >
            {displayAvgImplausible ? (
              <Value>--</Value>
            ) : (
              <>
                <Value>{speedVal(displayAvgKph)}</Value>
                <Unit>{speedUnit}</Unit>
              </>
            )}
          </MetricCell>
        )}

        {sport === "run" && s.averageSpeed > 0 && (
          <MetricCell
            label={t("stat.avgPace")}
            title={avgSpeedImplausible ? t("stat.dataWarningRaw", { value: s.averageSpeed.toFixed(1) }) : undefined}
            explain={explainFor("pace")}
          >
            {avgSpeedImplausible ? (
              <Value>--</Value>
            ) : (
              <>
                <Value>{formatPace(s.averageSpeed)}</Value>
                <Unit>/km</Unit>
              </>
            )}
          </MetricCell>
        )}

        {sport === "swim" && s.averageSpeed > 0 && (
          <MetricCell
            label={t("stat.avgPace")}
            title={avgSpeedImplausible ? t("stat.dataWarningRaw", { value: s.averageSpeed.toFixed(1) }) : undefined}
          >
            {avgSpeedImplausible ? (
              <Value>--</Value>
            ) : (
              <>
                <Value>{formatSwimPace(s.averageSpeed)}</Value>
                <Unit>/100m</Unit>
              </>
            )}
          </MetricCell>
        )}

        {showElevation && s.elevationGain > 0 && (
          <MetricCell label={t("stat.elev")}>
            <Value>{elevVal(s.elevationGain)}</Value>
            <Unit>{elevUnit}</Unit>
          </MetricCell>
        )}

        {s.averageHeartRate != null ? (
          <MetricCell
            label={t("stat.avgHr")}
            sub={s.maxHeartRate != null ? `${t("page.max")} ${Math.round(s.maxHeartRate)}` : undefined}
          >
            <Value>{Math.round(s.averageHeartRate)}</Value>
            <Unit>bpm</Unit>
          </MetricCell>
        ) : avgPowerValue != null && (sport === "ride" || sport === "run") ? (
          <MetricCell
            label={t("stat.avgPower")}
            sub={normalizedPowerValue != null ? `NP ${Math.round(normalizedPowerValue)}` : undefined}
          >
            <Value>{Math.round(avgPowerValue)}</Value>
            <Unit>W</Unit>
          </MetricCell>
        ) : null}

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

        {s.calories != null && (
          <MetricCell label={t("stat.calories")} last>
            <Value>{Math.round(s.calories).toLocaleString()}</Value>
            <Unit>kcal</Unit>
          </MetricCell>
        )}
      </div>

      {showAdditionalRow && (
        <div className="grid grid-cols-3 sm:grid-cols-6" style={{ borderTop: "1px solid var(--line-soft)" }}>
          {s.averageHeartRate != null && avgPowerValue != null && (sport === "ride" || sport === "run") && (
            <MetricCell
              label={t("stat.avgPower")}
              sub={normalizedPowerValue != null ? `NP ${Math.round(normalizedPowerValue)}` : undefined}
            >
              <Value compact>{Math.round(avgPowerValue)}</Value>
              <Unit>W</Unit>
            </MetricCell>
          )}

          {sport === "ride" && s.maxSpeed > 0 && (
            <MetricCell
              label={t("stat.maxSpeed")}
              title={maxSpeedImplausible ? t("stat.dataWarningRaw", { value: s.maxSpeed.toFixed(1) }) : undefined}
            >
              {maxSpeedImplausible ? (
                <Value compact>--</Value>
              ) : (
                <>
                  <Value compact>{speedVal(s.maxSpeed)}</Value>
                  <Unit>{speedUnit}</Unit>
                </>
              )}
            </MetricCell>
          )}

          {sport === "run" && s.maxSpeed > 0 && (
            <MetricCell
              label={t("stat.maxPace")}
              title={maxSpeedImplausible ? t("stat.dataWarningRaw", { value: s.maxSpeed.toFixed(1) }) : undefined}
            >
              {maxSpeedImplausible ? (
                <Value compact>--</Value>
              ) : (
                <>
                  <Value compact>{formatPace(s.maxSpeed)}</Value>
                  <Unit>/km</Unit>
                </>
              )}
            </MetricCell>
          )}

          {sport === "swim" && s.maxSpeed > 0 && (
            <MetricCell
              label={t("stat.maxPace")}
              title={maxSpeedImplausible ? t("stat.dataWarningRaw", { value: s.maxSpeed.toFixed(1) }) : undefined}
            >
              {maxSpeedImplausible ? (
                <Value compact>--</Value>
              ) : (
                <>
                  <Value compact>{formatSwimPace(s.maxSpeed)}</Value>
                  <Unit>/100m</Unit>
                </>
              )}
            </MetricCell>
          )}

          {s.averageCadence != null && sport === "ride" && (
            <MetricCell label={t("stat.avgCadence")}>
              <Value compact>{Math.round(s.averageCadence)}</Value>
              <Unit>rpm</Unit>
            </MetricCell>
          )}

          {s.averageCadence != null && sport === "run" && (
            <MetricCell label={t("stat.cadence")} explain={explainFor("cadence")}>
              <Value compact>{Math.round(s.averageCadence)}</Value>
              <Unit>spm</Unit>
            </MetricCell>
          )}

          {s.averageCadence != null && sport === "swim" && (
            <MetricCell label={t("stat.avgStroke")}>
              <Value compact>{Math.round(s.averageCadence)}</Value>
              <Unit>spm</Unit>
            </MetricCell>
          )}
        </div>
      )}
    </div>
  );
}
