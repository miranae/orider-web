import GlossaryProvider from "../../../components/common/GlossaryProvider";
import GlossaryText from "../../../components/common/GlossaryText";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { ActivityOverviewPresentation } from "@shared/types/activity-overview";
import type { useActivityOverview } from "../../../hooks/useActivityOverview";
import { Button, Card, Chip, Stack, Stat, Text, buttonClass } from "../../../theme/components";
import InfoTip from "../../../components/InfoTip";
import FuelSplitBar from "../../../components/FuelSplitBar";
import { DeltaBar, FitnessShift, IntensityGauge, MixedValue, OverviewPowerCurve, PercentMeter, ZoneTimeBar, formatSpan, powerComparisonBasis } from "./ActivityOverviewCharts";

const number = (value: number) => String(Math.round(value * 10) / 10);
const signed = (value: number) => `${value > 0 ? "+" : ""}${number(value)}`;

/**
 * 섹션 제목에는 용어 강조를 하지 않는다 — 설명은 ⓘ 하나로 연결한다.
 * `collapsible` 이면 좁은 카드(휴대폰, 카드 폭 480px 미만)에서 접힌 채 시작한다. 그보다 넓으면 늘 펼친다.
 */
function SummarySection({ title, children, info, className = "", collapsible = false }: { title: string; children: ReactNode; info?: string; className?: string; collapsible?: boolean }) {
  const { t } = useTranslation("activity");
  const ref = useRef<HTMLElement | null>(null);
  const bodyId = useId();
  const [narrow, setNarrow] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    // 접힘 여부는 카드 폭(휴대폰)으로 정한다 — 태블릿 두 열의 좁은 열에서는 펼친다.
    const element = ref.current?.closest(".activity-overview-body") ?? ref.current;
    if (!collapsible || !element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setNarrow((entry?.contentRect.width ?? 0) > 0 && (entry?.contentRect.width ?? 0) < 480));
    observer.observe(element);
    return () => observer.disconnect();
  }, [collapsible]);
  const folded = collapsible && narrow && !open;
  return <section ref={ref} className={`min-w-0 border-t border-[var(--line-soft)] pt-[var(--dim-section-gap)] space-y-4 ${className}`} aria-label={title}>
    <div className="activity-overview-section-head">
      {collapsible && narrow
        ? <h3 className="activity-overview-section-head__title"><button type="button" className="activity-overview-disclosure" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((value) => !value)}>
            <Text variant="subtitle" tone="primary">{title}</Text><span aria-hidden="true" className="activity-overview-disclosure__chevron" />
          </button></h3>
        : <Text as="h3" variant="subtitle">{title}</Text>}
      {info && <InfoTip content={info} label={t("overviewSummary.aboutSection", { title })} />}
    </div>
    <div id={bodyId} hidden={folded} className="space-y-4">{children}</div>
  </section>;
}

/** 자료가 없는 구역은 제목과 사유를 한 줄로 접는다 — 모든 빈 상태가 같은 모양이다. */
function CompactSection({ title, className = "", children }: { title: string; className?: string; children: ReactNode }) {
  return <section className={`min-w-0 border-t border-[var(--line-soft)] pt-[var(--dim-section-gap)] ${className}`} aria-label={title}>
    <div className="activity-overview-compact"><Text as="h3" variant="bodySmall" weight={600} tone="secondary">{title}</Text>{children}</div>
  </section>;
}

