import { Fragment, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card, Chip, Text } from "../../theme/components";
import type {
  CoachAnswerActionCode, CoachAnswerBlock, CoachAnswerDocument, CoachDisplayValue, CoachEntityRef,
  CoachLoadAssessment, CoachMetricId, CoachResponseFormat, CoachV2Response,
} from "../../services/coachV2Contract";
import { CoachPrescription } from "./CoachPrescription";

const PRIMARY_COUNT = 5;
const LOAD_METRIC_IDS = new Set<CoachMetricId>(["ctl", "atl", "form"]);

function formatDate(value: string, locale: string, timezone?: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", ...(timezone ? { timeZone: timezone } : {}) }).format(new Date(value));
  } catch { return value; }
}

function primitiveText(value: unknown, locale: string, signDisplay: "auto" | "always" = "auto"): string {
  if (value === null) return "—";
  if (typeof value === "number") return new Intl.NumberFormat(locale, { maximumFractionDigits: 2, signDisplay }).format(value);
  if (typeof value === "boolean") return value ? "✓" : "—";
  if (typeof value === "string") return value;
  return "";
}

function Display({ item, locale, className, showPositiveSign = false }: { item: CoachDisplayValue; locale: string; className?: string;
  showPositiveSign?: boolean }) {
  const { t } = useTranslation("coach");
  const value = primitiveText(item.value, locale, showPositiveSign ? "always" : "auto");
  return <span className={className} data-evidence-id={item.evidenceId}>
    {value}{item.unit ? <small className="coach-answer__unit"> {t(`answer.unit.${item.unit}`)}</small> : null}
  </span>;
}

function MetricLabel({ metricId }: { metricId: CoachMetricId }) {
  const { t } = useTranslation("coach");
  return <>{t(`answer.metric.${metricId}`)}</>;
}

function BlockState({ block }: { block: Exclude<CoachAnswerBlock, { kind: "unsupported_block" }> }) {
  const { t } = useTranslation("coach");
  if (!block.partial && !block.stale && !block.truncated && block.omittedCount === 0) return null;
  return <div className="coach-answer__badges" aria-label={t("answer.state.label")}>
    {block.partial && <Chip variant="warning">{t("answer.state.partial")}</Chip>}
    {block.stale && <Chip variant="warning">{t("answer.state.stale")}</Chip>}
    {(block.truncated || block.omittedCount > 0) && <Chip>{t("answer.state.omitted", { count: block.omittedCount })}</Chip>}
  </div>;
}

function FormatFallbackNotice({ local = false }: { local?: boolean }) {
  const { t } = useTranslation("coach");
  return <div className="coach-answer__format-fallback" role="status">
    <strong>{t(local ? "responseFormat.blockFallbackTitle" : "responseFormat.fallbackTitle")}</strong>
    <p>{t(local ? "responseFormat.blockFallbackBody" : "responseFormat.fallbackBody")}</p>
  </div>;
}

function MoreItems<T>({ items, render, listKind }: { items: T[]; render: (item: T, index: number) => ReactNode;
  listKind?: "ul" | "ol" }) {
  const { t } = useTranslation("coach");
  const primary = items.slice(0, PRIMARY_COUNT);
  const remaining = items.slice(PRIMARY_COUNT);
  const renderedRemaining = remaining.map((item, index) => <Fragment key={index}>{render(item, index + PRIMARY_COUNT)}</Fragment>);
  const disclosure = remaining.length > 0 && <details className="coach-answer__more">
    <summary>{t("answer.more", { count: remaining.length })}</summary>
    {listKind === "ul" ? <ul>{renderedRemaining}</ul> : listKind === "ol" ? <ol>{renderedRemaining}</ol> : renderedRemaining}
  </details>;
  return <>{primary.map(render)}{disclosure && (listKind ? <li className="coach-answer__more-item">{disclosure}</li> : disclosure)}</>;
}

function Entity({ entity, locale }: { entity: CoachEntityRef; locale: string }) {
  return <span className="coach-answer__entity"><Display item={entity.label} locale={locale} />
    {entity.occurredAt && <small><Display item={entity.occurredAt} locale={locale} /></small>}
  </span>;
}

type TimeSeriesBlock = Extract<CoachAnswerBlock, { kind: "time_series" }>;

function numericSegments(series: TimeSeriesBlock["series"][number]) {
  const segments: Array<Array<{ point: typeof series.points[number]; sourceIndex: number }>> = [];
  let current: Array<{ point: typeof series.points[number]; sourceIndex: number }> = [];
  series.points.forEach((point, sourceIndex) => {
    if (typeof point.value.value === "number" && Number.isFinite(point.value.value)) current.push({ point, sourceIndex });
    else {
      if (current.length >= 2) segments.push(current);
      current = [];
    }
  });
  if (current.length >= 2) segments.push(current);
  return segments;
}

const ISO_DATE_OR_INSTANT = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/;

function timestampFromAt(value: unknown): number | null {
  if (typeof value !== "string" || !ISO_DATE_OR_INSTANT.test(value)) return null;
  const calendarDate = value.slice(0, 10);
  const calendarTimestamp = Date.parse(`${calendarDate}T00:00:00Z`);
  if (!Number.isFinite(calendarTimestamp) || new Date(calendarTimestamp).toISOString().slice(0, 10) !== calendarDate) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return timestamp;
}

