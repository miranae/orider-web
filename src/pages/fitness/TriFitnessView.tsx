import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { LocalizedLink as Link } from "../../components/LocalizedLink";
import DisciplineTabs from "../../components/redesign/DisciplineTabs";
import { Card, Text } from "../../theme/components";
import IntegratedLoadCard, { type CombinedLoadStatus } from "../../components/mobile/IntegratedLoadCard";
import type { LoadFocusResult } from "../../features/fitness/multisportPerformance";
import { DISCIPLINE_CHART_COLORS, PMC_LINE_PALETTE } from "../../features/fitness/chartPalette";
import type { TriFitnessBreakdown, TriFitnessTimelinePoint } from "../../hooks/useFitnessModel";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────
type TriRange = 42 | 90 | 180 | 365;

interface TriFitnessViewProps {
  range: number;
  onRangeChange: (range: TriRange) => void;
  breakdown: TriFitnessBreakdown;
  timeline: TriFitnessTimelinePoint[];
  combinedLoad: CombinedLoadStatus | null;
  loadFocus: LoadFocusResult;
}


// ─────────────────────────────────────────────────────────────────────────────
// TripleStackPMC SVG 차트 — 실데이터 기반
// ─────────────────────────────────────────────────────────────────────────────
interface PMCSeriesProps {
  bikeCtl: number[];
  runCtl: number[];
  swimCtl: number[];
  totCtl: number[];
  atl: number[];
  tsb: number[];
  /** 날짜 레이블 배열 (YYYY-MM-DD), totCtl과 동일 길이 */
  dates: string[];
}

