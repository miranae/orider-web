/**
 * RiderTypeCard — 라이더 6타입 분류 + 2축 성향(Tendency) + Ability(인구 분위).
 *
 * 서버(pdc.ts)가 `users/{uid}/fitness/pdc_bike` 에 사전계산한 `riderType`/`ability` 를
 *  표시. 6타입 한국어 배지 + 2축 사분면 산점도 + 종합 백분위 + duration 별 분위 바.
 *  강점/약점 카드(#279)와 시각적으로 일관되게 디자인 토큰만 사용.
 *
 * bike 종목 + riderType 있을 때만 렌더. confidence 낮으면 "데이터 더 필요" 안내.
 */
import { useTranslation } from "react-i18next";
import { Card, Chip, Text } from "../theme/components";
import { type RiderType } from "@shared/training/riderType";
import type { PdcDoc } from "@shared/types/pdc";

/** 종합 백분위 색 — 토큰만 사용. */
function percentileColor(p: number): string {
  if (p >= 75) return "var(--lime)";
  if (p >= 50) return "var(--aqua)";
  if (p >= 25) return "var(--amber)";
  return "var(--ink-3)";
}

/** 2축 사분면 산점도 — axisX(폭발↔지속), axisY(절대파워↔W/kg). */
function TendencyPlot({ axisX, axisY, t }: { axisX: number; axisY: number; t: (key: string) => string }) {
  // [-1,1] → [0,100] (%). axisY 는 화면상 위가 양수(W/kg)라 반전.
  const left = ((axisX + 1) / 2) * 100;
  const top = ((1 - axisY) / 2) * 100;
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "1 / 1",
        maxWidth: 200,
        border: "1px solid var(--line-soft)",
        borderRadius: "var(--r-md)",
        background: "var(--bg-2)",
        overflow: "hidden",
      }}
    >
      {/* 중심 십자축 */}
      <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "var(--line-soft)" }} />
      <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: "var(--line-soft)" }} />
      {/* 축 라벨 */}
      <Text as="span" variant="eyebrow" style={{ position: "absolute", top: 4, left: "50%", transform: "translateX(-50%)", color: "var(--ink-4)" }}>W/kg</Text>
      <Text as="span" variant="eyebrow" style={{ position: "absolute", bottom: 4, left: "50%", transform: "translateX(-50%)", color: "var(--ink-4)" }}>{t("riderType.axis.absolutePower")}</Text>
      <Text as="span" variant="eyebrow" style={{ position: "absolute", left: 4, top: "50%", transform: "translateY(-50%)", color: "var(--ink-4)" }}>{t("riderType.axis.explosive")}</Text>
      <Text as="span" variant="eyebrow" style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", color: "var(--ink-4)" }}>{t("riderType.axis.sustained")}</Text>
      {/* 위치 점 */}
      <div
        style={{
          position: "absolute",
          left: `${left}%`,
          top: `${top}%`,
          width: 14,
          height: 14,
          marginLeft: -7,
          marginTop: -7,
          borderRadius: "50%",
          background: "var(--aqua)",
          boxShadow: "0 0 0 4px color-mix(in oklch, var(--aqua) 22%, transparent)",
        }}
      />
    </div>
  );
}

const RIDER_TYPE_KEYS: RiderType[] = [
  "RoadSprinter", "TrackSprinter", "AllRounder", "Puncher", "Climber", "TimeTrialist", "Unclassified",
];

export default function RiderTypeCard({ pdc }: { pdc: PdcDoc }) {
  const { t } = useTranslation("fitness");
  const rt = pdc.riderType;
  if (!rt) return null;

  const type: RiderType = (RIDER_TYPE_KEYS as string[]).includes(rt.type)
    ? (rt.type as RiderType)
    : "Unclassified";
  const lowConfidence = rt.confidence < 0.5 || type === "Unclassified";
  const ability = pdc.ability;

  const durationLabelKey: Record<string, string> = {
    "5s": t("riderType.duration.5s"),
    "1m": t("riderType.duration.1m"),
    "5m": t("riderType.duration.5m"),
    "20m": t("riderType.duration.20m"),
  };

  return (
    <Card padding="none" style={{ marginTop: "var(--space-4)", padding: "16px 24px" }}>
      <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-3)" }}>{t("riderType.title")}</Text>

      {lowConfidence ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <Chip variant="default" dot>{t("riderType.lowConfidence")}</Chip>
          <Text as="div" variant="eyebrow" style={{ color: "var(--ink-4)" }}>
            {t(`riderType.type.${type}.desc`)}
          </Text>
        </div>
      ) : (
        <div style={{ display: "flex", gap: "var(--space-5)", flexWrap: "wrap", alignItems: "flex-start" }}>
          {/* 좌: 타입 + 설명 + Ability */}
          <div style={{ flex: "1 1 240px", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
              <Chip variant="accent" dot>{t(`riderType.type.${type}.label`)}</Chip>
            </div>
            <Text as="div" variant="eyebrow" style={{ color: "var(--ink-4)" }}>
              {t(`riderType.type.${type}.desc`)}
            </Text>

            {ability && (
              <div style={{ marginTop: "var(--space-2)" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-2)" }}>
                  <Text as="span" variant="eyebrow">{t("riderType.abilityLabel")}</Text>
                  <Text variant="dataLarge" style={{ color: percentileColor(ability.overallPercentile) }}>
                    {t("riderType.topPct", { pct: 100 - ability.overallPercentile })}
                  </Text>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", marginTop: "var(--space-2)" }}>
                  {ability.byDuration.map((d) => (
                    <div key={d.duration} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                      <Text as="span" variant="mono" style={{ width: 32, color: "var(--ink-3)" }}>
                        {durationLabelKey[d.duration] ?? d.duration}
                      </Text>
                      <div style={{ flex: 1, height: 6, borderRadius: "var(--r-sm)", background: "var(--bg-2)", overflow: "hidden" }}>
                        <div
                          style={{
                            width: `${d.percentile}%`,
                            height: "100%",
                            background: percentileColor(d.percentile),
                          }}
                        />
                      </div>
                      <Text as="span" variant="mono" style={{ width: 36, textAlign: "right", color: "var(--ink-3)" }}>
                        {d.percentile}p
                      </Text>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 우: 2축 성향 산점도 */}
          <div style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", gap: "var(--space-2)", alignItems: "center" }}>
            <TendencyPlot axisX={rt.axisX} axisY={rt.axisY} t={t} />
            <Text as="div" variant="eyebrow" style={{ color: "var(--ink-4)" }}>{t("riderType.tendencyTitle")}</Text>
          </div>
        </div>
      )}

      <Text as="div" variant="eyebrow" style={{ marginTop: "var(--space-3)", color: "var(--ink-4)" }}>
        {t("riderType.cogganNote")}
      </Text>
    </Card>
  );
}
