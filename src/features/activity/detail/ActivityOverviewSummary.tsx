import GlossaryProvider from "../../../components/common/GlossaryProvider";
import GlossaryText from "../../../components/common/GlossaryText";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { ActivityOverviewPresentation } from "@shared/types/activity-overview";
import type { useActivityOverview } from "../../../hooks/useActivityOverview";
import { Button, Card, Chip, Stack, Stat, Text, buttonClass } from "../../../theme/components";
import InfoTip from "../../../components/InfoTip";
import FuelSplitBar from "../../../components/FuelSplitBar";
import { FitnessShift, IntensityGauge, OverviewPowerCurve, PercentMeter, ZoneTimeBar } from "./ActivityOverviewCharts";

const number = (value: number) => String(Math.round(value * 10) / 10);
const signed = (value: number) => `${value > 0 ? "+" : ""}${number(value)}`;

function SummarySection({ title, children, info, span = false }: { title: string; children: ReactNode; info?: string; span?: boolean }) {
  const { t } = useTranslation("activity");
  return <section className={`min-w-0 border-t border-[var(--line-soft)] pt-[var(--dim-section-gap)] space-y-4 ${span ? "activity-overview-span" : ""}`} aria-label={title}>
    <div className="activity-overview-section-head">
      <Text as="h3" variant="subtitle"><GlossaryText>{title}</GlossaryText></Text>
      {info && <InfoTip content={info} label={t("overviewSummary.aboutSection", { title })} />}
    </div>
    {children}
  </section>;
}

