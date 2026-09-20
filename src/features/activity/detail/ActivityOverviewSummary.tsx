import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { ActivityOverviewPresentation } from "@shared/types/activity-overview";
import type { useActivityOverview } from "../../../hooks/useActivityOverview";
import { Button, Card, Chip, Stack, Stat, Text, buttonClass } from "../../../theme/components";

const number = (value: number) => String(Math.round(value * 10) / 10);
const signed = (value: number) => `${value > 0 ? "+" : ""}${number(value)}`;

function SummarySection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="min-w-0 border-t border-[var(--line-soft)] pt-[var(--dim-section-gap)] space-y-3" aria-label={title}>
    <Text as="h3" variant="subtitle">{title}</Text>
    {children}
  </section>;
}

/** A reading surface for the sharing summary, not a second analysis dashboard. */
export function ActivityOverviewSummaryContent({ presentation: p, isOwner = true }: { presentation: ActivityOverviewPresentation; isOwner?: boolean }) {
  const { t, i18n } = useTranslation("activity");
  const label = (key: string) => t(`overviewEvidence.${key}`);
  const copy = (key: string) => t(`overviewSummary.${key}`);
  // 개요 문구는 소유자 1인칭으로 쓰여 있다. 남의 활동에서 그대로 쓰면 보는 사람의 기록으로 읽힌다.
  const voice = (key: string) => copy(isOwner ? key : `${key}Other`);
  // "성격 확인 중" 은 곧 계산될 것처럼 읽힌다. 임계값이 없으면 설정 전까지 영원히
  // 채워지지 않으므로 그 상태를 그대로 말한다.
  const thresholdMissing = p.thresholdBasis === "none";
  const duration = (value: number) => `${Math.floor(Math.round(value) / 60)}${copy("minute")} ${Math.round(value) % 60}${copy("second")}`;
  const powerDuration = (value: string) => i18n.language.startsWith("ko") ? value.replace(/s$/, "초").replace(/m$/, "분").replace(/h$/, "시간") : value;
  const powerVisible = p.availability?.power !== "private";
  const zones = (p.zones ?? []).filter((zone) => zone.kind === "power" ? powerVisible : p.availability?.heartRate !== "private");
  const highZone = zones.find((zone) => zone.kind === "power") ?? zones.find((zone) => zone.kind === "heartRate");
  // Format the canonical zone-time aggregate exactly as the share formatter does.
  const zoneTotal = highZone?.seconds.reduce((sum, value) => sum + value, 0) ?? 0;
  const highPercent = highZone && zoneTotal > 0 ? highZone.seconds.slice(3).reduce((sum, value) => sum + value, 0) / zoneTotal * 100 : undefined;
  const effort = powerVisible ? p.thresholdWork : undefined;
  const metadata = p.comparisonMetadata;
  const axes = ["sessionLoad", "highIntensityExposure", p.session.discipline === "bike" ? "cadenceVariability" : "paceVariability"];
  const personal = axes.flatMap((axis) => (p.personal ?? []).filter((row) => row.axis === axis));
  const power = powerVisible ? p.powerFingerprint ?? [] : [];
  const comparable = metadata?.historyCompleteness === "complete" ? power.filter((row) => row.deltaPct != null && Number.isFinite(row.deltaPct) && (row.medianWatts ?? 0) > 0 && (row.priorSampleCount ?? 0) >= 3) : [];
  const highlights = [...comparable.filter((row) => row.deltaPct! >= 5).sort((a, b) => b.deltaPct! - a.deltaPct!).slice(0, 1), ...comparable.filter((row) => row.deltaPct! <= -5).sort((a, b) => a.deltaPct! - b.deltaPct!).slice(0, 1)];
  const records = p.availability?.records === "evaluated" ? [
    ...power.filter((row) => row.recordAchievement).map((row) => ({ key: row.duration, value: `${powerDuration(row.duration)} · ${number(row.watts)} W`, achievement: row.recordAchievement! })),
    ...(p.runRecordAchievements ?? []).map((row) => ({ key: row.distance, value: `${row.distance} · ${duration(row.valueSec)}`, achievement: row.recordAchievement })),
  ] : [];
  const note = (children: ReactNode) => <Text as="p" variant="caption" tone="tertiary">{children}</Text>;
  const line = (name: string, value: string) => <Stack direction="row" justify="space-between" align="baseline" wrap><Text variant="bodySmall" tone="secondary">{name}</Text><Text variant="bodyMedium" mono tone="primary">{value}</Text></Stack>;
  return <Stack gap="var(--dim-section-gap)">
    <Stack gap="var(--dim-item-gap)">
      {/* 성격이 곧 라벨이다 — 별도 은유 층을 두지 않는다. 서버가 확정한 값만 그린다(화면에서 재분류하지 않는다). */}
      <Stack direction="row" wrap><Chip variant={p.session.character ? "accent" : "default"}>
        {p.session.character ? label(`characters.${p.session.character}`)
          : thresholdMissing ? copy("thresholdMissingChip") : copy("characterPending")}
        {p.aboveUsualVolume ? ` · ${copy("aboveUsualVolume")}` : ""}
      </Chip></Stack>
      <Text as="p" variant="title" tone="primary">{p.coachSentence}</Text>
      {/* 하이라이트의 한 줄 근거 — 서버가 표시 언어로 써서 보낸다. "왜 그렇게 불렀나" 가 칩 바로 아래 온다. */}
      {p.highlight && <Text as="p" variant="caption" tone="secondary">{p.highlight.reason}</Text>}
    </Stack>
    <SummarySection title={copy("stimulus")}>
      <Stack gap="var(--dim-item-gap)">
        {/* 부하·NP·IF 는 상단 스탯 스트립에 없다 — 여기서 빠지면 어디에도 안 나온다. */}
        {(p.session.load != null || (powerVisible && p.session.normalizedPowerW != null)) && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-[var(--dim-item-gap)]">
            {p.session.load != null && <Stat compact label={p.session.loadKind === "tss" ? "TSS" : label("load")} value={number(p.session.load)} />}
            {powerVisible && p.session.normalizedPowerW != null && <Stat compact label="NP" value={number(p.session.normalizedPowerW)} unit="W" />}
            {powerVisible && p.session.intensityFactor != null && <Stat compact label="IF" value={p.session.intensityFactor.toFixed(2)} />}
          </div>
        )}
        {highPercent != null && <Stat compact label={`${label(highZone!.kind)} Z4+`} value={number(highPercent)} unit="%" />}
        {effort?.matchesCount != null && line(copy("matches"), `${effort.matchesCount}${copy("efforts")}${effort.matchesTotalSec != null ? ` · ${duration(effort.matchesTotalSec)}` : ""}`)}
        {effort?.longestZ4PlusSec != null && line(copy("longest"), duration(effort.longestZ4PlusSec))}
        {effort?.anaerobicSec != null && line(copy("anaerobic"), duration(effort.anaerobicSec))}
        {effort?.wPrimeDepletionPct != null ? line(copy("reserve"), `${number(effort.wPrimeDepletionPct)}%`) : effort?.wPrimeRemainingPct != null && line(copy("remaining"), `${number(effort.wPrimeRemainingPct)}%`)}
        {highPercent == null && ![effort?.matchesCount, effort?.longestZ4PlusSec, effort?.anaerobicSec, effort?.wPrimeDepletionPct, effort?.wPrimeRemainingPct].some((value) => value != null) && note(copy("stimulusMissing"))}
      </Stack>
    </SummarySection>
    <SummarySection title={voice("changes")}>
      {!!records.length && <Stack>{records.map((row) => <Stack key={row.key} direction="row" wrap align="center"><Chip variant="accent">{label(`records.${row.achievement}`)}</Chip><Text variant="bodyMedium" mono>{row.value}</Text></Stack>)}</Stack>}
      {!!personal.length && <Stack gap="var(--dim-item-gap)">{personal.map((row) => <Stack key={row.axis} direction="row" justify="space-between" align="baseline" wrap><Text variant="bodySmall" tone="secondary">{label(`axes.${row.axis}`)} · {label(`bands.${row.band}`)}</Text><Text variant="bodyMedium" mono tone="primary">{copy("index")} {number(row.personalIndex)}</Text></Stack>)}</Stack>}
      {!personal.length && (thresholdMissing
        ? <Stack gap="var(--dim-item-gap)">
            {note(voice("thresholdMissing"))}
            {isOwner && <Link to="/settings?section=training" className={buttonClass({ size: "sm", variant: "outline" })}>
              {copy("thresholdMissingCta")}
            </Link>}
          </Stack>
        : note(label(`personalStates.${p.availability?.personal ?? "unavailable"}`)))}
      {!!highlights.length && <Stack>{highlights.map((row) => <Stack key={row.duration} direction="row" wrap justify="space-between"><Text variant="bodySmall">{copy("peakChange")} · {powerDuration(row.duration)}</Text><Text variant="bodyMedium" mono>{signed(row.deltaPct!)}% · {row.priorSampleCount}{copy("samples")}</Text></Stack>)}</Stack>}
      {!!comparable.length && !highlights.length && note(voice("stablePower"))}
      {metadata && (personal.length > 0 || comparable.length > 0) && note(t("overviewEvidence.scope", { days: metadata.windowDays, count: metadata.priorSampleCount, character: label(`characters.${metadata.character}`) }) + (metadata.historyCompleteness !== "complete" ? ` · ${label(`completeness.${metadata.historyCompleteness}`)}` : ""))}
    </SummarySection>
    {!!power.length && <SummarySection title={copy("peaks")}>
      {/* 비교 이력이 없어도 구간 최고 출력 자체는 읽을 값이다. 예전에는 비교 가능할 때만
          "변화" 한 줄을 그리고 9개 구간을 통째로 버렸다. */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-[var(--dim-item-gap)]">
        {power.map((row) => <Stat key={row.duration} compact label={powerDuration(row.duration)} value={number(row.watts)} unit="W" />)}
      </div>
    </SummarySection>}
    {p.routeLoad && (p.routeLoad.climbCount != null || p.routeLoad.maxGradePct != null) && <SummarySection title={copy("route")}>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-[var(--dim-item-gap)]">
        {p.routeLoad.climbCount != null && <Stat compact label={label("climbs")} value={number(p.routeLoad.climbCount)} />}
        {p.routeLoad.highestCategory && <Stat compact label={label("category")} value={p.routeLoad.highestCategory} />}
        {p.routeLoad.avgGradePct != null && <Stat compact label={label("avgGrade")} value={number(p.routeLoad.avgGradePct)} unit="%" />}
        {p.routeLoad.maxGradePct != null && <Stat compact label={label("maxGrade")} value={number(p.routeLoad.maxGradePct)} unit="%" />}
      </div>
      {p.routeLoad.elevationSuspect && note(label("suspect"))}
    </SummarySection>}
    <SummarySection title={copy("recovery")}>
      <Stack>
        {p.recovery && <Stat compact label={copy("recoveryHours")} value={number(p.recovery.hours)} unit={copy("hour")} />}
        {powerVisible && p.energy?.fatPct != null && p.energy.carbPct != null && <div className="grid grid-cols-2 gap-[var(--dim-item-gap)]"><Stat compact label={label("fat")} value={number(p.energy.fatPct)} unit="%" /><Stat compact label={label("carb")} value={number(p.energy.carbPct)} unit="%" /></div>}
        {!p.recovery && !(powerVisible && p.energy?.fatPct != null && p.energy.carbPct != null) && note(copy("recoveryMissing"))}
      </Stack>
    </SummarySection>
    <SummarySection title={copy("before")}>
      {p.priorFitnessStatus ? <Stack>
        <Stack direction="row" wrap align="center"><Text variant="bodyMedium" tone="primary">{label(`forms.${p.priorFitnessStatus.formBand}`)}</Text><Text variant="caption" tone="tertiary">{p.priorFitnessStatus.asOf}</Text></Stack>
        <div className="grid grid-cols-3 gap-[var(--dim-item-gap)]"><Stat compact label={copy("ctl")} value={number(p.priorFitnessStatus.ctl)} /><Stat compact label={copy("atl")} value={number(p.priorFitnessStatus.atl)} /><Stat compact label={copy("tsb")} value={number(p.priorFitnessStatus.tsb)} /></div>
      </Stack> : note(copy("beforeMissing"))}
    </SummarySection>
    <Stack gap="var(--dim-item-gap)">
      {note(label("modelNote"))}
      {p.qualityNote && note(copy("qualityFooter"))}
    </Stack>
  </Stack>;
}

