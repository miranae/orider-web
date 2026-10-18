import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type {
  FatMaxProfile,
  RideSubstrate,
} from "@shared/training/metabolism";
import { Text } from "../theme/components";
import InfoTip from "./InfoTip";
import FuelSplitBar from "./FuelSplitBar";

interface MetabolismCardProps {
  /** 서버 `activity_metrics.substrate` — 시간 가중 적분. 웹은 계산하지 않는다 (#2437). */
  substrate: RideSubstrate | null | undefined;
  /** 서버 `activity_metrics.fatMax`. */
  fatMax: FatMaxProfile | null | undefined;
  /** 가상파워(추정 파워) 활동 여부 — 신뢰도 낮음 표기. */
  isVirtualPower?: boolean;
}

const panelStyle: CSSProperties = {
  padding: "var(--space-4)",
  borderRadius: "var(--r-lg)",
  background: "var(--bg-2)",
  border: "1px solid var(--line-soft)",
};

const metricStyle: CSSProperties = {
  padding: "14px var(--space-4)",
  borderRadius: "var(--r-lg)",
  background: "var(--bg-2)",
  border: "1px solid var(--line-soft)",
};

function Dot({ color }: { color: string }) {
  return (
    <span
      style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0 }}
    />
  );
}

export default function MetabolismCard({
  substrate,
  fatMax,
  isVirtualPower = false,
}: MetabolismCardProps) {
  const { t } = useTranslation("activity");
  const { t: term } = useTranslation("termGlossary");

  if (!substrate || substrate.totalKcal <= 0) return null;

  const fatPctRound = Math.round(substrate.fatPct * 1000) / 10;
  const carbPctRound = Math.round((1 - substrate.fatPct) * 1000) / 10;

  const sustainText =
    fatMax?.sustainableMin != null
      ? fatMax.sustainableMin >= 240
        ? t("metabolism.sustainLong")
        : t("metabolism.sustainMin", { min: Math.round(fatMax.sustainableMin) })
      : null;

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-3">
        <h3
          className="text-[length:var(--fs-sm)] font-semibold"
          style={{ color: "var(--ink-1)" }}
        >
          <InfoTip title={t("metabolism.section")} content={t("analysis.glossary.metabolism")}
            label={term("openLabel", { term: t("metabolism.section") })} tone="inherit">{t("metabolism.section")}</InfoTip>
        </h3>
      </div>

      {isVirtualPower && (
        <div
          className="rounded-[var(--r-lg)] px-4 py-2.5 text-[length:var(--fs-xs)] mb-3"
          style={{
            background: "color-mix(in oklch, var(--amber) 12%, transparent)",
            border: "1px solid color-mix(in oklch, var(--amber) 30%, transparent)",
            color: "var(--amber)",
          }}
        >
          {t("metabolism.virtualPowerNote")}
        </div>
      )}

      {/* 지방 vs 탄수 분할 — 개요와 같은 막대를 쓴다. */}
      <div style={panelStyle}>
        <FuelSplitBar
          fat={{ label: t("metabolism.fat"), pct: fatPctRound, kcal: substrate.fatKcal }}
          carb={{ label: t("metabolism.carb"), pct: carbPctRound, kcal: substrate.carbKcal }}
          footer={<Text as="div" variant="caption" tone="tertiary" style={{ marginTop: "var(--space-2)" }}>
            {t("metabolism.totalKcal", { kcal: substrate.totalKcal })}
          </Text>}
        />
      </div>

      {/* FATMAX 존 */}
      {fatMax && <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
        <div style={metricStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
            <Dot color="var(--lime)" />
            <Text variant="bodySmall" weight={600} size="xs"><InfoTip title={term("terms.fatmax.label")} content={term("terms.fatmax.description")}
              label={term("openLabel", { term: t("metabolism.fatMaxZone") })} termId="fatmax" tone="inherit">{t("metabolism.fatMaxZone")}</InfoTip></Text>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-1)", lineHeight: 1 }}>
            <Text variant="dataLarge" style={{ color: "var(--lime)" }}>{fatMax.fatMaxWatts}</Text>
            <Text variant="unit">W</Text>
          </div>
          <Text as="div" variant="caption" tone="tertiary" style={{ marginTop: "var(--space-1)" }}>
            {Math.round(fatMax.fatMaxPctFtp * 100)}% FTP
          </Text>
        </div>

        {sustainText && (
          <div style={metricStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
              <Dot color="var(--aqua)" />
              <Text variant="eyebrow" size="xs">{t("metabolism.sustainable")}</Text>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-1)", lineHeight: 1 }}>
              <Text variant="dataLarge" style={{ color: "var(--aqua)" }}>{sustainText}</Text>
            </div>
            <Text as="div" variant="caption" tone="tertiary" style={{ marginTop: "var(--space-1)" }}>
              {t("metabolism.sustainableDesc")}
            </Text>
          </div>
        )}

        {fatMax.tssAtFatMax != null && (
          <div style={metricStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
              <Dot color="var(--violet)" />
              <Text variant="eyebrow" size="xs">{t("metabolism.tssAtFatMax")}</Text>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-1)", lineHeight: 1 }}>
              <Text variant="dataLarge" style={{ color: "var(--violet)" }}>{fatMax.tssAtFatMax}</Text>
            </div>
            <Text as="div" variant="caption" tone="tertiary" style={{ marginTop: "var(--space-1)" }}>
              {t("metabolism.tssAtFatMaxDesc")}
            </Text>
          </div>
        )}
      </div>}

      <Text as="div" variant="caption" tone="tertiary" style={{ marginTop: "var(--space-2)" }}>
        {t("metabolism.disclaimer")}
      </Text>
    </div>
  );
}