function timeSeriesDomain(block: TimeSeriesBlock): { keys: string[]; keyFor: (value: unknown) => string } | null {
  const values = block.series.flatMap((series) => series.points.map((point) => point.at.value));
  const timestamps = values.map(timestampFromAt);
  const allTemporal = timestamps.every((timestamp) => timestamp !== null);
  const allLabels = timestamps.every((timestamp) => timestamp === null);
  if (!allTemporal && !allLabels) return null;

  if (allTemporal) {
    const keys = [...new Set(timestamps as number[])].sort((left, right) => left - right).map((timestamp) => `time:${timestamp}`);
    return { keys, keyFor: (value) => `time:${timestampFromAt(value)}` };
  }

  // A single categorical sequence has a trustworthy source order. Across multiple
  // series, arbitrary labels do not provide enough information to infer one shared order.
  if (block.series.length > 1) return null;
  const keys = [...new Set(values.map((value) => `${typeof value}:${String(value)}`))];
  return { keys, keyFor: (value) => `${typeof value}:${String(value)}` };
}

function isChartableTimeSeries(block: TimeSeriesBlock): boolean {
  return timeSeriesDomain(block) !== null && block.series.some((series) => numericSegments(series).length > 0);
}

function SeriesGraphic({ block, locale }: { block: TimeSeriesBlock; locale: string }) {
  const { t } = useTranslation("coach");
  const domain = timeSeriesDomain(block);
  if (!domain) return <TimeSeriesTable block={block} locale={locale} />;
  const chartSegments = block.series.flatMap((series, seriesIndex) => numericSegments(series).map((segment, segmentIndex) => ({
    seriesId: series.seriesId, seriesIndex, segmentIndex, points: segment.map(({ point, sourceIndex }) => ({
      point, sourceIndex, domainIndex: domain.keys.indexOf(domain.keyFor(point.at.value)),
    })),
  })));
  const numeric = chartSegments.flatMap((segment) => segment.points.map(({ point }) => point.value.value as number));
  const min = numeric.length > 0 ? Math.min(...numeric) : 0;
  const max = numeric.length > 0 ? Math.max(...numeric) : 0;
  const span = max - min || 1;
  return <div className="coach-answer__series">
    <svg viewBox="0 0 100 40" role="img" aria-label={t("answer.chart.visualLabel")} preserveAspectRatio="none">
      {chartSegments.map((segment) => {
        const points = segment.points.map(({ point, domainIndex }) => {
          const x = domain.keys.length <= 1 ? 50 : domainIndex * 100 / (domain.keys.length - 1);
          const number = point.value.value as number;
          return `${x},${36 - ((number - min) / span) * 32}`;
        }).join(" ");
        return <polyline key={`${segment.seriesId}-${segment.segmentIndex}`} data-source-indexes={segment.points.map(({ sourceIndex }) => sourceIndex).join(",")}
          points={points} className={`coach-answer__line coach-answer__line--${segment.seriesIndex % 3}`} />;
      })}
    </svg>
    <details className="coach-answer__series-data">
      <summary>{t("answer.chart.dataToggle")}</summary>
      <TimeSeriesTable block={block} locale={locale} />
    </details>
  </div>;
}

function TimeSeriesTable({ block, locale }: { block: TimeSeriesBlock; locale: string }) {
  const { t } = useTranslation("coach");
  return <div className="coach-answer__table-scroll"><table>
      <caption>{t("answer.chart.tableCaption")}</caption>
      <thead><tr><th scope="col">{t("answer.chart.series")}</th><th scope="col">{t("answer.chart.at")}</th><th scope="col">{t("answer.chart.value")}</th></tr></thead>
      <tbody>{block.series.flatMap((series) => series.points.map((point, index) => <tr key={`${series.seriesId}-${index}`}>
        <th scope="row"><MetricLabel metricId={series.metricId} /></th><td><Display item={point.at} locale={locale} /></td><td><Display item={point.value} locale={locale} /></td>
      </tr>))}</tbody>
    </table></div>;
}

function MetricGridTable({ block, locale }: { block: Extract<CoachAnswerBlock, { kind: "metric_grid" }>; locale: string }) {
  const { t } = useTranslation("coach");
  const [expanded, setExpanded] = useState(false);
  const remaining = Math.max(0, block.items.length - PRIMARY_COUNT);
  const items = expanded ? block.items : block.items.slice(0, PRIMARY_COUNT);
  return <div className="coach-answer__table-scroll"><table>
    <caption>{t("responseFormat.tableCaption")}</caption>
    <thead><tr><th scope="col">{t("answer.metricLabel")}</th><th scope="col">{t("answer.chart.value")}</th></tr></thead>
    <tbody>{items.map((item, index) => <tr key={`${item.metricId}-${index}`}>
      <th scope="row"><MetricLabel metricId={item.metricId} /></th><td><Display item={item.current} locale={locale} /></td>
    </tr>)}</tbody>
  </table>{remaining > 0 && <Button type="button" variant="ghost" size="sm" aria-expanded={expanded}
    onClick={() => setExpanded((value) => !value)}>{expanded ? t("responseFormat.showLess") : t("answer.more", { count: remaining })}</Button>}</div>;
}

