import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import GlossaryText from "../../../components/common/GlossaryText";
import DurationCurveChart from "../../../components/DurationCurveChart";
import { Text } from "../../../theme/components";
import type { ActivityOverviewPresentation } from "@shared/types/activity-overview";
import { HR_ZONE_LABELS, POWER_ZONE_LABELS } from "./metricsPresentation";
import "./activity-overview-charts.css";

/*
 * 개요 카드의 그림들. **값은 전부 서버 정본(presentation)** 이다 — 여기서는 위치·폭·문구만
 * 만든다. 막대 폭은 서버 비중(%)을, 그것이 없던 옛 응답은 초를 그대로 flex 비율로 쓴다
 * (비율을 다시 계산해 숫자로 내보이지 않는다).
 */

type Zone = NonNullable<ActivityOverviewPresentation["zones"]>[number];
type PowerRow = NonNullable<ActivityOverviewPresentation["powerFingerprint"]>[number];
type FitnessStatus = NonNullable<ActivityOverviewPresentation["priorFitnessStatus"]>;

const one = (value: number) => String(Math.round(value * 10) / 10);
const fixed1 = (value: number) => (Math.round(value * 10) / 10).toFixed(1);
const clock = (seconds: number) => {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
};
const cssVar = (vars: Record<string, string | number>) => vars as CSSProperties;

/** 그림의 실제 폭(px). 점 간격·조각 라벨처럼 "화면에서 읽히는가" 를 판단할 때만 쓴다. */
function useElementWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** "1s"/"5m"/"1h" → 초. 서버가 보낸 창 이름을 축 위치로 바꿀 뿐이다. */
export function powerDurationSeconds(value: string): number | null {
  const match = /^(\d+(?:\.\d+)?)(s|m|h)$/.exec(value);
  if (!match) return null;
  const n = Number(match[1]);
  return match[2] === "s" ? n : match[2] === "m" ? n * 60 : n * 3600;
}

/* ───────────── IF 강도 게이지 ───────────── */

// IF = NP ÷ FTP 이므로 파워 존(%FTP) 경계가 그대로 눈금이다. 활동을 분류하지 않고 자만 그린다.
export const IF_MIN = 0.4;
export const IF_MAX = 1.3;
export const IF_TICKS = [0.55, 0.75, 0.9, 1.05] as const;
const IF_EDGES = [IF_MIN, ...IF_TICKS, IF_MAX] as const;
export const ifPos = (value: number) => (Math.min(IF_MAX, Math.max(IF_MIN, value)) - IF_MIN) / (IF_MAX - IF_MIN) * 100;
/** 띠는 눈금과 같은 좌표계(트랙 전체 = 100%)에 절대 배치한다. 마지막 띠는 트랙 끝까지 간다. */
export const ifBandLayout = () => IF_EDGES.slice(0, -1).map((from, index) => {
  const to = IF_EDGES[index + 1]!;
  return { from, to, left: ifPos(from), width: ifPos(to) - ifPos(from) };
});

export function IntensityGauge({ value }: { value: number }) {
  const { t } = useTranslation("activity");
  const bands = ifBandLayout();
  const current = bands.findIndex((band, index) => value < band.to || index === bands.length - 1);
  return <div className="activity-overview-gauge" role="img" aria-label={t("overviewSummary.ifGaugeLabel", { value: value.toFixed(2) })}>
    <span className="activity-overview-gauge__ftp-label" aria-hidden="true" style={cssVar({ "--at": `${ifPos(1)}%` })}>FTP</span>
    <div className="activity-overview-gauge__track" aria-hidden="true">
      {/* 지금 IF 가 놓인 띠만 존 색으로 칠한다 — 나머지는 바탕과 눈금선이 자를 그린다. */}
      {bands.map((band, index) => <span key={band.from} data-band={index + 1}
        className={`activity-overview-gauge__band ${index === current ? `activity-overview-zone--${index + 1}` : ""}`}
        style={cssVar({ "--left": `${band.left}%`, "--width": `${band.width}%` })} />)}
      {IF_TICKS.map((tick) => <span key={tick} className="activity-overview-gauge__tick" data-tick={tick} style={cssVar({ "--at": `${ifPos(tick)}%` })} />)}
      <span className="activity-overview-gauge__ftp" style={cssVar({ "--at": `${ifPos(1)}%` })} />
      <span className="activity-overview-gauge__marker" style={cssVar({ "--at": `${ifPos(value)}%` })} />
    </div>
    <div className="activity-overview-gauge__scale" aria-hidden="true">
      {IF_TICKS.map((tick) => <span key={tick} style={cssVar({ "--at": `${ifPos(tick)}%` })}>{tick.toFixed(2)}</span>)}
    </div>
  </div>;
}

