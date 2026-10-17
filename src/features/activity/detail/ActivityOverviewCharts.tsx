import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from "react";
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

/** 한글 단위가 섞인 수치 — 숫자만 고정폭(mono·tabular), 단위·공백은 본문 글꼴로. */
export function MixedValue({ value }: { value: string }) {
  return <span className="activity-overview-mixed">{value.split(/([+-]?\d[\d.,:]*)/).filter(Boolean).map((part, index) =>
    /\d/.test(part) ? <span key={index} className="activity-overview-mixed__num">{part}</span> : <span key={index}>{part}</span>)}</span>;
}

/**
 * 지속 시간 문구 — 0 인 단위는 생략한다. 60초 미만 "30초", 1시간 미만 "1분 30초"·"1분",
 * 1시간 이상 "1시간 5분"(초는 생략).
 */
export function formatSpan(seconds: number, units: { hour: string; minute: string; second: string }): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const parts = h > 0 ? [h && `${h}${units.hour}`, m && `${m}${units.minute}`] : [m && `${m}${units.minute}`, r && `${r}${units.second}`];
  const text = parts.filter(Boolean).join(" ");
  return text || `0${units.second}`;
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
// 띠 = 파워 존 Z1…Z6 의 %FTP 경계(55·75·90·105·120%). 1.30 너머는 끝에 붙이고 글로 밝힌다.
export const IF_TICKS = [0.55, 0.75, 0.9, 1.05, 1.2] as const;
/** 좁은 게이지(약 21rem 미만)에서 남길 눈금 — 템포 시작과 역치 끝만. */
const IF_TICKS_NARROW = [0.75, 1.05] as const;
const IF_EDGES = [IF_MIN, ...IF_TICKS, IF_MAX] as const;
export const ifPos = (value: number) => (Math.min(IF_MAX, Math.max(IF_MIN, value)) - IF_MIN) / (IF_MAX - IF_MIN) * 100;
/** 띠는 눈금과 같은 좌표계(트랙 전체 = 100%)에 절대 배치한다. 마지막 띠는 트랙 끝까지 간다. */
export const ifBandLayout = () => IF_EDGES.slice(0, -1).map((from, index) => {
  const to = IF_EDGES[index + 1]!;
  return { from, to, left: ifPos(from), width: ifPos(to) - ifPos(from) };
});

export function IntensityGauge({ value }: { value: number }) {
  const { t } = useTranslation("activity");
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const bands = ifBandLayout();
  const current = bands.findIndex((band, index) => value < band.to || index === bands.length - 1);
  const ticks = width > 0 && width < 336 ? IF_TICKS_NARROW : IF_TICKS;
  // 자 밖의 값은 끝에 붙이되 그 사실을 마커 위에 쓴다.
  const outside = value > IF_MAX ? `≥${IF_MAX.toFixed(2)}` : value < IF_MIN ? `≤${IF_MIN.toFixed(2)}` : null;
  return <div ref={ref} className="activity-overview-gauge" role="img" aria-label={t("overviewSummary.ifGaugeLabel", { value: value.toFixed(2) })}>
    <span className="activity-overview-gauge__ftp-label" aria-hidden="true" style={cssVar({ "--at": `${ifPos(1)}%` })}>FTP</span>
    {outside && <span className="activity-overview-gauge__outside" aria-hidden="true" style={cssVar({ "--at": `${ifPos(value)}%` })}>{outside}</span>}
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
      {ticks.map((tick) => <span key={tick} style={cssVar({ "--at": `${ifPos(tick)}%` })}>{tick.toFixed(2)}</span>)}
    </div>
  </div>;
}

/* ───────────── 존 시간 누적 막대 ───────────── */

const LABEL_MIN_PX = 22;

const BRACKET_MIN_PX = 22;

type StripItem = { label: string; detail: string };

/**
 * 존 누적 막대. `items` 가 있으면 조각마다 포인터·키보드로 값을 읽는다 — 막대 하나가 탭 한 번
 * (roving tabindex): 막대에 들어오면 ←/→ 로 조각을 옮기고, 툴팁에 존 이름·시간·% 가 뜬다.
 */
