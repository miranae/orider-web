import type { CSSProperties, ReactNode } from "react";
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
const clampPct = (value: number) => `${Math.min(100, Math.max(0, value))}%`;
const clock = (seconds: number) => {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
};
const cssVar = (name: string, value: string | number) => ({ [name]: value } as CSSProperties);

/** "1s"/"5m"/"1h" → 초. 서버가 보낸 창 이름을 축 위치로 바꿀 뿐이다. */
export function powerDurationSeconds(value: string): number | null {
  const match = /^(\d+(?:\.\d+)?)(s|m|h)$/.exec(value);
  if (!match) return null;
  const n = Number(match[1]);
  return match[2] === "s" ? n : match[2] === "m" ? n * 60 : n * 3600;
}

/* ───────────── IF 강도 게이지 ───────────── */

// IF = NP ÷ FTP 이므로 파워 존(%FTP) 경계가 그대로 눈금이다. 활동을 분류하지 않고 자만 그린다.
const IF_MIN = 0.4, IF_MAX = 1.3;
const IF_BANDS = [[0.4, 0.55], [0.55, 0.75], [0.75, 0.9], [0.9, 1.05], [1.05, 1.3]] as const;
const ifPos = (value: number) => (Math.min(IF_MAX, Math.max(IF_MIN, value)) - IF_MIN) / (IF_MAX - IF_MIN) * 100;

export function IntensityGauge({ value }: { value: number }) {
  const { t } = useTranslation("activity");
  return <div className="activity-overview-gauge" role="img" aria-label={t("overviewSummary.ifGaugeLabel", { value: value.toFixed(2) })}>
    <div className="activity-overview-gauge__track" aria-hidden="true">
      {IF_BANDS.map(([from, to], index) => <span key={from} className={`activity-overview-zone--${index + 1}`} style={{ flexGrow: to - from }} />)}
      <span className="activity-overview-gauge__ftp" style={cssVar("--at", `${ifPos(1)}%`)} />
      <span className="activity-overview-gauge__marker" style={cssVar("--at", `${ifPos(value)}%`)} />
    </div>
    <span className="activity-overview-gauge__ftp-label" aria-hidden="true" style={cssVar("--at", `${ifPos(1)}%`)}>FTP</span>
    <div className="activity-overview-gauge__scale" aria-hidden="true">
      {[0.55, 0.75, 0.9, 1.05].map((tick) => <span key={tick} style={cssVar("--at", `${ifPos(tick)}%`)}>{tick.toFixed(2)}</span>)}
    </div>
  </div>;
}

/* ───────────── 존 시간 누적 막대 ───────────── */