function TripleStackPMC({ bikeCtl = [], runCtl = [], swimCtl = [], totCtl = [], atl = [], tsb = [], dates = [] }: Partial<PMCSeriesProps>) {
  const { t } = useTranslation("fitness");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
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
    arr.map((v, i) => `${i ? "L" : "M"}${sx(i)} ${sy(v)}`).join(" ");

  // 스택 영역: bike(하단) → bike+run → bike+run+swim
  const bikeArea =
    `M${sx(0)} ${sy(0)} ` +
    bikeCtl.map((v, i) => `L${sx(i)} ${sy(v)}`).join(" ") +
    ` L${sx(n - 1)} ${sy(0)} Z`;

  const runArea =
    bikeCtl.map((v, i) => `${i ? "L" : "M"}${sx(i)} ${sy(v)}`).join(" ") +
    " " +
    bikeCtl
      .map((_, i) => {
        const idx = n - 1 - i;
        return `L${sx(idx)} ${sy(bikeCtl[idx]! + runCtl[idx]!)}`;
      })
      .join(" ") +
    " Z";

  const swimArea =
    bikeCtl.map((v, i) => `${i ? "L" : "M"}${sx(i)} ${sy(v + runCtl[i]!)}`).join(" ") +
    " " +
    bikeCtl
      .map((_, i) => {
        const idx = n - 1 - i;
        return `L${sx(idx)} ${sy(bikeCtl[idx]! + runCtl[idx]! + swimCtl[idx]!)}`;
      })
      .join(" ") +
    " Z";

  // 날짜 레이블: 시작, 1/4, 중간, 3/4, 끝
  const labelIndices = [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4), n - 1];
  const formatLabel = (dateStr: string) => {
    const [, m, d] = dateStr.split("-");
    return t("triView.dateLabel", { month: parseInt(m!), day: parseInt(d!) });
  };

  const hi = hoverIdx != null && hoverIdx < n ? hoverIdx : null;
  // 툴팁 앵커(%) — 양 끝 클램프. svg 는 preserveAspectRatio=none 이라 x 가 폭에 선형 매핑됨.
  const anchorPct = hi != null ? Math.min(Math.max((hi / (n - 1 || 1)) * 100, 12), 88) : 0;
  const fmtDate = (s?: string) => (s ? formatLabel(s) : "");

  return (
    <div
      style={{ position: "relative" }}
      onPointerMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        if (rect.width === 0) return;
        const idx = Math.round(((e.clientX - rect.left) / rect.width) * (n - 1));
        setHoverIdx(Math.max(0, Math.min(n - 1, idx)));
      }}
      onPointerLeave={() => setHoverIdx(null)}
    >
    <svg
      viewBox={`0 0 ${w} ${h}`}
      style={{ width: "100%", height: 300, display: "block" }}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${t("triView.pmc.title")}. ${t("triView.pmc.sub")}`}
    >
      {/* 가이드 라인 */}
      {[0, 0.25, 0.5, 0.75, 1].map((p) => (
        <line
          key={p}
          x1="0"
          x2={w}
          y1={h * p}
          y2={h * p}
          stroke="var(--grid-soft)"
        />
      ))}
      <line
        x1="0"
        x2={w}
        y1={sy(0)}
        y2={sy(0)}
        stroke="var(--grid-axis)"
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
      <text x={sx(n - 1) - 40} y="14" fontSize="12" fontFamily="JetBrains Mono" fill="var(--ink-2)">
        {t("triView.today")}
      </text>
      <circle
        cx={sx(n - 1)}
        cy={sy(totCtl[n - 1]!)}
        r="4"
        fill={PMC_LINE_PALETTE.ctl.color}
        stroke="var(--primary-fg)"
        strokeWidth="2"
      />

      {/* 날짜 레이블 (SVG 내부 하단) */}
      {labelIndices.map((idx) => {
        const label = dates[idx] ? formatLabel(dates[idx]!) : "";
        return (
          <text
            key={idx}
            x={sx(idx)}
            y={h - 4}
            fontSize="12"
            fontFamily="JetBrains Mono"
            fill="var(--ink-4)"
            textAnchor="middle"
          >
            {label}
          </text>
        );
      })}

      {/* 호버 십자선 */}
      {hi != null && (
        <line x1={sx(hi)} x2={sx(hi)} y1="0" y2={h} stroke="var(--ink-2)" strokeWidth="1" opacity="0.55" strokeDasharray="2 2" />
      )}
    </svg>

    {hi != null && (
      <div
        style={{
          position: "absolute",
          top: 4,
          left: `${anchorPct}%`,
          transform: "translateX(-50%)",
          background: "var(--bg-1)",
          border: "1px solid var(--line)",
          borderRadius: "var(--r-md)",
          boxShadow: "var(--shadow-md)",
          padding: "var(--space-2) var(--space-3)",
          pointerEvents: "none",
          whiteSpace: "nowrap",
          zIndex: 5,
          fontFamily: "var(--font-mono)",
          fontSize: "var(--fs-xs)",
        }}
      >
        <div style={{ color: "var(--ink-2)", marginBottom: "var(--space-1)" }}>{fmtDate(dates[hi])}</div>
        {([
          { type: "line", label: t("triView.totalCtl"), value: totCtl[hi], ...PMC_LINE_PALETTE.ctl },
          { type: "rect", label: t("discipline.bike"), value: bikeCtl[hi], color: DISCIPLINE_CHART_COLORS.bike },
          { type: "rect", label: t("discipline.run"), value: runCtl[hi], color: DISCIPLINE_CHART_COLORS.run },
          { type: "rect", label: t("discipline.swim"), value: swimCtl[hi], color: DISCIPLINE_CHART_COLORS.swim },
          { type: "line", label: "ATL", value: atl[hi], ...PMC_LINE_PALETTE.atl },
          { type: "line", label: "TSB", value: tsb[hi], ...PMC_LINE_PALETTE.tsb },
        ] as const).map((item) => (
          <div key={item.label} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            {item.type === "line" ? (
              <svg width="12" height="8" viewBox="0 0 12 8" aria-hidden="true" style={{ display: "block", flex: "0 0 auto" }}>
                <line x1="0" y1="4" x2="12" y2="4" stroke={item.color} strokeWidth="2" strokeDasharray={item.dasharray} strokeLinecap={item.linecap} vectorEffect="non-scaling-stroke" />
              </svg>
            ) : (
              <span style={{ width: 8, height: 8, borderRadius: "var(--r-xs)", background: item.color, flexShrink: 0 }} />
            )}
            <span style={{ color: "var(--ink-2)", minWidth: 56 }}>{item.label}</span>
            <span style={{ color: item.color, fontWeight: 700, marginLeft: "auto" }}>
              {item.value != null && item.label === "TSB" && item.value >= 0 ? "+" : ""}{(item.value ?? 0).toFixed(1)}
            </span>
          </div>
        ))}
      </div>
    )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 종목별 기여도 도넛
// ─────────────────────────────────────────────────────────────────────────────
interface ContribSlice {
  label: string;
  pct: number;
  ctl: number;
  color: string;
}

function ContribDonut({ slices, totalCtl }: { slices: ContribSlice[]; totalCtl: number }) {
  const { t } = useTranslation("fitness");
  const total = slices.reduce((a, s) => a + s.pct, 0) || 1;
  const R = 62, r = 44, cx = 90, cy = 90;
  let acc = 0;
  const arcs = slices.map((s) => {
    const a0 = (acc / total) * Math.PI * 2 - Math.PI / 2;
    acc += s.pct;
    const a1 = (acc / total) * Math.PI * 2 - Math.PI / 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0);
    const x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
    const xi0 = cx + r * Math.cos(a0), yi0 = cy + r * Math.sin(a0);
    const xi1 = cx + r * Math.cos(a1), yi1 = cy + r * Math.sin(a1);
    return {
      ...s,
      d: `M${x0} ${y0} A${R} ${R} 0 ${large} 1 ${x1} ${y1} L${xi1} ${yi1} A${r} ${r} 0 ${large} 0 ${xi0} ${yi0} Z`,
    };
  });

  return (
    <div style={{ display: "flex", gap: "var(--space-4)", alignItems: "center" }}>
      <svg width="180" height="180" viewBox="0 0 180 180" style={{ flexShrink: 0 }}>
        {arcs.map((a, i) => (
          <path key={i} d={a.d} fill={a.color}>
            <title>{`${a.label} · ${a.pct}% · CTL ${a.ctl.toFixed(1)}`}</title>
          </path>
        ))}
        <text x={cx} y={cy - 4} fontSize="12" fontFamily="JetBrains Mono" fill="var(--ink-3)" textAnchor="middle">
          {t("triView.totalCtl")}
        </text>
        <text x={cx} y={cy + 14} fontSize="20" fontFamily="JetBrains Mono" fill="var(--ink-0)" textAnchor="middle" fontWeight="600">
          {totalCtl.toFixed(1)}
        </text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 'var(--space-2)', flex: 1 }}>
        {slices.map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <span style={{ width: 10, height: 10, background: s.color, borderRadius: "var(--r-xs)", flexShrink: 0 }} />
            <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-1)", minWidth: 60 }}>{s.label}</span>
            <Text variant="mono" style={{ fontSize: "var(--fs-xs)", color: "var(--ink-2)", minWidth: 36 }}>{s.pct}%</Text>
            <div style={{ flex: 1, height: 4, background: "var(--bg-3)", borderRadius: "var(--r-xs)", overflow: "hidden" }}>
              <div style={{ width: `${s.pct}%`, height: "100%", background: s.color }} />
            </div>
            <Text variant="mono" style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", minWidth: 32, textAlign: "right" }}>
              {s.ctl.toFixed(1)}
            </Text>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 종목별 드릴다운 카드
// ─────────────────────────────────────────────────────────────────────────────
interface PerDisciplineCardProps {
  label: string;
  color: string;
  ctl: number[];
  delta: number;
  tss: number;
  dist: string;
  unit: string;
  lastSess: string;
  href: string;
}

function PerDisciplineCard({ label, color, ctl, delta, tss, dist, unit, lastSess, href }: PerDisciplineCardProps) {
  const { t } = useTranslation("fitness");
  const w = 180, h = 48;
  const max = Math.max(...ctl);
  const min = Math.min(...ctl);
  const sx = (i: number) => ctl.length <= 1 ? w / 2 : (i / (ctl.length - 1)) * w;
  const sy = (v: number) => h - ((v - min) / (max - min || 1)) * h;
  const path = ctl.map((v, i) => `${i ? "L" : "M"}${sx(i)} ${sy(v)}`).join(" ");
  const area = `M0 ${h} ${path.replace(/^M/, "L")} L${w} ${h} Z`;

  return (
    <Link
      to={href}
      className="ds-card ds-card--bare"
      style={{ padding: 'var(--space-4)', display: "flex", flexDirection: "column", gap: "var(--space-2)", textDecoration: "none", color: "inherit" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 'var(--space-2)' }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
        <Text variant="eyebrow">{label}</Text>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)" }}>→</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-1-5)" }}>
        <Text variant="dataHero" style={{ fontSize: "var(--fs-3xl)", color, fontFamily: "var(--font-mono)" }}>
          {ctl.length > 0 ? ctl[ctl.length - 1]!.toFixed(1) : "0.0"}
        </Text>
        <Text variant="unit">CTL</Text>
        <span style={{ flex: 1 }} />
        <Text variant="mono" style={{ fontSize: "var(--fs-xs)", color: delta >= 0 ? "var(--lime)" : "var(--rose)" }}>
          {delta >= 0 ? "+" : ""}{delta.toFixed(1)}
        </Text>
      </div>
      {ctl.length > 0 && (
        <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: 48 }} preserveAspectRatio="none">
          <title>{`${label} · CTL ${ctl[ctl.length - 1]!.toFixed(1)} · ${t("triView.perDisciplineCard.recentDays", { n: ctl.length })}`}</title>
          <path d={area} fill={color} opacity="0.18" />
          <path d={path} stroke={color} strokeWidth="1.5" fill="none" />
        </svg>
      )}
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
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 일별 부하 바 차트 (3종목 스택)
// ─────────────────────────────────────────────────────────────────────────────
type DailyBarEntry = { date: string; bike: number; run: number; swim: number };

const BIKE_COLOR = DISCIPLINE_CHART_COLORS.bike;

function DailyLoadChart({ data }: { data: DailyBarEntry[] }) {
  const { t } = useTranslation("fitness");
  const max = 300;
  const entries = data.length > 0 ? data : ([] as DailyBarEntry[]);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const hover = hoverIdx != null ? entries[hoverIdx] : null;
  // 양 끝 막대 툴팁이 카드 밖으로 잘리지 않도록 앵커 중심을 [12%, 88%] 로 클램프
  const anchorPct =
    hoverIdx != null ? Math.min(Math.max(((hoverIdx + 0.5) / entries.length) * 100, 12), 88) : 0;

  if (entries.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "flex-end", gap: "var(--space-1)", height: 110 }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-4)", fontSize: "var(--fs-xs)" }}>
          {t("daily.empty")}
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <div
        style={{ display: "flex", alignItems: "flex-end", gap: "var(--space-1)", height: 110 }}
        onPointerLeave={() => setHoverIdx(null)}
      >
        {entries.map(({ bike, run, swim }, i) => {
          const isRest = bike === 0 && run === 0 && swim === 0;
          const dim = hoverIdx != null && hoverIdx !== i ? 0.5 : 1;
          return (
            <div
              key={i}
              onPointerEnter={() => setHoverIdx(i)}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
                gap: 1,
                height: "100%",
                minWidth: 3,
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
                </>
              )}
            </div>
          );
        })}
      </div>
      {hover && (
        <div
          style={{
            position: "absolute",
            top: -6,
            left: `${anchorPct}%`,
            transform: "translate(-50%, -100%)",
            background: "var(--bg-1)",
            border: "1px solid var(--line)",
            borderRadius: "var(--r-md)",
            boxShadow: "var(--shadow-md)",
            padding: "var(--space-2) var(--space-3)",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            zIndex: 5,
          }}
        >
          <div style={{ fontSize: "var(--fs-xs)", fontFamily: "var(--font-mono)", color: "var(--ink-2)", marginBottom: "var(--space-0-5)" }}>{hover.date}</div>
          {([
            [t("discipline.bike"), hover.bike, BIKE_COLOR],
            [t("discipline.run"), hover.run, DISCIPLINE_CHART_COLORS.run],
            [t("discipline.swim"), hover.swim, DISCIPLINE_CHART_COLORS.swim],
          ] as const).map(([label, v, color]) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: "var(--space-1-5)", fontSize: "var(--fs-xs)", fontFamily: "var(--font-mono)" }}>
              <span style={{ width: 8, height: 8, borderRadius: "var(--r-xs)", background: color, flexShrink: 0 }} />
              <span style={{ color: "var(--ink-2)", minWidth: 44 }}>{label}</span>
              <span style={{ color: "var(--ink-0)", fontWeight: 700, marginLeft: "auto" }}>{Math.round(v)}</span>
            </div>
          ))}
          <div style={{ marginTop: "var(--space-1)", paddingTop: 3, borderTop: "1px solid var(--line-soft)", display: "flex", gap: "var(--space-1-5)", fontSize: "var(--fs-xs)", fontFamily: "var(--font-mono)" }}>
            <span style={{ color: "var(--ink-3)" }}>{t("triView.total")}</span>
            <span style={{ color: "var(--ink-0)", fontWeight: 700, marginLeft: "auto" }}>{Math.round(hover.bike + hover.run + hover.swim)} TSS</span>
          </div>
        </div>
      )}
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
export default function TriFitnessView({ range, onRangeChange, breakdown: triBreakdown, timeline, combinedLoad, loadFocus }: TriFitnessViewProps) {
  const { t } = useTranslation("fitness");

  // ── 실데이터 기반 KPI 변수 ─────────────────────────────────────────────────
  const hasData = Object.values(triBreakdown).some((entry) => entry.fitness.length > 0);
  const currentTimelinePoint = timeline[timeline.length - 1];

  const bikeCTL = currentTimelinePoint?.bike?.ctl ?? 0;
  const runCTL = currentTimelinePoint?.run?.ctl ?? 0;
  const swimCTL = currentTimelinePoint?.swim?.ctl ?? 0;
  const totalCTL = bikeCTL + runCTL + swimCTL;

  const bikeATL = currentTimelinePoint?.bike?.atl ?? 0;
  const runATL = currentTimelinePoint?.run?.atl ?? 0;
  const swimATL = currentTimelinePoint?.swim?.atl ?? 0;
  const totalATL = bikeATL + runATL + swimATL;

  const totalTSB = totalCTL - totalATL;
  const displayedWeeklyTss = hasData
    ? Math.round(triBreakdown.bike.weeklyTSS + triBreakdown.run.weeklyTSS + triBreakdown.swim.weeklyTSS).toString()
    : "487";

  const totalForPct = totalCTL || 1;
  const bikePct = Math.round((bikeCTL / totalForPct) * 100);
  const runPct = Math.round((runCTL / totalForPct) * 100);
  // 두 독립 반올림 합이 100 초과 시 swimPct 가 음수 → 도넛 호·막대 width 깨짐(#539). 0 클램프.
  const swimPct = Math.max(0, 100 - bikePct - runPct);

  const contribSlices: ContribSlice[] = [
    { label: t("triView.cycling"), pct: bikePct, ctl: bikeCTL, color: DISCIPLINE_CHART_COLORS.bike },
    { label: t("discipline.run"),  pct: runPct,  ctl: runCTL,  color: DISCIPLINE_CHART_COLORS.run },
    { label: t("discipline.swim"), pct: swimPct, ctl: swimCTL, color: DISCIPLINE_CHART_COLORS.swim },
  ];

  // ── CTL 스파크라인 (최근 28일 FitnessPoint에서 추출) ───────────────────────
  const bikeSpark = timeline.slice(-28).map((point) => point.bike?.ctl ?? 0);
  const runSpark  = timeline.slice(-28).map((point) => point.run?.ctl ?? 0);
  const swimSpark = timeline.slice(-28).map((point) => point.swim?.ctl ?? 0);

  // 스파크 빈 경우 단일 점(0) fallback — PerDisciplineCard가 빈 배열 처리 가능하도록 그냥 전달
  // ctl.length === 0이면 차트 렌더 생략 (컴포넌트 내부에서 처리)

  // ── 일별 부하 차트 데이터 (최근 42일) ────────────────────────────────────
  const dailyLoadData = useMemo((): DailyBarEntry[] => {
    return timeline.slice(-42).map((point) => ({
      date: point.date,
      bike: point.bike?.dailyLoad ?? 0,
      run: point.run?.dailyLoad ?? 0,
      swim: point.swim?.dailyLoad ?? 0,
    }));
  }, [timeline]);

  // ── PMC 실데이터 시계열 (rangeLocal 일 기준) ─────────────────────────────
  const pmcSeries = useMemo(() => {
    // 각 종목의 fitness 배열을 rangeLocal 일 slice
    const sliced = timeline.slice(-range);
    return {
      bikeCtl: sliced.map((point) => point.bike?.ctl ?? 0),
      runCtl: sliced.map((point) => point.run?.ctl ?? 0),
      swimCtl: sliced.map((point) => point.swim?.ctl ?? 0),
      totCtl: sliced.map((point) => point.integrated.ctl),
      atl: sliced.map((point) => point.integrated.atl),
      tsb: sliced.map((point) => point.integrated.tsb),
      dates: sliced.map((point) => point.date),
    };
  }, [range, timeline]);

  const rangeOptions: Array<{ label: string; value: TriRange }> = [
    { label: t("triView.range.6w"), value: 42 },
    { label: t("triView.range.3m"), value: 90 },
    { label: t("triView.range.6m"), value: 180 },
    { label: t("triView.range.1y"), value: 365 },
  ];

  const dailyLegendItems = [
    { color: DISCIPLINE_CHART_COLORS.bike, label: t("discipline.bike") },
    { color: DISCIPLINE_CHART_COLORS.run, label: t("discipline.run") },
    { color: DISCIPLINE_CHART_COLORS.swim, label: t("discipline.swim") },
    { color: "var(--bg-3)",            label: t("load.rest") },
  ];

  return (
    <div>
      {/* 헤더 — PageHeader 패턴 */}
      <div className="site-shell" style={{ padding: "24px 28px 18px", borderBottom: "1px solid var(--line-soft)", display: "flex", alignItems: "flex-end", gap: 'var(--space-6)' }}>
        <div style={{ flex: 1 }}>
          <Text as="div" variant="eyebrow" style={{ marginBottom: 'var(--space-2)' }}>{t("triView.header.eyebrow")}</Text>
          <h1 style={{ fontSize: "var(--fs-3xl)", fontWeight: 700, color: "var(--ink-0)", marginBottom: "var(--space-1-5)" }}>
            {t("triView.header.title")}
          </h1>
          <div style={{ color: "var(--ink-2)", fontSize: "var(--fs-sm)" }}>
            {t("triView.header.subtitle")}
          </div>
        </div>
        <div style={{ display: "flex", gap: 'var(--space-2)', alignItems: "center" }}>
          <DisciplineTabs includeTri />
          <div style={{ display: "flex", gap: "var(--space-0-5)", background: "var(--bg-1)", padding: "var(--space-1)", borderRadius: "var(--r-md)", border: "1px solid var(--line-soft)" }}>
            {rangeOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onRangeChange(opt.value)}
                style={{
                  padding: "5px 12px",
                  fontSize: "var(--fs-xs)",
                  borderRadius: "var(--r-sm)",
                  border: "none",
                  cursor: "pointer",
                  background: range === opt.value ? "var(--bg-3)" : "transparent",
                  color: range === opt.value ? "var(--ink-0)" : "var(--ink-3)",
                  fontWeight: range === opt.value ? 600 : 400,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="site-shell" style={{ padding: "var(--space-5) var(--space-6) var(--space-8)" }}>

      {combinedLoad && (
        <div style={{ marginBottom: "var(--space-5)" }}>
          <IntegratedLoadCard combined={combinedLoad} focus={loadFocus} />
        </div>
      )}

      {/* IntegratedLoadCard는 현재 snapshot/기여도/포커스, 이 PMC는 시간 추이만 담당한다. */}
      <Card padding="none" style={{ marginTop: 'var(--space-5)', padding: 'var(--space-5)' }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            marginBottom: "var(--space-3)",
          }}
        >
          <div>
            <h3 style={{ margin: 0, marginBottom: "var(--space-1)", fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--ink-0)" }}>
              {t("triView.pmc.title")}
            </h3>
            <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>
              {t("triView.pmc.sub")}
            </div>
          </div>
          <div style={{ flex: 1 }} />
          {/* 범례 */}
          <div
            style={{
              display: "flex",
              gap: "var(--space-3)",
              fontSize: "var(--fs-xs)",
              color: "var(--ink-3)",
              flexWrap: "wrap",
            }}
          >
            {LEGEND_ITEM_KEYS.map((item) => (
              <span
                key={item.key}
                style={{ display: "flex", alignItems: "center", gap: "var(--space-1-5)" }}
              >
                {item.type === "rect" ? (
                  <span
                    style={{
                      width: 14,
                      height: 8,
                      background: item.color,
                      opacity: item.opacity,
                      borderRadius: "var(--r-xs)",
                    }}
                  />
                ) : (
                  <svg width="14" height="6" viewBox="0 0 14 6" aria-hidden="true" style={{ display: "block", flex: "0 0 auto", opacity: item.opacity }}>
                    <line x1="0" y1="3" x2="14" y2="3" stroke={item.color} strokeWidth="2" strokeDasharray={item.dasharray} strokeLinecap={item.linecap} vectorEffect="non-scaling-stroke" />
                  </svg>
                )}
                {t(item.key)}
              </span>
            ))}
          </div>
        </div>

        <TripleStackPMC
          bikeCtl={pmcSeries.bikeCtl}
          runCtl={pmcSeries.runCtl}
          swimCtl={pmcSeries.swimCtl}
          totCtl={pmcSeries.totCtl}
          atl={pmcSeries.atl}
          tsb={pmcSeries.tsb}
          dates={pmcSeries.dates}
        />

        {/* 목표 배너 */}
        <div
          style={{
            marginTop: 'var(--space-4)',
            padding: "var(--space-3)",
            background:
              "color-mix(in oklch, var(--aqua) 5%, var(--bg-2))",
            border:
              "1px solid color-mix(in oklch, var(--aqua) 20%, var(--line-soft))",
            borderRadius: "var(--r-md)",
            display: "grid",
            gridTemplateColumns: "2fr repeat(3, 1fr)",
            gap: 'var(--space-5)',
            alignItems: "center",
          }}
        >
          <div>
            <Text as="div" variant="eyebrow"
              style={{ color: "var(--aqua)", marginBottom: 'var(--space-1)' }}
            >
              {t("triView.goal.eyebrow")}
            </Text>
            <div style={{ fontSize: "var(--fs-sm)", color: "var(--ink-0)", fontWeight: 500 }}>
              2026-06-30 · D-
              <Text variant="mono" style={{ color: "var(--aqua)" }}>
                62
              </Text>
              <span style={{ color: "var(--ink-3)", fontSize: "var(--fs-xs)", marginLeft: "var(--space-2)" }}>
                {t("triView.goal.distance")}
              </span>
            </div>
          </div>
          <div>
            <Text as="div" variant="eyebrow" style={{ fontSize: "var(--fs-xs)", marginBottom: "var(--space-1)" }}>
              {t("triView.goal.currentCtl")}
            </Text>
            <div>
              <Text variant="dataMedium"
                style={{ color: "var(--ink-0)", fontFamily: "var(--font-mono)" }}
              >
                {totalCTL.toFixed(1)}
              </Text>
            </div>
          </div>
          <div>
            <Text as="div" variant="eyebrow" style={{ fontSize: "var(--fs-xs)", marginBottom: "var(--space-1)" }}>
              {t("triView.goal.currentTsb")}
            </Text>
            <div>
              <Text variant="dataMedium"
                style={{ color: totalTSB >= 0 ? "var(--lime)" : "var(--rose)", fontFamily: "var(--font-mono)" }}
              >
                {totalTSB >= 0 ? "+" : ""}{totalTSB.toFixed(1)}
              </Text>
              <Text variant="unit"> {totalTSB >= 0 ? t("triView.goal.goodForm") : t("triView.kpi.fatigue")}</Text>
            </div>
          </div>
          <div>
            <Text as="div" variant="eyebrow" style={{ fontSize: "var(--fs-xs)", marginBottom: "var(--space-1)" }}>
              {t("triView.kpi.weeklyTss")}
            </Text>
            <div>
              <Text variant="dataMedium"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {displayedWeeklyTss}
              </Text>
              <Text variant="unit"> TSS</Text>
            </div>
          </div>
        </div>
      </Card>

      {/* 종목별 드릴다운 카드 */}
      <div style={{ marginTop: 'var(--space-5)' }}>
        <div style={{ display: "flex", alignItems: "baseline", marginBottom: 'var(--space-3)' }}>
          <h3 style={{ margin: 0, fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--ink-0)" }}>
            {t("discipline.summary.title")}
          </h3>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)" }}>{t("triView.disciplineCards.hint")}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 'var(--space-4)' }}>
          <PerDisciplineCard
            label={t("triView.cycling")}
            color={DISCIPLINE_CHART_COLORS.bike}
            ctl={bikeSpark.length > 0 ? bikeSpark : [0]}
            delta={bikeSpark.length >= 2 ? bikeSpark[bikeSpark.length - 1]! - bikeSpark[bikeSpark.length - 2]! : 0}
            tss={Math.round(triBreakdown.bike.weeklyTSS)}
            dist="—"
            unit="km"
            lastSess={hasData ? t("triView.liveData") : t("triView.demo.bikeLastSess")}
            href="/fitness?sport=bike"
          />
          <PerDisciplineCard
            label={t("discipline.run")}
            color={DISCIPLINE_CHART_COLORS.run}
            ctl={runSpark.length > 0 ? runSpark : [0]}
            delta={runSpark.length >= 2 ? runSpark[runSpark.length - 1]! - runSpark[runSpark.length - 2]! : 0}
            tss={Math.round(triBreakdown.run.weeklyTSS)}
            dist="—"
            unit="km"
            lastSess={hasData ? t("triView.liveData") : t("triView.demo.runLastSess")}
            href="/fitness?sport=run"
          />
          <PerDisciplineCard
            label={t("discipline.swim")}
            color={DISCIPLINE_CHART_COLORS.swim}
            ctl={swimSpark.length > 0 ? swimSpark : [0]}
            delta={swimSpark.length >= 2 ? swimSpark[swimSpark.length - 1]! - swimSpark[swimSpark.length - 2]! : 0}
            tss={Math.round(triBreakdown.swim.weeklyTSS)}
            dist="—"
            unit="km"
            lastSess={hasData ? t("triView.liveData") : t("triView.demo.swimLastSess")}
            href="/fitness?sport=swim"
          />
        </div>
      </div>

      {/* 통합 부하 모델 설명 카드 */}
      <Card padding="none" style={{ padding: 'var(--space-5)', marginTop: 'var(--space-5)' }}>
        <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--ink-0)", marginBottom: 'var(--space-2)' }}>
          {t("triView.model.title")}
        </div>
        <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", lineHeight: 1.7 }}>
          {t("triView.model.desc")}
        </div>
      </Card>

      {/* 기여도 도넛 + 일별 부하 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 'var(--space-5)', marginTop: 'var(--space-5)' }}>
        {/* 종목별 기여도 */}
        <Card padding="none" style={{ padding: 'var(--space-5)' }}>
          <div style={{ marginBottom: "var(--space-3)" }}>
            <h3 style={{ margin: 0, marginBottom: "var(--space-1)", fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--ink-0)" }}>
              {t("triView.contrib.title")}
            </h3>
            <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>{t("triView.contrib.sub", { ctl: hasData ? totalCTL.toFixed(1) : "62.1" })}</div>
          </div>
          <ContribDonut
            slices={hasData ? contribSlices : [
              { label: t("triView.cycling"), pct: 45, ctl: 28, color: DISCIPLINE_CHART_COLORS.bike },
              { label: t("discipline.run"),  pct: 33, ctl: 20, color: DISCIPLINE_CHART_COLORS.run },
              { label: t("discipline.swim"), pct: 22, ctl: 14, color: DISCIPLINE_CHART_COLORS.swim },
            ]}
            totalCtl={hasData ? totalCTL : 62.1}
          />
          <div
            style={{
              marginTop: 'var(--space-4)',
              paddingTop: 14,
              borderTop: "1px solid var(--line-soft)",
              fontSize: "var(--fs-xs)",
              color: "var(--ink-3)",
              lineHeight: 1.6,
            }}
          >
            {hasData
              ? t("triView.contrib.advice", { pct: bikePct })
              : t("triView.contrib.adviceDemo")}
          </div>
        </Card>

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
            {dailyLegendItems.map((item) => (
              <span key={item.label} style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
                <span style={{ width: 10, height: 10, background: item.color, borderRadius: "var(--r-xs)" }} />
                {item.label}
              </span>
            ))}
          </div>
          {/* 주간 요약 */}
          <div
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
              <Text as="div" variant="eyebrow" style={{ fontSize: "var(--fs-xs)", marginBottom: "var(--space-1)" }}>{t("daily.weekTSS")}</Text>
              <div><Text variant="dataMedium">{displayedWeeklyTss}</Text><Text variant="unit"> {t("triView.total")}</Text></div>
            </div>
            <div>
              <Text as="div" variant="eyebrow" style={{ fontSize: "var(--fs-xs)", marginBottom: "var(--space-1)" }}>{t("discipline.bike")}</Text>
              <div><Text variant="dataMedium">{Math.round(triBreakdown.bike.weeklyTSS)}</Text><Text variant="unit"> TSS</Text></div>
            </div>
            <div>
              <Text as="div" variant="eyebrow" style={{ fontSize: "var(--fs-xs)", marginBottom: "var(--space-1)" }}>{t("discipline.run")}</Text>
              <div><Text variant="dataMedium">{Math.round(triBreakdown.run.weeklyTSS)}</Text><Text variant="unit"> TSS</Text></div>
            </div>
            <div>
              <Text as="div" variant="eyebrow" style={{ fontSize: "var(--fs-xs)", marginBottom: "var(--space-1)" }}>{t("discipline.swim")}</Text>
              <div><Text variant="dataMedium">{Math.round(triBreakdown.swim.weeklyTSS)}</Text><Text variant="unit"> TSS</Text></div>
            </div>
          </div>
        </Card>
      </div>
      </div>
    </div>
  );
}
