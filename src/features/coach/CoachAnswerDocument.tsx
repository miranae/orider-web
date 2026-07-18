import { Fragment, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card, Chip, Text } from "../../theme/components";
import type {
  CoachAnswerActionCode, CoachAnswerBlock, CoachAnswerDocument, CoachDisplayValue, CoachEntityRef,
  CoachEvidenceRecord, CoachMetricId, CoachV2Response,
} from "../../services/coachV2Contract";

const PRIMARY_COUNT = 5;

function formatDate(value: string, locale: string, timezone?: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", ...(timezone ? { timeZone: timezone } : {}) }).format(new Date(value));
  } catch { return value; }
}

function primitiveText(value: unknown, locale: string): string {
  if (value === null) return "—";
  if (typeof value === "number") return new Intl.NumberFormat(locale, { maximumFractionDigits: 2, signDisplay: "auto" }).format(value);
  if (typeof value === "boolean") return value ? "✓" : "—";
  if (typeof value === "string") return value;
  return "";
}

function Display({ item, locale, className }: { item: CoachDisplayValue; locale: string; className?: string }) {
  const { t } = useTranslation("coach");
  const value = primitiveText(item.value, locale);
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

function SeriesGraphic({ block, locale }: { block: Extract<CoachAnswerBlock, { kind: "time_series" }>; locale: string }) {
  const { t } = useTranslation("coach");
  const numeric = block.series.flatMap((series) => series.points.map((point) => typeof point.value.value === "number" ? point.value.value : null)).filter((value): value is number => value !== null);
  const min = numeric.length > 0 ? Math.min(...numeric) : 0;
  const max = numeric.length > 0 ? Math.max(...numeric) : 0;
  const span = max - min || 1;
  return <div className="coach-answer__series">
    <svg viewBox="0 0 100 40" role="img" aria-label={t("answer.chart.visualLabel")} preserveAspectRatio="none">
      {block.series.map((series, seriesIndex) => {
        const points = series.points.map((point, index) => {
          const x = series.points.length <= 1 ? 50 : index * 100 / (series.points.length - 1);
          const number = typeof point.value.value === "number" ? point.value.value : min;
          return `${x},${36 - ((number - min) / span) * 32}`;
        }).join(" ");
        return <polyline key={series.seriesId} points={points} className={`coach-answer__line coach-answer__line--${seriesIndex % 3}`} />;
      })}
    </svg>
    <div className="coach-answer__table-scroll"><table>
      <caption>{t("answer.chart.tableCaption")}</caption>
      <thead><tr><th scope="col">{t("answer.chart.series")}</th><th scope="col">{t("answer.chart.at")}</th><th scope="col">{t("answer.chart.value")}</th></tr></thead>
      <tbody>{block.series.flatMap((series) => series.points.map((point, index) => <tr key={`${series.seriesId}-${index}`}>
        <th scope="row"><MetricLabel metricId={series.metricId} /></th><td><Display item={point.at} locale={locale} /></td><td><Display item={point.value} locale={locale} /></td>
      </tr>))}</tbody>
    </table></div>
  </div>;
}

function SupportedBlock({ block, locale, onAction }: {
  block: Exclude<CoachAnswerBlock, { kind: "unsupported_block" }>;
  locale: string;
  onAction: (code: CoachAnswerActionCode, entity?: CoachEntityRef) => void;
}) {
  const { t } = useTranslation("coach");
  let body: ReactNode;
  if (block.kind === "narrative") {
    const order = block.templateKey.endsWith("comparison_summary") ? ["current", "previous", "delta"] : ["current"];
    body = <div className="coach-answer__narrative"><Text id={`coach-block-${block.blockId}`} as="h3" variant="subtitle">{t(`answer.template.${block.templateKey.split(".").slice(-1)[0]}`)}</Text>
      <div className="coach-answer__narrative-values">{order.flatMap((key) => block.placeholders[key] ? [<Display key={key} item={block.placeholders[key]} locale={locale} className="coach-answer__strong" />] : [])}</div></div>;
  } else if (block.kind === "metric_grid") {
    body = <div className="coach-answer__metric-grid"><MoreItems items={block.items} render={(item, index) => <Card key={`${item.metricId}-${index}`} padding="compact">
      <Text as="div" variant="label"><MetricLabel metricId={item.metricId} /></Text><Display item={item.current} locale={locale} className="coach-answer__metric" />
    </Card>} /></div>;
  } else if (block.kind === "comparison_table") {
    body = <div className="coach-answer__table-scroll"><table><caption>{t("answer.block.comparison_table")}</caption><thead><tr><th scope="col">{t("answer.metricLabel")}</th>
      {block.columns.map((column) => <th key={column.id} scope="col">{t(`answer.column.${column.id}`)}</th>)}</tr></thead>
      <tbody>{block.rows.map((row) => <tr key={row.rowId}><th scope="row"><MetricLabel metricId={row.metricId} /></th>
        {block.columns.map((column) => <td key={column.id}><Display item={row.cells[column.id]} locale={locale} /></td>)}</tr>)}</tbody></table></div>;
  } else if (block.kind === "time_series") {
    body = <SeriesGraphic block={block} locale={locale} />;
  } else if (block.kind === "distribution") {
    body = <ul className="coach-answer__list"><MoreItems listKind="ul" items={block.categories} render={(item) => <li key={item.categoryId}>
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
  return <section className={`coach-answer__block coach-answer__block--${block.kind}`} aria-labelledby={`coach-block-${block.blockId}`}>
    {block.kind !== "narrative" && <h3 id={`coach-block-${block.blockId}`} className="coach-answer__block-title">{t(`answer.block.${block.kind}`)}</h3>}
    {body}<BlockState block={block} />
  </section>;
}

function Evidence({ records, locale, timezone }: { records: CoachEvidenceRecord[]; locale: string; timezone: string }) {
  const { t } = useTranslation("coach");
  return <details className="coach-answer__evidence"><summary>{t("answer.evidence.toggle", { count: records.length })}</summary>
    <ol>{records.map((record, index) => <li key={record.evidenceId} data-evidence-id={record.evidenceId}>
      <span>{t("answer.evidence.item", { index: index + 1 })}</span>
      {(["string", "number", "boolean"].includes(typeof record.value) || record.value === null) && <strong>{primitiveText(record.value, locale)}</strong>}
      <small>{formatDate(record.asOf, locale, timezone)}</small>
    </li>)}</ol></details>;
}

export function CoachAnswerDocumentView({ response, locale, onAction }: {
  response: CoachV2Response;
  locale: string;
  onAction: (code: CoachAnswerActionCode, entity?: CoachEntityRef) => void;
}) {
  const { t } = useTranslation("coach");
  const document = response.answer;
  if (!document) return null;
  const fallback = response.outcome !== "answer";
  return <div className="coach-answer">
    {fallback && <div className="coach-answer__fallback" role="alert"><strong>{t("answer.fallback.title")}</strong><p>{t("answer.fallback.body")}</p></div>}
    {document.compatibility === "unsupported_schema" ? <UnsupportedBlockNotice /> : <>
      {document.blocks.map((block) => block.kind === "unsupported_block"
        ? <UnsupportedBlockNotice key={block.blockId} prescription={block.reason === "prescription_feature_disabled"} />
        : <SupportedBlock key={block.blockId} block={block} locale={locale} onAction={onAction} />)}
      <footer className="coach-answer__metadata"><span>{t("answer.freshness", { at: formatDate(document.freshness.asOf, locale, document.freshness.timezone) })}</span>
        <span>{t("answer.timezone", { timezone: document.freshness.timezone })}</span>
        {document.status === "partial" && <span>{t("answer.state.partial")}</span>}</footer>
      <Evidence records={document.evidence} locale={locale} timezone={document.freshness.timezone} />
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
