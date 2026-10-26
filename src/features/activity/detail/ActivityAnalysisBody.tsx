import { Fragment, isValidElement, type ComponentProps, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ActivityOverviewPresentation } from "@shared/types/activity-overview";
import { ActivityPowerComparison } from "./ActivityPowerComparison";
import AnalysisTab, { type ActivityAnalysisSections } from "../../../components/AnalysisTab";
import type { useActivityOverview } from "../../../hooks/useActivityOverview";
import GlossaryProvider from "../../../components/common/GlossaryProvider";
import GlossaryText from "../../../components/common/GlossaryText";
import { Link } from "react-router-dom";
import FuelSplitBar from "../../../components/FuelSplitBar";
import { Button, Chip, Disclosure, Section, Stack, Stat, Text } from "../../../theme/components";
import { zoneSurfaceStyle } from "../../../theme/charts/zoneSurface";
import { FitnessShift, IntensityGauge, OverviewPowerCurve, PercentMeter, formatSpan, powerDurationSeconds } from "./ActivityOverviewCharts";

interface Props {
  overview: ReturnType<typeof useActivityOverview>;
  analysisProps: ComponentProps<typeof AnalysisTab> | null;
  isOwner: boolean;
  preview: boolean;
  ftpW: number | null;
  totalCalories: number | null;
  storedLoad: number | null;
  sharedStats: { averagePower: number | null; averageCadence: number | null; averageHeartRate: number | null; maxHeartRate: number | null };
  timeline: ReactNode;
  provenance: ReactNode;
  benchmark: ReactNode;
  peakInspector: ReactNode;
  sensorFallback: ReactNode;
  powerControls?: ReactNode;
  summaryOutside?: boolean;
}

function readable(node: ReactNode): boolean {
  if (node == null || typeof node === "boolean") return false;
  if (typeof node === "string") return node.trim().length > 0;
  if (Array.isArray(node)) return node.some(readable);
  if (isValidElement<{ children?: ReactNode }>(node) && node.type === Fragment) return readable(node.props.children);
  return true;
}

/** A section belongs to a reader's question; existing card boundaries do not determine its contents. */
function Topic({ id, title, children, visible = true }: { id: string; title: string; children: ReactNode; visible?: boolean }) {
  if (!visible || !readable(children)) return null;
  return <Section className="activity-analysis-topic" title={title} headingId={`analysis-topic-${id}`} data-analysis-topic={id}>
    <div className="activity-analysis-topic__body">{children}</div>
  </Section>;
}

