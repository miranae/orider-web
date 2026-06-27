/**
 * Phase A.7 (2026-05-28) — server-computed `activity_metrics/{id}` 결과를
 * AnalysisTab 상단에 노출. 핵심 지표 + peakHr 1/5/20m + 정지 시간.
 *
 * 향후: client 재계산 useMemo 들이 점진적으로 metrics doc 값을 우선 사용하도록 migration.
 * 본 배너는 "데이터 1회 계산됨" 시각화 + migration 진행 시 비교 검증 보조.
 */

import { useTranslation } from "react-i18next";
import { Card, Chip, Text } from "../../theme/components";
import type { UseActivityMetricsState } from "../../hooks/useActivityMetrics";

interface ServerMetricsBannerProps {
  state: UseActivityMetricsState;
}

/** 신뢰도 임계 — 이 아래면 type label de-emphasize + hint hide. */
const LOW_CONFIDENCE = 0.5;

function fmtSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** peakHr 1/5/20m 중 존재하는 것을 묶어 한 줄에 표시. */
function peakHrSummary(p: { "1m"?: number; "5m"?: number; "20m"?: number } | undefined): string | null {
  if (!p) return null;
  const parts: string[] = [];
  if (p["1m"] != null) parts.push(`1m ${p["1m"]}`);
  if (p["5m"] != null) parts.push(`5m ${p["5m"]}`);
  if (p["20m"] != null) parts.push(`20m ${p["20m"]}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export default function ServerMetricsBanner({ state }: ServerMetricsBannerProps) {
  const { t } = useTranslation("activity");

  const WORKOUT_TYPE_LABEL: Record<string, string> = {
    recovery: t("serverMetrics.workoutType.recovery"),
    endurance: t("serverMetrics.workoutType.endurance"),
    tempo: t("serverMetrics.workoutType.tempo"),
    threshold: t("serverMetrics.workoutType.threshold"),
    interval: t("serverMetrics.workoutType.interval"),
    race: t("serverMetrics.workoutType.race"),
    mixed: t("serverMetrics.workoutType.mixed"),
  };

  // missing: Phase A 트리거 발화 안 된 활동 — 1줄 hint 로 명시.
  if (state.status === "missing") {
    return (
      <Card style={{ padding: "var(--space-3)", marginBottom: "var(--space-4)" }}>
        <Text size="xs" tone="tertiary">{t("serverMetrics.missing")}</Text>
      </Card>
    );
  }
  // loading: 첫 read 응답 전. 잠깐만 보임 — silent.
  if (state.status !== "ready") return null;
  const m = state.metrics;

  const lowConf = m.workoutTypeConfidence != null && m.workoutTypeConfidence < LOW_CONFIDENCE;

  const items: Array<{ label: string; value: string; hint?: string; tone?: "default" | "muted" }> = [];
  if (m.tss != null) items.push({ label: "TSS", value: String(Math.round(m.tss)) });
  if (m.np != null) items.push({ label: "NP", value: `${Math.round(m.np)} W` });
  if (m.if != null) items.push({ label: "IF", value: m.if.toFixed(2) });
  if (m.vi != null) items.push({ label: "VI", value: m.vi.toFixed(2) });
  if (m.trimp != null) items.push({ label: "TRIMP", value: String(Math.round(m.trimp)) });
  if (m.workoutType) {
    items.push({
      label: t("serverMetrics.workoutTypeLabel"),
      value: WORKOUT_TYPE_LABEL[m.workoutType] ?? m.workoutType,
      // 신뢰도 ≥ 0.5 일 때만 hint 표시 — mixed fallback (0.3) 같은 weak 분류는
      // 라벨 자체를 muted 처리하고 hint 는 숨김.
      hint: !lowConf && m.workoutTypeConfidence != null
        ? t("serverMetrics.confidenceHint", { pct: Math.round(m.workoutTypeConfidence * 100) })
        : undefined,
      tone: lowConf ? "muted" : "default",
    });
  }
  const peakHrSum = peakHrSummary(m.peakHr);
  if (peakHrSum) items.push({ label: "peakHR bpm", value: peakHrSum });
  if (m.movingTimeSec != null && m.pauseTimeSec != null && m.pauseTimeSec >= 30) {
    items.push({ label: t("serverMetrics.movingTimeLabel"), value: fmtSec(m.movingTimeSec), hint: t("serverMetrics.pauseHint", { time: fmtSec(m.pauseTimeSec) }) });
  }

  if (items.length === 0) return null;

  return (
    <Card style={{ padding: "var(--space-3)", marginBottom: "var(--space-4)" }}>
      <div className="flex items-center" style={{ gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
        <Chip>{t("serverMetrics.chip")}</Chip>
        <Text size="xs" tone="tertiary">
          {new Date(m.computedAt).toLocaleString("ko-KR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })} · v{m.version}
        </Text>
      </div>
      {/* 셀별 라벨/값/힌트를 항상 세로 stack — <Text> 가 기본 span 이라 wrapper 없이 두면
       *  인라인으로 붙어("TSS30") 끔찍하게 렌더되던 회귀 수정. ActivityCard #181 StatBlock 패턴
       *  참고. 모바일은 grid-cols-3, 데스크톱은 flex-wrap 으로 자연 정렬. */}
      <div className="grid grid-cols-3 gap-x-3 gap-y-3 md:flex md:flex-wrap md:gap-4">
        {items.map((it) => (
          <div key={it.label} className="flex flex-col items-start" style={{ minWidth: 80 }}>
            <Text size="xs" tone="tertiary" as="span">{it.label}</Text>
            <Text size="md" weight={600} tone={it.tone === "muted" ? "tertiary" : "primary"} as="span">{it.value}</Text>
            {it.hint && <Text size="xs" tone="tertiary" as="span">{it.hint}</Text>}
          </div>
        ))}
      </div>
    </Card>
  );
}