function ZoneStrip({ weights, className, label, labelled = false, items }: { weights: number[]; className?: string; label: string; labelled?: boolean; items?: StripItem[] }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  // 무엇이 툴팁을 열었나 — 탭(click)으로 연 것은 같은 조각을 다시 탭하면 닫힌다.
  const openedBy = useRef<"focus" | "click" | "hover" | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // 터치: 막대 밖을 탭하면 닫는다.
  useEffect(() => {
    if (active == null) return;
    const close = (event: PointerEvent) => { if (!wrapRef.current?.contains(event.target as Node)) { setActive(null); openedBy.current = null; } };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [active]);
  const segmentRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const total = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
  const present = weights.flatMap((w, i) => w > 0 ? [i] : []);
  const rovingIndex = focusIndex ?? present[0] ?? 0;
  // Z4+ 를 한 묶음으로 둬 그 위에 괄호를 얹는다. 묶음 폭도 같은 비율의 합이다(표시값 아님).
  const groups = [weights.slice(0, 3).map((w, i) => [w, i] as const), weights.slice(3).map((w, i) => [w, i + 3] as const)];
  const interactive = !!items;
  const move = (from: number, step: number) => {
    const position = present.indexOf(from);
    const next = present[Math.min(present.length - 1, Math.max(0, position + step))];
    if (next == null) return;
    setFocusIndex(next);
    segmentRefs.current[next]?.focus();
  };
  // 툴팁 위치: 조각 가운데(막대 왼쪽 끝 기준 비율). 위치 계산일 뿐 표시값이 아니다.
  const centerOf = (index: number) => {
    const before = weights.slice(0, index).reduce((sum, w) => sum + Math.max(0, w), 0);
    return total > 0 ? (before + Math.max(0, weights[index]!) / 2) / total * 100 : 0;
  };
  return <div ref={wrapRef} className="activity-overview-zones__strip-wrap">
    <div ref={ref} className={`activity-overview-zones__strip ${className ?? ""}`} role={interactive ? "group" : "img"} aria-label={label}>
      {groups.map((group, groupIndex) => {
        const visible = group.filter(([w]) => w > 0);
        const grow = visible.reduce((sum, [w]) => sum + w, 0);
        if (!visible.length) return null;
        // 괄호가 22px 보다 좁으면 "∩" 처럼 보인다 — 숨기고 Z4+ 비율은 머리글 글자로만 둔다.
        const narrowBracket = groupIndex > 0 && total > 0 && width * grow / total < BRACKET_MIN_PX;
        return <span key={groupIndex} className={`activity-overview-zones__group ${groupIndex ? "activity-overview-zones__group--high" : ""} ${narrowBracket ? "is-narrow" : ""}`} style={{ flexGrow: grow }} aria-hidden={interactive ? undefined : true}>
          {visible.map(([w, i]) => <span key={i} ref={(node) => { segmentRefs.current[i] = node; }} className={`activity-overview-zone--${i + 1}`} style={{ flexGrow: w }}
            {...(interactive ? {
              role: "img", "aria-label": `${items![i]!.label} · ${items![i]!.detail}`, tabIndex: i === rovingIndex ? 0 : -1,
              onFocus: () => { setFocusIndex(i); setActive(i); openedBy.current = "focus"; },
              onBlur: () => { setActive(null); openedBy.current = null; },
              onMouseEnter: () => { setActive(i); openedBy.current = "hover"; },
              onMouseLeave: () => { if (openedBy.current === "hover") { setActive(null); openedBy.current = null; } },
              onClick: () => {
                // 같은 조각을 다시 탭하면 닫는다. 첫 탭(포커스·호버로 이미 열린 경우 포함)은 연 채로 둔다.
                if (active === i && openedBy.current === "click") { setActive(null); openedBy.current = null; return; }
                setActive(i); openedBy.current = "click";
              },
              onKeyDown: (event: KeyboardEvent<HTMLSpanElement>) => {
                if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); move(i, event.key === "ArrowRight" ? 1 : -1); }
                if (event.key === "Home" || event.key === "End") { event.preventDefault(); move(i, event.key === "Home" ? -99 : 99); }
                if (event.key === "Escape") { setActive(null); openedBy.current = null; }
              },
            } : {})}>
            {/* 조각이 충분히 넓을 때만 안에 이름을 쓴다 — 좁은 조각은 범례가 맡는다. */}
            {labelled && total > 0 && width * w / total >= LABEL_MIN_PX && <span aria-hidden="true" className={`activity-overview-zones__seg-label ${i >= 4 ? "is-strong" : ""}`}>Z{i + 1}</span>}
          </span>)}
        </span>;
      })}
    </div>
    {interactive && active != null && items![active] && <div className="ds-chart__tooltip activity-overview-zones__tip" role="tooltip" style={cssVar({ "--at": `${centerOf(active)}%` })}>
      <strong>{items![active]!.label}</strong><span>{items![active]!.detail}</span>
    </div>}
  </div>;
}

