import { isSportUiEnabled } from "../../config/sportFeatures";
import { useState, useMemo, useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LocalizedLink as Link } from "../../components/LocalizedLink";
import DisciplineTabs from "../../components/redesign/DisciplineTabs";
import { Card, ChartFrame, ChartHeader, ChartLegend, ChartValue, ChartGridLine, ChartAxisLine, Section, Text } from "../../theme/components";
import IntegratedLoadCard, { type CombinedLoadStatus } from "../../components/mobile/IntegratedLoadCard";
import type { LoadFocusResult } from "../../features/fitness/multisportPerformance";
import { DISCIPLINE_CHART_COLORS, PMC_LINE_PALETTE } from "../../features/fitness/chartPalette";
import type { TriFitnessBreakdown, TriFitnessTimelinePoint } from "../../hooks/useFitnessModel";
import { addFitnessDateKeyDays, fitnessTodayKey } from "@shared/training/dateKey";
import ConditionSectionNav from "../../features/fitness/components/ConditionSectionNav";
import DetailsSection from "../../components/redesign/DetailsSection";
import "./TriFitnessView.css";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────
type TriRange = 42 | 90 | 180 | 365;

interface TriFitnessViewProps {
  condition?: boolean;
  /** Reuse sport-specific evidence on narrow screens without duplicating the header/current summary. */
  evidenceOnly?: boolean;
  hasThresholdSettings?: boolean;
  loading?: boolean;
  range: number;
  selectedHistoryRange?: number | "3y" | "all";
  onRangeChange: (range: TriRange) => void;
  breakdown: TriFitnessBreakdown;
  timeline: TriFitnessTimelinePoint[];
  combinedLoad: CombinedLoadStatus | null;
  loadFocus: LoadFocusResult | null;
  historySlot?: ReactNode;
  thresholdsSlot?: ReactNode;
}


// ─────────────────────────────────────────────────────────────────────────────
// TripleStackPMC SVG 차트 — 실데이터 기반
// ─────────────────────────────────────────────────────────────────────────────
interface PMCSeriesProps {
  bikeCtl: Array<number | null>;
  runCtl: Array<number | null>;
  swimCtl: Array<number | null>;
  totCtl: number[];
  atl: number[];
  tsb: number[];
  /** 날짜 레이블 배열 (YYYY-MM-DD), totCtl과 동일 길이 */
  dates: string[];
}