function DistributionTable({ block, locale }: { block: Extract<CoachAnswerBlock, { kind: "distribution" }>; locale: string }) {
  const { t } = useTranslation("coach");
  const [expanded, setExpanded] = useState(false);
  const remaining = Math.max(0, block.categories.length - PRIMARY_COUNT);
  const categories = expanded ? block.categories : block.categories.slice(0, PRIMARY_COUNT);
  return <div className="coach-answer__table-scroll"><table>
    <caption>{t("responseFormat.tableCaption")}</caption>
    <thead><tr><th scope="col">{t("responseFormat.category")}</th><th scope="col">{t("answer.chart.value")}</th></tr></thead>
    <tbody>{categories.map((item) => <tr key={item.categoryId}>
      <th scope="row"><Display item={item.label} locale={locale} /></th><td><Display item={item.value} locale={locale} /></td>
    </tr>)}</tbody>
  </table>{remaining > 0 && <Button type="button" variant="ghost" size="sm" aria-expanded={expanded}
    onClick={() => setExpanded((value) => !value)}>{expanded ? t("responseFormat.showLess") : t("answer.more", { count: remaining })}</Button>}</div>;
}

function DistributionGraphic({ block, locale }: { block: Extract<CoachAnswerBlock, { kind: "distribution" }>; locale: string }) {
  const { t } = useTranslation("coach");
  const numeric = block.categories.map((item) => typeof item.value.value === "number" ? item.value.value : 0);
  const max = Math.max(...numeric.map(Math.abs), 1);
  const bar = (item: typeof block.categories[number], index: number) => <div className="coach-answer__bar-row" key={item.categoryId}>
    <Display item={item.label} locale={locale} />
    <span className="coach-answer__bar-track" aria-hidden="true"><span className="coach-answer__bar"
      style={{ inlineSize: `${Math.max(2, Math.abs(numeric[index]!) / max * 100)}%` }} /></span>
    <Display item={item.value} locale={locale} className="coach-answer__strong" />
  </div>;
  const remaining = block.categories.slice(PRIMARY_COUNT);
  return <div className="coach-answer__distribution-chart">
    <div className="coach-answer__bars">
      <div className="coach-answer__bar-plot" role="img" aria-label={t("responseFormat.distributionChartLabel")}>
        {block.categories.slice(0, PRIMARY_COUNT).map(bar)}
      </div>
      {remaining.length > 0 && <details className="coach-answer__more"><summary>{t("answer.more", { count: remaining.length })}</summary>
        <div className="coach-answer__bar-plot">{remaining.map((item, index) => bar(item, index + PRIMARY_COUNT))}</div></details>}
    </div>
    <DistributionTable block={block} locale={locale} />
  </div>;
}

interface LoadAnalysisGroup {
  blockIds: Set<string>;
  firstBlockId: string;
  comparisons: Array<Extract<CoachAnswerBlock, { kind: "comparison_table" }>["rows"][number]>;
  trends: Array<Extract<CoachAnswerBlock, { kind: "time_series" }>>;
  goal?: Extract<CoachAnswerBlock, { kind: "goal_progress" }>;
  typed?: Extract<CoachAnswerBlock, { kind: "load_analysis" }>;
}

function collectLoadAnalysisGroup(document: CoachAnswerDocument): LoadAnalysisGroup | null {
  const typed = document.blocks.find((block): block is Extract<CoachAnswerBlock, { kind: "load_analysis" }> => block.kind === "load_analysis");
  const comparisonBlocks = document.blocks.filter((block): block is Extract<CoachAnswerBlock, { kind: "comparison_table" }> =>
    block.kind === "comparison_table" && block.rows.length > 0 && block.rows.every((row) => LOAD_METRIC_IDS.has(row.metricId)));
  const trends = document.blocks.filter((block): block is Extract<CoachAnswerBlock, { kind: "time_series" }> =>
    block.kind === "time_series" && block.series.length > 0 && block.series.every((series) => LOAD_METRIC_IDS.has(series.metricId)));
  const goal = document.blocks.find((block): block is Extract<CoachAnswerBlock, { kind: "goal_progress" }> => block.kind === "goal_progress");
  if (!typed && comparisonBlocks.length === 0 && trends.length === 0 && !goal) return null;
  const comparisons = comparisonBlocks.flatMap((block) => block.rows.filter((row) => LOAD_METRIC_IDS.has(row.metricId)));
  const blockIds = new Set([...(typed ? [typed.blockId] : []), ...comparisonBlocks.map((block) => block.blockId), ...trends.map((block) => block.blockId),
    ...(goal ? [goal.blockId] : [])]);
  const firstBlockId = document.blocks.find((block) => blockIds.has(block.blockId))?.blockId;
  if (!firstBlockId) return null;
  return { blockIds, firstBlockId, comparisons, trends, ...(goal ? { goal } : {}), ...(typed ? { typed } : {}) };
}

