/**
 * 훈련 상태 카드 — TSB 숫자 대신 일상어 라벨 + 한 줄 조언 (설계 문서 §3.5, 시안 3).
 *
 * 스펙트럼 바 규칙: **현재 위치 세그먼트만** 강조한다. 양끝(과부하·과회복)을 상시 경고색으로
 * 칠하면 성격이 다른 두 상태가 동급 위험으로 읽힌다. 경고색은 실제로 과부하일 때만 쓴다.
 *
 * ## 구간은 서버가 판정한다 (#886)
 *
 * `decision` 봉투가 들어오면 **서버 `form.band` 만** 그린다 — 로컬 판정으로 대체하지 않는다.
 * 값이 없는 상태(processing/failed/unavailable)에서는 구간 대신 그 상태를 밝힌다. 여기서
 * 로컬 밴드로 떨어지면 같은 TSB 가 화면마다 다르게 읽히던 문제가 그대로 돌아온다.
 *
 * `decision` 이 아예 없으면(전환 플래그 꺼짐) 기존 로컬 표시가 남는다 — 서버 배포 전 회귀 방지.
 */
import { useTranslation } from "react-i18next";
import { Card, Chip, Text, type ChipVariant } from "../../theme/components";
import { MetricExplainerTrigger } from "../common/MetricExplainer";
import { canonicalDisplayShowsValue, type CanonicalDisplay } from "@shared/types/canonicalDisplay";
import { FORM_BAND_KEYS, knownFormBandKey, type FormBandKey } from "@shared/training/formBand";
import type { TrainingDecisionEnvelope } from "../../services/trainingDecisionCanonicalContract";
import {
  trainingStatusLabel,
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
  /** canonical 결정 봉투. 있으면 서버 구간만 그린다. 없으면(전환 꺼짐) 기존 로컬 표시. */
  decision?: TrainingDecisionEnvelope | null;
  /** 봉투에서 파생된 화면 상태(`useTrainingDecision().display`). */
  decisionDisplay?: CanonicalDisplay | null;
  /**
   * 서버가 이 화면을 껐다(`useTrainingDecision().paused`). 구간도 숫자도 그리지 않고 중단만
   * 밝힌다 — 로컬 밴드로 내려가면 kill switch 를 내린 의미가 없다 (#2442).
   */
  decisionPaused?: boolean;
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

/**
 * 구간 → 톤. 키는 서버 `FORM_BAND_KEYS` 와 1:1 이고 i18n `fitness:trainingStatus.{key}.label`
 * 도 같은 키를 쓴다. 새 구간이 서버에 생기면 여기 없으므로 타입이 먼저 깨진다.
 */
const TONE_BY_BAND: Record<FormBandKey, TrainingStatusTone> = {
  overload: "warning",
  needsRecovery: "neutral",
  productive: "accent",
  fresh: "neutral",
  overRecovered: "neutral",
};

/** 값이 없는 상태의 안내 문구 키. 숫자도 구간도 그리지 않는다. */
const STATE_MESSAGE_KEY: Record<Exclude<CanonicalDisplay, "value" | "value_with_stale_hint">, string> = {
  loading: "trainingStatus.state.loading",
  error: "trainingStatus.state.error",
  empty: "trainingStatus.state.empty",
};

interface ResolvedBand {
  key: FormBandKey;
  index: number;
  tone: TrainingStatusTone;
  drivenByRamp: boolean;
}

export default function TrainingStatusCard({
  tsb,
  ctl,
  atl,
  ctlRampPerWeek,
  sport,
  decision,
  decisionDisplay,
  decisionPaused = false,
}: TrainingStatusCardProps) {
  const { t } = useTranslation("fitness");

  // kill switch 가 먼저다. 값이 손에 있어도 그리지 않는다.
  if (decisionPaused) {
    return (
      <Card>
        <Text as="p" variant="bodySmall" tone="secondary" style={{ margin: 0 }}>
          {t("trainingStatus.state.paused")}
        </Text>
      </Card>
    );
  }

  const display = decision ? (decisionDisplay ?? null) : null;
  const serverBandKey = decision?.data ? knownFormBandKey(decision.data.form.band.key) : null;

  // 봉투가 있는데 그릴 값이 없으면 상태만 밝힌다 — 로컬 판정으로 내려가지 않는다.
  if (decision && (display === null || !canonicalDisplayShowsValue(display) || serverBandKey === null)) {
    const messageKey = display && display !== "value" && display !== "value_with_stale_hint"
      ? STATE_MESSAGE_KEY[display]
      : "trainingStatus.state.error";
    return (
      <Card>
        <Text as="p" variant="bodySmall" tone="secondary" style={{ margin: 0 }}>
          {t(messageKey)}
        </Text>
      </Card>
    );
  }

  const band: ResolvedBand = serverBandKey !== null && decision?.data
    ? {
        key: serverBandKey,
        index: FORM_BAND_KEYS.indexOf(serverBandKey),
        tone: TONE_BY_BAND[serverBandKey],
        drivenByRamp: decision.data.form.band.drivenByRamp,
      }
    : localBand(tsb, ctlRampPerWeek);

  const toneColor = TONE_VAR[band.tone];
  const stale = display === "value_with_stale_hint";
  const adviceKey = band.drivenByRamp
    ? `trainingStatus.${band.key}.adviceRamp`
    : `trainingStatus.${band.key}.advice`;

  return (
    <Card>
      <MetricExplainerTrigger
        metric="tsb"
        scope="global"
        sport={sport}
        context={{ tsb, ctl, atl, ctlRampPerWeek, formBandKey: serverBandKey }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <Chip variant={TONE_CHIP[band.tone]} dot style={{ flexShrink: 0, fontWeight: 600 }}>
            {t(`trainingStatus.${band.key}.label`)}
          </Chip>
          {stale && <Chip variant="default" style={{ flexShrink: 0 }}>{t("trainingStatus.staleChip")}</Chip>}
          <Text as="p" variant="bodySmall" tone="secondary" style={{ margin: 0 }}>
            {t(adviceKey)}
          </Text>
        </div>
      </MetricExplainerTrigger>

      {/* 스펙트럼 바 — 현재 위치만 채운다 */}
      <div
        style={{ display: "flex", gap: "var(--space-1)", marginTop: "var(--space-3)" }}
        role="img"
        aria-label={`${t(`trainingStatus.${band.key}.label`)} (${band.index + 1}/${FORM_BAND_KEYS.length})`}
      >
        {FORM_BAND_KEYS.map((key, i) => (
          <div
            key={key}
            style={{
              flex: 1,
              height: 4,
              borderRadius: "var(--r-sm)",
              background: i === band.index ? toneColor : "var(--bg-3)",
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "var(--space-1)" }}>
        {FORM_BAND_KEYS.map((key, i) => (
          <Text
            key={key}
            as="span"
            variant="caption"
            style={{
              color: i === band.index ? toneColor : "var(--ink-4)",
              fontWeight: i === band.index ? 700 : 400,
            }}
          >
            {t(`trainingStatus.${key}.label`)}
          </Text>
        ))}
      </div>
    </Card>
  );
}

/** 전환 전 경로 — `decision` 이 없을 때만 쓴다. 서버 배포·백필이 끝나면 사라질 분기. */
function localBand(tsb: number, ctlRampPerWeek?: number | null): ResolvedBand {
  const status = trainingStatusLabel({ tsb, ctlRampPerWeek });
  return { key: status.key, index: status.index, tone: status.tone, drivenByRamp: status.drivenByRamp };
}
