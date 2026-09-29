import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SplitRow } from "@shared/types/activity-metrics";
import { useLocale } from "../../contexts/LocaleContext";
import { formatElev, formatPace } from "../../utils/units";
import { Card, Text } from "../../theme/components";
import { MetricExplainerTrigger } from "../common/MetricExplainer";

/** 서버 km 스플릿을 탐색한다. 막대는 관측된 페이스 범위 안에서 상대 비교하며 기록 페이스를 다시 계산하지 않는다. */
export default function RunSplitProfile({ splits, distanceKm, suppressCadence, cadenceLabel, formatCadence }: {
  splits: SplitRow[];
  distanceKm: number | null;
  suppressCadence: boolean;
  cadenceLabel: string;
  formatCadence: (value: number | null | undefined) => string;
}) {
  const { t } = useTranslation("activity");
  const { units } = useLocale();
  const valid = splits.filter(split => Number.isFinite(split.km) && split.km > 0 && Number.isFinite(split.paceSec) && split.paceSec > 0);
  const [selectedKm, setSelectedKm] = useState(valid[0]?.km);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const selected = valid.find(split => split.km === selectedKm) ?? valid[0];
  if (!selected) return <Text as="p" variant="bodySmall" tone="tertiary">{t("analysis.run.splitsUnavailable")}</Text>;
  const isPartial = (split: SplitRow) => !Number.isInteger(split.km) || (distanceKm != null && split.km > distanceKm);
  const full = valid.filter(split => distanceKm != null && Number.isInteger(split.km) && !isPartial(split));
  const fastestPace = full.length ? Math.min(...full.map(split => split.paceSec)) : null;
  const minPace = Math.min(...valid.map(split => split.paceSec));
  const maxPace = Math.max(...valid.map(split => split.paceSec));
  const pace = (value: number | null | undefined) => value != null && Number.isFinite(value) && value > 0 ? formatPace(value, units) : "—";
  const context = { paceSecPerKm: selected.paceSec, gapSecPerKm: selected.gapSec, thresholdPaceSecPerKm: null };
  const selectByKeyboard = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = event.key === "ArrowDown" || event.key === "ArrowRight" ? Math.min(valid.length - 1, index + 1)
      : event.key === "ArrowUp" || event.key === "ArrowLeft" ? Math.max(0, index - 1)
        : event.key === "Home" ? 0 : event.key === "End" ? valid.length - 1 : null;
    if (next == null) return;
    const nextSplit = valid[next];
    if (!nextSplit) return;
    event.preventDefault();
    setSelectedKm(nextSplit.km);
    buttons.current[next]?.focus();
    buttons.current[next]?.scrollIntoView?.({ block: "nearest" });
  };
  return <section data-testid="run-split-profile" className="min-w-0 space-y-3" aria-label={t("analysis.section.splits")}>
    <div>
      <Text as="h3" variant="subtitle">{t("analysis.section.splits")}</Text>
      <Text as="p" variant="caption" tone="tertiary">{t("analysis.run.profileGuide")}</Text>
    </div>
    <Card padding="compact" className="min-w-0" data-testid="selected-run-split" aria-live="polite" aria-atomic="true">
      <Text as="h4" variant="bodyMedium" weight={600}>{t("analysis.run.selectedSplit", { km: selected.km })}{isPartial(selected) ? ` · ${t("analysis.run.partialSplit")}` : ""}</Text>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" style={{ marginTop: "var(--space-3)" }}>
        <MetricExplainerTrigger metric="pace" context={context} sport="run"><Text as="div" variant="caption">{t("stat.avgPace")}</Text><Text variant="dataSmall">{pace(selected.paceSec)}</Text></MetricExplainerTrigger>
        {selected.gapSec != null && Number.isFinite(selected.gapSec) && selected.gapSec > 0 && <MetricExplainerTrigger metric="gap" context={context} sport="run"><Text as="div" variant="caption">{t("runCards.gapPace")}</Text><Text variant="dataSmall">{pace(selected.gapSec)}</Text></MetricExplainerTrigger>}
        {selected.avgHr != null && Number.isFinite(selected.avgHr) && selected.avgHr > 0 && <div><Text as="div" variant="caption">{t("stat.avgHr")}</Text><Text variant="dataSmall">{Math.round(selected.avgHr)} bpm</Text></div>}
        {!suppressCadence && selected.avgCadence != null && formatCadence(selected.avgCadence) !== "—" && <MetricExplainerTrigger metric="cadence" context={{ thresholdPaceSecPerKm: null }} sport="run"><Text as="div" variant="caption">{cadenceLabel}</Text><Text variant="dataSmall">{formatCadence(selected.avgCadence)}</Text></MetricExplainerTrigger>}
        {Number.isFinite(selected.elevGain) && <div><Text as="div" variant="caption">{t("analysis.metric.elevGain")}</Text><Text variant="dataSmall">{formatElev(selected.elevGain, units)}</Text></div>}
      </div>
    </Card>
    <Card padding="compact" className="min-w-0">
      <div role="group" aria-label={t("analysis.run.profileLabel")} className="space-y-1" style={{ maxHeight: "calc(var(--space-8) * 6)", overflowY: "auto", overflowX: "hidden" }}>
        {valid.map((split, index) => <button
          key={split.km} type="button" ref={node => { buttons.current[index] = node; }}
          aria-pressed={selected.km === split.km} tabIndex={selected.km === split.km ? 0 : -1}
          aria-label={[t("analysis.run.selectSplit", { km: split.km, pace: pace(split.paceSec) }), isPartial(split) ? t("analysis.run.partialSplit") : split.paceSec === fastestPace ? t("analysis.run.fastestSplit") : null].filter(Boolean).join(" · ")}
          onClick={() => setSelectedKm(split.km)} onKeyDown={event => selectByKeyboard(event, index)}
          className="w-full min-w-0 rounded-[var(--r-sm)] px-2 py-2 focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          style={{ minHeight: 44, display: "grid", gridTemplateColumns: "3.5em minmax(0, 1fr) auto", alignItems: "center", gap: "var(--space-2)", textAlign: "left", background: selected.km === split.km ? "var(--bg-3)" : "transparent", color: "var(--ink-0)", border: "1px solid var(--line-soft)" }}
        >
          <Text variant="caption" mono>{split.km} km</Text>
          <span aria-hidden="true" style={{ minWidth: 0, height: "var(--space-2)", background: "var(--bg-3)", borderRadius: "var(--r-sm)" }}>
            <span data-testid={`split-bar-${split.km}`} style={{ display: "block", width: `${maxPace === minPace ? 100 : 25 + (maxPace - split.paceSec) / (maxPace - minPace) * 75}%`, height: "100%", borderRadius: "var(--r-sm)", background: selected.km === split.km ? "var(--accent)" : "var(--ink-3)" }} />
          </span>
          <span style={{ textAlign: "right" }}>
            <Text variant="bodySmall" mono>{pace(split.paceSec)}</Text>
            {isPartial(split) ? <Text as="span" variant="caption" tone="tertiary"> · {t("analysis.run.partialSplit")}</Text>
              : split.paceSec === fastestPace && <Text as="span" variant="caption" style={{ color: "var(--accent-dark)" }}> · {t("analysis.run.fastestSplit")}</Text>}
          </span>
        </button>)}
      </div>
    </Card>
    <Text as="p" variant="caption" tone="tertiary">{t("analysis.run.splitsUnits")}</Text>
  </section>;
}