const BAND_KEYS: Record<string, string> = {
  "coach.load.band.recovery_review.label": "answer.load.band.recovery_review.label",
  "coach.load.band.recovery_review.explanation": "answer.load.band.recovery_review.explanation",
  "coach.load.band.high_load.label": "answer.load.band.high_load.label",
  "coach.load.band.high_load.explanation": "answer.load.band.high_load.explanation",
  "coach.load.band.productive_load.label": "answer.load.band.productive_load.label",
  "coach.load.band.productive_load.explanation": "answer.load.band.productive_load.explanation",
  "coach.load.band.normal.label": "answer.load.band.normal.label",
  "coach.load.band.normal.explanation": "answer.load.band.normal.explanation",
};

function typedLoadTrendBlock(block: Extract<CoachAnswerBlock, { kind: "load_analysis" }>): TimeSeriesBlock {
  const metrics = ["ctl", "atl", "form"] as const;
  return { blockId: `${block.blockId}_weekly_trend`, kind: "time_series", sourceSlotIds: block.sourceSlotIds,
    partial: block.partial, stale: block.stale, truncated: block.truncated, omittedCount: block.omittedCount,
    series: metrics.map((metric) => ({ seriesId: `${block.blockId}_${metric}`, metricId: metric,
      points: block.assessment.weeklyTrend.map((week) => ({ at: week.period.toCanonicalDate, value: week[metric] })) })) };
}

function TypedLoadTrendTable({ block, locale }: { block: Extract<CoachAnswerBlock, { kind: "load_analysis" }>; locale: string }) {
  const { t } = useTranslation("coach");
  const metrics = ["ctl", "atl", "form"] as const;
  return <div className="coach-answer__table-scroll"><table><caption>{t("answer.load.weeklyTrendCaption")}</caption>
    <thead><tr><th scope="col">{t("answer.load.canonicalPeriod")}</th>{metrics.map((metric) => <th key={metric} scope="col"><MetricLabel metricId={metric} /></th>)}</tr></thead>
    <tbody>{block.assessment.weeklyTrend.map((week) => <tr key={week.weekId}><th scope="row"><Display item={week.period.fromCanonicalDate} locale={locale} /> – <Display item={week.period.toCanonicalDate} locale={locale} />
      {(week.partial || week.sampleBasis === "current_as_of") && <Chip variant="warning">{t("answer.load.inProgress")}</Chip>}</th>
      {metrics.map((metric) => <td key={metric}><Display item={week[metric]} locale={locale} /></td>)}</tr>)}</tbody></table></div>;
}

