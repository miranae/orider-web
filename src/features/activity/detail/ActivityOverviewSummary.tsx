import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ActivityOverviewPresentation } from "@shared/types/activity-overview";
import type { useActivityOverview } from "../../../hooks/useActivityOverview";
import { Button, Card, Chip, Stack, Stat, Text } from "../../../theme/components";

const number = (value: number) => String(Math.round(value * 10) / 10);
const signed = (value: number) => `${value > 0 ? "+" : ""}${number(value)}`;

function SummarySection({ title, marker, children }: { title: string; marker: string; children: ReactNode }) {
  return <section className="min-w-0 space-y-3" aria-label={title}>
    <Stack direction="row" align="center"><Text variant="eyebrow" tone="accent" aria-hidden="true">{marker}</Text><Text as="h3" variant="subtitle">{title}</Text></Stack>
    {children}
  </section>;
}

/** A reading surface for the sharing summary, not a second analysis dashboard. */
export function ActivityOverviewSummaryContent({ presentation: p }: { presentation: ActivityOverviewPresentation }) {
  const { t, i18n } = useTranslation("activity");
  const label = (key: string) => t(`overviewEvidence.${key}`);
  const copy = (key: string) => t(`overviewSummary.${key}`);
  const duration = (value: number) => `${Math.floor(Math.round(value) / 60)}${copy("minute")} ${Math.round(value) % 60}${copy("second")}`;
  const powerDuration = (value: string) => i18n.language.startsWith("ko") ? value.replace(/s$/, "초").replace(/m$/, "분").replace(/h$/, "시간") : value;
  const powerVisible = p.availability?.power !== "private";
  const zones = (p.zones ?? []).filter((zone) => zone.kind === "power" ? powerVisible : p.availability?.heartRate !== "private");
  const highZone = zones.find((zone) => zone.kind === "power") ?? zones.find((zone) => zone.kind === "heartRate");
  // Format the canonical zone-time aggregate exactly as the share formatter does.
  const zoneTotal = highZone?.seconds.reduce((sum, value) => sum + value, 0) ?? 0;
  const highPercent = highZone && zoneTotal > 0 ? highZone.seconds.slice(3).reduce((sum, value) => sum + value, 0) / zoneTotal * 100 : undefined;
  const effort = powerVisible ? p.thresholdWork : undefined;
  const ftp = powerVisible ? p.sportDetails?.find((row) => row.label === "분석 기준 FTP" || row.label === "Analysis FTP") : undefined;
  const metadata = p.comparisonMetadata;
  const axes = ["sessionLoad", "highIntensityExposure", p.session.discipline === "bike" ? "cadenceVariability" : "paceVariability"];
  const personal = axes.flatMap((axis) => (p.personal ?? []).filter((row) => row.axis === axis));
  const power = powerVisible ? p.powerFingerprint ?? [] : [];
  const comparable = metadata?.historyCompleteness === "complete" ? power.filter((row) => row.deltaPct != null && Number.isFinite(row.deltaPct) && (row.medianWatts ?? 0) > 0 && (row.priorSampleCount ?? 0) >= 3) : [];
  const highlights = [...comparable.filter((row) => row.deltaPct! >= 5).sort((a, b) => b.deltaPct! - a.deltaPct!).slice(0, 2), ...comparable.filter((row) => row.deltaPct! <= -5).sort((a, b) => a.deltaPct! - b.deltaPct!).slice(0, 2)];
  const records = p.availability?.records === "evaluated" ? [
    ...power.filter((row) => row.recordAchievement).map((row) => ({ key: row.duration, value: `${powerDuration(row.duration)} · ${number(row.watts)} W`, achievement: row.recordAchievement! })),
    ...(p.runRecordAchievements ?? []).map((row) => ({ key: row.distance, value: `${row.distance} · ${duration(row.valueSec)}`, achievement: row.recordAchievement })),
  ] : [];
  const zoneChanges = metadata?.historyCompleteness === "complete" ? zones.flatMap((zone) => {
    if ((zone.priorSampleCount ?? 0) < 3) return [];
    const rows = (zone.deltaPercentagePoints ?? []).flatMap((value, index) => Number.isFinite(value) && zone.baselinePercentages?.[index] != null ? [{ value, index }] : []);
    const selected = [rows.filter((row) => row.value >= 2).sort((a, b) => b.value - a.value)[0], rows.filter((row) => row.value <= -2).sort((a, b) => a.value - b.value)[0]].filter((row) => row != null);
    return selected.length ? [{ zone, text: selected.map((row) => `Z${row.index + 1} ${signed(row.value)}%p`).join(" · ") }] : [];
  }) : [];
  const note = (children: ReactNode) => <Text as="p" variant="caption" tone="tertiary">{children}</Text>;
  const line = (name: string, value: string) => <Stack direction="row" justify="space-between" align="baseline" wrap><Text variant="bodySmall" tone="secondary">{name}</Text><Text variant="bodyMedium" mono tone="primary">{value}</Text></Stack>;
  return <Stack gap="var(--dim-section-gap)">
    <Stack gap="var(--dim-item-gap)">
      <Stack direction="row" wrap><Chip variant="accent">{p.session.character ? label(`characters.${p.session.character}`) : copy("characterPending")}</Chip><Chip>{label(`sports.${p.session.discipline}`)}</Chip></Stack>
      <Text as="p" variant="title" tone="primary">{p.coachSentence}</Text>
    </Stack>
    <SummarySection title={copy("stimulus")} marker="01">
      <Card variant="inset"><Stack gap="var(--dim-item-gap)">
        {highPercent != null && <Stat compact label={`${label(highZone!.kind)} Z4+`} value={number(highPercent)} unit="%" />}
        {effort?.matchesCount != null && line(copy("matches"), `${effort.matchesCount}${copy("efforts")}${effort.matchesTotalSec != null ? ` · ${duration(effort.matchesTotalSec)}` : ""}`)}
        {effort?.longestZ4PlusSec != null && line(copy("longest"), duration(effort.longestZ4PlusSec))}
        {effort?.anaerobicSec != null && line(copy("anaerobic"), duration(effort.anaerobicSec))}
        {effort?.wPrimeDepletionPct != null ? line(copy("reserve"), `${number(effort.wPrimeDepletionPct)}%`) : effort?.wPrimeRemainingPct != null && line(copy("remaining"), `${number(effort.wPrimeRemainingPct)}%`)}
        {highPercent == null && ![effort?.matchesCount, effort?.longestZ4PlusSec, effort?.anaerobicSec, effort?.wPrimeDepletionPct, effort?.wPrimeRemainingPct].some((value) => value != null) && note(copy("stimulusMissing"))}
        {highPercent != null && note(copy("measuredZones"))}
      </Stack></Card>
    </SummarySection>
    <SummarySection title={copy("changes")} marker="02">
      {!!records.length && <Stack>{records.map((row) => <Stack key={row.key} direction="row" wrap align="center"><Chip variant="accent">{label(`records.${row.achievement}`)}</Chip><Text variant="bodyMedium" mono>{row.value}</Text></Stack>)}</Stack>}
      {!!personal.length && <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{personal.map((row) => <Card key={row.axis} variant="inset" padding="compact"><Stack><Text variant="caption">{label(`axes.${row.axis}`)}</Text><Text variant="subtitle" tone="primary">{label(`bands.${row.band}`)}</Text><Text variant="caption" mono>{copy("index")} {number(row.personalIndex)} · {row.sampleCount}{copy("samples")}</Text></Stack></Card>)}</div>}
      {!personal.length && <Card variant="inset">{note(label(`personalStates.${p.availability?.personal ?? "unavailable"}`))}</Card>}
      {!!highlights.length && <Stack>{highlights.map((row) => <Stack key={row.duration} direction="row" wrap justify="space-between"><Text variant="bodySmall">{copy("peakChange")} · {powerDuration(row.duration)}</Text><Text variant="bodyMedium" mono>{signed(row.deltaPct!)}% · {row.priorSampleCount}{copy("samples")}</Text></Stack>)}</Stack>}
      {!!comparable.length && !highlights.length && note(copy("stablePower"))}
      {zoneChanges.map(({ zone, text }) => <Stack key={zone.kind} direction="row" wrap justify="space-between"><Text variant="bodySmall">{label(zone.kind)} · {zone.priorSampleCount}{copy("samples")}</Text><Text variant="bodyMedium" mono>{text}</Text></Stack>)}
      {!!personal.length && note(label("relative"))}
      {metadata && (personal.length > 0 || comparable.length > 0 || zoneChanges.length > 0) && note(t("overviewEvidence.scope", { days: metadata.windowDays, count: metadata.priorSampleCount, character: label(`characters.${metadata.character}`) }) + (metadata.historyCompleteness !== "complete" ? ` · ${label(`completeness.${metadata.historyCompleteness}`)}` : ""))}
      {(comparable.length > 0 || zoneChanges.length > 0) && note(copy("comparisonNote"))}
      {p.availability?.records === "unavailable" && note(label("recordStates.unavailable"))}
    </SummarySection>
    <SummarySection title={copy("recovery")} marker="03">
      <Card variant="inset"><Stack>
        {p.recovery && <Stat compact label={copy("recoveryHours")} value={number(p.recovery.hours)} unit={copy("hour")} />}
        {powerVisible && p.energy?.fatPct != null && p.energy.carbPct != null && <div className="grid grid-cols-2 gap-3"><Stat compact label={label("fat")} value={number(p.energy.fatPct)} unit="%" /><Stat compact label={label("carb")} value={number(p.energy.carbPct)} unit="%" /></div>}
        {!p.recovery && !(powerVisible && p.energy?.fatPct != null && p.energy.carbPct != null) && note(copy("recoveryMissing"))}
      </Stack></Card>
    </SummarySection>
    <SummarySection title={copy("before")} marker="04">
      {p.priorFitnessStatus ? <Card variant="inset"><Stack>
        <Stack direction="row" wrap align="center"><Chip>{label(`forms.${p.priorFitnessStatus.formBand}`)}</Chip><Text variant="caption" tone="tertiary">{label(`sports.${p.session.discipline}`)} · {p.priorFitnessStatus.asOf}</Text></Stack>
        <div className="grid grid-cols-3 gap-3"><Stat compact label={copy("ctl")} value={number(p.priorFitnessStatus.ctl)} /><Stat compact label={copy("atl")} value={number(p.priorFitnessStatus.atl)} /><Stat compact label={copy("tsb")} value={number(p.priorFitnessStatus.tsb)} /></div>
      </Stack></Card> : note(copy("beforeMissing"))}
    </SummarySection>
    <Stack>
      {ftp && note(`${copy("ftp")} ${ftp.value}`)}
      {note(label("modelNote"))}
      {p.qualityNote && note(label("qualityNote"))}
    </Stack>
  </Stack>;
}

