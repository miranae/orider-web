import { useTranslation } from "react-i18next";
import type { FitnessPoint } from "../utils/fitnessMetrics";

interface FitnessSummaryProps {
  current: FitnessPoint;
  weekAgo: FitnessPoint | null;
}

function formatDelta(current: number, previous: number | undefined): { text: string; color: string } {
  if (previous == null) return { text: "", color: "" };
  const diff = current - previous;
  const sign = diff > 0 ? "+" : "";
  return {
    text: `${sign}${diff.toFixed(1)}`,
    color: diff > 0 ? "text-green-500" : diff < 0 ? "text-red-500" : "text-[var(--ink-3)]",
  };
}

function tsbStatusStyle(tsb: number): { color: string; bgColor: string } {
  if (tsb > 25) return { color: "text-blue-600", bgColor: "bg-blue-50" };
  if (tsb > 5) return { color: "text-green-600", bgColor: "bg-green-50" };
  if (tsb > -10) return { color: "text-[var(--amber)]", bgColor: "bg-[var(--bg-2)]" };
  if (tsb > -30) return { color: "text-red-600", bgColor: "bg-red-50" };
  return { color: "text-red-700", bgColor: "bg-red-100" };
}

export default function FitnessSummary({ current, weekAgo }: FitnessSummaryProps) {
  const { t } = useTranslation("dashboard");
  const ctlDelta = formatDelta(current.ctl, weekAgo?.ctl);
  const atlDelta = formatDelta(current.atl, weekAgo?.atl);
  const tsbDelta = formatDelta(current.tsb, weekAgo?.tsb);
  const statusStyle = tsbStatusStyle(current.tsb);

  function tsbStatusLabel(tsb: number): string {
    if (tsb > 25) return t("fitnessSummary.statusWellRested");
    if (tsb > 5) return t("fitnessSummary.statusRecovered");
    if (tsb > -10) return t("fitnessSummary.statusOptimal");
    if (tsb > -30) return t("fitnessSummary.statusFatigued");
    return t("fitnessSummary.statusOverreaching");
  }
  const statusLabel = tsbStatusLabel(current.tsb);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div className="rounded-[var(--r-lg)] p-4 border" style={{ background: "var(--bg-0)", borderColor: "var(--line-soft)" }}>
        <div className="text-[length:var(--fs-xs)] uppercase tracking-wide" style={{ color: "var(--ink-2)" }}>{t("fitnessSummary.ctl")}</div>
        <div className="mt-1 text-[length:var(--fs-2xl)] font-bold text-blue-600 tabular-nums">{current.ctl.toFixed(1)}</div>
        {ctlDelta.text && <div className={`text-[length:var(--fs-xs)] mt-0.5 ${ctlDelta.color}`}>{t("fitnessSummary.vsWeekAgo", { delta: ctlDelta.text })}</div>}
      </div>
      <div className="rounded-[var(--r-lg)] p-4 border" style={{ background: "var(--bg-0)", borderColor: "var(--line-soft)" }}>
        <div className="text-[length:var(--fs-xs)] uppercase tracking-wide" style={{ color: "var(--ink-2)" }}>{t("fitnessSummary.atl")}</div>
        <div className="mt-1 text-[length:var(--fs-2xl)] font-bold text-red-500 tabular-nums">{current.atl.toFixed(1)}</div>
        {atlDelta.text && <div className={`text-[length:var(--fs-xs)] mt-0.5 ${atlDelta.color}`}>{t("fitnessSummary.vsWeekAgo", { delta: atlDelta.text })}</div>}
      </div>
      <div className="rounded-[var(--r-lg)] p-4 border" style={{ background: "var(--bg-0)", borderColor: "var(--line-soft)" }}>
        <div className="text-[length:var(--fs-xs)] uppercase tracking-wide" style={{ color: "var(--ink-2)" }}>{t("fitnessSummary.tsb")}</div>
        <div className="mt-1 text-[length:var(--fs-2xl)] font-bold text-emerald-600 tabular-nums">{current.tsb.toFixed(1)}</div>
        {tsbDelta.text && <div className={`text-[length:var(--fs-xs)] mt-0.5 ${tsbDelta.color}`}>{t("fitnessSummary.vsWeekAgo", { delta: tsbDelta.text })}</div>}
      </div>
      <div className={`rounded-[var(--r-lg)] p-4 border ${statusStyle.bgColor}`} style={{ borderColor: "var(--line-soft)" }}>
        <div className="text-[length:var(--fs-xs)] uppercase tracking-wide" style={{ color: "var(--ink-2)" }}>{t("fitnessSummary.status")}</div>
        <div className={`mt-1 text-[length:var(--fs-lg)] font-bold ${statusStyle.color}`}>{statusLabel}</div>
        <div className="text-[length:var(--fs-xs)] mt-1" style={{ color: "var(--ink-2)" }}>{t("fitnessSummary.tsbOptimal")}</div>
      </div>
    </div>
  );
}