function TypedLoadAnalysisView({ block, responseFormat, showLocalFormatFallback = false, locale, onAction }: { block: Extract<CoachAnswerBlock, { kind: "load_analysis" }>;
  responseFormat: CoachResponseFormat; showLocalFormatFallback?: boolean; locale: string;
  onAction: (code: CoachAnswerActionCode, entity?: CoachEntityRef) => void }) {
  const { t } = useTranslation("coach");
  const [chartOpen, setChartOpen] = useState(false);
  const value = block.assessment;
  const metrics = ["ctl", "atl", "form"] as const;
  const trendBlock = typedLoadTrendBlock(block);
  const chartableTrend = isChartableTimeSeries(trendBlock);
  const openDriver = (driver: CoachLoadAssessment["drivers"][number]) => onAction("OPEN_ACTIVITY", {
    entityType: "activity", entityId: driver.activityId, label: driver.title, occurredAt: driver.date,
  });
  return <section className="coach-answer__load" aria-labelledby={`coach-block-${block.blockId}`}>
    <h3 id={`coach-block-${block.blockId}`} className="coach-answer__block-title">{t("answer.load.title")}</h3>
    {value.confidence === "low" && <div className="coach-answer__notice" role="status"><strong>{t("answer.load.confidence.low")}</strong>
      <p>{t("answer.load.confidence.lowBody")}</p>{value.missingSignals.length > 0 && <ul>{value.missingSignals.map((signal) => <li key={signal}>{t("answer.load.missingSignal", { signal })}</li>)}</ul>}</div>}
    <div className="coach-answer__table-scroll"><table><caption>{t("answer.load.comparisonCaption")}</caption><thead><tr>
      <th scope="col">{t("answer.metricLabel")}</th><th scope="col">{t("answer.load.previousCanonical")}</th>
      <th scope="col">{t("answer.column.current")}</th><th scope="col">{t("answer.column.delta")}</th></tr></thead>
      <tbody>{metrics.map((metric) => <tr key={metric}><th scope="row"><MetricLabel metricId={metric} /></th>
        <td><Display item={value.previousComparable[metric]} locale={locale} /></td><td><Display item={value.current[metric]} locale={locale} /></td>
        <td><Display item={value.delta[metric]} locale={locale} showPositiveSign /></td></tr>)}</tbody></table></div>
    <section className="coach-answer__load-trend"><h4>{t("answer.load.weeklyTssTitle")}</h4>
      <p>{t("answer.load.weeklyTssBasis")}</p><div className="coach-answer__load-goal">
        <div><span>{t("answer.column.previous")}</span><Display item={value.weeklyTss.previousComparable} locale={locale} /></div>
        <div><span>{t("answer.column.current")}</span><Display item={value.weeklyTss.current} locale={locale} /></div>
        <div><span>{t("answer.column.delta")}</span><Display item={value.weeklyTss.delta} locale={locale} showPositiveSign /></div></div></section>
    {value.weeklyTrend.length > 0 && <section className="coach-answer__load-trend"><h4>{t("answer.load.trendTitle")}</h4>
      {showLocalFormatFallback && responseFormat === "chart" && !chartableTrend && <FormatFallbackNotice local />}
      {responseFormat === "auto" && chartableTrend && <Button type="button" variant="outline" aria-expanded={chartOpen} aria-controls={`coach-load-${block.blockId}`}
        onClick={() => setChartOpen((open) => !open)}>{t(chartOpen ? "answer.load.hideChart" : "answer.load.showChart")}</Button>}
      {responseFormat === "table" || !chartableTrend || (responseFormat === "auto" && chartOpen)
        ? <TypedLoadTrendTable block={block} locale={locale} />
        : responseFormat === "chart"
          ? <div id={`coach-load-${block.blockId}`}><SeriesGraphic block={trendBlock} locale={locale} /></div>
          : null}</section>}
    {value.drivers.length > 0 && <section><h4>{t("answer.load.driversTitle")}</h4><ol className="coach-answer__list">{value.drivers.map((driver) => <li key={driver.activityId}>
      <button type="button" className="coach-answer__driver" onClick={() => openDriver(driver)}><Display item={driver.title} locale={locale} /></button>
      <span><Display item={driver.date} locale={locale} /> · TSS <Display item={driver.tss} locale={locale} /> · <Display item={driver.durationMin} locale={locale} /> min
        {driver.distanceKm && <> · <Display item={driver.distanceKm} locale={locale} /> km</>} · <Display item={driver.weeklyLoadContributionPct} locale={locale} />%</span></li>)}</ol></section>}
    {value.goalAssessment && <section className="coach-answer__load-goal"><h4>{t("answer.load.goalTitle")}</h4>
      <div><span>{t("answer.goal.target")}</span><Display item={value.goalAssessment.target} locale={locale} /></div>
      <div><span>{t("answer.goal.current")}</span><Display item={value.goalAssessment.current} locale={locale} /></div>
      <div><span>{t("answer.load.goalResult")}</span><strong><Display item={value.goalAssessment.achieved} locale={locale} /> {t(value.goalAssessment.achieved.value ? "answer.load.goalAchieved" : "answer.load.goalNotAchieved")}</strong></div>
      {value.goalAssessment.achievedAt && <div><span>{t("answer.load.goalAchievedAt")}</span><Display item={value.goalAssessment.achievedAt} locale={locale} /></div>}</section>}
    <section><h4>{t("answer.load.bandTitle")}</h4><p>{t("answer.load.bandMeta", { catalog: value.bandAssessment.catalogVersion })}</p>
      <ul className="coach-answer__list">{value.bandAssessment.bands.map((band) => <li key={band.id} aria-current={band.id === value.bandAssessment.currentBandId ? "true" : undefined}>
        <strong>{t(BAND_KEYS[band.labelKey] ?? "answer.load.band.unknown")}</strong><span>{t(BAND_KEYS[band.explanationKey] ?? "answer.load.band.unknownExplanation")}</span>
        <small>{band.minInclusive && <Display item={band.minInclusive} locale={locale} />}{band.minInclusive && band.maxExclusive && " ≤ Form < "}{band.maxExclusive && <Display item={band.maxExclusive} locale={locale} />} · {band.referenceId}</small></li>)}</ul>
      <p>{t("answer.load.currentBand", { band: value.bandAssessment.currentBandId ?? t("answer.load.none") })}: <Display item={value.bandAssessment.currentValue} locale={locale} /></p></section>
    {value.confidence !== "low" && <p>{t(`answer.load.confidence.${value.confidence}`)}</p>}
    {value.reasonCodes.length > 0 && <details><summary>{t("answer.load.reasons")}</summary><ul>{value.reasonCodes.map((reason) => <li key={reason}>{reason}</li>)}</ul></details>}
    <BlockState block={block} />
  </section>;
}