function ZoneStrip({ weights, className, label }: { weights: number[]; className?: string; label: string }) {
  // Z4+ 를 한 묶음으로 둬 그 위에 괄호를 얹는다. 묶음 폭도 같은 비율의 합이다(표시값 아님).
  const groups = [weights.slice(0, 3).map((w, i) => [w, i] as const), weights.slice(3).map((w, i) => [w, i + 3] as const)];
  return <div className={`activity-overview-zones__strip ${className ?? ""}`} role="img" aria-label={label}>
    {groups.map((group, groupIndex) => {
      const visible = group.filter(([w]) => w > 0);
      const grow = visible.reduce((sum, [w]) => sum + w, 0);
      if (!visible.length) return null;
      return <span key={groupIndex} className={`activity-overview-zones__group ${groupIndex ? "activity-overview-zones__group--high" : ""}`} style={{ flexGrow: grow }} aria-hidden="true">
        {visible.map(([w, i]) => <span key={i} className={`activity-overview-zone--${i + 1}`} style={{ flexGrow: w }} />)}
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
    <ZoneStrip weights={weights} label={`${t("overviewSummary.zoneBarLabel")}: ${describe(pcts)}`} />
    {baseline && <div className="activity-overview-zones__baseline">
      <Text variant="caption" tone="tertiary">{t(zone.baselineScope === "discipline" ? "overviewSummary.zoneBaselineDiscipline" : "overviewSummary.zoneBaseline", { count: zone.priorSampleCount })}</Text>
      <ZoneStrip weights={baseline} className="activity-overview-zones__strip--baseline" label={`${t("overviewSummary.zoneBaselineAria")}: ${describe(baseline)}`} />
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
  return <div className="activity-overview-meter">
    <div className="activity-overview-meter__head">
      <Text variant="bodySmall" tone="secondary">{label}</Text>
      <Text variant="bodyMedium" mono tone="primary">{display}</Text>
    </div>
    <div className={`activity-overview-meter__track ${mid ? "activity-overview-meter__track--mid" : ""}`} aria-hidden="true">
      {mid ? <span className="activity-overview-meter__dot" style={cssVar("--at", clampPct(value))} />
        : <span className={`activity-overview-meter__fill activity-overview-meter__fill--${tone}`} style={{ width: clampPct(value) }} />}
    </div>
    {sub}
  </div>;
}

/* ───────────── 파워 커브 ───────────── */

export function OverviewPowerCurve({ rows, recordsEvaluated, comparableMedian }: { rows: PowerRow[]; recordsEvaluated: boolean; comparableMedian: boolean }) {
  const { t, i18n } = useTranslation(["activity", "dashboard"]);
  const label = (key: string) => t(`overviewEvidence.${key}`);
  const points = rows.flatMap((row) => {
    const seconds = powerDurationSeconds(row.duration);
    return seconds == null ? [] : [{ row, durationSeconds: seconds, value: row.watts }];
  });
  const duration = (value: string) => i18n.language.startsWith("ko") ? value.replace(/s$/, "초").replace(/m$/, "분").replace(/h$/, "시간") : value;
  const best = recordsEvaluated && points.some((p) => p.row.allTimeBestWatts != null);
  const median = !best && comparableMedian && points.some((p) => p.row.medianWatts != null);
  const comparison = best ? { label: label("allTimeBest"), values: points.map((p) => p.row.allTimeBestWatts ?? null) }
    : median ? { label: label("baseline"), values: points.map((p) => p.row.medianWatts ?? null) } : null;
  const records = recordsEvaluated ? points.flatMap((p, index) => p.row.recordAchievement ? [index] : []) : [];
  const closest = best ? points.reduce<number | null>((top, p, index) => p.row.allTimeBestPct != null && (top == null || p.row.allTimeBestPct > points[top]!.row.allTimeBestPct!) ? index : top, null) : null;
  const annotations = records.length
    ? records.map((index) => ({ index, text: t("overviewSummary.prMark") }))
    : closest != null ? [{ index: closest, text: t("overviewSummary.ofBest", { pct: Math.round(points[closest]!.row.allTimeBestPct!) }) }] : [];
  const footer = (index: number) => {
    const row = points[index]?.row;
    if (!row) return [];
    return [
      ...(recordsEvaluated && row.previousBestPct != null ? [`${label("previousBestPct")} ${one(row.previousBestPct)}%`] : []),
      ...(median && row.deltaPct != null ? [`${label("change")} ${row.deltaPct > 0 ? "+" : ""}${one(row.deltaPct)}%`] : []),
      ...(recordsEvaluated && row.recordAchievement ? [label(`records.${row.recordAchievement}`)] : []),
    ];
  };
  const peak = points.reduce((max, p) => Math.max(max, p.value), 0);
  return <div className="activity-overview-curve">
    <DurationCurveChart
      points={points.map(({ durationSeconds, value }) => ({ durationSeconds, value }))}
      unit="W" color="var(--chart-power)" datasetLabel={t("overviewSummary.thisActivity")}
      comparison={comparison} tooltipFooter={footer} annotations={annotations} showLegend
      heightClassName="h-[220px]"
      ariaLabel={t("overviewSummary.curveAria", { peak: Math.round(peak) })}
      emptyTitle={t("dashboard:charts.powerCurve.emptyTitle")} emptyDescription={t("dashboard:charts.powerCurve.emptyDescription")}
    />
    {/* 캔버스를 못 읽는 보조기기용 — 같은 값의 목록. 화면에는 툴팁·라벨이 같은 일을 한다. */}
    <ul className="sr-only">
      {points.map(({ row }) => <li key={row.duration}>
        <span>{duration(row.duration)}</span> <span>{one(row.watts)}</span> W
        {comparison && row[best ? "allTimeBestWatts" : "medianWatts"] != null && <> · {comparison.label} <span>{one(row[best ? "allTimeBestWatts" : "medianWatts"]!)}</span> W</>}
        {recordsEvaluated && row.previousBestPct != null && <> · {label("previousBestPct")} <span>{`${one(row.previousBestPct)}%`}</span></>}
        {recordsEvaluated && row.recordAchievement && <> · {label(`records.${row.recordAchievement}`)}</>}
      </li>)}
    </ul>
  </div>;
}

/* ───────────── 통합 훈련 부하 전→후 ───────────── */

export function FitnessShift({ prior, post, rowLabel, priorCaption, postCaption }: {
  prior: FitnessStatus; post?: FitnessStatus | null;
  rowLabel: (key: "ctl" | "atl" | "tsb") => ReactNode;
  priorCaption: ReactNode; postCaption?: ReactNode;
}) {
  const { t } = useTranslation("activity");
  const keys = ["ctl", "atl", "tsb"] as const;
  const values = keys.flatMap((key) => [prior[key], ...(post ? [post[key]] : [])]);
  // 세 줄이 한 축을 공유한다 — 같은 단위(일 부하)라 길이를 서로 비교할 수 있어야 한다.
  const lo = Math.min(0, ...values), hi = Math.max(0, ...values);
  const pad = (hi - lo || 1) * 0.08;
  const at = (value: number) => (value - (lo - pad)) / (hi - lo + pad * 2) * 100;
  return <div className="activity-overview-shift">
    <ul className="activity-overview-shift__legend">
      <li><span aria-hidden="true" className="activity-overview-shift__key activity-overview-shift__key--before" />{priorCaption}</li>
      {post && <li><span aria-hidden="true" className="activity-overview-shift__key activity-overview-shift__key--after" />{postCaption}</li>}
    </ul>
    <div className="activity-overview-shift__rows" style={cssVar("--zero", `${at(0)}%`)}>
      {keys.map((key) => {
        const from = prior[key], to = post?.[key];
        const a = at(from), b = to == null ? a : at(to);
        return <div key={key} className="activity-overview-shift__row">
          <Text variant="bodySmall" tone="secondary" className="activity-overview-shift__label">{rowLabel(key)}</Text>
          <div className="activity-overview-shift__track" role="img"
            aria-label={to == null ? `${t(`overviewSummary.${key}`)} ${one(from)}` : t("overviewSummary.shiftAria", { metric: t(`overviewSummary.${key}`), from: one(from), to: one(to) })}>
            <span className="activity-overview-shift__zero" aria-hidden="true" />
            {to != null && <span className={`activity-overview-shift__span ${b < a ? "is-down" : ""}`} aria-hidden="true" style={{ ...cssVar("--from", `${Math.min(a, b)}%`), ...cssVar("--to", `${Math.max(a, b)}%`) }} />}
            <span className="activity-overview-shift__dot activity-overview-shift__dot--before" aria-hidden="true" style={cssVar("--at", `${a}%`)} />
            {to != null && <span className="activity-overview-shift__dot activity-overview-shift__dot--after" aria-hidden="true" style={cssVar("--at", `${b}%`)} />}
          </div>
          <Text variant="bodyMedium" mono tone="primary" className="activity-overview-shift__values">
            {to == null ? one(from) : <><span className="activity-overview-shift__from">{one(from)}</span><span className="activity-overview-shift__arrow"> → </span>{one(to)}</>}
          </Text>
        </div>;
      })}
    </div>
  </div>;
}
