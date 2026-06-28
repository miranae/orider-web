import { useMemo, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import {
  computeRideSubstrate,
  computeFatMaxProfile,
  relativeFatOxidation,
  FATMAX_PEAK_PCT_FTP,
} from "@shared/training/metabolism";
import { Text } from "../theme/components";
import InfoTip from "./InfoTip";

interface MetabolismCardProps {
  /** 1Hz 파워 스트림 (W). */
  watts: number[];
  /** 기능적 임계파워 (W). */
  ftp: number;
  /** 체중 (kg). v1 미사용이나 향후 보정 여지로 전달. */
  weightKg?: number | null;
  /** 임계파워 (W) — 있으면 FATMAX 지속시간·TSS 추정. */
  cp?: number | null;
  /** 무산소 용량 (J). */
  wPrime?: number | null;
  /** 가상파워(추정 파워) 활동 여부 — 신뢰도 낮음 표기. */
  isVirtualPower?: boolean;
}

/** 강도-지방산화 종형곡선 시각화용 샘플 강도(%FTP). */
const CURVE_PCTS = [0.3, 0.4, 0.5, 0.6, 0.68, 0.8, 0.9, 1.0, 1.15];

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
  watts,
  ftp,
  weightKg = null,
  cp = null,
  wPrime = null,
  isVirtualPower = false,
}: MetabolismCardProps) {
  const { t } = useTranslation("activity");

  const substrate = useMemo(
    () => computeRideSubstrate(watts, ftp, weightKg),
    [watts, ftp, weightKg],
  );
  const fatMax = useMemo(
    () => computeFatMaxProfile(ftp, cp, wPrime),
    [ftp, cp, wPrime],
  );

  if (substrate.totalKcal <= 0) return null;

  const fatPctRound = Math.round(substrate.fatPct * 100);
  const carbPctRound = 100 - fatPctRound;

  // 종형곡선 막대 — 각 강도의 상대 지방산화율(0~1)을 높이로.
  const curve = CURVE_PCTS.map((p) => ({
    pct: p,
    rel: relativeFatOxidation(p),
    isPeak: Math.abs(p - FATMAX_PEAK_PCT_FTP) < 0.01,
  }));

  const sustainText =
    fatMax.sustainableMin != null
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
          {t("metabolism.section")}
        </h3>
        <InfoTip content={t("analysis.glossary.metabolism")} label={t("metabolism.section")} />
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

      {/* 지방 vs 탄수 분할 */}
      <div
        style={panelStyle}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <Text variant="eyebrow" size="xs">
              {t("metabolism.fat")}
            </Text>
            <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-1)", lineHeight: 1 }}>
              <Text variant="dataLarge" style={{ color: "var(--lime)" }}>
                {substrate.fatKcal}
              </Text>
              <Text variant="unit">kcal · {fatPctRound}%</Text>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <Text variant="eyebrow" size="xs">
              {t("metabolism.carb")}
            </Text>
            <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-1)", lineHeight: 1, justifyContent: "flex-end" }}>
              <Text variant="dataLarge" style={{ color: "var(--amber)" }}>
                {substrate.carbKcal}
              </Text>
              <Text variant="unit">kcal · {carbPctRound}%</Text>
            </div>
          </div>
        </div>

        {/* 분할 바 */}
        <div
          className="rounded-full"
          style={{
            display: "flex",
            height: 10,
            overflow: "hidden",
            background: "var(--bg-3)",
          }}
        >
          <div style={{ width: `${fatPctRound}%`, background: "var(--lime)" }} />
          <div style={{ width: `${carbPctRound}%`, background: "var(--amber)" }} />
        </div>
        <Text as="div" variant="caption" tone="tertiary" style={{ marginTop: "var(--space-2)" }}>
          {t("metabolism.totalKcal", { kcal: substrate.totalKcal })}
        </Text>
      </div>

      {/* FATMAX 존 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
        <div style={metricStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
            <Dot color="var(--lime)" />
            <Text variant="eyebrow" size="xs">{t("metabolism.fatMaxZone")}</Text>
            <InfoTip content={t("analysis.glossary.fatmax")} label={t("metabolism.fatMaxZone")} />
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
      </div>

      {/* 강도-지방산화 종형곡선 */}
      <div className="mt-3" style={panelStyle}>
        <Text variant="eyebrow" size="xs">{t("metabolism.curveTitle")}</Text>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "var(--space-2)", height: 90, marginTop: "var(--space-2)" }}>
          {curve.map((c) => (
            <div key={c.pct} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-1)" }}>
              <div
                style={{
                  width: "100%",
                  height: `${Math.max(2, c.rel * 70)}px`,
                  borderRadius: "var(--r-sm)",
                  background: c.isPeak ? "var(--lime)" : "var(--line-soft)",
                }}
                title={`${Math.round(c.pct * 100)}% FTP`}
              />
              <Text variant="caption" style={{ color: c.isPeak ? "var(--lime)" : "var(--ink-3)" }}>
                {Math.round(c.pct * 100)}
              </Text>
            </div>
          ))}
        </div>
        <Text as="div" variant="caption" tone="tertiary" style={{ marginTop: "var(--space-2)" }}>
          {t("metabolism.curveFootnote")}
        </Text>
      </div>

      <Text as="div" variant="caption" tone="tertiary" style={{ marginTop: "var(--space-2)" }}>
        {t("metabolism.disclaimer")}
      </Text>
    </div>
  );
}