export default function ActivityOverviewSummary({ overview, preview = false }: { overview: ReturnType<typeof useActivityOverview>; preview?: boolean }) {
  const { t } = useTranslation("activity");
  if (!overview.enabled) return null;
  const reason = overview.response?.status === "unavailable" ? overview.response.reason : null;
  return <Card data-testid="activity-overview-summary"><Stack gap="var(--dim-section-gap)">
    <Stack direction="row" wrap justify="space-between" align="baseline"><Text as="h2" variant="subtitle">{t("overviewSummary.title")}</Text><Text variant="eyebrow" tone="accent">O-RIDER</Text></Stack>
    {preview && <Text as="p" variant="caption">{t("overviewEvidence.preview")}</Text>}
    {overview.loading ? <Text as="p" variant="body" role="status">{t("overviewEvidence.loading")}</Text> : overview.response?.status === "available" ? <>
      <ActivityOverviewSummaryContent presentation={overview.response.presentation} />
      {!!overview.response.partialReasons?.length && <Text as="p" variant="caption">{t("overviewEvidence.partial")} {overview.response.partialReasons.map((value) => t(`overviewEvidence.partialReasons.${value}`)).join(" · ")}</Text>}
    </> : <Stack><Text as="p" variant="body">{t(overview.error ? "overviewEvidence.error" : reason ? `overviewEvidence.unavailable.${reason}` : "overviewEvidence.missing")}</Text>{reason !== "rollout_disabled" && <Button size="sm" variant="outline" onClick={overview.retry}>{t("overviewEvidence.retry")}</Button>}</Stack>}
  </Stack></Card>;
}