export function ZoneTimeBar({ zone, highPercent, baselineHighPercent, heading }: { zone: Zone; highPercent?: number; baselineHighPercent?: number; heading: ReactNode }) {
  const { t } = useTranslation(["activity", "fitness"]);
  const labels = zone.kind === "power" ? POWER_ZONE_LABELS : HR_ZONE_LABELS;
  const pcts = zone.currentPercentages?.length === zone.seconds.length ? zone.currentPercentages : undefined;
  const weights = pcts ?? zone.seconds;
  const baseline = zone.baselinePercentages?.length === zone.seconds.length && (zone.priorSampleCount ?? 0) > 0 ? zone.baselinePercentages : undefined;
  const describe = (values: number[] | undefined) => zone.seconds.map((sec, i) => `Z${i + 1} ${values ? `${one(values[i]!)}%` : clock(sec)}`).join(", ");
  const name = (i: number) => `Z${i + 1}${labels[i] ? ` ${t(labels[i]!.nameKey)}` : ""}`;
  const items = zone.seconds.map((sec, i) => ({ label: name(i), detail: [clock(sec), pcts ? `${one(pcts[i]!)}%` : null].filter(Boolean).join(" · ") }));
  // 0% 존은 범례 한 줄로 접는다 — 빈 칸이 같은 무게로 자리를 차지하지 않게.
  const shown = zone.seconds.flatMap((sec, i) => (pcts ? pcts[i]! > 0 : sec > 0) ? [i] : []);
  const empty = zone.seconds.flatMap((sec, i) => (pcts ? pcts[i]! > 0 : sec > 0) ? [] : [i]);
  return <div className="activity-overview-zones">
    <div className="activity-overview-zones__head">
      <Text variant="bodySmall" tone="secondary">{heading}</Text>
      {highPercent != null && <span className="activity-overview-zones__high">
        <Text variant="caption" tone="tertiary"><GlossaryText>Z4+</GlossaryText></Text>
        <Text variant="dataSmall" tone="primary">{one(highPercent)}%</Text>
      </span>}
    </div>
    <ZoneStrip weights={weights} labelled items={items} label={`${t("overviewSummary.zoneBarLabel")}: ${describe(pcts)}`} />
    {baseline && <div className="activity-overview-zones__baseline">
      <ZoneStrip weights={baseline} className="activity-overview-zones__strip--baseline" label={`${t("overviewSummary.zoneBaselineAria")}: ${describe(baseline)}`} />
      <Text variant="caption" tone="tertiary">{t(zone.baselineScope === "discipline" ? "overviewSummary.zoneBaselineDiscipline" : "overviewSummary.zoneBaseline", { count: zone.priorSampleCount })}
        {baselineHighPercent != null && <> · <GlossaryText>{t("overviewSummary.usualHigh", { pct: one(baselineHighPercent) })}</GlossaryText></>}</Text>
    </div>}
    <ul className="activity-overview-zones__legend" style={cssVar({ "--rows": Math.ceil(shown.length / 2) })}>
      {shown.map((i) => <li key={i}>
        <span aria-hidden="true" className={`activity-overview-swatch activity-overview-zone--${i + 1}`} />
        <span className="activity-overview-zones__name"><b>Z{i + 1}</b><span className="activity-overview-zones__label"> {labels[i] ? t(labels[i]!.nameKey) : ""}</span></span>
        <span className="activity-overview-zones__value">{pcts ? `${one(pcts[i]!)}%` : clock(zone.seconds[i]!)}</span>
        {(pcts || baseline) && <span className="activity-overview-zones__time">
          {pcts && <span className="activity-overview-zones__clock activity-overview-mixed__num">{clock(zone.seconds[i]!)}</span>}
          {baseline && <span className="activity-overview-zones__usual"><span className="activity-overview-zones__sep" aria-hidden="true">{pcts ? " · " : ""}</span><MixedValue value={t("overviewSummary.usualPct", { pct: one(baseline[i]!) })} /></span>}
        </span>}
      </li>)}
    </ul>
    {empty.length > 0 && <p className="activity-overview-zones__empty"><MixedValue value={t("overviewSummary.zonesEmpty", { zones: empty.map(name).join(", ") })} /></p>}
  </div>;
}