/**
 * A reading surface for the sharing summary, not a second analysis dashboard.
 *
 * 첫 화면에서 "어떤 활동이었나" 가 그림으로 읽히게 한다 — 강도 게이지·존 막대, 파워 커브,
 * 훈련 부하 전→후. 숫자는 그림이 가리키는 몇 개만 크게 남기고, 설명은 ⓘ 로 접는다.
 * 값은 전부 서버 정본이다. 없으면 그 그림을 그리지 않는다.
 */
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
  const powerVisible = p.session.discipline === "bike";
  const powerEstimated = p.session.discipline === "bike" && p.availability?.power === "estimated";
  const zones = (p.zones ?? []).filter((zone) => zone.kind !== "power" || powerVisible);
  const highZone = zones.find((zone) => zone.kind === "power") ?? zones.find((zone) => zone.kind === "heartRate");
  const zoneTotal = highZone?.seconds.reduce((sum, value) => sum + value, 0) ?? 0;
  // Z4+ 는 서버 비중(%)을 더한 값이다. 비중이 없던 옛 응답만 공유 문구와 같은 방식으로 초에서 읽는다.
  const highPercent = !highZone || zoneTotal <= 0 ? undefined
    : highZone.currentPercentages?.length === highZone.seconds.length ? highZone.currentPercentages.slice(3).reduce((sum, value) => sum + value, 0)
    : highZone.seconds.slice(3).reduce((sum, value) => sum + value, 0) / zoneTotal * 100;
  const effort = powerVisible ? p.thresholdWork : undefined;
  const metadata = p.comparisonMetadata;
  const axes = ["sessionLoad", "highIntensityExposure", p.session.discipline === "bike" ? "cadenceVariability" : "paceVariability"];
  const personal = axes.flatMap((axis) => (p.personal ?? []).filter((row) => row.axis === axis));
  const power = powerVisible ? p.powerFingerprint ?? [] : [];
  const comparable = metadata?.historyCompleteness === "complete" ? power.filter((row) => row.deltaPct != null && Number.isFinite(row.deltaPct) && (row.medianWatts ?? 0) > 0 && (row.priorSampleCount ?? 0) >= 3) : [];
  const highlights = [...comparable.filter((row) => row.deltaPct! >= 5).sort((a, b) => b.deltaPct! - a.deltaPct!).slice(0, 1), ...comparable.filter((row) => row.deltaPct! <= -5).sort((a, b) => a.deltaPct! - b.deltaPct!).slice(0, 1)];
  const powerDuration = (value: string) => i18n.language.startsWith("ko") ? value.replace(/s$/, "초").replace(/m$/, "분").replace(/h$/, "시간") : value;
  const records = p.availability?.records === "evaluated" ? [
    ...power.filter((row) => row.recordAchievement).map((row) => ({ key: row.duration, value: `${powerDuration(row.duration)} · ${number(row.watts)} W`, achievement: row.recordAchievement! })),
    ...(p.runRecordAchievements ?? []).map((row) => ({ key: row.distance, value: `${row.distance} · ${duration(row.valueSec)}`, achievement: row.recordAchievement })),
  ] : [];
  const note = (children: ReactNode) => <Text as="p" variant="caption" tone="tertiary"><GlossaryText>{children}</GlossaryText></Text>;
  const loadLabel = p.session.loadKind === "tss" ? "TSS" : p.session.loadSource === "time" ? `${label("load")} · ${label("loadEstimatedFromTime")}` : label("load");
  const hasHero = p.session.load != null || (powerVisible && (p.session.normalizedPowerW != null || p.session.intensityFactor != null));
  const facts = [
    effort?.matchesCount != null && <Stat key="matches" compact label={<GlossaryText>{copy("matches")}</GlossaryText>} value={<GlossaryText>{`${effort.matchesCount}${copy("efforts")}${effort.matchesTotalSec != null ? ` · ${duration(effort.matchesTotalSec)}` : ""}`}</GlossaryText>} />,
    effort?.longestZ4PlusSec != null && <Stat key="longest" compact label={<GlossaryText>{copy("longest")}</GlossaryText>} value={duration(effort.longestZ4PlusSec)} />,
    effort?.anaerobicSec != null && <Stat key="anaerobic" compact label={<GlossaryText>{copy("anaerobic")}</GlossaryText>} value={duration(effort.anaerobicSec)} />,
  ].filter(Boolean);
  const form = (status: { formBand: string }) => p.fitnessEvidence && p.fitnessEvidence !== "sufficient" ? label("fitnessLimited") : label(`forms.${status.formBand}`);
  const fuel = powerVisible && p.energy?.fatPct != null && p.energy.carbPct != null ? p.energy : null;
  return <GlossaryProvider scopeKey="activity-overview-summary"><Stack gap="var(--dim-section-gap)">
    <Stack gap="var(--dim-item-gap)">
      {/* 성격이 곧 라벨이다 — 별도 은유 층을 두지 않는다. 서버가 확정한 값만 그린다(화면에서 재분류하지 않는다). */}
      <Stack direction="row" wrap><Chip variant={p.session.character ? "accent" : "default"}>
        {p.session.character ? label(`characters.${p.session.character}`)
          : thresholdMissing ? copy("thresholdMissingChip") : copy("characterPending")}
        {p.aboveUsualVolume ? ` · ${copy("aboveUsualVolume")}` : ""}
      </Chip></Stack>
      {/* 판정 문장은 근거가 있을 때만 온다. 없으면 줄을 비운다 — 칩과 헤더가 이미 사실을 보여준다. */}
      {!!p.observedEffects?.length && note(p.observedEffects.join(" · "))}
      {p.coachSentence && <Text as="p" variant="title" tone="primary"><GlossaryText>{p.coachSentence}</GlossaryText></Text>}
      {/* 하이라이트의 한 줄 근거 — 서버가 표시 언어로 써서 보낸다. "왜 그렇게 불렀나" 가 칩 바로 아래 온다. */}
      {p.highlight && <Text as="p" variant="caption" tone="secondary"><GlossaryText>{p.highlight.reason}</GlossaryText></Text>}
    </Stack>
    {powerEstimated && note(label("powerEstimated"))}
    {zones.some((zone) => zone.provisional) && note(label("zoneProvisional"))}
    {zones.filter((zone) => zone.historyCompleteness && zone.historyCompleteness !== "complete").map((zone) => <Text key={zone.kind} as="p" variant="caption" tone="tertiary"><GlossaryText>{label(zone.kind)}</GlossaryText> · <GlossaryText>{label(`completeness.${zone.historyCompleteness}`)}</GlossaryText></Text>)}
    {powerVisible && p.session.ftpVerificationRequired && note(label("ftpVerificationRequired"))}
    <div className="activity-overview-body"><div className="activity-overview-grid">
    <SummarySection title={copy("stimulus")} span>
      {/* 그림 1 — 얼마나 세게(IF 게이지), 어디서 시간을 썼나(존 막대). 부하·NP·IF 는 상단 스탯 스트립에 없다. */}
      {(hasHero || highZone) && <div className={`activity-overview-split ${powerVisible && p.session.intensityFactor != null ? "" : "activity-overview-split--lead"}`}>
        {hasHero && <Stack gap="var(--space-5)">
          <div className="activity-overview-hero">
            {p.session.load != null && <Stat label={<GlossaryText>{loadLabel}</GlossaryText>} value={number(p.session.load)} />}
            {powerVisible && p.session.normalizedPowerW != null && <Stat label={<GlossaryText>NP</GlossaryText>} value={number(p.session.normalizedPowerW)} unit="W" />}
          </div>
          {powerVisible && p.session.intensityFactor != null && <div className="activity-overview-if">
            <div className="activity-overview-if__head">
              <Text variant="bodySmall" tone="secondary"><GlossaryText>{copy("intensity")}</GlossaryText></Text>
              <Text variant="dataMedium" tone="primary">{p.session.intensityFactor.toFixed(2)}</Text>
            </div>
            <IntensityGauge value={p.session.intensityFactor} />
          </div>}
        </Stack>}
        {highZone && <Stack gap="var(--space-4)">
          <ZoneTimeBar zone={highZone} highPercent={highPercent} heading={<GlossaryText>{`${label(highZone.kind)} · ${copy("zoneTime")}`}</GlossaryText>} />
        </Stack>}
      </div>}
      {(facts.length > 0 || effort?.wPrimeDepletionPct != null || effort?.wPrimeRemainingPct != null) && <div className="activity-overview-split">
        {facts.length > 0 ? <div className="activity-overview-facts">{facts}</div> : <span />}
        {effort?.wPrimeDepletionPct != null
          ? <PercentMeter label={<GlossaryText>{copy("reserve")}</GlossaryText>} value={effort.wPrimeDepletionPct} display={`${number(effort.wPrimeDepletionPct)}%`} tone="high" />
          : effort?.wPrimeRemainingPct != null && <PercentMeter label={<GlossaryText>{copy("remaining")}</GlossaryText>} value={effort.wPrimeRemainingPct} display={`${number(effort.wPrimeRemainingPct)}%`} />}
      </div>}
      {/* 존·기록·무산소가 없으면 그림이 없는 것으로 충분하다. "아직 없어요" 는 곧 계산될 것처럼 읽혀 임계값 없는 활동에서 거짓이 된다. */}
    </SummarySection>
    {!!power.length && <SummarySection title={copy("peaks")} info={p.availability?.records === "evaluated" && power.some((row) => row.previousBestPct != null) ? label("previousBestScope") : undefined}>
      {/* 그림 2 — 비교 이력이 없어도 구간 최고 출력 자체는 읽을 값이다. 대비 % 는 툴팁·점 라벨로 간다. */}
      <OverviewPowerCurve rows={power} recordsEvaluated={p.availability?.records === "evaluated"} comparableMedian={comparable.length > 0} />
    </SummarySection>}
    <SummarySection title={p.fitnessScope === "integrated" ? copy("fitnessTitle") : copy("before")} info={p.fitnessScope === "integrated" ? label("fitnessDefinition") : undefined}>
      {/* 그림 3 — 이번 활동이 체력·피로·폼을 어디서 어디로 옮겼나. 세 줄이 한 축을 공유한다. */}
      {p.priorFitnessStatus ? <FitnessShift prior={p.priorFitnessStatus} post={p.postFitnessStatus}
        rowLabel={(key) => <GlossaryText>{copy(key)}</GlossaryText>}
        priorCaption={<><GlossaryText>{copy("beforeLegend")}</GlossaryText> · <GlossaryText>{form(p.priorFitnessStatus)}</GlossaryText> · {p.priorFitnessStatus.asOf}</>}
        postCaption={p.postFitnessStatus && <>{label("after")} · <GlossaryText>{form(p.postFitnessStatus)}</GlossaryText> · {p.postFitnessStatus.asOf}</>} />
        : note(copy("beforeMissing"))}
      {p.sportFitnessStatus && note(`${label(`sports.${p.sportFitnessStatus.discipline}`)} · ${label("sportHistory")} · CTL ${number(p.sportFitnessStatus.ctl)}${p.sportFitnessStatus.evidence !== "sufficient" ? ` · ${label("fitnessLimited")}` : ""}`)}
    </SummarySection>
    <SummarySection title={voice("changes")}>
      {!!records.length && <Stack direction="row" wrap>{records.map((row) => <Stack key={row.key} direction="row" wrap align="center"><Chip variant="accent">{label(`records.${row.achievement}`)}</Chip><Text variant="bodyMedium" mono><GlossaryText>{row.value}</GlossaryText></Text></Stack>)}</Stack>}
      {!!personal.length && <Stack gap="var(--space-4)">{personal.map((row) => <PercentMeter key={row.axis} mid value={row.personalIndex}
        label={<><GlossaryText>{label(`axes.${row.axis}`)}</GlossaryText> · <GlossaryText>{label(`bands.${row.band}`)}</GlossaryText></>}
        display={<><GlossaryText>{copy("index")}</GlossaryText> <GlossaryText>{number(row.personalIndex)}</GlossaryText></>} />)}</Stack>}
      {!personal.length && (thresholdMissing
        ? <Stack gap="var(--dim-item-gap)">
            {note(p.session.discipline === "run" && isOwner ? copy("runThresholdMissing") : voice("thresholdMissing"))}
            {isOwner && <Link to="/coach/condition?sport=bike#thresholds" className={buttonClass({ size: "sm", variant: "outline" })}>
              {copy("thresholdMissingCta")}
            </Link>}
          </Stack>
        : note(label(`personalStates.${p.availability?.personal ?? "unavailable"}`)))}
      {!!highlights.length && <Stack>{highlights.map((row) => <Stack key={row.duration} direction="row" wrap justify="space-between"><Text variant="bodySmall"><GlossaryText>{copy("peakChange")}</GlossaryText> · <GlossaryText>{powerDuration(row.duration)}</GlossaryText></Text><Text variant="bodyMedium" mono><GlossaryText>{signed(row.deltaPct!)}</GlossaryText>% · <GlossaryText>{row.priorSampleCount}</GlossaryText><GlossaryText>{copy("samples")}</GlossaryText></Text></Stack>)}</Stack>}
      {!!comparable.length && !highlights.length && note(voice("stablePower"))}
      {metadata && (personal.length > 0 || comparable.length > 0) && note(t("overviewEvidence.scope", { days: metadata.windowDays, count: metadata.priorSampleCount, character: label(`characters.${metadata.character}`) }) + (metadata.historyCompleteness !== "complete" ? ` · ${label(`completeness.${metadata.historyCompleteness}`)}` : ""))}
    </SummarySection>
    {/* 회복·경로는 오른쪽 한 칸에 쌓는다 — 왼쪽 "나의 변화" 가 길어도 빈 칸이 남지 않는다. */}
    <div className="activity-overview-stack">
    {(p.session.discipline === "bike" || p.recovery || p.recoveryGuidance) && <SummarySection title={copy(p.session.discipline === "bike" ? "recovery" : "runRecovery")}>
      <Stack gap="var(--space-4)">
        {!p.recoveryGuidance && p.recovery && <Stat compact label={<GlossaryText>{copy("recoveryHours")}</GlossaryText>} value={number(p.recovery.hours)} unit={copy("hour")} />}
        {fuel && <FuelSplitBar size="compact" fat={{ label: label("fat"), pct: fuel.fatPct!, kcal: fuel.fatKcal }} carb={{ label: label("carb"), pct: fuel.carbPct!, kcal: fuel.carbKcal }} />}
        {p.recoveryGuidance && note(label("recoveryGuidance"))}
        {!p.recoveryGuidance && !p.recovery && !fuel && note(copy("recoveryMissing"))}
      </Stack>
    </SummarySection>}
    {p.routeLoad && (p.routeLoad.climbCount != null || p.routeLoad.maxGradePct != null) && <SummarySection title={copy("route")}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-[var(--dim-item-gap)]">
        {p.routeLoad.climbCount != null && <Stat compact label={<GlossaryText>{label("climbs")}</GlossaryText>} value={number(p.routeLoad.climbCount)} />}
        {p.routeLoad.highestCategory && <Stat compact label={<GlossaryText>{label("category")}</GlossaryText>} value={p.routeLoad.highestCategory} />}
        {p.routeLoad.avgGradePct != null && <Stat compact label={<GlossaryText>{label("avgGrade")}</GlossaryText>} value={number(p.routeLoad.avgGradePct)} unit="%" />}
        {p.routeLoad.maxGradePct != null && <Stat compact label={<GlossaryText>{label("maxGrade")}</GlossaryText>} value={number(p.routeLoad.maxGradePct)} unit="%" />}
      </div>
      {p.routeLoad.elevationSuspect && note(label("suspect"))}
    </SummarySection>}
    </div>
    </div></div>
    <Stack gap="var(--dim-item-gap)">
      {p.session.discipline === "bike" ? note(label("modelNote")) : p.recovery ? note(copy("runRecoveryNote")) : null}
      {p.qualityNote && note(copy("qualityFooter"))}
    </Stack>
  </Stack></GlossaryProvider>;
}

