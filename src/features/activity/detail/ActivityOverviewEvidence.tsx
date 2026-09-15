import { useTranslation } from "react-i18next";
import type { ActivityOverviewPresentation } from "@shared/types/activity-overview";
import type { useActivityOverview } from "../../../hooks/useActivityOverview";
import { Button, Card, Text } from "../../../theme/components";

const number = (value: number | undefined, unit = "") => value != null && Number.isFinite(value) ? `${Math.round(value * 10) / 10}${unit}` : "—";
const delta = (value: number | undefined, unit: string) => value != null && Number.isFinite(value) ? `${value > 0 ? "+" : ""}${number(value, unit)}` : "—";
const seconds = (value: number | undefined) => number(value, " s");

export function ActivityOverviewEvidenceContent({ presentation: p }: { presentation: ActivityOverviewPresentation }) {
  const { t } = useTranslation("activity");
  const label = (key: string) => t(`overviewEvidence.${key}`);
  const section = (key: string, rows: [string, string][]) => <section className="space-y-2"><Text as="h3" variant="subtitle">{label(key)}</Text><dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">{rows.map(([name, value]) => <div key={name}><Text as="dt" variant="caption" tone="tertiary">{name}</Text><Text as="dd" variant="body">{value}</Text></div>)}</dl></section>;
  const powerVisible = p.availability?.power !== "private";
  const hrVisible = p.availability?.heartRate !== "private";
  const recordsVisible = p.availability?.records === "evaluated";
  const effort = powerVisible ? p.thresholdWork : undefined;
  const zones = (p.zones ?? []).filter((zone) => zone.kind === "power" ? powerVisible : hrVisible);
  const highZone = zones.find((zone) => zone.kind === "power") ?? zones.find((zone) => zone.kind === "heartRate");
  const zoneTotal = highZone?.seconds.reduce((sum, value) => sum + value, 0) ?? 0;
  const highPercent = highZone && zoneTotal > 0 ? highZone.seconds.slice(3).reduce((sum, value) => sum + value, 0) / zoneTotal * 100 : undefined;
  const metadata = p.comparisonMetadata;
  const record = (achievement: "first" | "new" | "tie" | undefined) => achievement ? label(`records.${achievement}`) : "—";
  const table = (headers: string[], rows: string[][]) => <div className="overflow-x-auto"><table className="w-full" style={{ fontSize: "var(--fs-sm)" }}><thead><tr>{headers.map((header) => <th key={header} className="text-left p-2 whitespace-nowrap">{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column} className="p-2 tabular-nums whitespace-nowrap">{cell}</td>)}</tr>)}</tbody></table></div>;
  return <div className="space-y-6">
    <Text as="p" variant="body">{p.coachSentence}</Text>
    {p.session.classificationReason && <Text as="p" variant="caption" tone="secondary">{p.session.classificationReason}</Text>}
    {section("stimulus", [
      [label("sport"), label(`sports.${p.session.discipline}`)],
      [label("character"), p.session.character ? label(`characters.${p.session.character}`) : "—"],
      [`${label("load")} · ${p.session.loadKind === "tss" ? "TSS" : label("load")}`, number(p.session.load)],
      ...(powerVisible ? [["IF", p.session.intensityFactor != null ? p.session.intensityFactor.toFixed(2) : "—"], ["NP", number(p.session.normalizedPowerW, " W")]] as [string, string][] : []),
      [label("highZone"), `${number(highPercent, "%")} · ${highZone ? label(highZone.kind) : "—"}`],
      ...(powerVisible ? [
        [label("matches"), number(effort?.matchesCount)], [label("matchesTotal"), seconds(effort?.matchesTotalSec)],
        [label("longestZ4"), seconds(effort?.longestZ4PlusSec)], [label("anaerobic"), seconds(effort?.anaerobicSec)],
        [label("depletion"), number(effort?.wPrimeDepletionPct, "%")], [label("remaining"), number(effort?.wPrimeRemainingPct, "%")],
      ] as [string, string][] : []),
    ])}
    <section className="space-y-2"><Text as="h3" variant="subtitle">{label("personal")}</Text>
      <Text as="p" variant="caption" tone="secondary">{label("relative")}</Text>
      {metadata && <Text as="p" variant="caption">{t("overviewEvidence.scope", { days: metadata.windowDays, count: metadata.priorSampleCount, character: label(`characters.${metadata.character}`) })} · {label(`completeness.${metadata.historyCompleteness}`)}</Text>}
      {p.personal?.length ? table([label("axis"), label("index"), label("band"), label("samples")], p.personal.map((row) => [label(`axes.${row.axis}`), number(row.personalIndex), label(`bands.${row.band}`), number(row.sampleCount)])) : <Text as="p" variant="caption">{label(`personalStates.${p.availability?.personal ?? "unavailable"}`)}</Text>}
    </section>
    <section className="space-y-2"><Text as="h3" variant="subtitle">{label("powerComparison")}</Text><Text as="p" variant="caption">{label("prScope")}</Text>
      {powerVisible && p.powerFingerprint?.length ? table([label("duration"), "W", label("median"), label("change"), label("rank"), label("samples"), "PR"], p.powerFingerprint.map((row) => [row.duration, number(row.watts), number(row.medianWatts, " W"), delta(row.deltaPct, "%"), number(row.competitionRank), number(row.priorSampleCount), recordsVisible ? record(row.recordAchievement) : "—"])) : <Text as="p" variant="caption">{label(powerVisible ? "missing" : "private")}</Text>}
      {recordsVisible && p.runRecordAchievements?.length ? table([label("distance"), label("duration"), "PR"], p.runRecordAchievements.map((row) => [row.distance, seconds(row.valueSec), record(row.recordAchievement)])) : null}
      <Text as="p" variant="caption" tone="tertiary">{label(`recordStates.${p.availability?.records ?? "unavailable"}`)}</Text>
    </section>
    <section className="space-y-2"><Text as="h3" variant="subtitle">{label("zones")}</Text>
      {zones.length ? zones.map((zone) => <div key={zone.kind}><Text as="h4" variant="body">{label(zone.kind)} · {label("samples")} {number(zone.priorSampleCount)}</Text>{table([label("zone"), label("duration"), "%", label("baseline"), label("change")], zone.seconds.map((value, index) => [`Z${index + 1}`, seconds(value), number(zone.currentPercentages?.[index] ?? (zone.seconds.reduce((sum, seconds) => sum + seconds, 0) > 0 ? value / zone.seconds.reduce((sum, seconds) => sum + seconds, 0) * 100 : undefined), "%"), number(zone.baselinePercentages?.[index], "%"), delta(zone.deltaPercentagePoints?.[index], "%p")]))}</div>) : <Text as="p" variant="caption">{label("missing")}</Text>}
    </section>
    {section("recoveryFuel", [
      [label("recovery"), number(p.recovery?.hours, " h")], [label("recoveryLoad"), number(p.recovery?.load)], [label("historicalCtl"), number(p.recovery?.ctl)],
      [label("energy"), number(p.energy?.totalKcal, " kcal")], [label("fat"), `${number(p.energy?.fatPct, "%")} · ${number(p.energy?.fatKcal, " kcal")}`], [label("carb"), `${number(p.energy?.carbPct, "%")} · ${number(p.energy?.carbKcal, " kcal")}`],
    ])}
    {section("fitness", [
      [label("cutoff"), p.priorFitnessStatus ? p.priorFitnessStatus.asOf : "—"],
      [label("sport"), label(`sports.${p.session.discipline}`)], ["CTL", number(p.priorFitnessStatus?.ctl)], ["ATL", number(p.priorFitnessStatus?.atl)], ["TSB", number(p.priorFitnessStatus?.tsb)],
      [label("form"), p.priorFitnessStatus ? label(`forms.${p.priorFitnessStatus.formBand}`) : "—"],
    ])}
    {!!p.sportDetails?.length && section("sportDetails", p.sportDetails.map((row) => [row.label, row.value]))}
    {p.routeLoad && section("route", [[label("climbs"), number(p.routeLoad.climbCount)], [label("category"), p.routeLoad.highestCategory ?? "—"], [label("avgGrade"), number(p.routeLoad.avgGradePct, "%")], [label("maxGrade"), number(p.routeLoad.maxGradePct, "%")], [label("elevationQuality"), label(p.routeLoad.elevationSuspect ? "suspect" : "noWarning")]])}
    <Text as="p" variant="caption" tone="tertiary">{label("modelNote")}</Text>
    {p.qualityNote && <Text as="p" variant="caption" tone="tertiary">{label("qualityNote")}</Text>}
  </div>;
}