function TripleStackPMC({ bikeCtl = [], runCtl = [], swimCtl = [], totCtl = [], atl = [], tsb = [], dates = [] }: Partial<PMCSeriesProps>) {
  const { t } = useTranslation("fitness");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const tooltipId = useId();
  const n = totCtl.length;
  if (n === 0) {
    return (
      <div
        style={{
          height: 300,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--ink-4)",
          fontSize: "var(--fs-sm)",
        }}
      >
        {t("triView.emptyChart")}
      </div>
    );
  }

  const w = 1080, h = 300;
  const allVals = [...totCtl, ...atl, ...tsb];
  const rawMax = Math.max(...allVals, 0);
  const rawMin = Math.min(...allVals, 0);
  const pad = Math.max((rawMax - rawMin) * 0.1, 10);
  const max = rawMax + pad;
  const min = rawMin - pad;

  const sx = (i: number) => n <= 1 ? w / 2 : (i / (n - 1)) * w;
  const sy = (v: number) => h - ((v - min) / (max - min)) * h;

  const linePath = (arr: number[]) =>
    arr.map((v, i) => `${i ? "L" : "M"}${sx(i)} ${sy(v ?? 0)}`).join(" ");

  // 스택 영역: bike(하단) → bike+run → bike+run+swim
  const bikeArea =
    `M${sx(0)} ${sy(0)} ` +
    bikeCtl.map((v, i) => `L${sx(i)} ${sy(v ?? 0)}`).join(" ") +
    ` L${sx(n - 1)} ${sy(0)} Z`;

  const runArea =
    bikeCtl.map((v, i) => `${i ? "L" : "M"}${sx(i)} ${sy(v ?? 0)}`).join(" ") +
    " " +
    bikeCtl
      .map((_, i) => {
        const idx = n - 1 - i;
        return `L${sx(idx)} ${sy((bikeCtl[idx] ?? 0) + (runCtl[idx] ?? 0))}`;
      })
      .join(" ") +
    " Z";

  const swimArea =
    bikeCtl.map((v, i) => `${i ? "L" : "M"}${sx(i)} ${sy((v ?? 0) + (runCtl[i] ?? 0))}`).join(" ") +
    " " +
    bikeCtl
      .map((_, i) => {
        const idx = n - 1 - i;
        return `L${sx(idx)} ${sy((bikeCtl[idx] ?? 0) + (runCtl[idx] ?? 0) + (swimCtl[idx] ?? 0))}`;
      })
      .join(" ") +
    " Z";

  // 날짜 레이블: 시작, 1/4, 중간, 3/4, 끝
  const labelIndices = [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4), n - 1]
    .filter((index, position, all) => all.indexOf(index) === position);
  const formatLabel = (dateStr: string) => {
    const [, m, d] = dateStr.split("-");
    return t("triView.dateLabel", { month: parseInt(m!), day: parseInt(d!) });
  };

  const hi = hoverIdx != null && hoverIdx < n ? hoverIdx : n - 1;

  return (
    <div
      className="tri-fitness__interactive-chart"
      role="group"
      tabIndex={0}
      aria-label={t("triView.pmc.title")}
      aria-describedby={hi == null ? undefined : tooltipId}
      onFocus={() => setHoverIdx(current => current ?? n - 1)}
      onKeyDown={(e) => {
        if (e.key === "Escape") { setHoverIdx(null); return; }
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
        e.preventDefault();
        setHoverIdx(current => e.key === "Home" ? 0 : e.key === "End" ? n - 1 : Math.max(0, Math.min(n - 1, (current ?? n - 1) + (e.key === "ArrowLeft" ? -1 : 1))));
      }}
      onPointerDown={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        if (rect.width > 0) setHoverIdx(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - rect.left) / rect.width) * (n - 1)))));
      }}
      onPointerMove={(e) => {
        if (e.pointerType === "touch") return;
        const rect = e.currentTarget.getBoundingClientRect();
        if (rect.width === 0) return;
        const idx = Math.round(((e.clientX - rect.left) / rect.width) * (n - 1));
        setHoverIdx(Math.max(0, Math.min(n - 1, idx)));
      }}
    >
    <svg
      viewBox={`0 0 ${w} ${h}`}
      data-point-count={n}
      style={{ width: "100%", height: 300, display: "block" }}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${t("triView.pmc.title")}. ${t("triView.pmc.sub")}`}
    >
      {/* 가이드 라인 */}
      {[0, 0.25, 0.5, 0.75, 1].map((p) => (
        <ChartGridLine
          key={p}
          x1="0"
          x2={w}
          y1={h * p}
          y2={h * p}
        />
      ))}
      <ChartAxisLine
        x1="0"
        x2={w}
        y1={sy(0)}
        y2={sy(0)}
        strokeDasharray="3 3"
      />

      {/* 스택 영역 */}
      <path d={bikeArea} fill={DISCIPLINE_CHART_COLORS.bike} opacity="0.28" />
      <path d={runArea} fill={DISCIPLINE_CHART_COLORS.run} opacity="0.28" />
      <path d={swimArea} fill={DISCIPLINE_CHART_COLORS.swim} opacity="0.32" />

      {/* 총 CTL 라인 */}
      <path d={linePath(totCtl)} stroke={PMC_LINE_PALETTE.ctl.color} strokeWidth={PMC_LINE_PALETTE.ctl.strokeWidth} strokeLinecap={PMC_LINE_PALETTE.ctl.linecap} vectorEffect="non-scaling-stroke" fill="none" />

      {/* ATL */}
      <path d={linePath(atl)} stroke={PMC_LINE_PALETTE.atl.color} strokeWidth={PMC_LINE_PALETTE.atl.strokeWidth} strokeDasharray={PMC_LINE_PALETTE.atl.dasharray} strokeLinecap={PMC_LINE_PALETTE.atl.linecap} vectorEffect="non-scaling-stroke" fill="none" />

      {/* TSB */}
      <path d={linePath(tsb)} stroke={PMC_LINE_PALETTE.tsb.color} strokeWidth={PMC_LINE_PALETTE.tsb.strokeWidth} strokeDasharray={PMC_LINE_PALETTE.tsb.dasharray} strokeLinecap={PMC_LINE_PALETTE.tsb.linecap} vectorEffect="non-scaling-stroke" fill="none" />

      {/* 오늘(마지막) 마커 */}
      <line
        x1={sx(n - 1)}
        x2={sx(n - 1)}
        y1="0"
        y2={h}
        stroke="var(--ink-2)"
        strokeDasharray="2 2"
        opacity="0.5"
      />
      <circle
        cx={sx(n - 1)}
        cy={sy(totCtl[n - 1]!)}
        r="4"
        fill={PMC_LINE_PALETTE.ctl.color}
        stroke="var(--primary-fg)"
        strokeWidth="2"
      />

      <line x1={sx(hi)} x2={sx(hi)} y1="0" y2={h} stroke="var(--ink-2)" strokeWidth="1" opacity="0.55" strokeDasharray="2 2" />
    </svg>
    <div className="tri-fitness__date-axis" aria-label={t("triView.chart.dateAxis")}>
      {labelIndices.map(index => <span key={index}>{dates[index] ? formatLabel(dates[index]!) : "—"}</span>)}
    </div>
    <div className="tri-fitness__today-label">{t("triView.today")} · {dates[n - 1]}</div>
      <Card variant="inset" padding="compact" id={tooltipId} role="status">
      <Text as="p" variant="bodySmall">{dates[hi]}</Text>
      <Text as="p" variant="bodySmall" tone="secondary">{t("triView.chart.pmcBasis")} {t("chartDetail.pmcUnit")}</Text>
      <div className="tri-fitness__fixed-values">{([
        { label: t("triView.totalCtl"), value: totCtl[hi] },
        { label: `${t("discipline.bike")} CTL`, value: bikeCtl[hi] },
        { label: `${t("discipline.run")} CTL`, value: runCtl[hi] },
        { label: `${t("discipline.swim")} CTL`, value: swimCtl[hi] },
        { label: "ATL", value: atl[hi] }, { label: "TSB", value: tsb[hi] },
      ]).filter(item => isSportUiEnabled("swim") || item.label !== `${t("discipline.swim")} CTL`).map(item => <ChartValue key={item.label} primary={item.value == null ? t("triView.chart.unknown") : `${item.label === "TSB" && item.value >= 0 ? "+" : ""}${item.value.toFixed(1)}`} secondary={item.label} />)}</div>
    </Card>
    <p className="tri-fitness__chart-hint">{t("triView.chart.interactionHint")}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 종목별 기여도 도넛
// ─────────────────────────────────────────────────────────────────────────────
interface PerDisciplineCardProps {
  label: string;
  color: string;
  ctl: number[];
  dates: string[];
  delta: number | null;
  tss: string;
  dist: string;
  unit: string;
  lastSess: string;
  href: string;
  disabled?: boolean;
}

function PerDisciplineCard({ label, color, ctl, dates, delta, tss, dist, unit, lastSess, href, disabled = false }: PerDisciplineCardProps) {
  const { t } = useTranslation("fitness");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const w = 180, h = 48;
  const max = Math.max(...ctl);
  const min = Math.min(...ctl);
  const sx = (i: number) => ctl.length <= 1 ? w / 2 : (i / (ctl.length - 1)) * w;
  const sy = (v: number) => h - ((v - min) / (max - min || 1)) * h;
  const path = ctl.map((v, i) => `${i ? "L" : "M"}${sx(i)} ${sy(v ?? 0)}`).join(" ");
  const area = `M0 ${h} ${path.replace(/^M/, "L")} L${w} ${h} Z`;

  const content = (
      <Card variant="bare" padding="none" style={{ padding: 'var(--space-4)', display: "flex", flexDirection: "column", gap: "var(--space-2)", color: "inherit" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 'var(--space-2)' }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
        <Text variant="caption">{label}</Text>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)" }}>{disabled ? t("common:discipline.comingSoon") : "→"}</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-1-5)" }}>
        <Text variant="dataHero" style={{ fontSize: "var(--fs-3xl)", color, fontFamily: "var(--font-mono)" }}>
          {ctl.length > 0 ? ctl[ctl.length - 1]!.toFixed(1) : "—"}
        </Text>
        <Text variant="unit">CTL</Text>
        <span style={{ flex: 1 }} />
        <Text variant="mono" style={{ fontSize: "var(--fs-xs)", color: delta != null && delta >= 0 ? "var(--lime)" : "var(--rose)" }}>
          {delta == null ? "—" : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`}
        </Text>
      </div>
      <Text variant="caption" tone="tertiary">{t("triView.previousCtl")}</Text>
      {ctl.length > 0 && (
        <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: 48 }} preserveAspectRatio="none"
          tabIndex={0} role="img" aria-label={`${label} CTL`}
          onFocus={() => setSelectedIndex(ctl.length - 1)} onBlur={() => setSelectedIndex(null)}
          onPointerMove={(event) => { if (event.pointerType === "touch") return; const rect = event.currentTarget.getBoundingClientRect(); if (rect.width) setSelectedIndex(Math.max(0, Math.min(ctl.length - 1, Math.round((event.clientX - rect.left) / rect.width * (ctl.length - 1))))); }}
          onPointerLeave={(event) => { if (event.pointerType !== "touch") setSelectedIndex(null); }}
          onClick={(event) => { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); if (rect.width) setSelectedIndex(Math.max(0, Math.min(ctl.length - 1, Math.round((event.clientX - rect.left) / rect.width * (ctl.length - 1))))); }}
          onKeyDown={(event) => {
            if (event.key === "Escape") { setSelectedIndex(null); return; }
            if (!["ArrowLeft", "ArrowRight", "Home", "End", "Enter", " "].includes(event.key)) return;
            event.preventDefault(); event.stopPropagation();
            setSelectedIndex(current => event.key === "Home" ? 0 : event.key === "End" ? ctl.length - 1 : Math.max(0, Math.min(ctl.length - 1, (current ?? ctl.length - 1) + (event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0))));
          }}>
          <title>{`${label} · CTL ${ctl[ctl.length - 1]!.toFixed(1)} · ${t("triView.perDisciplineCard.recentDays", { n: ctl.length })}`}</title>
          <path d={area} fill={color} opacity="0.18" />
          <path d={path} stroke={color} strokeWidth="1.5" fill="none" />
        </svg>
      )}
      {selectedIndex != null && <div role="status" className="tri-fitness__chart-readout">{dates[selectedIndex]} · {label} CTL {ctl[selectedIndex]?.toFixed(1)}<p>{t("chartDetail.pmcUnit")}</p></div>}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "var(--fs-xs)",
          color: "var(--ink-3)",
          paddingTop: 6,
          borderTop: "1px solid var(--line-soft)",
        }}
      >
        <span><Text variant="mono" style={{ color: "var(--ink-1)" }}>{tss}</Text> {t("triView.tssPerWeek")}</span>
        <span><Text variant="mono" style={{ color: "var(--ink-1)" }}>{dist}</Text> {unit}</span>
      </div>
      <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)" }}>{lastSess}</div>
      </Card>
  );
  return disabled ? <div role="group" data-testid="K1-8-3" aria-disabled="true" aria-label={`${label} · ${t("common:discipline.comingSoon")}`}>{content}</div>
    : <Link data-testid="K1-8-3" to={href} className="block no-underline" style={{ color: "inherit" }}>{content}</Link>;
}