export default function ActivityAnalysisBody(props: Props) {
  const { overview, analysisProps, isOwner, preview, ftpW, timeline, provenance, benchmark, peakInspector, sensorFallback } = props;
  const { t } = useTranslation("activity");
  const p = overview.enabled && !overview.loading && overview.response?.status === "available" ? overview.response.presentation : undefined;
  const label = (key: string) => t(`overviewEvidence.${key}`);
  const copy = (key: string) => t(`overviewSummary.${key}`);
  const num = (value: number | null | undefined, unit = "") => value != null && Number.isFinite(value) ? `${Math.round(value * 10) / 10}${unit}` : "—";
  const span = (seconds: number) => formatSpan(seconds, { hour: copy("hour"), minute: copy("minute"), second: copy("second") });
  const signed = (value: number | undefined, unit: string) => value != null && Number.isFinite(value) ? `${value > 0 ? "+" : ""}${num(value, unit)}` : "—";
  const note = (value: ReactNode) => <Text as="p" variant="caption" tone="tertiary"><GlossaryText>{value}</GlossaryText></Text>;
  const facts = (rows: [string, ReactNode][]) => <dl className="activity-analysis-facts">{rows.map(([name, value]) => <div key={name}><Text as="dt" variant="bodySmall" tone="secondary"><GlossaryText>{name}</GlossaryText></Text><Text as="dd" variant="bodyMedium" weight={600}>{value}</Text></div>)}</dl>;
  const personal = (axes: string[]) => (p?.personal ?? []).filter(row => axes.includes(row.axis)).map(row => <div key={row.axis} className="activity-analysis-comparison">
    <PercentMeter mid value={row.personalIndex} label={<GlossaryText>{label(`axes.${row.axis}`)}</GlossaryText>} display={`${num(row.personalIndex)} · ${row.sampleCount}${copy("samples")}`} />
    {note(`${label(`bands.${row.band}`)}${p?.comparisonMetadata ? ` · ${t("overviewEvidence.scope", { days: p.comparisonMetadata.windowDays, count: row.sampleCount, character: label(`characters.${p.comparisonMetadata.character}`) })} · ${label(`completeness.${p.comparisonMetadata.historyCompleteness}`)}` : ""}`)}
  </div>);

  const render = (raw: ActivityAnalysisSections) => {
    const context = raw.context;
    const power = p?.session.discipline === "bike";
    const effort = power ? p?.thresholdWork : undefined;
    const energy = power ? p?.energy : undefined;
    const canonicalFuel = energy?.fatPct != null && energy.carbPct != null;
    const currentFtp = context?.ftp ?? ftpW;
    const records = p?.availability?.records === "evaluated";
    const curveRows = [...(power ? p?.powerFingerprint ?? [] : [])];
    // Add existing measured durations to the same curve, retaining canonical comparison fields.
    for (const point of context?.powerCurve ?? []) {
      if (!curveRows.some(row => powerDurationSeconds(row.duration) === point.durationSeconds)) {
        const seconds = point.durationSeconds;
        curveRows.push({ duration: seconds >= 3600 && seconds % 3600 === 0 ? `${seconds / 3600}h` : seconds >= 60 && seconds % 60 === 0 ? `${seconds / 60}m` : `${seconds}s`, watts: point.maxPower });
      }
    }
    curveRows.sort((a, b) => (powerDurationSeconds(a.duration) ?? 0) - (powerDurationSeconds(b.duration) ?? 0));
    type PowerRow = NonNullable<ActivityOverviewPresentation["powerFingerprint"]>[number];
    const powerColumns: { label: string; value: (row: PowerRow) => string; primary?: boolean }[] = [
      { label: label("duration"), value: row => row.duration, primary: true },
      { label: "W", value: row => num(row.watts), primary: true },
      ...(context?.weightKg ? [{ label: "W/kg", value: (row: PowerRow) => (row.watts / context.weightKg!).toFixed(2) }] : []),
      ...(currentFtp ? [{ label: "% FTP", value: (row: PowerRow) => num(row.watts / currentFtp * 100, "%") }] : []),
      { label: label("allTimeBest"), value: row => records ? num(row.allTimeBestWatts, " W") : "—" },
      { label: label("bestPct"), value: row => records ? num(row.allTimeBestPct, "%") : "—" },
      { label: label("previousBestPct"), value: row => records ? num(row.previousBestPct, "%") : "—" },
      { label: label("median"), value: row => num(row.medianWatts, " W") },
      { label: label("change"), value: row => signed(row.deltaPct, "%") },
      { label: label("rank"), value: row => num(row.competitionRank) },
      { label: label("samples"), value: row => num(row.priorSampleCount) },
      { label: "PR", value: row => records && row.recordAchievement ? label(`records.${row.recordAchievement}`) : "—" },
    ];
    const availablePowerColumns = powerColumns.filter(column => column.primary || curveRows.some(row => column.value(row) !== "—"));
    const zones = (p?.zones ?? []).filter(zone => zone.kind !== "power" || power);
    const fitness = p?.priorFitnessStatus;
    const post = p?.postFitnessStatus;
    const fitnessName = (key: "ctl" | "atl" | "tsb") => p?.fitnessScope === "integrated" ? copy(`integrated_${key}`) : copy(key);
    const form = (state: NonNullable<ActivityOverviewPresentation["priorFitnessStatus"]>) => p?.fitnessEvidence && p.fitnessEvidence !== "sufficient" ? label("fitnessLimited") : label(`forms.${state.formBand}`);
    const modelCalories = energy?.totalKcal ?? context?.substrate?.totalKcal;
    const activityCalories = props.totalCalories ?? context?.caloriesKcal;
    // Producer-defined labels only. Unknown server facts remain visible; no fuzzy text routing.
    const sourceValue = (value: number | null | undefined, suffix: string) => value != null ? `${Math.round(value * 10) / 10}${suffix}` : null;
    const knownFacts: Record<string, string | null> = {};
    for (const [ko, en, value] of [
      ["분석 기준 FTP", "Analysis FTP", sourceValue(currentFtp, "W")],
      ["평균 파워", "Average power", sourceValue(props.sharedStats.averagePower, "W")],
      ["일량", "Work", sourceValue(context?.workKj, "kJ")],
      ["평균 케이던스", "Average cadence", sourceValue(props.sharedStats.averageCadence, "rpm")],
      ["평균 심박", "Average HR", sourceValue(props.sharedStats.averageHeartRate, "bpm")],
      ["최대 심박", "Max HR", sourceValue(props.sharedStats.maxHeartRate, "bpm")],
    ] as const) { knownFacts[ko] = value; knownFacts[en] = value; }
    const remainingDetails = (p?.sportDetails ?? []).filter(row => knownFacts[row.label] == null || row.value.replace(/\s+/g, "") !== knownFacts[row.label]?.replace(/\s+/g, ""));
    const detailFacts = (labels: string[]) => remainingDetails.filter(row => labels.includes(row.label));
    const extras = (labels: string[]) => { const rows = detailFacts(labels); return rows.length ? facts(rows.map(row => [row.label, row.value])) : null; };
    const extraDetails = remainingDetails.filter(row => !Object.prototype.hasOwnProperty.call(knownFacts, row.label));
    return <GlossaryProvider scopeKey="activity-analysis-domains"><div className="activity-analysis-domains" data-testid="activity-analysis-domains">
      <Topic id="timeline" title={t("detail.analysisTopics.timeline")}>{timeline}</Topic>
      {raw.status}
      {overview.enabled && !p && isOwner && <div role={overview.loading ? "status" : undefined} className="activity-analysis-source-state">
        {note(t(overview.loading ? "overviewEvidence.loading" : overview.error ? "overviewEvidence.error" : overview.response?.status === "unavailable" ? `overviewEvidence.unavailable.${overview.response.reason}` : "overviewEvidence.missing"))}
        {!overview.loading && !(overview.response?.status === "unavailable" && overview.response.reason === "rollout_disabled") && <Button size="sm" variant="outline" onClick={overview.retry}>{label("retry")}</Button>}
      </div>}
      <Topic id="training" title={t("detail.analysisTopics.training")} visible={!!p && (p.session.load != null || p.session.normalizedPowerW != null || p.session.intensityFactor != null || !!fitness || !!p.coachSentence || !!p.personal?.length || p.thresholdBasis === "none") || readable(raw.load) || props.storedLoad != null}>
        {p && !props.summaryOutside && <Stack gap="var(--space-3)">
          <Stack direction="row" wrap>{p.session.character && <Chip variant="accent">{label(`characters.${p.session.character}`)}</Chip>}{p.aboveUsualVolume && <Chip>{copy("aboveUsualVolume")}</Chip>}</Stack>
          {p.coachSentence && <Text as="p" variant="bodyLarge" tone="primary"><GlossaryText>{p.coachSentence}</GlossaryText></Text>}
          {p.session.classificationReason && note(p.session.classificationReason)}
          {!!p.observedEffects?.length && note(p.observedEffects.join(" · "))}
          <div className="activity-analysis-fact-cluster">
            {p.session.load != null && <Stat compact label={t("detail.acceptedLoadLabel")} value={num(p.session.load)} />}
            {power && p.session.normalizedPowerW != null && <Stat compact label="NP" value={num(p.session.normalizedPowerW)} unit="W" />}
            {power && p.session.intensityFactor != null && <Stat compact label="IF" value={p.session.intensityFactor.toFixed(2)} />}
          </div>
          {power && p.session.intensityFactor != null && <IntensityGauge value={p.session.intensityFactor} />}
          {p.session.load != null && note(`${t("detail.acceptedLoadDescription")} ${p.session.loadKind === "tss" ? t("detail.acceptedLoadTssBasis") : p.session.loadSource === "time" ? t("detail.acceptedLoadTimeBasis") : p.session.loadSource === "trimp" ? t("detail.acceptedLoadHrBasis") : ""}`)}
        </Stack>}
        {props.summaryOutside && p && <>
          {p.session.classificationReason && note(p.session.classificationReason)}
          {!!p.observedEffects?.length && note(p.observedEffects.join(" · "))}
          {power && p.session.intensityFactor != null && <IntensityGauge value={p.session.intensityFactor} />}
          {p.session.load != null && note(`${t("detail.acceptedLoadDescription")} ${p.session.loadKind === "tss" ? t("detail.acceptedLoadTssBasis") : p.session.loadSource === "time" ? t("detail.acceptedLoadTimeBasis") : p.session.loadSource === "trimp" ? t("detail.acceptedLoadHrBasis") : ""}`)}
        </>}
        {provenance}
        {fitness && (post ? <FitnessShift prior={fitness} post={post} rowLabel={key => <GlossaryText>{fitnessName(key)}</GlossaryText>} metricName={fitnessName}
          priorCaption={`${copy("beforeLegend")} · ${form(fitness)} · ${fitness.asOf}`} postCaption={`${label("after")} · ${form(post)} · ${post.asOf}`} />
          : <>{facts((["ctl", "atl", "tsb"] as const).map(key => [fitnessName(key), num(fitness[key])]))}{note(`${form(fitness)} · ${fitness.asOf}`)}</>)}
        {p?.thresholdBasis === "none" && <div className="activity-analysis-comparison">{note(copy(isOwner ? "thresholdMissing" : "thresholdMissingOther"))}{isOwner && <Link to="/coach/condition?sport=bike#thresholds">{copy("thresholdMissingCta")}</Link>}</div>}
        {p && !p.personal?.length && p.availability?.personal && p.availability.personal !== "available" && note(label(`personalStates.${p.availability.personal}`))}
        {p?.fitnessScope === "integrated" && note(label("fitnessDefinition"))}
        {p?.sportFitnessStatus && note(`${t("overviewSummary.sportOnly", { sport: label(`sports.${p.sportFitnessStatus.discipline}`) })} · CTL ${num(p.sportFitnessStatus.ctl)}${p.sportFitnessStatus.evidence !== "sufficient" ? ` · ${label("fitnessLimited")}` : ""}`)}
        {personal(["sessionLoad", ...(p?.personal ?? []).filter(row => !["sessionLoad", "highIntensityExposure", "cadenceVariability", "paceVariability", "muscularLoad"].includes(row.axis)).map(row => row.axis)])}
        {currentFtp != null && note(`${t("detail.analysisTopics.ftpBasis")} ${num(currentFtp, " W")}`)}
        {p?.availability?.power === "estimated" && note(label("powerEstimated"))}
        {p?.session.ftpVerificationRequired && note(label("ftpVerificationRequired"))}
        {extras(["분석 기준 FTP", "Analysis FTP"])}
        {readable(raw.load) && <Disclosure title={t("analysisReading.loadDetails")}>{raw.load}</Disclosure>}
        {!readable(raw.load) && props.storedLoad != null && <Stat compact label={t("detail.analysisLoadLabel")} value={String(Math.round(props.storedLoad))} />}
      </Topic>
      <Topic id="intensity" title={t("detail.analysisTopics.intensity")} visible={zones.length > 0 || readable(raw.zones) || readable(raw.bands) || readable(raw.anaerobic) || !!effort && Object.values(effort).some(value => value != null)}>
        <div className="activity-analysis-zones">{zones.map(zone => {
          const rawZones = zone.kind === "power" ? context?.powerZones : context?.hrZones;
          const differentTimes = rawZones?.length === zone.seconds.length && rawZones.some((rawZone, index) => rawZone.seconds !== zone.seconds[index]);
          const totalZoneSeconds = zone.seconds.reduce((sum, seconds) => sum + seconds, 0);
          const showCurrent = !!zone.currentPercentages?.some(value => Number.isFinite(value));
          const showBaseline = !!zone.baselinePercentages?.some(value => Number.isFinite(value));
          const showDelta = !!zone.deltaPercentagePoints?.some(value => Number.isFinite(value));
          return <section key={zone.kind} className="activity-analysis-zone" aria-label={label(zone.kind)}>
          <Text as="h3" variant="bodyMedium" weight={600}>{label(zone.kind)}</Text>
          <div className="activity-analysis-table" role="region" tabIndex={0} aria-label={label(zone.kind)}><table>
            <thead><tr>{[label("zone"), differentTimes ? t("detail.analysisTopics.summaryZoneTime") : label("duration"), ...(differentTimes ? [t("detail.analysisTopics.metricZoneTime")] : []), ...(showCurrent ? ["%"] : []), ...(showBaseline ? [label("baseline")] : []), ...(showDelta ? [label("change")] : []), ...(zone.kind === "power" && context?.zoneKj ? ["kJ"] : [])].map(name => <th scope="col" key={name}>{name}</th>)}</tr></thead>
            <tbody>{zone.seconds.map((seconds, index) => <tr key={index}>
              <th scope="row">Z{index + 1}</th><td title={num(seconds, " s")}>{span(seconds)}{!showCurrent && <span className="activity-analysis-zone-track" aria-hidden="true"><span style={{ width: `${totalZoneSeconds > 0 ? seconds / totalZoneSeconds * 100 : 0}%`, background: `var(--zone-${index + 1})`, ...(zone.kind === "power" ? zoneSurfaceStyle : {}) }} /></span>}</td>{differentTimes && <td title={num(rawZones?.[index]?.seconds, " s")}>{rawZones?.[index]?.seconds != null ? span(rawZones[index]!.seconds) : "—"}</td>}
              {showCurrent && <td><div className="activity-analysis-zone-value"><span>{num(zone.currentPercentages?.[index], "%")}</span><span className="activity-analysis-zone-track" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, zone.currentPercentages?.[index] ?? 0))}%`, background: `var(--zone-${index + 1})`, ...(zone.kind === "power" ? zoneSurfaceStyle : {}) }} /></span></div></td>}
              {showBaseline && <td>{num(zone.baselinePercentages?.[index], "%")}</td>}{showDelta && <td>{signed(zone.deltaPercentagePoints?.[index], "%p")}</td>}
              {zone.kind === "power" && context?.zoneKj && <td>{num(context.zoneKj[`z${index + 1}` as keyof typeof context.zoneKj])}</td>}
            </tr>)}</tbody>
          </table></div>
          {zone.priorSampleCount != null && note(`${label("samples")} ${num(zone.priorSampleCount)}${zone.baselinePercentages ? ` · ${label(`baselineScope.${zone.baselineScope ?? "sameCharacter"}`)}` : ""}${zone.historyCompleteness ? ` · ${label(`completeness.${zone.historyCompleteness}`)}` : ""}${zone.provisional ? ` · ${label("zoneProvisional")}` : ""}`)}
        </section>; })}</div>
        {context?.maxHr != null && note(`${t("detail.analysisTopics.hrBasis")} ${num(context.maxHr, " bpm")}`)}
        {readable(raw.zones) && <Disclosure title={t("analysisReading.zoneDetails")}>{raw.zones}</Disclosure>}
        {personal(["highIntensityExposure"])}
        {readable(raw.bands) && <Disclosure title={t("analysisReading.thresholdDetails")}>{raw.bands}</Disclosure>}
        {effort && facts([
          ...(effort.matchesCount != null ? [[copy("matches"), num(effort.matchesCount)]] as [string, ReactNode][] : []),
          ...(effort.matchesTotalSec != null ? [[label("matchesTotal"), span(effort.matchesTotalSec)]] as [string, ReactNode][] : []),
          ...(effort.longestZ4PlusSec != null ? [[copy("longest"), span(effort.longestZ4PlusSec)]] as [string, ReactNode][] : []),
          ...(effort.anaerobicSec != null ? [[copy("anaerobic"), span(effort.anaerobicSec)]] as [string, ReactNode][] : []),
          ...(effort.aboveFtpKj != null ? [[label("anaerobicWork"), num(effort.aboveFtpKj, " kJ")]] as [string, ReactNode][] : []),
          ...(effort.wPrimeDepletionPct != null ? [[copy("reserve"), num(effort.wPrimeDepletionPct, "%")]] as [string, ReactNode][] : []),
          ...(effort.wPrimeRemainingPct != null ? [[copy("remaining"), num(effort.wPrimeRemainingPct, "%")]] as [string, ReactNode][] : []),
        ])}
        {readable(raw.anaerobic) && <Disclosure title={t("analysisReading.anaerobicDetails")}>{raw.anaerobic}</Disclosure>}
        {(effort?.wPrimeDepletionPct != null || effort?.wPrimeRemainingPct != null || readable(raw.anaerobic)) && note(t("detail.analysisTopics.wPrimeModel"))}
      </Topic>
      <Topic id="records" title={t("detail.analysisTopics.records")} visible={curveRows.length > 0 || readable(raw.power) || readable(raw.powerCurve) || readable(benchmark) || readable(peakInspector) || !!p?.peakMoment || readable(props.powerControls)}>
        {props.powerControls}
        {extras(["평균 파워", "Average power"])}
        {(curveRows.length > 0 || readable(raw.powerCurve) || readable(benchmark)) && <ActivityPowerComparison benchmark={benchmark}
          current={curveRows.length > 0 ? (<OverviewPowerCurve interactiveReading rows={curveRows} recordsEvaluated={records} comparableMedian={p?.comparisonMetadata?.historyCompleteness === "complete" && curveRows.some(row => row.deltaPct != null && Number.isFinite(row.deltaPct) && (row.medianWatts ?? 0) > 0 && (row.priorSampleCount ?? 0) >= 3)} ftpW={currentFtp} />) : raw.powerCurve}
          evidence={curveRows.length > 0 ? <>
          <div className="activity-analysis-table" role="region" tabIndex={0} aria-label={t("detail.analysisTopics.records")}><table>
            <thead><tr>{availablePowerColumns.map(column => <th scope="col" key={column.label}>{column.label}</th>)}</tr></thead>
            <tbody>{curveRows.map(row => <tr key={row.duration}>{availablePowerColumns.map((column, index) => index === 0 ? <th scope="row" key={column.label}>{column.value(row)}</th> : <td key={column.label}>{column.value(row)}</td>)}</tr>)}</tbody>
          </table></div>
          {note(`${label("bestScope")} · ${label("previousBestScope")}`)}
          {p?.comparisonMetadata && note(t("overviewEvidence.scope", { days: p.comparisonMetadata.windowDays, count: p.comparisonMetadata.priorSampleCount, character: label(`characters.${p.comparisonMetadata.character}`) }))}
</> : null} />}
        {readable(raw.power) && <Disclosure title={t("analysisReading.powerMetrics")}>{raw.power}</Disclosure>}
        {context?.weightKg != null && note(`${t("detail.analysisTopics.weightBasis")} ${num(context.weightKg, " kg")}`)}
        {p?.highlight && note(p.highlight.reason)}
        {(curveRows.length > 0 || p?.availability?.records) && note(label(`recordStates.${records ? p?.powerFingerprint?.length ? "evaluatedWithEvidence" : "evaluatedEmpty" : p?.availability?.records ?? "unavailable"}`))}
        {peakInspector}
        {p?.peakMoment && note([label("peakMoment"), p.peakMoment.segmentName, p.peakMoment.segmentPr ? label("segmentPr") : null, p.peakMoment.fromKm != null && p.peakMoment.toKm != null ? t("overviewEvidence.peakMomentAt", { from: p.peakMoment.fromKm, to: p.peakMoment.toKm }) : null, `${num(p.peakMoment.durationSec, " s")} · ${num(p.peakMoment.avgPowerW, " W")}`, p.peakMoment.avgSpeedKmh != null ? num(p.peakMoment.avgSpeedKmh, " km/h") : null, p.peakMoment.maxHr != null ? `${label("maxHrShort")} ${num(p.peakMoment.maxHr, " bpm")}` : null].filter(Boolean).join(" · "))}
      </Topic>
      <Topic id="efficiency" title={t("detail.analysisTopics.efficiency")}>
        {extras(["평균 케이던스", "Average cadence", "평균 심박", "Average HR", "최대 심박", "Max HR"])}
        {raw.heartRate}{raw.cadence}
        {(readable(raw.pedaling) || readable(raw.dynamics)) && <Disclosure title={t("analysisReading.pedalingDetails")}>{raw.pedaling}{raw.dynamics}</Disclosure>}
        {personal(["cadenceVariability", "paceVariability", "muscularLoad"])}
      </Topic>
      <Topic id="energy" title={t("detail.analysisTopics.energy")}>
        {p?.recoveryGuidance && note(label("recoveryGuidance"))}
        {!p?.recoveryGuidance && p?.recovery?.hours != null && <Stat compact label={copy("recoveryHours")} value={num(p.recovery.hours)} unit={copy("hour")} />}
        {p?.recovery && facts([[label("recoveryLoad"), num(p.recovery.load)], [label("historicalCtl"), num(p.recovery.ctl)]])}
        {raw.recovery}
        {(modelCalories != null || activityCalories != null) && facts([
          ...(activityCalories != null ? [[t("detail.analysisTopics.activityCalories"), num(activityCalories, " kcal")]] as [string, ReactNode][] : []),
          ...(modelCalories != null ? [[t("detail.analysisTopics.modelCalories"), num(modelCalories, " kcal")]] as [string, ReactNode][] : []),
        ])}
        {canonicalFuel && <FuelSplitBar size="compact" fat={{ label: label("fat"), pct: energy!.fatPct!, kcal: energy!.fatKcal }} carb={{ label: label("carb"), pct: energy!.carbPct!, kcal: energy!.carbKcal }} />}
        {energy && !canonicalFuel && facts([
          ...(energy.fatPct != null ? [[label("fat"), num(energy.fatPct, "%")]] as [string, ReactNode][] : []),
          ...(energy.fatKcal != null ? [[`${label("fat")} · kcal`, num(energy.fatKcal, " kcal")]] as [string, ReactNode][] : []),
          ...(energy.carbPct != null ? [[label("carb"), num(energy.carbPct, "%")]] as [string, ReactNode][] : []),
          ...(energy.carbKcal != null ? [[`${label("carb")} · kcal`, num(energy.carbKcal, " kcal")]] as [string, ReactNode][] : []),
        ])}
        {energy?.fatGrams != null && facts([[label("fatGrams"), num(energy.fatGrams, " g")]])}
        {canonicalFuel && context?.substrate && (() => {
          const substrate = context.substrate;
          const different = [
            [t("detail.analysisTopics.metricFuelTotal"), energy?.totalKcal, substrate.totalKcal, " kcal"],
            [t("detail.analysisTopics.metricFuelFat"), energy?.fatPct, substrate.fatPct * 100, "%"],
            [t("detail.analysisTopics.metricFuelFatKcal"), energy?.fatKcal, substrate.fatKcal, " kcal"],
            [t("detail.analysisTopics.metricFuelCarb"), energy?.carbPct, (1 - substrate.fatPct) * 100, "%"],
            [t("detail.analysisTopics.metricFuelCarbKcal"), energy?.carbKcal, substrate.carbKcal, " kcal"],
          ] as const;
          const changed = different.filter(([, canonical, metric]) => canonical == null || Math.round(canonical * 10) !== Math.round(metric * 10));
          return changed.length ? <div className="activity-analysis-comparison">{note(t("detail.analysisTopics.fuelDifference"))}{facts(changed.map(([name, , metric, unit]) => [name, num(metric, unit)]))}</div> : null;
        })()}
        {raw.energyFacts}{extras(["일량", "Work"])}{readable(raw.metabolism) && <Disclosure title={t("analysisReading.metabolismDetails")}>{raw.metabolism}</Disclosure>}
        {(p?.recovery || energy) && note(t("detail.analysisTopics.energyModel"))}
      </Topic>
      <Topic id="terrain" title={t("detail.analysisTopics.terrain")}>
        {raw.exercise}{raw.speedCurve}
        {p?.routeLoad && facts([
          ...(p.routeLoad.terrain ? [[label("terrainLabel"), label(`terrain.${p.routeLoad.terrain}`)]] as [string, ReactNode][] : []),
          ...(p.routeLoad.climbCount != null ? [[label("climbs"), num(p.routeLoad.climbCount)]] as [string, ReactNode][] : []),
          ...(p.routeLoad.highestCategory ? [[label("category"), p.routeLoad.highestCategory]] as [string, ReactNode][] : []),
          ...(p.routeLoad.avgGradePct != null ? [[label("avgGrade"), num(p.routeLoad.avgGradePct, "%")]] as [string, ReactNode][] : []),
          ...(p.routeLoad.maxGradePct != null ? [[label("maxGrade"), num(p.routeLoad.maxGradePct, "%")]] as [string, ReactNode][] : []),
        ])}
        {p?.routeLoad?.elevationSuspect && note(copy("elevationSuspect"))}
        {readable(raw.climbs) && <Disclosure title={t("analysisReading.climbDetails")}>{raw.climbs}</Disclosure>}{raw.runSplits}{raw.laps}
      </Topic>
      {sensorFallback}
      {!!extraDetails.length && facts(extraDetails.map(row => [row.label, row.value]))}
      {preview && note(label("preview"))}
      {p && overview.response?.status === "available" && !!overview.response.partialReasons?.length && note(`${label("partial")} ${overview.response.partialReasons.map(reason => label(`partialReasons.${reason}`)).join(" · ")}`)}
      {p?.qualityNote && note(label("qualityNote"))}
    </div></GlossaryProvider>;
  };
  return <AnalysisTab {...(analysisProps ?? { activityId: null, isOwner, streams: { userId: "", time: [], distance: [] }, serverMetrics: { status: "loading", metrics: null } })} canonicalPresentationAvailable={overview.enabled && overview.response?.status === "available"} integratedPresentation={p} renderSections={render} />;
}