export default function ActivityOverviewEvidence({ overview, preview = false, variant = "analysis" }: { overview: ReturnType<typeof useActivityOverview>; preview?: boolean; variant?: "overview" | "analysis" }) {
  const { t } = useTranslation("activity");
  if (!overview.enabled) return null;
  const reason = overview.response?.status === "unavailable" ? overview.response.reason : null;
  return <Card className="space-y-4" data-testid="activity-overview-evidence">
    <Text as="h2" variant="subtitle">{t(variant === "overview" ? "overviewEvidence.overviewTitle" : "overviewEvidence.title")}</Text>
    <Text as="p" variant="caption" tone="secondary">{t(variant === "overview" ? "overviewEvidence.overviewSource" : "overviewEvidence.source")}</Text>
    {preview && <Text as="p" variant="caption">{t("overviewEvidence.preview")}</Text>}
    {overview.loading ? <Text as="p" variant="body" role="status">{t("overviewEvidence.loading")}</Text> : overview.response?.status === "available" ? <>
      <ActivityOverviewEvidenceContent presentation={overview.response.presentation} />
      {!!overview.response.partialReasons?.length && <Text as="p" variant="caption">{t("overviewEvidence.partial")} {overview.response.partialReasons.map((reason) => t(`overviewEvidence.partialReasons.${reason}`)).join(" · ")}</Text>}
    </> : <div className="space-y-2"><Text as="p" variant="body">{t(overview.error ? "overviewEvidence.error" : reason ? `overviewEvidence.unavailable.${reason}` : "overviewEvidence.missing")}</Text>{reason !== "rollout_disabled" && <Button size="sm" variant="outline" onClick={overview.retry}>{t("overviewEvidence.retry")}</Button>}</div>}
  </Card>;
}