export default function ActivityOverviewSummary({ overview, preview = false, isOwner = true }: { overview: ReturnType<typeof useActivityOverview>; preview?: boolean; isOwner?: boolean }) {
  const { t } = useTranslation("activity");
  if (!overview.enabled) return null;
  const reason = overview.response?.status === "unavailable" ? overview.response.reason : null;
  // 남의 활동에서는 보여줄 개요가 있을 때만 카드를 낸다 — 진단 문구·재시도는 소유자의 것이다.
  if (!isOwner && overview.response?.status !== "available") return null;
  return <Card data-testid="activity-overview-summary"><Stack gap="var(--dim-section-gap)">
    <Stack direction="row" wrap justify="space-between" align="baseline"><Text as="h2" variant="subtitle">{t("overviewSummary.title")}</Text><Text variant="eyebrow" tone="accent">O-RIDER</Text></Stack>
    {preview && <Text as="p" variant="caption">{t("overviewEvidence.preview")}</Text>}
    {overview.loading ? <Text as="p" variant="body" role="status">{t("overviewEvidence.loading")}</Text> : overview.response?.status === "available" ? <>
      <ActivityOverviewSummaryContent presentation={overview.response.presentation} isOwner={isOwner} />
      {!!overview.response.partialReasons?.length && <Text as="p" variant="caption">{t("overviewEvidence.partial")} {overview.response.partialReasons.map((value) => t(`overviewEvidence.partialReasons.${value}`)).join(" · ")}</Text>}
    </> : <Stack><Text as="p" variant="body">{t(overview.error ? "overviewEvidence.error" : reason ? `overviewEvidence.unavailable.${reason}` : "overviewEvidence.missing")}</Text>{reason !== "rollout_disabled" && <Button size="sm" variant="outline" onClick={overview.retry}>{t("overviewEvidence.retry")}</Button>}</Stack>}
  </Stack></Card>;
}