function LoadAnalysisView({ group, responseFormat, showLocalFormatFallback, locale, onAction }: { group: LoadAnalysisGroup; responseFormat: CoachResponseFormat;
  showLocalFormatFallback: boolean; locale: string;
  onAction: (code: CoachAnswerActionCode, entity?: CoachEntityRef) => void }) {
  const { t } = useTranslation("coach");
  const [chartOpen, setChartOpen] = useState(false);
  if (group.typed) return <TypedLoadAnalysisView block={group.typed} responseFormat={responseFormat}
    showLocalFormatFallback={showLocalFormatFallback} locale={locale} onAction={onAction} />;
  const columns = ["previous", "current", "delta"] as const;
  return <section className="coach-answer__load" aria-labelledby="coach-load-title">
    <h3 id="coach-load-title" className="coach-answer__block-title">{t("answer.load.title")}</h3>
    {group.comparisons.length > 0 && <div className="coach-answer__table-scroll"><table>
      <caption>{t("answer.load.comparisonCaption")}</caption>
      <thead><tr><th scope="col">{t("answer.metricLabel")}</th>
        <th scope="col">{t("answer.column.previous")}</th><th scope="col">{t("answer.column.current")}</th>
        <th scope="col">{t("answer.column.delta")}</th></tr></thead>
      <tbody>{group.comparisons.map((row) => <tr key={row.rowId}><th scope="row"><MetricLabel metricId={row.metricId} /></th>
        {columns.map((column) => <td key={column}><Display item={row.cells[column]} locale={locale} showPositiveSign={column === "delta"} /></td>)}</tr>)}</tbody>
    </table></div>}
    {group.trends.length > 0 && <section className="coach-answer__load-trend" aria-labelledby="coach-load-trend-title">
      <h4 id="coach-load-trend-title">{t("answer.load.trendTitle")}</h4>
      {responseFormat === "auto" && <ul className="coach-answer__load-sequences">{group.trends.flatMap((block) => block.series
        .filter((series) => LOAD_METRIC_IDS.has(series.metricId)).map((series) => <li key={`${block.blockId}-${series.seriesId}`}>
          <strong><MetricLabel metricId={series.metricId} /></strong>
          <span aria-label={t("answer.load.sequenceLabel", { metric: t(`answer.metric.${series.metricId}`) })}>
            {series.points.map((point, index) => <Fragment key={`${point.at.evidenceId}-${point.value.evidenceId}`}>
              {index > 0 && <span aria-hidden="true"> → </span>}<Display item={point.value} locale={locale} />
            </Fragment>)}
          </span>
        </li>))}</ul>}
      {responseFormat === "auto" && group.trends.some(isChartableTimeSeries) && <Button type="button" variant="outline" aria-expanded={chartOpen} aria-controls="coach-load-charts"
        onClick={() => setChartOpen((open) => !open)}>{t(chartOpen ? "answer.load.hideChart" : "answer.load.showChart")}</Button>}
      {(responseFormat !== "auto" || chartOpen) && <div id="coach-load-charts" className="coach-answer__load-charts" aria-label={t("answer.load.chartRegion")}>
        {group.trends.map((block) => <div key={block.blockId}>{showLocalFormatFallback && responseFormat === "chart"
          && !isChartableTimeSeries(block) && <FormatFallbackNotice local />}{responseFormat === "table" || !isChartableTimeSeries(block)
          ? <TimeSeriesTable block={block} locale={locale} /> : <SeriesGraphic block={block} locale={locale} />}<BlockState block={block} /></div>)}
      </div>}
    </section>}
    {group.goal && <section className="coach-answer__load-goal" aria-labelledby="coach-load-goal-title">
      <h4 id="coach-load-goal-title">{t("answer.load.goalTitle")}</h4>
      <div><span>{t("answer.goal.target")}</span><Display item={group.goal.target} locale={locale} /></div>
      <div><span>{t("answer.goal.current")}</span><Display item={group.goal.current} locale={locale} /></div>
      {group.goal.progress && <div><span>{t("answer.goal.progress")}</span><Display item={group.goal.progress} locale={locale} /></div>}
      <BlockState block={group.goal} />
    </section>}
  </section>;
}

