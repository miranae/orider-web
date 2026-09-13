import FitnessChart from "../../../components/FitnessChart";
import { DisciplineTabs, EmptyState, ErrorState, LoadingSkeleton } from "../../../components/redesign";
import TodayTrainingDecisionCard from "../../trainingDecision/TodayTrainingDecisionCard";
import type { CanonicalFitnessSummaryState } from "../../../hooks/useCanonicalFitnessSummary";
import type { FitnessModel } from "../../../hooks/useFitnessModel";
import { Card, Text, buttonClass } from "../../../theme/components";
import { getDisciplineColor } from "../../../utils/disciplineFilter";

interface CanonicalFitnessViewProps {
  embedded?: boolean;
  model: FitnessModel;
}

function StateNotice({ state, t }: { state: CanonicalFitnessSummaryState; t: FitnessModel["t"] }) {
  if (state.display === "value" && !state.showingLastGood) return null;
  const key = state.display === "error" ? "failed" : state.status ?? "processing";
  return (
    <div
      role={key === "failed" ? "alert" : "status"}
      style={{
        padding: "var(--space-3) var(--space-4)", border: "1px solid var(--line-soft)",
        borderRadius: "var(--r-md)", background: "var(--bg-1)", color: "var(--ink-2)",
        marginBottom: "var(--space-4)",
      }}
    >
      <strong style={{ color: "var(--ink-0)" }}>{t(`canonical.status.${key}`)}</strong>
      {state.showingLastGood && <span> · {t("canonical.lastGood")}</span>}
      {(key === "failed" || key === "processing") && (
        <button type="button" className={buttonClass({ variant: "ghost", size: "sm" })} onClick={state.retry} style={{ marginLeft: "var(--space-3)" }}>
          {t("canonical.retry")}
        </button>
      )}
    </div>
  );
}

export default function CanonicalFitnessView({ embedded = false, model }: CanonicalFitnessViewProps) {
  const { canonicalFitness: state, discipline, range, setRange, t } = model;
  const values = state.values;
  const padding = embedded ? "var(--space-5) var(--space-4) var(--space-8)" : "var(--space-6)";
  if (state.display === null || (state.display === "loading" && values === null)) {
    return <div style={{ padding }}><LoadingSkeleton kind="chart" /></div>;
  }
  if (state.display === "error" && values === null) {
    return <div style={{ padding }}>
      <ErrorState title={t("canonical.errorTitle")} description={t("canonical.errorBody")} onRetry={state.retry} />
    </div>;
  }
  if (state.display === "empty" && values === null) {
    return <div style={{ padding }}>
      <EmptyState icon="📈" title={t("canonical.emptyTitle")} description={t("canonical.emptyBody")} />
    </div>;
  }
  if (!values) return null;

  const selected = discipline === "tri" ? values : values.breakdown[discipline];
  const points = discipline === "tri" ? [] : values.timeseries[discipline]?.points ?? [];
  const visiblePoints = points.slice(-range);
  const meta = state.metadata;
  const period = meta?.period;
  const coverage = (["bike", "run", "swim"] as const)
    .filter((item) => discipline === "tri" || item === discipline)
    .map((item) => {
      const history = values.timeseries[item];
      return history ? `${item}: ${history.startDate ?? "—"} – ${history.endDate ?? "—"} (${history.pointCount})` : null;
    })
    .filter((entry): entry is string => entry !== null)
    .join(" · ") || null;
  const metaRows = [
    [t("canonical.meta.revision"), meta?.inputRevision],
    [t("canonical.meta.generation"), meta?.generation],
    [t("canonical.meta.asOf"), meta?.asOf == null ? null : new Date(meta.asOf).toISOString()],
    [t("canonical.meta.timezone"), meta?.timezone],
    [t("canonical.meta.period"), period ? `${new Date(period.start).toISOString()} – ${new Date(period.end).toISOString()}` : null],
    [t("canonical.meta.coverage"), coverage],
    [t("canonical.meta.algorithm"), meta?.algorithmVersion],
  ] as const;

  return (
    <div className="site-shell" style={{ padding }} data-testid="canonical-fitness-view">
      <StateNotice state={state} t={t} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-4)" }}>
        <Text as="h1" variant="pageTitle">{t("title")}</Text>
        <DisciplineTabs includeTri />
      </div>
      {discipline !== "tri" && model.user && (
        <div style={{ marginBottom: "var(--space-4)" }}>
          <TodayTrainingDecisionCard user={model.user} discipline={discipline} surface="fitness" />
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "var(--space-3)" }}>
        {(["ctl", "atl", "tsb"] as const).map((metric) => (
          <Card key={metric} padding="compact">
            <Text as="div" variant="eyebrow">{t(metric)}</Text>
            <Text as="div" variant="dataLarge">{selected[metric].toFixed(1)}</Text>
          </Card>
        ))}
      </div>

      {discipline === "tri" && (
        <Card padding="compact" style={{ marginTop: "var(--space-4)" }}>
          <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-3)" }}>{t("canonical.breakdown")}</Text>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "var(--space-3)" }}>
            {(["bike", "run", "swim"] as const).map((item) => (
              <div key={item}>
                <Text as="div" variant="eyebrow">{t(`discipline.${item}`)}</Text>
                <Text as="div" variant="dataMedium">CTL {values.breakdown[item].ctl.toFixed(1)}</Text>
              </div>
            ))}
          </div>
          <Text as="div" variant="eyebrow" style={{ marginTop: "var(--space-3)", color: "var(--ink-3)" }}>
            {t("canonical.integratedHistoryUnavailable")}
          </Text>
        </Card>
      )}

      {discipline !== "tri" && (
        <Card padding="compact" style={{ marginTop: "var(--space-4)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
            <Text as="div" variant="eyebrow">{t("history.canonical")}</Text>
            <select value={range} onChange={(event) => setRange(Number(event.target.value) as 30 | 90 | 180 | 365)} aria-label={t("history.range")}>
              {[30, 90, 180, 365].map((days) => <option key={days} value={days}>{t(`range.${days}`)}</option>)}
            </select>
          </div>
          {visiblePoints.length > 0
            ? <FitnessChart data={visiblePoints} today={visiblePoints[visiblePoints.length - 1]?.date} ctlColor={getDisciplineColor(discipline)} />
            : <EmptyState icon="📈" title={t("history.empty")} />}
        </Card>
      )}

      <details style={{ marginTop: "var(--space-4)" }}>
        <summary style={{ cursor: "pointer", color: "var(--ink-2)" }}>{t("canonical.meta.title")}</summary>
        <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "var(--space-2) var(--space-3)", fontSize: "var(--fs-xs)" }}>
          {metaRows.map(([label, value]) => <div key={label} style={{ display: "contents" }}>
            <dt style={{ color: "var(--ink-3)" }}>{label}</dt><dd style={{ margin: 0, overflowWrap: "anywhere" }}>{value ?? "—"}</dd>
          </div>)}
        </dl>
      </details>
    </div>
  );
}