/* ───────────── 존 시간 누적 막대 ───────────── */

const LABEL_MIN_PX = 32;

function ZoneStrip({ weights, className, label, labelled = false }: { weights: number[]; className?: string; label: string; labelled?: boolean }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const total = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
  // Z4+ 를 한 묶음으로 둬 그 위에 괄호를 얹는다. 묶음 폭도 같은 비율의 합이다(표시값 아님).
  const groups = [weights.slice(0, 3).map((w, i) => [w, i] as const), weights.slice(3).map((w, i) => [w, i + 3] as const)];
  return <div ref={ref} className={`activity-overview-zones__strip ${className ?? ""}`} role="img" aria-label={label}>
    {groups.map((group, groupIndex) => {
      const visible = group.filter(([w]) => w > 0);
      const grow = visible.reduce((sum, [w]) => sum + w, 0);
      if (!visible.length) return null;
      return <span key={groupIndex} className={`activity-overview-zones__group ${groupIndex ? "activity-overview-zones__group--high" : ""}`} style={{ flexGrow: grow }} aria-hidden="true">
        {visible.map(([w, i]) => <span key={i} className={`activity-overview-zone--${i + 1}`} style={{ flexGrow: w }}>
          {/* 조각이 충분히 넓을 때만 안에 이름을 쓴다 — 좁은 조각은 범례가 맡는다. */}
          {labelled && total > 0 && width * w / total >= LABEL_MIN_PX && <span className="activity-overview-zones__seg-label">Z{i + 1}</span>}
        </span>)}
      </span>;
    })}
  </div>;
}

export function ZoneTimeBar({ zone, highPercent, heading }: { zone: Zone; highPercent?: number; heading: ReactNode }) {
  const { t } = useTranslation(["activity", "fitness"]);
  const labels = zone.kind === "power" ? POWER_ZONE_LABELS : HR_ZONE_LABELS;
  const pcts = zone.currentPercentages?.length === zone.seconds.length ? zone.currentPercentages : undefined;
  const weights = pcts ?? zone.seconds;
  const baseline = zone.baselinePercentages?.length === zone.seconds.length && (zone.priorSampleCount ?? 0) > 0 ? zone.baselinePercentages : undefined;
  const describe = (values: number[] | undefined) => zone.seconds.map((sec, i) => `Z${i + 1} ${values ? `${one(values[i]!)}%` : clock(sec)}`).join(", ");
  return <div className="activity-overview-zones">
    <div className="activity-overview-zones__head">
      <Text variant="bodySmall" tone="secondary">{heading}</Text>
      {highPercent != null && <span className="activity-overview-zones__high">
        <Text variant="caption" tone="tertiary"><GlossaryText>Z4+</GlossaryText></Text>
        <Text variant="dataSmall" tone="primary">{one(highPercent)}%</Text>
      </span>}
    </div>
    <ZoneStrip weights={weights} labelled label={`${t("overviewSummary.zoneBarLabel")}: ${describe(pcts)}`} />
    {baseline && <div className="activity-overview-zones__baseline">
      <ZoneStrip weights={baseline} className="activity-overview-zones__strip--baseline" label={`${t("overviewSummary.zoneBaselineAria")}: ${describe(baseline)}`} />
      <Text variant="caption" tone="tertiary">{t(zone.baselineScope === "discipline" ? "overviewSummary.zoneBaselineDiscipline" : "overviewSummary.zoneBaseline", { count: zone.priorSampleCount })}</Text>
    </div>}
    <ul className="activity-overview-zones__legend">
      {zone.seconds.map((sec, i) => <li key={i} className={sec > 0 ? undefined : "is-empty"}>
        <span aria-hidden="true" className={`activity-overview-swatch activity-overview-zone--${i + 1}`} />
        <span className="activity-overview-zones__name"><b>Z{i + 1}</b> {labels[i] ? t(labels[i]!.nameKey) : ""}</span>
        <span className="activity-overview-zones__value">{pcts ? `${one(pcts[i]!)}%` : clock(sec)}</span>
        {pcts && <span className="activity-overview-zones__time">{clock(sec)}</span>}
      </li>)}
    </ul>
  </div>;
}

