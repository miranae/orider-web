/**
 * 워크아웃 목적 + 개인화 목표 페이스 — HeroCard 의 `detailLine` 슬롯에 들어간다 (§3.3, 시안 2).
 *
 * 두 가지를 더한다:
 * 1. "왜 이 훈련인가" 일상어 한 줄 (`today.purposePlain.{category}`)
 * 2. 러닝일 때 존별 목표 페이스 범위 — 임계 페이스가 없으면 "(추정)" 라벨을 반드시 함께 노출.
 *    추정값과 확정값을 시각적으로 구분하지 않으면, 나중에 값이 바뀔 때 사용자 신뢰가 깨진다.
 */
import { useTranslation } from "react-i18next";
import { Text } from "../../../theme/components";
import { LocalizedLink } from "../../../components/LocalizedLink";
import { formatPaceRange, zonePaceRange, type PaceZone } from "../../../utils/workoutPace";
import type { WorkoutCategory } from "./todaysWorkoutUtils";

export interface WorkoutPurposeDetailProps {
  /** 워크아웃 카테고리 — 목적 문장 조회 키. */
  category: WorkoutCategory;
  /** 워크아웃의 주 강도 존. */
  zone: PaceZone;
  /** 러닝일 때만 목표 페이스를 노출한다. */
  isRun: boolean;
  /** 확정 또는 추정된 임계 페이스 (sec/km). */
  thresholdPaceSecPerKm: number | null;
  /** 임계 페이스가 사용자 확정값인지 추정값인지. */
  thresholdSource: "confirmed" | "estimated" | null;
}

/** 회복 존을 함께 보여줄 워크아웃 — 인터벌·역치는 회복 구간이 훈련의 절반이다. */
const SHOW_RECOVERY_ZONE: ReadonlySet<WorkoutCategory> = new Set(["vo2", "threshold"]);

export default function WorkoutPurposeDetail({
  category,
  zone,
  isRun,
  thresholdPaceSecPerKm,
  thresholdSource,
}: WorkoutPurposeDetailProps) {
  const { t } = useTranslation("training");

  const mainRange = isRun ? zonePaceRange(thresholdPaceSecPerKm, zone) : null;
  const recoveryRange =
    isRun && SHOW_RECOVERY_ZONE.has(category) ? zonePaceRange(thresholdPaceSecPerKm, 1) : null;
  const estimated = thresholdSource === "estimated";

  return (
    <div style={{ marginTop: "var(--space-3)" }}>
      {/* 왜 이 훈련인가 */}
      <div
        style={{
          background: "var(--bg-2)",
          borderRadius: "var(--r-md)",
          padding: "var(--space-2) var(--space-3)",
        }}
      >
        <Text as="span" variant="bodySmall" style={{ color: "var(--amber)", fontWeight: 700 }}>
          {t("today.pace.purposeLabel")}{" "}
        </Text>
        <Text as="span" variant="bodySmall" tone="secondary">
          {t(`today.purposePlain.${category}`)}
        </Text>
      </div>

      {/* 목표 페이스 범위 */}
      {mainRange && (
        <div style={{ marginTop: "var(--space-3)" }}>
          <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-2)" }}>
            {t("today.pace.targetPaceLabel")}
          </Text>
          <PaceRow label={t(`today.pace.zone${zone}`)} value={formatPaceRange(mainRange)} />
          {recoveryRange && (
            <PaceRow label={t("today.pace.zone1")} value={formatPaceRange(recoveryRange)} />
          )}
          <Text
            as="div"
            variant="caption"
            style={{ marginTop: "var(--space-2)", color: "var(--ink-3)" }}
          >
            {estimated && (
              <Text as="span" variant="caption" style={{ color: "var(--amber)", fontWeight: 600 }}>
                {t("today.pace.estimatedTag")}{" "}
              </Text>
            )}
            {estimated ? t("today.pace.estimatedHint") : t("today.pace.confirmedHint")}
          </Text>
        </div>
      )}

      {/*
        임계 페이스가 없으면 목표 페이스를 **추정해서 보여주지 않는다**. 대시보드에서 추정하려면
        최근 활동 스트림을 끌어와야 해 비싸고, 나중에 사용자가 임계값을 확정하는 순간 숫자가
        조용히 바뀌어 신뢰가 깨진다. 대신 설정 경로만 안내한다.
      */}
      {isRun && !mainRange && (
        <Text as="div" variant="caption" style={{ marginTop: "var(--space-2)", color: "var(--ink-3)" }}>
          {t("today.pace.unsetHint")}{" "}
          <LocalizedLink to="/settings?section=training" style={{ color: "var(--accent)", fontWeight: 600 }}>
            {t("today.pace.unsetCta")}
          </LocalizedLink>
        </Text>
      )}
    </div>
  );
}

function PaceRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--space-3)",
        padding: "var(--space-1) 0",
      }}
    >
      <Text as="span" variant="bodySmall" tone="secondary">
        {label}
      </Text>
      <Text as="span" variant="bodySmall" mono tone="primary" style={{ fontWeight: 600 }}>
        {value}
      </Text>
    </div>
  );
}