// ─────────────────────────────────────────────────────────────────────────────
// 일별 부하 바 차트 (3종목 스택)
// ─────────────────────────────────────────────────────────────────────────────
type DailyBarEntry = { date: string; bike: number | null; run: number | null; swim: number | null; unknownCount: number };

const BIKE_COLOR = DISCIPLINE_CHART_COLORS.bike;

function recentCalendarDays<T extends { date: string }>(points: readonly T[], days: number): T[] {
  const latestDate = points[points.length - 1]?.date;
  if (!latestDate) return [];
  const cutoff = new Date(Date.parse(`${latestDate}T00:00:00.000Z`) - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  return points.filter((point) => point.date >= cutoff);
}

function DailyLoadChart({ data }: { data: DailyBarEntry[] }) {
  const { t } = useTranslation("fitness");
  const { t: trainingT } = useTranslation("training");
  const max = Math.max(300, ...data.map(entry => (entry.bike ?? 0) + (entry.run ?? 0) + (entry.swim ?? 0)));
  const entries = data.length > 0 ? data : ([] as DailyBarEntry[]);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const hover = entries[hoverIdx ?? entries.length - 1] ?? null;
  const tooltipId = useId();

  if (entries.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "flex-end", gap: "var(--space-0-5)", height: 110 }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-4)", fontSize: "var(--fs-xs)" }}>
          {t("daily.empty")}
        </div>
      </div>
    );
  }

  return (
    <div className="tri-fitness__interactive-chart" data-daily-point-count={entries.length}
      role="group" tabIndex={0} aria-label={t("daily.title")}
      aria-describedby={hover ? tooltipId : undefined}
      onFocus={() => setHoverIdx(current => current ?? entries.length - 1)}
      onKeyDown={(e) => {
        if (e.key === "Escape") { setHoverIdx(null); return; }
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
        e.preventDefault();
        setHoverIdx(current => e.key === "Home" ? 0 : e.key === "End" ? entries.length - 1 : Math.max(0, Math.min(entries.length - 1, (current ?? entries.length - 1) + (e.key === "ArrowLeft" ? -1 : 1))));
      }}>

      <div
        style={{ display: "flex", alignItems: "flex-end", gap: "var(--space-0-5)", height: 110 }}
        >
        {entries.map((entry, i) => {
          const bike = entry.bike ?? 0;
          const run = entry.run ?? 0;
          const swim = entry.swim ?? 0;
          const isRest = entry.bike === 0 && entry.run === 0 && entry.swim === 0 && !entry.unknownCount;
          const dim = hoverIdx != null && hoverIdx !== i ? 0.5 : 1;
          return (
            <div
              key={i}
              onPointerEnter={(e) => { if (e.pointerType !== "touch") setHoverIdx(i); }}
              onPointerDown={() => setHoverIdx(i)}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
                gap: 1,
                height: "100%",
                minWidth: 0,
                opacity: dim,
                transition: "opacity 0.12s",
                cursor: "default",
              }}
            >
              {isRest ? (
                <div style={{ height: 4, background: "var(--bg-3)", borderRadius: "var(--r-xs)", opacity: 0.4 }} />
              ) : (
                <>
                  {/* 스택 순서: 바이크(하단), 러닝(중간), 수영(상단) */}
                  <div style={{ height: `${(swim / max) * 100}%`, background: DISCIPLINE_CHART_COLORS.swim, borderRadius: swim > 0 ? "1px 1px 0 0" : 0, minHeight: swim > 0 ? 2 : 0 }} />
                  <div style={{ height: `${(run / max) * 100}%`, background: DISCIPLINE_CHART_COLORS.run, borderRadius: run > 0 && swim === 0 ? "1px 1px 0 0" : 0, minHeight: run > 0 ? 2 : 0 }} />
                  <div style={{ height: `${(bike / max) * 100}%`, background: BIKE_COLOR, borderRadius: bike > 0 && run === 0 && swim === 0 ? "1px 1px 0 0" : 0, minHeight: bike > 0 ? 2 : 0 }} />
                  {entry.unknownCount > 0 && <div aria-label={trainingT("log.loadPartial", { count: entry.unknownCount })} style={{ height: 4, borderTop: "1px dashed var(--ink-3)" }} />}
                </>
              )}
            </div>
          );
        })}
      </div>
      {hover && (
        <div id={tooltipId} role="status" className="tri-fitness__chart-readout">
          <p>{t("triView.chart.dailyBasis")}</p>
          <div style={{ fontSize: "var(--fs-xs)", fontFamily: "var(--font-mono)", color: "var(--ink-2)", marginBottom: "var(--space-0-5)" }}>{hover.date}</div>
          {([
            [`${t("discipline.bike")} · bTSS`, hover.bike, BIKE_COLOR],
            [`${t("discipline.run")} · rTSS`, hover.run, DISCIPLINE_CHART_COLORS.run],
            [`${t("discipline.swim")} · sTSS`, hover.swim, DISCIPLINE_CHART_COLORS.swim],
          ] as const).filter(([, , color]) => isSportUiEnabled("swim") || color !== DISCIPLINE_CHART_COLORS.swim).map(([label, v, color]) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: "var(--space-1-5)", fontSize: "var(--fs-xs)", fontFamily: "var(--font-mono)" }}>
              <span style={{ width: 8, height: 8, borderRadius: "var(--r-xs)", background: color, flexShrink: 0 }} />
              <span style={{ color: "var(--ink-2)", minWidth: 44 }}>{label}</span>
              <span style={{ color: "var(--ink-0)", fontWeight: 700, marginLeft: "auto" }}>{v == null ? t("triView.chart.unknown") : Math.round(v)}</span>
            </div>
          ))}
          {hover.unknownCount > 0 && <Text as="p" variant="caption" tone="secondary">{trainingT("log.loadPartial", { count: hover.unknownCount })}</Text>}
          <div style={{ marginTop: "var(--space-1)", paddingTop: 3, borderTop: "1px solid var(--line-soft)", display: "flex", gap: "var(--space-1-5)", fontSize: "var(--fs-xs)", fontFamily: "var(--font-mono)" }}>
            <span style={{ color: "var(--ink-3)" }}>{t(hover.bike == null || hover.run == null || hover.swim == null || hover.unknownCount > 0 ? "triView.chart.partialTotal" : "triView.total")}</span>
            <span style={{ color: "var(--ink-0)", fontWeight: 700, marginLeft: "auto" }}>{hover.bike == null && hover.run == null && hover.swim == null ? "—" : Math.round((hover.bike ?? 0) + (hover.run ?? 0) + (hover.swim ?? 0))} TSS</span>
          </div>
        </div>
      )}
      <p className="tri-fitness__chart-hint">{t("triView.chart.interactionHint")}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 범례 아이템 키 정의 (모듈 레벨 — 번역은 컴포넌트 내부에서)