// 라벨이 라틴 약어(TSS·NP)뿐이면 eyebrow 자간을 유지하고, 한글이 섞이면 본문 라벨로 쓴다.
const latin = (value: string) => /^[A-Za-z0-9 .+′'/-]+$/.test(value) ? { "data-latin": "" } : {};

/**
 * A reading surface for the sharing summary, not a second analysis dashboard.
 *
 * 첫 화면에서 "어떤 활동이었나" 가 그림으로 읽히게 한다 — 강도 게이지·존 막대, 파워 커브,
 * 훈련 부하 전→후. 숫자는 그림이 가리키는 몇 개만 크게 남기고, 설명은 ⓘ 로 접는다.
 * 값은 전부 서버 정본이다. 없으면 그 그림을 그리지 않는다.
 */
export function ActivityOverviewSummaryContent({ presentation: p, isOwner = true, ftpW }: { presentation: ActivityOverviewPresentation; isOwner?: boolean;
  /** 서버 지표(`activity_metrics.contextSnapshot.ftp`)의 활동 당시 FTP. 있을 때만 파워 커브에 기준선을 긋는다. */
  ftpW?: number | null }) {
  const { t, i18n } = useTranslation("activity");
  const label = (key: string) => t(`overviewEvidence.${key}`);
  const copy = (key: string) => t(`overviewSummary.${key}`);
  // 개요 문구는 소유자 1인칭으로 쓰여 있다. 남의 활동에서 그대로 쓰면 보는 사람의 기록으로 읽힌다.
  const voice = (key: string) => copy(isOwner ? key : `${key}Other`);
  // "성격 확인 중" 은 곧 계산될 것처럼 읽힌다. 임계값이 없으면 설정 전까지 영원히
  // 채워지지 않으므로 그 상태를 그대로 말한다.
  const thresholdMissing = p.thresholdBasis === "none";
  const duration = (value: number) => formatSpan(value, { hour: copy("hour"), minute: copy("minute"), second: copy("second") });
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
  const recordsEvaluated = p.availability?.records === "evaluated";
  const comparable = metadata?.historyCompleteness === "complete" ? power.filter((row) => row.deltaPct != null && Number.isFinite(row.deltaPct) && (row.medianWatts ?? 0) > 0 && (row.priorSampleCount ?? 0) >= 3) : [];
  const highlights = [...comparable.filter((row) => row.deltaPct! >= 5).sort((a, b) => b.deltaPct! - a.deltaPct!).slice(0, 1), ...comparable.filter((row) => row.deltaPct! <= -5).sort((a, b) => a.deltaPct! - b.deltaPct!).slice(0, 1)];
  const powerDuration = (value: string) => i18n.language.startsWith("ko") ? value.replace(/s$/, "초").replace(/m$/, "분").replace(/h$/, "시간") : value;
  const records = recordsEvaluated ? [
    ...power.filter((row) => row.recordAchievement).map((row) => ({ key: row.duration, value: `${powerDuration(row.duration)} · ${number(row.watts)} W`, achievement: row.recordAchievement! })),
    ...(p.runRecordAchievements ?? []).map((row) => ({ key: row.distance, value: `${row.distance} · ${duration(row.valueSec)}`, achievement: row.recordAchievement })),
  ] : [];
  const note = (children: ReactNode) => <Text as="p" variant="caption" tone="tertiary"><GlossaryText>{children}</GlossaryText></Text>;
  const loadLabel = t("detail.acceptedLoadLabel");
  const hasHero = p.session.load != null || (powerVisible && (p.session.normalizedPowerW != null || p.session.intensityFactor != null));
  const hasGauge = powerVisible && p.session.intensityFactor != null;
  const facts = [
    effort?.matchesCount != null && <Stat key="matches" compact label={<GlossaryText>{copy("matches")}</GlossaryText>} value={<MixedValue value={`${effort.matchesCount}${copy("efforts")}${effort.matchesTotalSec != null ? ` · ${duration(effort.matchesTotalSec)}` : ""}`} />} />,
    effort?.longestZ4PlusSec != null && <Stat key="longest" compact label={<GlossaryText>{copy("longest")}</GlossaryText>} value={<MixedValue value={duration(effort.longestZ4PlusSec)} />} />,
    effort?.anaerobicSec != null && <Stat key="anaerobic" compact label={<GlossaryText>{copy("anaerobic")}</GlossaryText>} value={<MixedValue value={duration(effort.anaerobicSec)} />} />,
  ].filter(Boolean);
  const hasWPrime = effort?.wPrimeDepletionPct != null || effort?.wPrimeRemainingPct != null;
  const form = (status: { formBand: string }) => p.fitnessEvidence && p.fitnessEvidence !== "sufficient" ? label("fitnessLimited") : label(`forms.${status.formBand}`);
  const fuel = powerVisible && p.energy?.fatPct != null && p.energy.carbPct != null ? p.energy : null;
  const prior = p.priorFitnessStatus, post = p.postFitnessStatus;
  // 전·후가 다 있으면 "변화" 를, 운동 전만 있으면 그 상태를 말한다.
  const fitnessTitle = prior && post ? p.fitnessScope === "integrated" ? copy("fitnessTitle") : copy("fitnessChange")
    : p.fitnessScope === "integrated" ? label("integratedFitness") : copy("before");
  // 비교가 없을 때는 무엇을 하면 열리는지 말한다. 성격 불명확은 기록을 더해도 바로 풀리지 않으니 그 사유를 그대로 둔다.
  // 필요한 횟수는 서버가 주지 않으므로 숫자를 쓰지 않는다(화면에서 계산하지 않는다).
  const personalEmpty = p.availability?.personal === "character_uncertain" ? label("personalStates.character_uncertain") : voice("changesEmpty");
  const changesEmpty = !records.length && !personal.length && !highlights.length && !comparable.length && !thresholdMissing;
  const showRecovery = p.session.discipline === "bike" || p.recovery || p.recoveryGuidance;
  const showRoute = p.routeLoad && (p.routeLoad.climbCount != null || p.routeLoad.maxGradePct != null);
  // 모델 각주는 모델 값(W′·연료·회복시간)이 화면에 있을 때만 단다.
  // 화면에 실제로 있는 모델 값만 나열한다(회복만 있으면 회복만).
  const modeled = p.session.discipline !== "bike" ? [] : [
    !p.recoveryGuidance && p.recovery ? copy("modelRecovery") : null,
    fuel ? copy("modelFuel") : null,
    hasWPrime ? "W′" : null,
  ].filter(Boolean);
  const modelNote = modeled.length ? t("overviewSummary.modelNote", { items: modeled.join("·") }) : null;
  const baselineHighPercent = highZone?.baselinePercentages?.length === highZone?.seconds.length && (highZone?.priorSampleCount ?? 0) > 0
    ? highZone!.baselinePercentages!.slice(3).reduce((sum, value) => sum + value, 0) : undefined;
  // 게이지가 없는 활동(심박·러닝)은 왼쪽 칸에 서버가 준 이동 시간·거리를 함께 둔다.
  const sessionFacts = [
    p.session.movingSec != null && <Stat key="moving" compact label={copy("movingTime")} value={<MixedValue value={duration(p.session.movingSec)} />} />,
    p.session.distanceKm != null && <Stat key="distance" compact label={copy("distance")} value={number(p.session.distanceKm)} unit="km" />,
  ].filter(Boolean);
  const recoveryTitle = copy(fuel ? "recovery" : "recoveryOnly");
  const recoveryEmpty = !fuel && !(!p.recoveryGuidance && p.recovery);
  // 통합 부하면 이름에 범위를 밝힌다 — 아래 종목별 각주의 CTL 과 같은 이름으로 읽히지 않게.
  const metricName = (key: "ctl" | "atl" | "tsb") => p.fitnessScope === "integrated" ? copy(`integrated_${key}`) : copy(key);
  const ctlLabel = (key: "ctl" | "atl" | "tsb") => <GlossaryText>{metricName(key)}</GlossaryText>;
  const changesBlock = changesEmpty
        ? <CompactSection title={voice("changes")}>
            {note(personalEmpty)}
          </CompactSection>
        : <SummarySection title={voice("changes")} collapsible>
      {!!records.length && <Stack direction="row" wrap>{records.map((row) => <Stack key={row.key} direction="row" wrap align="center"><Chip variant="accent">{label(`records.${row.achievement}`)}</Chip><Text variant="bodyMedium" tone="primary"><MixedValue value={row.value} /></Text></Stack>)}</Stack>}
      {!!personal.length && <Stack gap="var(--space-4)">{personal.map((row) => <PercentMeter key={row.axis} mid value={row.personalIndex}
        label={<><GlossaryText>{label(`axes.${row.axis}`)}</GlossaryText> · <GlossaryText>{label(`bands.${row.band}`)}</GlossaryText></>}
        display={<MixedValue value={`${copy("index")} ${number(row.personalIndex)}`} />} />)}</Stack>}
      {!personal.length && (thresholdMissing
        ? <Stack gap="var(--dim-item-gap)">
            {note(p.session.discipline === "run" && isOwner ? copy("runThresholdMissing") : voice("thresholdMissing"))}
            {isOwner && <Link to="/coach/condition?sport=bike#thresholds" className={buttonClass({ size: "sm", variant: "outline" })}>
              {copy("thresholdMissingCta")}
            </Link>}
          </Stack>
        : note(personalEmpty))}
      {!!highlights.length && <Stack gap="var(--space-3)">{highlights.map((row) => <DeltaBar key={row.duration} value={row.deltaPct!}
        label={<><GlossaryText>{copy("peakChange")}</GlossaryText> · {powerDuration(row.duration)}</>}
        display={<MixedValue value={`${signed(row.deltaPct!)}% · ${row.priorSampleCount}${copy("samples")}`} />} />)}</Stack>}
      {!!comparable.length && !highlights.length && note(voice("stablePower"))}
      {metadata && (personal.length > 0 || comparable.length > 0) && note(t("overviewEvidence.scope", { days: metadata.windowDays, count: metadata.priorSampleCount, character: label(`characters.${metadata.character}`) }) + (metadata.historyCompleteness !== "complete" ? ` · ${label(`completeness.${metadata.historyCompleteness}`)}` : ""))}
        </SummarySection>;
  const shiftBlock = <SummarySection title={fitnessTitle} info={p.fitnessScope === "integrated" ? label("fitnessDefinition") : undefined}>
      {/* 그림 3 — 이번 활동이 체력·피로·폼을 어디서 어디로 옮겼나. 운동 전만 있으면 숫자 셋으로 충분하다. */}
      {prior && post ? <FitnessShift prior={prior} post={post} rowLabel={ctlLabel} metricName={metricName}
        priorCaption={<><GlossaryText>{copy("beforeLegend")}</GlossaryText> · <GlossaryText>{form(prior)}</GlossaryText> · {prior.asOf}</>}
        postCaption={<>{label("after")} · <GlossaryText>{form(post)}</GlossaryText> · {post.asOf}</>} />
        : prior ? <Stack gap="var(--space-3)">
            <Text variant="caption" tone="tertiary"><GlossaryText>{form(prior)}</GlossaryText> · {prior.asOf}</Text>
            <div className="grid grid-cols-3 gap-[var(--dim-item-gap)]">{(["ctl", "atl", "tsb"] as const).map((key) => <Stat key={key} compact label={ctlLabel(key)} value={prior[key].toFixed(1)} />)}</div>
          </Stack>
        : note(copy("beforeMissing"))}
      {p.sportFitnessStatus && note(`${t("overviewSummary.sportOnly", { sport: label(`sports.${p.sportFitnessStatus.discipline}`) })} · CTL ${number(p.sportFitnessStatus.ctl)}${p.sportFitnessStatus.evidence !== "sufficient" ? ` · ${label("fitnessLimited")}` : ""}`)}
    </SummarySection>;
  const curveBlock = power.length ? <SummarySection title={copy("peaks")}
        info={(() => { const basis = powerComparisonBasis(power, recordsEvaluated, comparable.length > 0);
          const pick = recordsEvaluated && power.some((row) => row.recordAchievement) ? copy("labelPickRecords")
            : basis === "allTimeBest" ? copy("labelPickBest") : basis === "previousBest" ? copy("labelPickPrevious") : "";
          return basis === "allTimeBest" ? `${label("bestScope")} ${pick}` : basis === "previousBest" ? `${label("previousBestScope")} ${pick}` : pick || undefined; })()}>
        {/* 그림 2 — 비교 이력이 없어도 구간 최고 출력 자체는 읽을 값이다. 대비 % 는 툴팁·점 라벨로 간다. */}
        <OverviewPowerCurve rows={power} recordsEvaluated={recordsEvaluated} comparableMedian={comparable.length > 0} ftpW={ftpW} />
      </SummarySection> : null;
  const recoveryBlock = showRecovery ? (recoveryEmpty
      ? <CompactSection title={recoveryTitle}>{note(p.recoveryGuidance ? label("recoveryGuidance") : copy("recoveryMissing"))}</CompactSection>
      : <SummarySection title={recoveryTitle}>
      <Stack gap="var(--space-4)">
        {!p.recoveryGuidance && p.recovery && <Stat compact label={<GlossaryText>{copy("recoveryHours")}</GlossaryText>} value={number(p.recovery.hours)} unit={copy("hour")} />}
        {fuel && <FuelSplitBar size="compact" fat={{ label: label("fat"), pct: fuel.fatPct!, kcal: fuel.fatKcal }} carb={{ label: label("carb"), pct: fuel.carbPct!, kcal: fuel.carbKcal }} />}
        {p.recoveryGuidance && note(label("recoveryGuidance"))}
      </Stack>
    </SummarySection>) : null;
  const routeBlock = showRoute ? <SummarySection title={copy("route")} collapsible>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-[var(--dim-item-gap)]">
        {p.routeLoad!.climbCount != null && <Stat compact label={<GlossaryText>{label("climbs")}</GlossaryText>} value={number(p.routeLoad!.climbCount)} />}
        {p.routeLoad!.highestCategory && <Stat compact label={<GlossaryText>{label("category")}</GlossaryText>} value={p.routeLoad!.highestCategory} />}
        {p.routeLoad!.avgGradePct != null && <Stat compact label={<GlossaryText>{label("avgGrade")}</GlossaryText>} value={number(p.routeLoad!.avgGradePct)} unit="%" />}
        {p.routeLoad!.maxGradePct != null && <Stat compact label={<GlossaryText>{label("maxGrade")}</GlossaryText>} value={number(p.routeLoad!.maxGradePct)} unit="%" />}
      </div>
      {p.routeLoad!.elevationSuspect && note(copy("elevationSuspect"))}
    </SummarySection> : null;
  return <GlossaryProvider scopeKey="activity-overview-summary" triggerTone="inherit"><Stack gap="var(--dim-section-gap)" className="activity-overview-root">
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
    <SummarySection title={copy("stimulus")} className="activity-overview-area--stimulus">
      {/* 그림 1 — 얼마나 세게(IF 게이지), 어디서 시간을 썼나(존 막대). 부하·NP·IF 는 상단 스탯 스트립에 없다. */}
      {(hasHero || highZone) && <div className={`activity-overview-split ${hasGauge ? "" : "activity-overview-split--lead"}`}>
        {hasHero && <Stack gap="var(--space-5)">
          <div className="activity-overview-hero">
            {p.session.load != null && <Stat {...latin(loadLabel)} label={<GlossaryText>{loadLabel}</GlossaryText>} value={number(p.session.load)} />}
            {powerVisible && p.session.normalizedPowerW != null && <Stat data-latin="" label={<GlossaryText>NP</GlossaryText>} value={number(p.session.normalizedPowerW)} unit="W" />}
          </div>
          {p.session.load != null && note(`${t("detail.acceptedLoadDescription")}${p.session.loadKind === "tss" ? ` ${t("detail.acceptedLoadTssBasis")}` : p.session.loadSource === "time" ? ` ${t("detail.acceptedLoadTimeBasis")}` : p.session.loadSource === "trimp" ? ` ${t("detail.acceptedLoadHrBasis")}` : ""}`)}
          {!hasGauge && sessionFacts.length > 0 && <div className="activity-overview-hero">{sessionFacts}</div>}
          {hasGauge && <div className="activity-overview-if">
            <div className="activity-overview-if__head">
              <Text variant="bodySmall" tone="secondary"><GlossaryText>{copy("intensity")}</GlossaryText></Text>
              <Text variant="dataMedium" tone="primary">{p.session.intensityFactor!.toFixed(2)}</Text>
            </div>
            <IntensityGauge value={p.session.intensityFactor!} />
          </div>}
        </Stack>}
        {highZone && <ZoneTimeBar zone={highZone} highPercent={highPercent} baselineHighPercent={baselineHighPercent} heading={<GlossaryText>{`${label(highZone.kind)} · ${copy("zoneTime")}`}</GlossaryText>} />}
      </div>}
      {/* 존·기록·무산소가 없으면 그림이 없는 것으로 충분하다. "아직 없어요" 는 곧 계산될 것처럼 읽혀 임계값 없는 활동에서 거짓이 된다. */}
    </SummarySection>
    {/* 보조 수치는 한 격자의 칸들이다 — W′ 막대도 그중 한 칸(얇고 옅게)이라 존 막대보다 약한 신호로 남는다. */}
    {(facts.length > 0 || hasWPrime) && <div className="activity-overview-area--facts activity-overview-facts" role="group" aria-label={copy("stimulusDetail")}>
      {facts}
      {effort?.wPrimeDepletionPct != null
        ? <PercentMeter quiet label={<GlossaryText>{copy("reserve")}</GlossaryText>} value={effort.wPrimeDepletionPct} display={<MixedValue value={`${number(effort.wPrimeDepletionPct)}%`} />} tone="high" ends={[copy("reserveStart"), copy("reserveEnd")]} />
        : effort?.wPrimeRemainingPct != null && <PercentMeter quiet label={<GlossaryText>{copy("remaining")}</GlossaryText>} value={effort.wPrimeRemainingPct} display={<MixedValue value={`${number(effort.wPrimeRemainingPct)}%`} />} ends={[copy("remainingStart"), copy("remainingEnd")]} />}
    </div>}
    {/* 넓은 카드의 두 열은 자리가 고정이다 — 활동이 달라도 같은 그림이 같은 곳에 온다.
        왼쪽: 커브 → 회복과 연료 → 경로 / 오른쪽: 훈련 부하 → 나의 변화. 커브가 없으면 훈련 부하가 왼쪽 첫 자리.
        열 높이 차이는 열 아래 여백으로 둔다. 좁은 카드는 order 로 한 줄. */}
    <div className="activity-overview-col activity-overview-col--left">
      {power.length > 0
        ? <div className="activity-overview-area--curve">{curveBlock}</div>
        : <div className="activity-overview-area--shift">{shiftBlock}</div>}
      {recoveryBlock && <div className="activity-overview-area--recovery">{recoveryBlock}</div>}
      {routeBlock && <div className="activity-overview-area--route">{routeBlock}</div>}
    </div>
    <div className="activity-overview-col activity-overview-col--right">
      {power.length > 0 && <div className="activity-overview-area--shift">{shiftBlock}</div>}
      <div className="activity-overview-area--changes">{changesBlock}</div>
    </div>
    </div></div>
    {(modelNote || p.qualityNote || (p.session.discipline !== "bike" && p.recovery)) && <Stack gap="var(--dim-item-gap)" className="activity-overview-footnotes">
      {modelNote && note(modelNote)}
      {p.session.discipline !== "bike" && p.recovery && note(copy("runRecoveryNote"))}
      {p.qualityNote && note(copy("qualityFooter"))}
    </Stack>}
  </Stack></GlossaryProvider>;
}

export default function ActivityOverviewSummary({ overview, preview = false, isOwner = true, ftpW, children }: { overview: ReturnType<typeof useActivityOverview>; preview?: boolean; isOwner?: boolean; ftpW?: number | null; children?: ReactNode }) {
  const { t } = useTranslation("activity");
  if (!overview.enabled) return null;
  const reason = overview.response?.status === "unavailable" ? overview.response.reason : null;
  // 남의 활동에서는 보여줄 개요가 있을 때만 카드를 낸다 — 진단 문구·재시도는 소유자의 것이다.
  if (!isOwner && overview.response?.status !== "available") return null;
  return <Card data-testid="activity-overview-summary" className="activity-overview-card"><Stack gap="var(--dim-section-gap)">
    <Stack direction="row" wrap justify="space-between" align="baseline"><Text as="h2" variant="subtitle"><GlossaryText>{t("overviewSummary.title")}</GlossaryText></Text><Text variant="eyebrow" tone="accent">O-RIDER</Text></Stack>
    {preview && <Text as="p" variant="caption"><GlossaryText>{t("overviewEvidence.preview")}</GlossaryText></Text>}
    {overview.loading ? <Text as="p" variant="body" role="status"><GlossaryText>{t("overviewEvidence.loading")}</GlossaryText></Text> : overview.response?.status === "available" ? <>
      <ActivityOverviewSummaryContent presentation={overview.response.presentation} isOwner={isOwner} ftpW={ftpW} />
      {!!overview.response.partialReasons?.length && <Text as="p" variant="caption"><GlossaryText>{t("overviewEvidence.partial")}</GlossaryText> <GlossaryText>{overview.response.partialReasons.map((value) => t(`overviewEvidence.partialReasons.${value}`)).join(" · ")}</GlossaryText></Text>}
    </> : <Stack><Text as="p" variant="body"><GlossaryText>{t(overview.error ? "overviewEvidence.error" : reason ? `overviewEvidence.unavailable.${reason}` : "overviewEvidence.missing")}</GlossaryText></Text>{reason !== "rollout_disabled" && <Button size="sm" variant="outline" onClick={overview.retry}>{t("overviewEvidence.retry")}</Button>}</Stack>}
    {children}
  </Stack></Card>;
}