/* ───────────── 0–100 미터 (W′·개인지수) ───────────── */

export function PercentMeter({ label, value, display, tone = "accent", mid = false, sub }: {
  label: ReactNode; value: number; display: ReactNode; tone?: "accent" | "high"; mid?: boolean; sub?: ReactNode;
}) {
  const { t } = useTranslation("activity");
  // 개인지수 0·100 은 이력 끝에 닿은 값이다 — 점을 테두리로 바꾸고 글로 밝힌다.
  const edge = mid ? value >= 100 ? "top" : value <= 0 ? "bottom" : null : null;
  return <div className="activity-overview-meter">
    <div className="activity-overview-meter__head">
      <Text variant="bodySmall" tone="secondary">{label}</Text>
      <span className="activity-overview-meter__value">
        <Text variant="bodyMedium" mono tone="primary">{display}</Text>
        {edge && <Text variant="caption" tone="tertiary">{t(edge === "top" ? "overviewSummary.indexTop" : "overviewSummary.indexBottom")}</Text>}
      </span>
    </div>
    <div className={`activity-overview-meter__track ${mid ? "activity-overview-meter__track--mid" : ""}`} aria-hidden="true">
      {mid ? <span className={`activity-overview-meter__dot ${edge ? "is-edge" : ""}`} style={cssVar({ "--at": `${Math.min(100, Math.max(0, value))}%` })} />
        : <span className={`activity-overview-meter__fill activity-overview-meter__fill--${tone}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />}
    </div>
    {mid && <div className="activity-overview-meter__scale" aria-hidden="true"><span>{t("overviewSummary.usual")}</span></div>}
    {sub}
  </div>;
}

/* ───────────── 파워 커브 ───────────── */

/** 최고 파워 곡선은 창이 길수록 같거나 낮아야 한다. 아니면 그 계열은 그리지 않는다(값을 고치지 않는다). */
export function isNonIncreasing(values: Array<number | null | undefined>): boolean {
  let previous: number | null = null;
  for (const value of values) {
    if (value == null) continue;
    if (previous != null && value > previous) return false;
    previous = value;
  }
  return true;
}

export type PowerComparisonBasis = "allTimeBest" | "previousBest" | "median" | null;

/**
 * 범례·툴팁·라벨·ⓘ 가 한 기준을 쓰도록 비교 기준을 한 번 정한다.
 * 역대 최고 계열이 비단조(서버 결함, g1-web#3228)면 선을 버리고 활동 전 최고 대비 % 만 남긴다.
 */
export function powerComparisonBasis(rows: PowerRow[], recordsEvaluated: boolean, comparableMedian: boolean): PowerComparisonBasis {
  if (recordsEvaluated && rows.some((row) => row.allTimeBestWatts != null) && isNonIncreasing(rows.map((row) => row.allTimeBestWatts))) return "allTimeBest";
  if (recordsEvaluated && rows.some((row) => row.previousBestPct != null)) return "previousBest";
  if (comparableMedian && rows.some((row) => row.medianWatts != null)) return "median";
  return null;
}

export function OverviewPowerCurve({ rows, recordsEvaluated, comparableMedian, ftpW }: { rows: PowerRow[]; recordsEvaluated: boolean; comparableMedian: boolean; ftpW?: number | null }) {
  const { t, i18n } = useTranslation(["activity", "dashboard"]);
  const listId = useId();
  const label = (key: string) => t(`overviewEvidence.${key}`);
  const points = rows.flatMap((row) => {
    const seconds = powerDurationSeconds(row.duration);
    return seconds == null ? [] : [{ row, durationSeconds: seconds, value: row.watts }];
  });
  const sorted = points.map((p) => p.row);
  const basis = powerComparisonBasis(sorted, recordsEvaluated, comparableMedian);
  const duration = (value: string) => i18n.language.startsWith("ko") ? value.replace(/s$/, "초").replace(/m$/, "분").replace(/h$/, "시간") : value;
  const comparison = basis === "allTimeBest" ? { label: label("allTimeBest"), values: points.map((p) => p.row.allTimeBestWatts ?? null) }
    : basis === "median" ? { label: label("baseline"), values: points.map((p) => p.row.medianWatts ?? null) } : null;
  const records = recordsEvaluated ? points.flatMap((p, index) => p.row.recordAchievement ? [index] : []) : [];
  const closest = basis === "allTimeBest" ? points.reduce<number | null>((top, p, index) => p.row.allTimeBestPct != null && (top == null || p.row.allTimeBestPct > points[top]!.row.allTimeBestPct!) ? index : top, null) : null;
  const annotations = records.length
    ? records.map((index) => ({ index, text: t("overviewSummary.prMark") }))
    : closest != null ? [{ index: closest, text: t("overviewSummary.ofBest", { pct: Math.round(points[closest]!.row.allTimeBestPct!) }) }] : [];
  // 한 줄 = 한 기준. 선이 역대 최고면 % 도 역대 최고 대비다.
  const facts = (row: PowerRow) => [
    ...(basis === "allTimeBest" && row.allTimeBestPct != null ? [`${t("overviewSummary.vsAllTimeBest")} ${one(row.allTimeBestPct)}%`] : []),
    ...(basis === "previousBest" && row.previousBestPct != null ? [`${label("previousBestPct")} ${one(row.previousBestPct)}%`] : []),
    ...(basis === "median" && row.deltaPct != null ? [`${label("change")} ${row.deltaPct > 0 ? "+" : ""}${one(row.deltaPct)}%`] : []),
    ...(recordsEvaluated && row.recordAchievement ? [label(`records.${row.recordAchievement}`)] : []),
  ];
  const peak = points.reduce((max, p) => Math.max(max, p.value), 0);
  const ftp = ftpW != null && Number.isFinite(ftpW) && ftpW > 0 ? Math.round(ftpW) : null;
  return <div className="activity-overview-curve">
    <DurationCurveChart
      points={points.map(({ durationSeconds, value }) => ({ durationSeconds, value }))}
      unit="W" color="var(--chart-power)" datasetLabel={t("overviewSummary.thisActivity")}
      comparison={comparison} tooltipFooter={(index) => points[index] ? facts(points[index]!.row) : []} annotations={annotations} showLegend
      reference={ftp ? { value: ftp, label: `FTP ${ftp} W` } : null} referenceSolid
      xTicks="all" unitAxisTitle heightClassName="h-[220px]"
      roleDescription={t("overviewSummary.chartRole")} describedBy={listId}
      ariaLabel={t("overviewSummary.curveAria", { peak: Math.round(peak) })}
      emptyTitle={t("dashboard:charts.powerCurve.emptyTitle")} emptyDescription={t("dashboard:charts.powerCurve.emptyDescription")}
    />
    {/* 캔버스를 못 읽는 보조기기용 — 같은 값의 목록. 화면에는 툴팁·라벨이 같은 일을 한다. */}
    <ul id={listId} className="sr-only">
      {points.map(({ row }, index) => <li key={row.duration}>
        <span>{duration(row.duration)}</span> <span>{one(row.watts)}</span> W
        {comparison && comparison.values[index] != null && <> · {comparison.label} <span>{one(comparison.values[index]!)}</span> W</>}
        {facts(row).map((fact) => <span key={fact}> · {fact}</span>)}
      </li>)}
    </ul>
  </div>;
}

/* ───────────── 훈련 부하 전→후 ───────────── */

const DOT_MIN_PX = 8;

export function FitnessShift({ prior, post, rowLabel, priorCaption, postCaption }: {
  prior: FitnessStatus; post: FitnessStatus;
  rowLabel: (key: "ctl" | "atl" | "tsb") => ReactNode;
  priorCaption: ReactNode; postCaption: ReactNode;
}) {
  const { t } = useTranslation("activity");
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const keys = ["ctl", "atl", "tsb"] as const;
  const values = keys.flatMap((key) => [prior[key], post[key]]);
  // 세 줄이 한 축을 공유한다 — 같은 단위(일 부하)라 길이를 서로 비교할 수 있어야 한다.
  const lo = Math.min(0, ...values), hi = Math.max(0, ...values);
  const pad = (hi - lo || 1) * 0.08;
  const at = (value: number) => (value - (lo - pad)) / (hi - lo + pad * 2) * 100;
  const zero = at(0);
  return <div className="activity-overview-shift">
    <ul className="activity-overview-shift__legend">
      <li><span aria-hidden="true" className="activity-overview-shift__key activity-overview-shift__key--before" />{priorCaption}</li>
      <li><span aria-hidden="true" className="activity-overview-shift__key activity-overview-shift__key--after" />{postCaption}</li>
    </ul>
    <div className="activity-overview-shift__rows" style={cssVar({ "--zero": `${zero}%` })}>
      {keys.map((key, index) => {
        const from = prior[key], to = post[key];
        const a = at(from), b = at(to);
        // 두 점이 8px 안으로 겹치면 운동 후 점만 찍고 변화량을 값 옆에 쓴다.
        const collapsed = width > 0 && Math.abs(a - b) / 100 * width < DOT_MIN_PX;
        const delta = Math.round((to - from) * 10) / 10;
        return <div key={key} className="activity-overview-shift__row">
          <Text variant="bodySmall" tone="secondary" className="activity-overview-shift__label">{rowLabel(key)}</Text>
          <div ref={index === 0 ? ref : undefined} className="activity-overview-shift__track" role="img"
            aria-label={t("overviewSummary.shiftAria", { metric: t(`overviewSummary.${key}`), from: fixed1(from), to: fixed1(to) })}>
            {/* 폼(TSB) 0 아래는 피로가 체력을 넘어선 구간 — 옅게 깐다. */}
            {key === "tsb" && <span className="activity-overview-shift__negative" aria-hidden="true" />}
            <span className="activity-overview-shift__zero" aria-hidden="true" />
            {!collapsed && <span className={`activity-overview-shift__span ${b < a ? "is-down" : ""}`} aria-hidden="true" style={cssVar({ "--from": `${Math.min(a, b)}%`, "--to": `${Math.max(a, b)}%` })} />}
            {!collapsed && <span className="activity-overview-shift__dot activity-overview-shift__dot--before" aria-hidden="true" style={cssVar({ "--at": `${a}%` })} />}
            <span className="activity-overview-shift__dot activity-overview-shift__dot--after" aria-hidden="true" style={cssVar({ "--at": `${b}%` })} />
          </div>
          <Text variant="bodyMedium" mono tone="primary" className="activity-overview-shift__values">
            <span className="activity-overview-shift__from">{fixed1(from)}</span><span className="activity-overview-shift__arrow"> → </span>{fixed1(to)}
            {collapsed && <span className="activity-overview-shift__delta"> ({delta > 0 ? "+" : ""}{delta.toFixed(1)})</span>}
          </Text>
        </div>;
      })}
      <div className="activity-overview-shift__row activity-overview-shift__row--axis" aria-hidden="true">
        <span />
        <div className="activity-overview-shift__axis"><span>0</span></div>
        <span />
      </div>
    </div>
  </div>;
}