/* ───────────── 0–100 미터 (W′·개인지수) ───────────── */

export function PercentMeter({ label, value, display, tone = "accent", mid = false, sub, ends, quiet = false }: {
  label: ReactNode; value: number; display: ReactNode; tone?: "accent" | "high"; mid?: boolean; sub?: ReactNode;
  /** 막대 양 끝의 뜻(예: "여유"·"소진"). 숫자를 쓰면 빈 쪽 끝이 반대로 읽힌다. */
  ends?: [ReactNode, ReactNode];
  /** 보조 수치 칸 안의 얇고 옅은 막대 — 존 막대보다 약한 신호로 둔다. */
  quiet?: boolean;
}) {
  const { t } = useTranslation("activity");
  // 개인지수 0·100 은 이력 끝에 닿은 값이다 — 점을 테두리로 바꾸고 글로 밝힌다.
  const edge = mid ? value >= 100 ? "top" : value <= 0 ? "bottom" : null : null;
  return <div className={`activity-overview-meter ${quiet ? "activity-overview-meter--quiet" : ""}`}>
    <div className="activity-overview-meter__head">
      <Text variant="bodySmall" tone="secondary">{label}</Text>
      <span className="activity-overview-meter__value">
        <Text variant="bodyMedium" tone="primary">{display}</Text>
        {edge && <Text variant="caption" tone="tertiary">{t(edge === "top" ? "overviewSummary.indexTop" : "overviewSummary.indexBottom")}</Text>}
      </span>
    </div>
    <div className={`activity-overview-meter__track ${mid ? "activity-overview-meter__track--mid" : ""}`} aria-hidden="true">
      {mid ? <span className={`activity-overview-meter__dot ${edge ? "is-edge" : ""}`} style={cssVar({ "--at": `${Math.min(100, Math.max(0, value))}%` })} />
        : <span className={`activity-overview-meter__fill activity-overview-meter__fill--${tone}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />}
    </div>
    {mid && <div className="activity-overview-meter__scale" aria-hidden="true"><span>{t("overviewSummary.usual")}</span></div>}
    {ends && <div className="activity-overview-meter__ends" aria-hidden="true"><span>{ends[0]}</span><span>{ends[1]}</span></div>}
    {sub}
  </div>;
}

/* ───────────── 0 기준 발산 막대(피크 파워 변화) ───────────── */

/** 발산 막대의 고정 범위(±%). 넘치면 끝에 화살표를 그려 "더 크다" 를 밝힌다. */
export const DELTA_RANGE = 50;

/** 막대 반폭(트랙 대비 %)과 클립 여부 — 고정 범위 ±50% 기준. 최댓값으로 정규화하지 않는다. */
export function deltaBarLayout(value: number): { half: number; clipped: boolean } {
  const clipped = Math.abs(value) > DELTA_RANGE;
  return { half: Math.min(DELTA_RANGE, Math.abs(value)) / DELTA_RANGE * 50, clipped };
}

/** 서버 변화율(%)을 0 가운데 막대로 — 고정 척도 ±50%, 양끝 눈금 라벨. */
export function DeltaBar({ value, label, display }: { value: number; label: ReactNode; display: ReactNode }) {
  const { half, clipped } = deltaBarLayout(value);
  return <div className="activity-overview-delta">
    <div className="activity-overview-meter__head">
      <Text variant="bodySmall" tone="secondary">{label}</Text>
      <Text variant="bodyMedium" tone="primary">{display}</Text>
    </div>
    <div className="activity-overview-delta__track" aria-hidden="true">
      <span className={`activity-overview-delta__bar ${value < 0 ? "is-down" : ""} ${clipped ? "is-clipped" : ""}`} style={cssVar({ "--from": value < 0 ? `${50 - half}%` : "50%", "--size": `${half}%` })} />
    </div>
    <div className="activity-overview-delta__scale" aria-hidden="true"><span>−{DELTA_RANGE}%</span><span>0</span><span>+{DELTA_RANGE}%</span></div>
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
  // 비교선이 없을 때는 활동 전 최고에 가장 가까웠던 점 하나에 % 를 직접 단다.
  const closestPrevious = basis === "previousBest" ? points.reduce<number | null>((top, p, index) => p.row.previousBestPct != null && (top == null || p.row.previousBestPct > points[top]!.row.previousBestPct!) ? index : top, null) : null;
  // 라벨에 창 길이를 함께 쓴다 — 어느 점의 값인지 글로 읽힌다. 점에는 강조 링을 두른다.
  const at = (index: number) => duration(points[index]!.row.duration);
  const annotations = records.length
    ? records.map((index) => ({ index, text: `${at(index)} · ${t("overviewSummary.prMark")}`, ring: true }))
    : closest != null ? [{ index: closest, text: `${at(closest)} · ${t("overviewSummary.ofBest", { pct: Math.round(points[closest]!.row.allTimeBestPct!) })}`, ring: true }]
    : closestPrevious != null ? [{ index: closestPrevious, text: `${at(closestPrevious)} · ${t("overviewSummary.ofPreviousBest", { pct: Math.round(points[closestPrevious]!.row.previousBestPct!) })}`, ring: true }] : [];
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
      xScale="log" unitAxisTitle heightClassName="h-48 sm:h-56"
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

export function FitnessShift({ prior, post, rowLabel, metricName, priorCaption, postCaption }: {
  prior: FitnessStatus; post: FitnessStatus;
  rowLabel: (key: "ctl" | "atl" | "tsb") => ReactNode;
  /** 보조기기용 지표 이름(범위 포함, 예: "통합 체력 · CTL"). */
  metricName: (key: "ctl" | "atl" | "tsb") => string;
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
        // 두 점이 8px 안으로 겹치면 운동 전은 채운 점 바깥 링으로 남긴다. 변화량은 세 줄 모두 값 옆에 쓴다.
        const collapsed = width > 0 && Math.abs(a - b) / 100 * width < DOT_MIN_PX;
        // 서버가 변화량을 따로 주지 않는다. 서버 값 두 개(운동 전·후)의 표시용 차이일 뿐 정본 계산이 아니다.
        const delta = Math.round((to - from) * 10) / 10;
        return <div key={key} className="activity-overview-shift__row">
          <Text variant="bodySmall" tone="secondary" className="activity-overview-shift__label">{rowLabel(key)}</Text>
          <div ref={index === 0 ? ref : undefined} className="activity-overview-shift__track" role="img"
            aria-label={t("overviewSummary.shiftAria", { metric: metricName(key), from: fixed1(from), to: fixed1(to) })}>
            {/* 폼(TSB) 0 아래는 피로가 체력을 넘어선 구간 — 옅게 깐다. */}
            {key === "tsb" && <span className="activity-overview-shift__negative" aria-hidden="true" />}
            <span className="activity-overview-shift__zero" aria-hidden="true" />
            {!collapsed && <span className={`activity-overview-shift__span ${b < a ? "is-down" : ""}`} aria-hidden="true" style={cssVar({ "--from": `${Math.min(a, b)}%`, "--to": `${Math.max(a, b)}%` })} />}
            <span className={`activity-overview-shift__dot activity-overview-shift__dot--before ${collapsed ? "is-halo" : ""}`} aria-hidden="true" style={cssVar({ "--at": `${collapsed ? b : a}%` })} />
            <span className="activity-overview-shift__dot activity-overview-shift__dot--after" aria-hidden="true" style={cssVar({ "--at": `${b}%` })} />
          </div>
          <Text variant="bodyMedium" mono tone="primary" className="activity-overview-shift__values">
            <span className="activity-overview-shift__from">{fixed1(from)}<span className="activity-overview-shift__arrow"> → </span></span>{fixed1(to)}
            <span className="activity-overview-shift__delta"> ({delta > 0 ? "+" : ""}{delta.toFixed(1)})</span>
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
