/**
 * 러닝 데이터 없는 상태 — 첫 동기화 여정 (설계 문서 §3.0).
 *
 * 1차 가치는 "입문자 획득"이 아니라 **연결~첫 동기화 사이의 졸업생 유지**다. 졸업생은 Strava 를
 * 연결하면 곧바로 데이터가 흐르므로, 이 화면의 무게중심은 샘플 카드가 아니라 "연결 → 도착" 경로다.
 *
 * 샘플 해석 카드는 **남의 가상 러닝**이라는 사실을 숨기지 않는다(점선 + "미리보기" 라벨).
 * 문서는 이 카드가 전환을 만든다고 단정했지만 그건 가설이다 — `or_run_empty_state_cta` 로
 * 전환을 재고, 카드 유무 A/B 로 기여도를 분리한다.
 */
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Footprints } from "lucide-react";
import { buttonClass, Card, Text } from "../../theme/components";
import { useStrava } from "../../hooks/useStrava";
import { track } from "../../services/analytics";

export interface RunEmptyStateProps {
  /** Strava 연결 여부 — 연결됐으면 "첫 러닝 대기" 문구로 바뀐다. */
  stravaConnected: boolean;
}

/** 샘플 카드에 쓰는 가상 러닝. 개인화가 아님을 시각적으로 명시한다. */
const SAMPLE = {
  paceLabel: `5'52"`,
  gapLabel: `5'40"`,
  loadLabel: "64",
};

export default function RunEmptyState({ stravaConnected }: RunEmptyStateProps) {
  const { t } = useTranslation("dashboard");
  const { connectStrava } = useStrava();

  useEffect(() => {
    track("or_run_empty_state_view", { stravaConnected });
  }, [stravaConnected]);

  const handleConnect = () => {
    track("or_run_empty_state_cta", { stravaConnected });
    connectStrava("/");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <div style={{ textAlign: "center", padding: "var(--space-6) var(--space-3) var(--space-2)" }}>
        <Footprints size={32} aria-hidden="true" style={{ color: "var(--ink-3)" }} />
        {/* 한국어는 어절 단위로 끊어야 읽힌다 — keep-all 없이는 좁은 폭에서 단어 중간이 갈린다. */}
        <Text
          as="h2"
          variant="subtitle"
          tone="primary"
          style={{ margin: "var(--space-3) 0 var(--space-2)", textWrap: "balance", wordBreak: "keep-all" }}
        >
          {stravaConnected ? t("runEmpty.waitingTitle") : t("runEmpty.title")}
        </Text>
        <Text
          as="p"
          variant="bodySmall"
          tone="secondary"
          style={{ margin: "0 0 var(--space-4)", wordBreak: "keep-all" }}
        >
          {stravaConnected ? t("runEmpty.waitingSubtitle") : t("runEmpty.subtitle")}
        </Text>

        {!stravaConnected && (
          <button
            type="button"
            onClick={handleConnect}
            className={buttonClass({ variant: "primary", size: "md" })}
            style={{ minHeight: 44 }}
          >
            {t("runEmpty.connectCta")}
          </button>
        )}
      </div>

      {/* 샘플 해석 카드 — 정적 가상 데이터. 점선 테두리로 실데이터와 구분. */}
      <Card style={{ borderStyle: "dashed", position: "relative" }}>
        <Text
          as="span"
          variant="caption"
          style={{
            position: "absolute",
            top: "calc(var(--space-3) * -1)",
            left: "var(--space-4)",
            background: "var(--amber)",
            color: "var(--bg-0)",
            borderRadius: "var(--r-sm)",
            padding: "2px var(--space-2)",
            fontWeight: 700,
            letterSpacing: "0.06em",
          }}
        >
          {t("runEmpty.previewTag")}
        </Text>

        <Text as="p" variant="body" tone="primary" style={{ margin: 0, lineHeight: 1.55 }}>
          {t("runEmpty.sampleSentence", { gap: SAMPLE.gapLabel })}
        </Text>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
          <SampleStat label={t("runEmpty.samplePace")} value={SAMPLE.paceLabel} />
          <SampleStat label="GAP" value={SAMPLE.gapLabel} />
          <SampleStat label={t("runEmpty.sampleLoad")} value={SAMPLE.loadLabel} />
        </div>
      </Card>

      <Text as="div" variant="caption" tone="tertiary" style={{ textAlign: "center" }}>
        {t("runEmpty.manualHint")}{" "}
        <a href="/web-manual/ch08-multisport.html" style={{ color: "var(--accent)", fontWeight: 600 }}>
          {t("runEmpty.manualCta")}
        </a>
      </Text>
    </div>
  );
}

function SampleStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "var(--bg-2)", borderRadius: "var(--r-md)", padding: "var(--space-2) var(--space-3)" }}>
      <Text as="div" variant="caption" tone="tertiary">{label}</Text>
      <Text as="div" variant="dataSmall" mono tone="primary">{value}</Text>
    </div>
  );
}