function SupportedBlock({ block, responseFormat, showLocalFormatFallback, locale, onAction }: {
  block: Exclude<CoachAnswerBlock, { kind: "unsupported_block" } | { kind: "prescription" }>;
  responseFormat: CoachResponseFormat;
  showLocalFormatFallback: boolean;
  locale: string;
  onAction: (code: CoachAnswerActionCode, entity?: CoachEntityRef) => void;
}) {
  const { t } = useTranslation("coach");
  if (block.kind === "load_analysis") return <TypedLoadAnalysisView block={block} responseFormat={responseFormat}
    showLocalFormatFallback={showLocalFormatFallback} locale={locale} onAction={onAction} />;
  let body: ReactNode;
  let formatFallback = false;
  if (block.kind === "grounded_markdown") {
    body = <GroundedMarkdown markdown={block.markdown} />;
  } else if (block.kind === "narrative") {
    const order = block.templateKey.endsWith("comparison_summary") ? ["current", "previous", "delta"] : ["current"];
    body = <div className="coach-answer__narrative"><Text id={`coach-block-${block.blockId}`} as="h3" variant="subtitle">{t(`answer.template.${block.templateKey.split(".").slice(-1)[0]}`)}</Text>
      <div className="coach-answer__narrative-values">{order.flatMap((key) => block.placeholders[key] ? [<Display key={key} item={block.placeholders[key]} locale={locale} className="coach-answer__strong" />] : [])}</div></div>;
  } else if (block.kind === "metric_grid") {
    body = responseFormat === "table" ? <MetricGridTable block={block} locale={locale} />
      : <div className="coach-answer__metric-grid"><MoreItems items={block.items} render={(item, index) => <Card key={`${item.metricId}-${index}`} padding="compact">
      <Text as="div" variant="label"><MetricLabel metricId={item.metricId} /></Text><Display item={item.current} locale={locale} className="coach-answer__metric" />
      </Card>} /></div>;
  } else if (block.kind === "comparison_table") {
    body = <div className="coach-answer__table-scroll"><table><caption>{t("answer.block.comparison_table")}</caption><thead><tr><th scope="col">{t("answer.metricLabel")}</th>
      {block.columns.map((column) => <th key={column.id} scope="col">{t(`answer.column.${column.id}`)}</th>)}</tr></thead>
      <tbody>{block.rows.map((row) => <tr key={row.rowId}><th scope="row"><MetricLabel metricId={row.metricId} /></th>
        {block.columns.map((column) => <td key={column.id}><Display item={row.cells[column.id]} locale={locale} /></td>)}</tr>)}</tbody></table></div>;
  } else if (block.kind === "time_series") {
    formatFallback = responseFormat === "chart" && !isChartableTimeSeries(block);
    body = responseFormat === "table" || !isChartableTimeSeries(block)
      ? <TimeSeriesTable block={block} locale={locale} /> : <SeriesGraphic block={block} locale={locale} />;
  } else if (block.kind === "distribution") {
    const numeric = block.categories.length > 0 && block.categories.every((item) => typeof item.value.value === "number");
    formatFallback = responseFormat === "chart" && !numeric;
    body = responseFormat === "table" || (responseFormat === "chart" && !numeric) ? <DistributionTable block={block} locale={locale} />
      : responseFormat === "chart" && numeric ? <DistributionGraphic block={block} locale={locale} />
      : <ul className="coach-answer__list"><MoreItems listKind="ul" items={block.categories} render={(item) => <li key={item.categoryId}>
      <Display item={item.label} locale={locale} /><Display item={item.value} locale={locale} className="coach-answer__strong" />
    </li>} /></ul>;
  } else if (block.kind === "ranking") {
    body = <ol className="coach-answer__list coach-answer__ranking"><MoreItems listKind="ol" items={block.entries} render={(entry, index) => <li key={`${entry.entity.entityId}-${index}`}>
      <Display item={entry.rank} locale={locale} /><Entity entity={entry.entity} locale={locale} /><span>{entry.values.map((value, valueIndex) => <Display key={valueIndex} item={value} locale={locale} />)}</span>
    </li>} /></ol>;
  } else if (block.kind === "activity_list") {
    body = <ul className="coach-answer__list"><MoreItems listKind="ul" items={block.activities} render={(entry, index) => <li key={`${entry.activity.entityId}-${index}`}>
      <Entity entity={entry.activity} locale={locale} /><span>{entry.values.map((value, valueIndex) => <Display key={valueIndex} item={value} locale={locale} />)}</span>
    </li>} /></ul>;
  } else if (block.kind === "goal_progress") {
    body = <div className="coach-answer__goal"><div><span>{t("answer.goal.current")}</span><Display item={block.current} locale={locale} /></div>
      <div><span>{t("answer.goal.target")}</span><Display item={block.target} locale={locale} /></div>
      {block.progress && <div><span>{t("answer.goal.progress")}</span><Display item={block.progress} locale={locale} /></div>}</div>;
  } else if (block.kind === "plan_adherence") {
    body = <div className="coach-answer__plan"><div className="coach-answer__metric-grid"><Card padding="compact"><Text as="div" variant="label">{t("answer.plan.planned")}</Text><Display item={block.planned} locale={locale} /></Card>
      <Card padding="compact"><Text as="div" variant="label">{t("answer.plan.completed")}</Text><Display item={block.completed} locale={locale} /></Card></div>
      {block.missed.length > 0 && <details><summary>{t("answer.plan.missed", { count: block.missed.length })}</summary><ul>{block.missed.map((item) => <li key={item.planned.entityId}><Entity entity={item.planned} locale={locale} /></li>)}</ul></details>}
      {block.replacements.length > 0 && <details><summary>{t("answer.plan.replacements", { count: block.replacements.length })}</summary><ul>{block.replacements.map((item) => <li key={`${item.planned.entityId}-${item.actual.entityId}`}><Entity entity={item.planned} locale={locale} /> → <Entity entity={item.actual} locale={locale} /></li>)}</ul></details>}</div>;
  } else if (block.kind === "data_gap") {
    body = <div className="coach-answer__notice" role="status"><Text as="h3" variant="subtitle">{t("answer.gap.title")}</Text><p>{t("answer.gap.body")}</p>
      {block.missingMetricIds.length > 0 && <ul>{block.missingMetricIds.map((metric) => <li key={metric}><MetricLabel metricId={metric} /></li>)}</ul>}</div>;
  } else {
    body = <Button variant="outline" onClick={() => onAction(block.actionCode, block.entity)}>{t(`answer.action.${block.actionCode}`)}</Button>;
  }
  return <section className={`coach-answer__block coach-answer__block--${block.kind}`}
    {...(block.kind === "grounded_markdown" ? {} : { "aria-labelledby": `coach-block-${block.blockId}` })}>
    {block.kind !== "narrative" && block.kind !== "grounded_markdown"
      && <h3 id={`coach-block-${block.blockId}`} className="coach-answer__block-title">{t(`answer.block.${block.kind}`)}</h3>}
    {showLocalFormatFallback && formatFallback && <FormatFallbackNotice local />}{body}<BlockState block={block} />
  </section>;
}

function MarkdownInline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*\n]+\*\*)/u);
  return <>{parts.map((part, index) => part.startsWith("**") && part.endsWith("**")
    ? <strong key={index}>{part.slice(2, -2)}</strong> : <Fragment key={index}>{part}</Fragment>)}</>;
}