// ─────────────────────────────────────────────────────────────────────────────
const LEGEND_ITEM_KEYS = [
  { type: "rect" as const, color: DISCIPLINE_CHART_COLORS.bike, opacity: 0.4, key: "discipline.bike" },
  { type: "rect" as const, color: DISCIPLINE_CHART_COLORS.run, opacity: 0.4, key: "discipline.run" },
  { type: "rect" as const, color: DISCIPLINE_CHART_COLORS.swim, opacity: 0.5, key: "discipline.swim" },
  { type: "line" as const, ...PMC_LINE_PALETTE.ctl, opacity: 1, key: "triView.legend.totalCtl" },
  { type: "line" as const, ...PMC_LINE_PALETTE.atl, opacity: 1, key: "pmc.legend.atl" },
  { type: "line" as const, ...PMC_LINE_PALETTE.tsb, opacity: 1, key: "pmc.legend.tsb" },
];

// ─────────────────────────────────────────────────────────────────────────────
// TriFitnessView
// ─────────────────────────────────────────────────────────────────────────────
export default function TriFitnessView({ condition = false, evidenceOnly = false, range, selectedHistoryRange = range, breakdown: triBreakdown, timeline, combinedLoad, loadFocus, historySlot, thresholdsSlot, hasThresholdSettings = Boolean(thresholdsSlot), loading = false }: TriFitnessViewProps) {
  const { t } = useTranslation("fitness");
  const { t: trainingT } = useTranslation("training");

  const weeklyEvidence = Object.fromEntries((["bike", "run", "swim"] as const).map(discipline => {
    const entry = triBreakdown[discipline];
    const today = fitnessTodayKey(Date.now(), entry.dateKeyBasis);
    const weekStart = addFitnessDateKeyDays(today, -6);
    const days = (entry.dailyData ?? []).filter(day => day.date >= weekStart && day.date <= today);
    const unknownCount = entry.weeklyUnknownCount ?? days.reduce((sum, day) => sum + (day.unknownCount ?? 0), 0);
    const known = entry.hasKnownWeeklyLoad ?? (days.some(day => day.activities.length > 0 || day.totalLoad > 0)
      || entry.fitness.some(point => point.date >= weekStart && point.date <= today));
    return [discipline, { unknownCount, known, display: known ? Math.round(entry.weeklyTSS ?? 0).toString() : "—" }];
  })) as Record<"bike" | "run" | "swim", { unknownCount: number; known: boolean; display: string }>;
  const weeklyUnknownCount = Object.values(weeklyEvidence).reduce((sum, entry) => sum + entry.unknownCount, 0);
  const displayedWeeklyTss = Object.values(weeklyEvidence).some(entry => entry.known)
    ? Math.round((triBreakdown.bike.weeklyTSS ?? 0) + (triBreakdown.run.weeklyTSS ?? 0) + (triBreakdown.swim.weeklyTSS ?? 0)).toString()
    : "—";

  // ── CTL 스파크라인 (최근 28일 FitnessPoint에서 추출) ───────────────────────
  const bikeSpark = timeline.length > 0
    ? timeline.slice(-28).flatMap(point => point.bike ? [point.bike.ctl] : [])
    : triBreakdown.bike.fitness.slice(-28).map(point => point.ctl);
  const runSpark = timeline.length > 0
    ? timeline.slice(-28).flatMap(point => point.run ? [point.run.ctl] : [])
    : triBreakdown.run.fitness.slice(-28).map(point => point.ctl);
  const swimSpark = timeline.length > 0
    ? timeline.slice(-28).flatMap(point => point.swim ? [point.swim.ctl] : [])
    : triBreakdown.swim.fitness.slice(-28).map(point => point.ctl);

  const sparkDates = Object.fromEntries((["bike", "run", "swim"] as const).map(discipline => [discipline,
    timeline.length > 0 ? timeline.slice(-28).filter(point => point[discipline]).map(point => point.date) : triBreakdown[discipline].fitness.slice(-28).map(point => point.date),
  ])) as Record<"bike" | "run" | "swim", string[]>;

  // 종목별 CTL 근거가 없으면 숫자와 차트를 미확인 상태로 표시한다.

  // ── 일별 부하 차트 데이터 (최근 42일) ────────────────────────────────────
  const dailyLoadData = useMemo((): DailyBarEntry[] => {
    // 확정 일별 부분합은 통합 PMC 유무와 독립이다. 미확인 종목을 휴식 0으로 만들지 않는다.
    const days = new Map<string, DailyBarEntry>();
    for (const discipline of ["bike", "run", "swim"] as const) {
      const entry = triBreakdown[discipline];
      const now = new Date();
      const today = entry.canonical ? fitnessTodayKey(now.getTime(), entry.dateKeyBasis)
        : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - 41 * 86_400_000).toISOString().slice(0, 10);
      const source = entry.dailyData ?? entry.fitness.map(point => ({ date: point.date, totalLoad: point.dailyLoad, activities: [], unknownCount: 0 }));
      for (const day of source) {
        if (day.date < cutoff || day.date > today) continue;
        const bar = days.get(day.date) ?? { date: day.date, bike: null, run: null, swim: null, unknownCount: 0 };
        bar[discipline] = day.unknownCount && !day.activities.length && day.totalLoad === 0 ? null : day.totalLoad;
        bar.unknownCount += day.unknownCount ?? 0;
        days.set(day.date, bar);
      }
    }
    return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [triBreakdown]);

  // ── PMC 실데이터 시계열 (rangeLocal 일 기준) ─────────────────────────────
  const pmcSeries = useMemo(() => {
    // 최신 기록일을 기준으로 실제 달력 N일만 포함한다. sparse 이력에서 N개 기록점을
    // N일로 오인하지 않도록 모든 series/date가 같은 cutoff 결과를 공유한다.
    const sliced = recentCalendarDays(timeline, range);
    return {
      bikeCtl: sliced.map((point) => point.bike?.ctl ?? null),
      runCtl: sliced.map((point) => point.run?.ctl ?? null),
      swimCtl: sliced.map((point) => point.swim?.ctl ?? null),
      totCtl: sliced.map((point) => point.integrated.ctl),
      atl: sliced.map((point) => point.integrated.atl),
      tsb: sliced.map((point) => point.integrated.tsb),
      dates: sliced.map((point) => point.date),
    };
  }, [range, timeline]);

  const dailyLegendItems = [
    { color: DISCIPLINE_CHART_COLORS.bike, label: t("discipline.bike") },
    { color: DISCIPLINE_CHART_COLORS.run, label: t("discipline.run") },
    { color: DISCIPLINE_CHART_COLORS.swim, label: t("discipline.swim") },
    { color: "var(--bg-3)",            label: t("load.rest") },
  ];

  const disciplineEvidence = <>
      {/* IntegratedLoadCard는 현재 snapshot/기여도/포커스, 이 PMC는 시간 추이만 담당한다. */}
      <ChartFrame variant="card" header={<ChartHeader size="compact" title={<h3>{t("triView.pmc.title")}</h3>} description={<>{t("triView.pmc.sub")}<Text as="p" variant="bodySmall" data-testid="tri-legacy-range-note">{t(selectedHistoryRange === "3y" || selectedHistoryRange === "all" ? "triView.pmc.legacyRangeLong" : "triView.pmc.legacyRange", { days: range, selected: t(`history.range.${selectedHistoryRange}`) })}</Text></>} />}>
        <ChartLegend items={LEGEND_ITEM_KEYS.filter(item => item.key !== "discipline.swim" || isSportUiEnabled("swim")).map(item => ({ label: t(item.key), color: item.color, dasharray: item.type === "line" ? item.dasharray : undefined }))} />
        <TripleStackPMC
          bikeCtl={pmcSeries.bikeCtl}
          runCtl={pmcSeries.runCtl}
          swimCtl={pmcSeries.swimCtl}
          totCtl={pmcSeries.totCtl}
          atl={pmcSeries.atl}
          tsb={pmcSeries.tsb}
          dates={pmcSeries.dates}
        />

      </ChartFrame>

      <Section headingLevel={3} title={t("triView.model.title")} description={t("triView.model.desc")} />

  </>;

  return (
    <div data-testid={evidenceOnly ? "condition-tri-mobile-evidence" : "K1-8"}>
      {/* 헤더 — PageHeader 패턴 */}
      {/* 헤더 — 사이클·러닝 화면과 같은 제목 줄(제목 + 오른쪽 끝 종목 전환). 통합을 골라도 전환 위치가 그대로다. */}
      {!evidenceOnly && <div className={`site-shell fitness-page-header tri-fitness__header${condition ? " condition-page-header" : ""}`}>
        <div className="fitness-page-header__title-row">
          <div className="fitness-page-header__heading">
            <Text as="h1" variant="pageTitle" data-testid="K1-0-1">
              {t(condition ? "condition.header.title" : "triView.header.title")}
            </Text>
            <Text as="div" variant="caption" className="fitness-page-header__eyebrow">{t("triView.header.eyebrow")}</Text>
          </div>
          <div><DisciplineTabs includeTri disabledKeys={["swim"]} /></div>
        </div>
        <div className="fitness-page-header__subtitle">
          {t("triView.header.subtitle")}
        </div>
      </div>}

      <div className={evidenceOnly ? "tri-fitness__mobile-evidence" : "site-shell"} style={{ padding: evidenceOnly ? "var(--space-4)" : "var(--space-5) var(--space-6) var(--space-8)" }}>

      {!evidenceOnly && loading && !combinedLoad && <Text as="p" role="status">{t("condition.current.loading")}</Text>}
      {!evidenceOnly && (historySlot || combinedLoad) && <div data-testid="K1-8-1" className="tri-fitness__primary">
        {combinedLoad && <div id={condition ? "condition-current" : undefined} tabIndex={condition ? -1 : undefined} className="tri-fitness__primary-summary condition-section-target"><IntegratedLoadCard combined={combinedLoad} focus={loadFocus} condition={condition} /></div>}
      {condition && !evidenceOnly && <ConditionSectionNav sections={[
        ...(combinedLoad ? [{ id: "condition-current", label: t("condition.current.title") }] : []),
        ...(historySlot ? [{ id: "condition-trend", label: t("history.title") }] : []),
        { id: "condition-load", label: t("condition.load.title") },
        { id: "condition-metrics", label: t("condition.metrics.triTitle") },
        ...(hasThresholdSettings ? [{ id: "thresholds", label: t("condition.settings.title") }] : []),
      ]} />}
        {historySlot && <div id={condition ? "condition-trend" : undefined} tabIndex={condition ? -1 : undefined} className="tri-fitness__primary-trend condition-section-target">{historySlot}</div>}
      </div>}

      {!condition && <div data-testid="K1-8-2"><DetailsSection title={t("history.disciplineDetails")} defaultOpen={!historySlot}>{disciplineEvidence}</DetailsSection></div>}

      {/* 일별 운동 부하 — 현재 기여도는 상단 IntegratedLoadCard 한 곳에만 표시한다. */}
      <div id={condition && !evidenceOnly ? "condition-load" : undefined} className="condition-section-target" tabIndex={condition && !evidenceOnly ? -1 : undefined} style={{ marginTop: 'var(--space-5)' }}>
        {/* 일별 운동 부하 */}
        <Card padding="none" style={{ padding: 'var(--space-5)' }}>
          <div style={{ marginBottom: "var(--space-3)" }}>
            <h3 style={{ margin: 0, marginBottom: "var(--space-1)", fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--ink-0)" }}>
              {t("daily.title")}
            </h3>
            <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>{t("triView.daily.sub")}</div>
          </div>
          <DailyLoadChart data={dailyLoadData} />
          {/* 범례 */}
          <div style={{ marginTop: "var(--space-3)", display: "flex", gap: "var(--space-3)", fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>
            {dailyLegendItems.filter(item => item.color !== DISCIPLINE_CHART_COLORS.swim || isSportUiEnabled("swim")).map((item) => (
              <span key={item.label} style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
                <span style={{ width: 10, height: 10, background: item.color, borderRadius: "var(--r-xs)" }} />
                {item.label}
              </span>
            ))}
          </div>
          {/* 주간 요약 */}
          <div
            className="tri-fitness__weekly"
            style={{
              marginTop: 'var(--space-4)',
              paddingTop: 14,
              borderTop: "1px solid var(--line-soft)",
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "var(--space-3)",
            }}
          >
            <div>
              <Text as="div" variant="caption" style={{ fontSize: "var(--fs-xs)", marginBottom: "var(--space-1)" }}>{t("daily.weekTSS")}</Text>
              <div><Text variant="dataMedium">{displayedWeeklyTss}</Text><Text variant="unit"> {t("triView.total")}</Text></div>
            </div>
            <div>
              <Text as="div" variant="caption" style={{ fontSize: "var(--fs-xs)", marginBottom: "var(--space-1)" }}>{t("discipline.bike")}</Text>
              <div><Text variant="dataMedium">{weeklyEvidence.bike.display}</Text><Text variant="unit"> TSS</Text></div>
            </div>
            <div>
              <Text as="div" variant="caption" style={{ fontSize: "var(--fs-xs)", marginBottom: "var(--space-1)" }}>{t("discipline.run")}</Text>
              <div><Text variant="dataMedium">{weeklyEvidence.run.display}</Text><Text variant="unit"> TSS</Text></div>
            </div>
            {isSportUiEnabled("swim") && <div>
              <Text as="div" variant="caption" style={{ fontSize: "var(--fs-xs)", marginBottom: "var(--space-1)" }}>{t("discipline.swim")}</Text>
              <div><Text variant="dataMedium">{weeklyEvidence.swim.display}</Text><Text variant="unit"> TSS</Text></div>
            </div>}
          </div>
        </Card>
      </div>

      {Object.values(triBreakdown).some(entry => entry.weeklyTSS === null) && Object.values(weeklyEvidence).some(entry => entry.known) && <Text as="p" variant="caption" tone="secondary">{t("history.partial")}</Text>}
      {weeklyUnknownCount > 0 && <Text as="p" variant="caption" tone="secondary">{trainingT("log.loadPartial", { count: weeklyUnknownCount })}</Text>}

      {/* 종목별 드릴다운 카드 */}
      <div id={condition && !evidenceOnly ? "condition-metrics" : undefined} className="condition-section-target" tabIndex={condition && !evidenceOnly ? -1 : undefined} style={{ marginTop: 'var(--space-5)' }}>
        {condition && <div data-testid="K1-8-2"><section aria-label={t("history.disciplineDetails")}>{disciplineEvidence}</section></div>}
        <div style={{ display: "flex", alignItems: "baseline", marginBottom: 'var(--space-3)' }}>
          <h3 style={{ margin: 0, fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--ink-0)" }}>{t("discipline.summary.title")}</h3>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)" }}>{t("triView.disciplineCards.hint")}</span>
        </div>
        <div className="tri-fitness__sport-cards">
          <PerDisciplineCard label={t("triView.cycling")} color={DISCIPLINE_CHART_COLORS.bike} ctl={bikeSpark} dates={sparkDates.bike} delta={bikeSpark.length >= 2 ? bikeSpark[bikeSpark.length - 1]! - bikeSpark[bikeSpark.length - 2]! : null} tss={weeklyEvidence.bike.display} dist="—" unit="km" lastSess={bikeSpark.length > 0 ? t("triView.liveData") : t("daily.empty")} href="/coach/condition?sport=bike" />
          <PerDisciplineCard label={t("discipline.run")} color={DISCIPLINE_CHART_COLORS.run} ctl={runSpark} dates={sparkDates.run} delta={runSpark.length >= 2 ? runSpark[runSpark.length - 1]! - runSpark[runSpark.length - 2]! : null} tss={weeklyEvidence.run.display} dist="—" unit="km" lastSess={runSpark.length > 0 ? t("triView.liveData") : t("daily.empty")} href="/coach/condition?sport=run" />
          {isSportUiEnabled("swim") && <PerDisciplineCard disabled label={t("discipline.swim")} color={DISCIPLINE_CHART_COLORS.swim} ctl={swimSpark} dates={sparkDates.swim} delta={swimSpark.length >= 2 ? swimSpark[swimSpark.length - 1]! - swimSpark[swimSpark.length - 2]! : null} tss={weeklyEvidence.swim.display} dist="—" unit="km" lastSess={swimSpark.length > 0 ? t("triView.liveData") : t("daily.empty")} href="/coach/condition?sport=swim" />}
        </div>
      </div>
      {!evidenceOnly && thresholdsSlot}
      </div>
    </div>
  );
}
