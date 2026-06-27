import { useMemo } from "react";
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
            background: "rgba(232,176,74,0.12)",
            border: "1px solid rgba(232,176,74,0.3)",
            color: "var(--amber)",
          }}
        >
          {t("metabolism.virtualPowerNote")}
        </div>
      )}

      {/* 지방 vs 탄수 분할 */}
      <div
        style={{
          padding: "16px",
          borderRadius: 10,
          background: "var(--bg-2)",
          border: "1px solid var(--line-soft)",
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <Text variant="eyebrow" style={{ fontSize: 9 }}>
              {t("metabolism.fat")}
            </Text>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4, lineHeight: 1 }}>
              <Text variant="dataHero" style={{ fontSize: 22, color: "var(--lime)" }}>
                {substrate.fatKcal}
              </Text>
              <Text variant="unit">kcal · {fatPctRound}%</Text>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <Text variant="eyebrow" style={{ fontSize: 9 }}>
              {t("metabolism.carb")}
            </Text>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4, lineHeight: 1, justifyContent: "flex-end" }}>
              <Text variant="dataHero" style={{ fontSize: 22, color: "var(--amber)" }}>
                {substrate.carbKcal}
              </Text>
              <Text variant="unit">kcal · {carbPctRound}%</Text>
            </div>
          </div>
        </div>

        {/* 분할 바 */}
        <div
          style={{
            display: "flex",
            height: 10,
            borderRadius: 999,
            overflow: "hidden",
            background: "var(--bg-3, rgba(255,255,255,0.06))",
          }}
        >
          <div style={{ width: `${fatPctRound}%`, background: "var(--lime)" }} />
          <div style={{ width: `${carbPctRound}%`, background: "var(--amber)" }} />
        </div>
        <div style={{ fontSize: 10, color: "var(--ink-3)", marginTop: "var(--space-2)" }}>
          {t("metabolism.totalKcal", { kcal: substrate.totalKcal })}
        </div>
      </div>

      {/* FATMAX 존 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
        <div style={{ padding: "14px 16px", borderRadius: 10, background: "var(--bg-2)", border: "1px solid var(--line-soft)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--lime)", flexShrink: 0 }} />
            <Text variant="eyebrow" style={{ fontSize: 9 }}>{t("metabolism.fatMaxZone")}</Text>
            <InfoTip content={t("analysis.glossary.fatmax")} label={t("metabolism.fatMaxZone")} />
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 3, lineHeight: 1 }}>
            <Text variant="dataHero" style={{ fontSize: 22, color: "var(--lime)" }}>{fatMax.fatMaxWatts}</Text>
            <Text variant="unit">W</Text>
          </div>
          <div style={{ fontSize: 10, color: "var(--ink-3)", marginTop: "var(--space-1)" }}>
            {Math.round(fatMax.fatMaxPctFtp * 100)}% FTP
          </div>
        </div>

        {sustainText && (
          <div style={{ padding: "14px 16px", borderRadius: 10, background: "var(--bg-2)", border: "1px solid var(--line-soft)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--aqua)", flexShrink: 0 }} />
              <Text variant="eyebrow" style={{ fontSize: 9 }}>{t("metabolism.sustainable")}</Text>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 3, lineHeight: 1 }}>
              <Text variant="dataHero" style={{ fontSize: 22, color: "var(--aqua)" }}>{sustainText}</Text>
            </div>
            <div style={{ fontSize: 10, color: "var(--ink-3)", marginTop: "var(--space-1)" }}>
              {t("metabolism.sustainableDesc")}
            </div>
          </div>
        )}

        {fatMax.tssAtFatMax != null && (
          <div style={{ padding: "14px 16px", borderRadius: 10, background: "var(--bg-2)", border: "1px solid var(--line-soft)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--violet)", flexShrink: 0 }} />
              <Text variant="eyebrow" style={{ fontSize: 9 }}>{t("metabolism.tssAtFatMax")}</Text>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 3, lineHeight: 1 }}>
              <Text variant="dataHero" style={{ fontSize: 22, color: "var(--violet)" }}>{fatMax.tssAtFatMax}</Text>
            </div>
            <div style={{ fontSize: 10, color: "var(--ink-3)", marginTop: "var(--space-1)" }}>
              {t("metabolism.tssAtFatMaxDesc")}
            </div>
          </div>
        )}
      </div>

      {/* 강도-지방산화 종형곡선 */}
      <div className="mt-3" style={{ padding: "16px", borderRadius: 10, background: "var(--bg-2)", border: "1px solid var(--line-soft)" }}>
        <Text variant="eyebrow" style={{ fontSize: 9 }}>{t("metabolism.curveTitle")}</Text>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 90, marginTop: 10 }}>
          {curve.map((c) => (
            <div key={c.pct} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div
                style={{
                  width: "100%",
                  height: `${Math.max(2, c.rel * 70)}px`,
                  borderRadius: 4,
                  background: c.isPeak ? "var(--lime)" : "var(--line-soft)",
                }}
                title={`${Math.round(c.pct * 100)}% FTP`}
              />
              <span style={{ fontSize: 9, color: c.isPeak ? "var(--lime)" : "var(--ink-3)" }}>
                {Math.round(c.pct * 100)}
              </span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 10, color: "var(--ink-3)", marginTop: "var(--space-2)" }}>
          {t("metabolism.curveFootnote")}
        </div>
      </div>

      <div style={{ fontSize: 10, color: "var(--ink-3)", marginTop: "var(--space-2)" }}>
        {t("metabolism.disclaimer")}
      </div>
    </div>
  );
}