function GroundedMarkdown({ markdown }: { markdown: string }) {
  const rows = markdown.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const nodes: ReactNode[] = [];
  for (let index = 0; index < rows.length;) {
    const line = rows[index]!;
    const emphasizedHeading = line.match(/^\*\*([^*\n]+)\*\*$/u);
    if (emphasizedHeading) {
      nodes.push(<h4 key={index}>{emphasizedHeading[1]}</h4>); index += 1; continue;
    }
    if (line.startsWith("### ")) {
      nodes.push(<h4 key={index}><MarkdownInline text={line.slice(4)} /></h4>); index += 1; continue;
    }
    if (line.startsWith("## ")) {
      nodes.push(<h3 key={index}><MarkdownInline text={line.slice(3)} /></h3>); index += 1; continue;
    }
    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (rows[index]?.startsWith("- ")) items.push(rows[index++]!.slice(2));
      nodes.push(<ul key={`u-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}><MarkdownInline text={item} /></li>)}</ul>); continue;
    }
    if (/^\d+[.]\s/u.test(line)) {
      const items: string[] = [];
      while (rows[index] && /^\d+[.]\s/u.test(rows[index]!)) items.push(rows[index++]!.replace(/^\d+[.]\s/u, ""));
      nodes.push(<ol key={`o-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}><MarkdownInline text={item} /></li>)}</ol>); continue;
    }
    nodes.push(<p key={index}><MarkdownInline text={line} /></p>); index += 1;
  }
  return <article className="coach-answer__markdown">{nodes}</article>;
}

export function CoachAnswerDocumentView({ response, responseFormat = "auto", locale, onAction, onReanalyze = () => undefined, historical = false }: {
  response: CoachV2Response;
  responseFormat?: CoachResponseFormat;
  locale: string;
  onAction: (code: CoachAnswerActionCode, entity?: CoachEntityRef) => void;
  onReanalyze?: () => void;
  historical?: boolean;
}) {
  const { t } = useTranslation("coach");
  const document = response.answer;
  if (!document) return null;
  const fallback = response.outcome !== "answer";
  const loadAnalysis = document.compatibility === "supported" ? collectLoadAnalysisGroup(document) : null;
  const hasGroundedMarkdown = document.blocks.some((block) => block.kind === "grounded_markdown");
  const loadChartable = loadAnalysis?.typed ? isChartableTimeSeries(typedLoadTrendBlock(loadAnalysis.typed))
    : loadAnalysis?.trends.some(isChartableTimeSeries) ?? false;
  const chartable = loadChartable || document.blocks.some((block) => {
    if (loadAnalysis?.blockIds.has(block.blockId)) return false;
    if (block.kind === "time_series") return isChartableTimeSeries(block);
    if (block.kind === "distribution") return block.categories.length > 0
      && block.categories.every((item) => typeof item.value.value === "number");
    return false;
  });
  return <div className={`coach-answer${historical ? " coach-answer--historical" : ""}`}>
    {fallback && !historical && <div className="coach-answer__fallback" role="alert"><strong>{t("answer.fallback.title")}</strong><p>{t("answer.fallback.body")}</p></div>}
    {responseFormat === "chart" && !chartable && !hasGroundedMarkdown && <FormatFallbackNotice />}
    {document.compatibility === "unsupported_schema" ? <UnsupportedBlockNotice /> : <>
      {document.blocks.map((block) => {
        if (loadAnalysis?.blockIds.has(block.blockId)) {
          if (block.blockId !== loadAnalysis.firstBlockId) return null;
          return <LoadAnalysisView key="load-analysis" group={loadAnalysis} responseFormat={responseFormat}
            showLocalFormatFallback={responseFormat === "chart" && chartable} locale={locale} onAction={onAction} />;
        }
        return block.kind === "unsupported_block"
          ? <UnsupportedBlockNotice key={block.blockId} prescription={block.reason === "prescription_feature_disabled"} />
          : block.kind === "prescription"
            ? <CoachPrescription key={block.blockId} initial={block.prescription} parentRequestId={response.requestId}
              locale={locale} onReanalyze={onReanalyze} />
          : <SupportedBlock key={block.blockId} block={block} responseFormat={responseFormat}
            showLocalFormatFallback={responseFormat === "chart" && chartable} locale={locale} onAction={onAction} />;
      })}
      <footer className="coach-answer__metadata"><span>{t("answer.freshness", { at: formatDate(document.freshness.asOf, locale, document.freshness.timezone) })}</span>
        <span>{t("answer.timezone", { timezone: document.freshness.timezone })}</span>
        {document.status === "partial" && <span>{t("answer.state.partial")}</span>}</footer>
    </>}
  </div>;
}

export function UnsupportedBlockNotice({ prescription = false }: { prescription?: boolean }) {
  const { t } = useTranslation("coach");
  return <div className="coach-answer__unsupported" role="status"><strong>{t(prescription ? "answer.prescriptionDisabled.title" : "answer.unsupportedBlock.title")}</strong>
    <p>{t(prescription ? "answer.prescriptionDisabled.body" : "answer.unsupportedBlock.body")}</p></div>;
}

export function supportedAnswerBlockKinds(document: CoachAnswerDocument): string[] {
  return document.blocks.filter((block) => block.kind !== "unsupported_block").map((block) => block.kind);
}