export default function ActivityOverviewSummary({ overview, preview = false, isOwner = true, children }: { overview: ReturnType<typeof useActivityOverview>; preview?: boolean; isOwner?: boolean; children?: ReactNode }) {
  const { t } = useTranslation("activity");
  if (!overview.enabled) return null;
  const reason = overview.response?.status === "unavailable" ? overview.response.reason : null;
  // 남의 활동에서는 보여줄 개요가 있을 때만 카드를 낸다 — 진단 문구·재시도는 소유자의 것이다.
  if (!isOwner && overview.response?.status !== "available") return null;
  return <Card data-testid="activity-overview-summary"><Stack gap="var(--dim-section-gap)">
    <Stack direction="row" wrap justify="space-between" align="baseline"><Text as="h2" variant="subtitle"><GlossaryText>{t("overviewSummary.title")}</GlossaryText></Text><Text variant="eyebrow" tone="accent">O-RIDER</Text></Stack>
    {preview && <Text as="p" variant="caption"><GlossaryText>{t("overviewEvidence.preview")}</GlossaryText></Text>}
    {overview.loading ? <Text as="p" variant="body" role="status"><GlossaryText>{t("overviewEvidence.loading")}</GlossaryText></Text> : overview.response?.status === "available" ? <>
      <ActivityOverviewSummaryContent presentation={overview.response.presentation} isOwner={isOwner} />
      {!!overview.response.partialReasons?.length && <Text as="p" variant="caption"><GlossaryText>{t("overviewEvidence.partial")}</GlossaryText> <GlossaryText>{overview.response.partialReasons.map((value) => t(`overviewEvidence.partialReasons.${value}`)).join(" · ")}</GlossaryText></Text>}
    </> : <Stack><Text as="p" variant="body"><GlossaryText>{t(overview.error ? "overviewEvidence.error" : reason ? `overviewEvidence.unavailable.${reason}` : "overviewEvidence.missing")}</GlossaryText></Text>{reason !== "rollout_disabled" && <Button size="sm" variant="outline" onClick={overview.retry}>{t("overviewEvidence.retry")}</Button>}</Stack>}
    {children}
  </Stack></Card>;
}
