/**
 * 훈련 상태 카드 — TSB 숫자 대신 일상어 라벨 + 한 줄 조언 (설계 문서 §3.5, 시안 3).
 *
 * 스펙트럼 바 규칙: **현재 위치 세그먼트만** 강조한다. 양끝(과부하·과회복)을 상시 경고색으로
 * 칠하면 성격이 다른 두 상태가 동급 위험으로 읽힌다. 경고색은 실제로 과부하일 때만 쓴다.
 */
import { useTranslation } from "react-i18next";
import { Card, Chip, Text, type ChipVariant } from "../../theme/components";
import { MetricExplainerTrigger } from "../common/MetricExplainer";
import {
  trainingStatusLabel,
  trainingStatusAdviceKey,
  TRAINING_STATUS_ORDER,
  type TrainingStatusTone,
} from "../../utils/trainingStatusLabel";

export interface TrainingStatusCardProps {
  tsb: number;
  ctl?: number | null;
  atl?: number | null;
  /** 주당 CTL 증가량 — 과도하면 과부하로 승격된다. */
  ctlRampPerWeek?: number | null;
  /** 분석 이벤트용 종목. */
  sport?: string;
}

const TONE_VAR: Record<TrainingStatusTone, string> = {
  warning: "var(--amber)",
  accent: "var(--accent)",
  neutral: "var(--ink-2)",
};

/** 상태 톤 → 디자인 시스템 Chip variant. */
const TONE_CHIP: Record<TrainingStatusTone, ChipVariant> = {
  warning: "warning",
  accent: "accent",
  neutral: "default",
};

export default function TrainingStatusCard({
  tsb,
  ctl,
  atl,
  ctlRampPerWeek,
  sport,
}: TrainingStatusCardProps) {
  const { t } = useTranslation("fitness");
  const status = trainingStatusLabel({ tsb, ctlRampPerWeek });
  const toneColor = TONE_VAR[status.tone];

  return (
    <Card>
      <MetricExplainerTrigger
        metric="tsb"
        scope="global"
        sport={sport}
        context={{ tsb, ctl, atl, ctlRampPerWeek }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <Chip variant={TONE_CHIP[status.tone]} dot style={{ flexShrink: 0, fontWeight: 600 }}>
            {t(`trainingStatus.${status.key}.label`)}
          </Chip>
          <Text as="p" variant="bodySmall" tone="secondary" style={{ margin: 0 }}>
            {t(trainingStatusAdviceKey(status))}
          </Text>
        </div>
      </MetricExplainerTrigger>

      {/* 스펙트럼 바 — 현재 위치만 채운다 */}
      <div
        style={{ display: "flex", gap: "var(--space-1)", marginTop: "var(--space-3)" }}
        role="img"
        aria-label={`${t(`trainingStatus.${status.key}.label`)} (${status.index + 1}/${TRAINING_STATUS_ORDER.length})`}
      >
        {TRAINING_STATUS_ORDER.map((key, i) => (
          <div
            key={key}
            style={{
              flex: 1,
              height: 4,
              borderRadius: "var(--r-sm)",
              background: i === status.index ? toneColor : "var(--bg-3)",
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "var(--space-1)" }}>
        {TRAINING_STATUS_ORDER.map((key, i) => (
          <Text
            key={key}
            as="span"
            variant="caption"
            style={{
              color: i === status.index ? toneColor : "var(--ink-4)",
              fontWeight: i === status.index ? 700 : 400,
            }}
          >
            {t(`trainingStatus.${key}.label`)}
          </Text>
        ))}
      </div>
    </Card>
  );
}
