import { powerComparisonBasis } from "./ActivityOverviewCharts";
import GlossaryProvider from "../../../components/common/GlossaryProvider";
import GlossaryText from "../../../components/common/GlossaryText";
import { useTranslation } from "react-i18next";
import type { ActivityOverviewPresentation } from "@shared/types/activity-overview";
import type { useActivityOverview } from "../../../hooks/useActivityOverview";
import { Button, Card, Chip, Stack, Text } from "../../../theme/components";

const number = (value: number | undefined, unit = "") => value != null && Number.isFinite(value) ? `${Math.round(value * 10) / 10}${unit}` : "—";
const delta = (value: number | undefined, unit: string) => value != null && Number.isFinite(value) ? `${value > 0 ? "+" : ""}${number(value, unit)}` : "—";
const seconds = (value: number | undefined) => number(value, " s");

export function ActivityOverviewEvidenceContent({ presentation: p, isOwner = true, supplemental = false }: { presentation: ActivityOverviewPresentation; isOwner?: boolean; supplemental?: boolean }) {
  const { t } = useTranslation("activity");
  const label = (key: string) => t(`overviewEvidence.${key}`);
  // 근거 문구도 소유자 1인칭이다 — 남의 활동에서는 소유자를 가리키는 표현으로 바꾼다.
  const voice = (key: string) => label(isOwner ? key : `${key}Other`);
  const accents: Record<string, string> = { stimulus: "var(--lime)", recoveryFuel: "var(--amber)", fitness: "var(--aqua)", sportDetails: "var(--lime)", route: "var(--aqua)" };
  const heading = (key: string) => <Text as={supplemental ? "h4" : "h3"} variant="bodySmall" weight={600} tone="secondary"><GlossaryText>{label(key)}</GlossaryText></Text>;
  const section = (key: string, rows: [string, string][]) => {
    const visibleRows = supplemental ? rows.filter(([, value]) => value.replace(/[— ·]/g, "").length > 0) : rows;
    if (!visibleRows.length) return null;
    return <section className="space-y-3" aria-label={label(key)}>
    {heading(key)}
    {supplemental ? <dl className="activity-evidence-facts">{visibleRows.map(([name, value]) => <div key={name} className="activity-evidence-fact">
      <Text as="dt" variant="bodySmall" tone="secondary"><GlossaryText>{name}</GlossaryText></Text>
      <Text as="dd" variant="bodyMedium" weight={600} mono={/^[\d—+−-]/.test(value)} style={{ color: accents[key] }}><GlossaryText>{value}</GlossaryText></Text>
    </div>)}</dl> : <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">{visibleRows.map(([name, value]) => <Card key={name} variant="inset" className={value.length > 24 ? "col-span-2 min-w-0" : "min-w-0"}>
      <Stack gap="var(--space-1-5)">
        <Text variant="eyebrow" tone="tertiary"><GlossaryText>{name}</GlossaryText></Text>
        <Text variant={value.length > 12 ? "bodyMedium" : "dataSmall"} mono={/^[\d—+−-]/.test(value)} style={{ color: value === "—" ? "var(--ink-3)" : accents[key] }} className="break-words"><GlossaryText>{value}</GlossaryText></Text>
      </Stack>
    </Card>)}</div>}
  </section>;
  };
  const powerVisible = p.session.discipline === "bike";
  const powerEstimated = p.session.discipline === "bike" && p.availability?.power === "estimated";
  const recordsVisible = p.availability?.records === "evaluated";
  const runRecordsVisible = recordsVisible && p.session.discipline === "run";
  const recordEvidenceVisible = powerVisible && !!p.powerFingerprint?.length || runRecordsVisible && !!p.runRecordAchievements?.length;
  const effort = powerVisible ? p.thresholdWork : undefined;
  const zones = (p.zones ?? []).filter((zone) => zone.kind !== "power" || powerVisible);
  const highZone = zones.find((zone) => zone.kind === "power") ?? zones.find((zone) => zone.kind === "heartRate");
  const zoneTotal = highZone?.seconds.reduce((sum, value) => sum + value, 0) ?? 0;
  const highPercent = highZone && zoneTotal > 0 ? highZone.seconds.slice(3).reduce((sum, value) => sum + value, 0) / zoneTotal * 100 : undefined;
  const summaryAxes = ["sessionLoad", "highIntensityExposure", p.session.discipline === "bike" ? "cadenceVariability" : "paceVariability"];
  const evidencePersonal = (p.personal ?? []).filter(row => !supplemental || !summaryAxes.includes(row.axis));
  const evidenceZones = zones.filter(zone => !supplemental || zone !== highZone || !!zone.deltaPercentagePoints?.length || (!!zone.baselinePercentages?.length && (zone.priorSampleCount ?? 0) <= 0));
  const metadata = p.comparisonMetadata;
  const summaryRouteVisible = p.routeLoad && (p.routeLoad.climbCount != null || p.routeLoad.maxGradePct != null);
  const comparisonBasis = powerComparisonBasis(p.powerFingerprint ?? [], recordsVisible, metadata?.historyCompleteness === "complete" && !!p.powerFingerprint?.some(row => row.deltaPct != null && Number.isFinite(row.deltaPct) && (row.medianWatts ?? 0) > 0 && (row.priorSampleCount ?? 0) >= 3));
  const extraPowerComparison = !!p.powerFingerprint?.some(row => row.competitionRank != null || row.priorSampleCount != null || recordsVisible && (comparisonBasis !== "allTimeBest" && (row.allTimeBestWatts != null || row.allTimeBestPct != null) || comparisonBasis !== "previousBest" && row.previousBestPct != null) || comparisonBasis !== "median" && (row.medianWatts != null || row.deltaPct != null));
  const loadIndex = (p.personal ?? []).find((row) => row.axis === "sessionLoad");
  // 역대 최고 대비 % 는 서버가 계산해 보낸다(클램프·글리치 구간은 비움). 화면은 나누지 않는다.
  const bestPct = (row: NonNullable<ActivityOverviewPresentation["powerFingerprint"]>[number]) =>
    recordsVisible ? row.allTimeBestPct : undefined;
  const record = (achievement: "first" | "new" | "tie" | undefined) => achievement ? label(`records.${achievement}`) : "—";
  const table = (allHeaders: string[], allRows: string[][], omitted: string[] = []) => {
    const columns = allHeaders.map((_, index) => index).filter(index => !supplemental || index === 0 || !omitted.includes(allHeaders[index]!) && allRows.some(row => row[index] !== "—"));
    if (supplemental && columns.length < 2) return null;
    const headers = columns.map(index => allHeaders[index]);
    const rows = allRows.map(row => columns.map(index => row[index]!));
    if (supplemental && headers.length === 2) return <div className="activity-evidence-comparison" role="group" aria-label={headers.join(" · ")}>
      <Text as="p" variant="caption" tone="tertiary">{headers.join(" · ")}</Text>
      <dl className="activity-evidence-comparison__rows">{rows.map(([name, value], index) => <div key={index}>
        <Text as="dt" variant="bodySmall" tone="secondary"><GlossaryText>{name}</GlossaryText></Text>
        <Text as="dd" variant="bodySmall" mono={headers[1] !== "PR"}>{headers[1] === "PR" && value !== "—" ? <Chip variant="accent">{value}</Chip> : <GlossaryText>{value}</GlossaryText>}</Text>
      </div>)}</dl>
    </div>;
    return <Card variant="inset" padding="none" className="overflow-hidden"><div className="overflow-x-auto" role="region" aria-label={headers.join(" · ")} tabIndex={0}>
    <table className="w-full" style={{ borderCollapse: "collapse" }}>
      <thead><tr>{headers.map((header, column) => <th scope="col" key={header} className={column === 0 ? "text-left p-3 whitespace-nowrap" : "text-right p-3 whitespace-nowrap"} style={{ background: "var(--bg-3)", borderBottom: "1px solid var(--line-soft)" }}><Text variant="eyebrow" tone="tertiary"><GlossaryText>{header}</GlossaryText></Text></th>)}</tr></thead>
      <tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column} className={column === 0 ? "p-3 whitespace-nowrap" : "p-3 text-right whitespace-nowrap"} style={{ borderBottom: index < rows.length - 1 ? "1px solid var(--line-soft)" : undefined }}>
        {headers[column] === "PR" && cell !== "—" ? <Chip variant="accent">{cell}</Chip> : <Text variant="bodySmall" mono={column > 0} tone={cell === "—" ? "tertiary" : column === 0 ? "secondary" : "primary"}><GlossaryText>{cell}</GlossaryText></Text>}
      </td>)}</tr>)}</tbody>
    </table>
  </div></Card>;
  };
  return <GlossaryProvider scopeKey="activity-overview-evidence"><div className="space-y-6">
    {!supplemental && !!p.observedEffects?.length && <Text as="p" variant="caption"><GlossaryText>{p.observedEffects.join(" · ")}</GlossaryText></Text>}
    {(!supplemental || p.peakMoment || p.session.classificationReason) && <Card variant="inset"><Stack>{!supplemental && p.coachSentence && <Text as="p" variant="bodyMedium" tone="primary"><GlossaryText>{p.coachSentence}</GlossaryText></Text>}
    {/* 하이라이트 근거 — 서버가 표시 언어로 써서 보낸 한 줄. 라벨이 왜 그렇게 불렸는지. */}
    {!supplemental && p.highlight && <Text as="p" variant="caption" tone="secondary"><GlossaryText>{label("highlight")}</GlossaryText> · <GlossaryText>{p.highlight.reason}</GlossaryText></Text>}
    {/* 최고 순간 — 서버 정본(peakEfforts.highlight + 세그먼트 이름). 화면은 단위와 순서만 붙인다. */}
    {p.peakMoment && <Text as="p" variant="caption" tone="secondary"><GlossaryText>{label("peakMoment")}</GlossaryText> · <GlossaryText>{[
      p.peakMoment.segmentName ? p.peakMoment.segmentName + (p.peakMoment.segmentPr ? ` (${label("segmentPr")})` : "")
        : p.peakMoment.fromKm != null && p.peakMoment.toKm != null ? t("overviewEvidence.peakMomentAt", { from: number(p.peakMoment.fromKm), to: number(p.peakMoment.toKm) }) : null,
      `${Math.round(p.peakMoment.durationSec / 60)}${label("minuteShort")} ${number(p.peakMoment.avgPowerW, " W")}`,
      p.peakMoment.avgSpeedKmh != null ? number(p.peakMoment.avgSpeedKmh, " km/h") : null,
      p.peakMoment.maxHr != null ? `${label("maxHrShort")} ${number(p.peakMoment.maxHr)}` : null,
    ].filter(Boolean).join(" · ")}</GlossaryText></Text>}
    {p.session.classificationReason && <Text as="p" variant="caption" tone="tertiary"><GlossaryText>{p.session.classificationReason}</GlossaryText></Text>}</Stack></Card>}
    {!supplemental && powerEstimated && <Text as="p" variant="caption"><GlossaryText>{label("powerEstimated")}</GlossaryText></Text>}
    {!supplemental && powerVisible && p.session.ftpVerificationRequired && <Text as="p" variant="caption"><GlossaryText>{label("ftpVerificationRequired")}</GlossaryText></Text>}
    {!supplemental && section("stimulus", [
      [label("sport"), label(`sports.${p.session.discipline}`)],
      [label("character"), p.session.character ? label(`characters.${p.session.character}`) + (p.aboveUsualVolume ? ` · ${label("aboveUsualVolume")}` : "") : "—"],
      [`${t("detail.acceptedLoadLabel")} · ${p.session.loadKind === "tss" ? t("detail.acceptedLoadTssBasis") : p.session.loadSource === "time" ? t("detail.acceptedLoadTimeBasis") : p.session.loadSource === "trimp" ? t("detail.acceptedLoadHrBasis") : label("load")}`, number(p.session.load)],
      ...(powerVisible ? [["IF", p.session.intensityFactor != null ? p.session.intensityFactor.toFixed(2) : "—"], ["NP", number(p.session.normalizedPowerW, " W")]] as [string, string][] : []),
      [label("highZone"), `${number(highPercent, "%")} · ${highZone ? label(highZone.kind) : "—"}`],
      ...(powerVisible ? [
        [label("matches"), number(effort?.matchesCount)], [label("matchesTotal"), seconds(effort?.matchesTotalSec)],
        [label("longestZ4"), seconds(effort?.longestZ4PlusSec)], [label("anaerobic"), seconds(effort?.anaerobicSec)],
        [label("anaerobicWork"), number(effort?.aboveFtpKj, " kJ")],
        [label("depletion"), number(effort?.wPrimeDepletionPct, "%")], [label("remaining"), number(effort?.wPrimeRemainingPct, "%")],
      ] as [string, string][] : []),
    ])}
    {supplemental && section("stimulus", [[label("anaerobicWork"), number(effort?.aboveFtpKj, " kJ")], ...(effort?.matchesCount == null ? [[label("matchesTotal"), seconds(effort?.matchesTotalSec)]] as [string, string][] : [])])}
    {(!supplemental || evidencePersonal.length > 0) && <section className="space-y-3">{<Text as={supplemental ? "h4" : "h3"} variant="bodySmall" weight={600} tone="secondary"><GlossaryText>{voice("personal")}</GlossaryText></Text>}
      <Text as="p" variant="caption" tone="secondary"><GlossaryText>{voice("relative")}</GlossaryText></Text>
      {metadata && <Text as="p" variant="caption"><GlossaryText>{t("overviewEvidence.scope", { days: metadata.windowDays, count: metadata.priorSampleCount, character: label(`characters.${metadata.character}`) })}</GlossaryText> · <GlossaryText>{label(`completeness.${metadata.historyCompleteness}`)}</GlossaryText></Text>}
      {/* 오늘의 점수 — 정의된 값(같은 성격 90일 상대지수)만 점수라 부른다. */}
      {!supplemental && loadIndex && <Text as="p" variant="bodyMedium" tone="primary"><GlossaryText>{t("overviewEvidence.loadIndex", { index: Math.round(loadIndex.personalIndex), top: Math.max(1, 100 - Math.round(loadIndex.personalIndex)) })}</GlossaryText></Text>}
      {evidencePersonal.length ? table([label("axis"), label("index"), label("band"), label("samples")], evidencePersonal.map((row) => [label(`axes.${row.axis}`), number(row.personalIndex), label(`bands.${row.band}`), number(row.sampleCount)])) : <Text as="p" variant="caption"><GlossaryText>{label(`personalStates.${p.availability?.personal ?? "unavailable"}`)}</GlossaryText></Text>}
    </section>}
    {(!supplemental || powerVisible && extraPowerComparison) && <section className="space-y-3">{heading(p.session.discipline === "run" ? "runRecords" : "powerComparison")}<Text as="p" variant="caption" tone="tertiary"><GlossaryText>{label("prScope")}</GlossaryText></Text>
      {p.session.discipline === "bike" ? (powerVisible && p.powerFingerprint?.length ? table([label("duration"), "W", label("allTimeBest"), label("bestPct"), label("previousBestPct"), label("median"), label("change"), label("rank"), label("samples"), "PR"], p.powerFingerprint.map((row) => [row.duration, number(row.watts),
        recordsVisible ? number(row.allTimeBestWatts, " W") : "—", number(bestPct(row), "%"), recordsVisible ? number(row.previousBestPct, "%") : "—",
        number(row.medianWatts, " W"), delta(row.deltaPct, "%"), number(row.competitionRank), number(row.priorSampleCount), recordsVisible ? record(row.recordAchievement) : "—"]), supplemental ? ["W", "PR", ...(comparisonBasis === "allTimeBest" ? [label("allTimeBest"), label("bestPct")] : comparisonBasis === "previousBest" ? [label("previousBestPct")] : comparisonBasis === "median" ? [label("median"), label("change")] : [])] : []) : <Text as="p" variant="caption"><GlossaryText>{label("missing")}</GlossaryText></Text>) : null}
      {powerVisible && p.powerFingerprint?.some((row) => bestPct(row) != null) && <Text as="p" variant="caption" tone="tertiary"><GlossaryText>{label("bestScope")}</GlossaryText></Text>}
      {powerVisible && recordsVisible && p.powerFingerprint?.some((row) => row.previousBestPct != null) && <Text as="p" variant="caption" tone="tertiary"><GlossaryText>{label("previousBestScope")}</GlossaryText></Text>}
      {runRecordsVisible && p.runRecordAchievements?.length ? table([label("distance"), label("duration"), "PR"], p.runRecordAchievements.map((row) => [row.distance, seconds(row.valueSec), record(row.recordAchievement)])) : null}
      <Text as="p" variant="caption" tone="tertiary"><GlossaryText>{label(`recordStates.${recordsVisible ? recordEvidenceVisible ? "evaluatedWithEvidence" : "evaluatedEmpty" : p.availability?.records ?? "unavailable"}`)}</GlossaryText></Text>
    </section>}
    {(!supplemental || evidenceZones.length > 0) && <section className="space-y-3">{heading("zones")}
      {zones.length ? evidenceZones.map((zone) => <div key={zone.kind} className="space-y-3"><Stack direction="row" align="center" wrap><Chip variant={zone.kind === "power" ? "accent" : "default"}>{label(zone.kind)}</Chip><Text variant="caption" tone="tertiary"><GlossaryText>{label("samples")}</GlossaryText> <GlossaryText>{number(zone.priorSampleCount)}</GlossaryText></Text>
        {/* 기준이 넓어진 것은 반드시 밝힌다 — 같은 성격 표본이 부족해 종목 전체로 비교했다는 뜻이다. */}
        {zone.provisional && <Chip>{label("zoneProvisional")}</Chip>}
        {zone.historyCompleteness && <Chip>{label(`completeness.${zone.historyCompleteness}`)}</Chip>}
        {zone.baselinePercentages && <Chip variant={zone.baselineScope === "discipline" ? "default" : "accent"}>{label(`baselineScope.${zone.baselineScope ?? "sameCharacter"}`)}</Chip>}</Stack>{table([label("zone"), label("duration"), "%", label("baseline"), label("change")], zone.seconds.map((value, index) => [`Z${index + 1}`, seconds(value), number(zone.currentPercentages?.[index], "%"), number(zone.baselinePercentages?.[index], "%"), delta(zone.deltaPercentagePoints?.[index], "%p")]), supplemental && zone === highZone ? [label("duration"), ...(zone.currentPercentages?.length === zone.seconds.length ? ["%"] : []), ...((zone.priorSampleCount ?? 0) > 0 ? [label("baseline")] : [])] : [])}</div>) : <Text as="p" variant="caption"><GlossaryText>{label("missing")}</GlossaryText></Text>}
    </section>}
    {!supplemental && p.recoveryGuidance && <Text as="p" variant="caption" tone="tertiary">{label("recoveryGuidance")}</Text>}
    {section("recoveryFuel", [
      ...(!supplemental || !powerVisible || p.recoveryGuidance ? [[label("recovery"), number(p.recovery?.hours, " h")]] as [string, string][] : []), [label("recoveryLoad"), number(p.recovery?.load)], [label("historicalCtl"), number(p.recovery?.ctl)],
      [label("energy"), number(p.energy?.totalKcal, " kcal")], ...(!supplemental || !powerVisible || p.energy?.fatPct == null || p.energy?.carbPct == null ? [[label("fat"), `${number(p.energy?.fatPct, "%")} · ${number(p.energy?.fatKcal, " kcal")}`], [label("carb"), `${number(p.energy?.carbPct, "%")} · ${number(p.energy?.carbKcal, " kcal")}`]] as [string, string][] : []),
      // 지방 1g ≈ 9kcal. "감량" 이 아니라 "소모" — 태운 지방이 곧 빠진 체중은 아니다.
      [label("fatGrams"), number(p.energy?.fatGrams, " g")],
    ])}
    {!supplemental && section("fitness", [
      [label("cutoff"), p.priorFitnessStatus ? p.priorFitnessStatus.asOf : "—"],
      [label("sport"), p.fitnessScope === "integrated" ? label("integratedFitness") : label(`sports.${p.session.discipline}`)], ["CTL", number(p.priorFitnessStatus?.ctl)], ["ATL", number(p.priorFitnessStatus?.atl)], ["TSB", number(p.priorFitnessStatus?.tsb)],
      [label("form"), p.priorFitnessStatus ? (p.fitnessEvidence && p.fitnessEvidence !== "sufficient" ? label("fitnessLimited") : label(`forms.${p.priorFitnessStatus.formBand}`)) : "—"],
      // 활동 반영 후 — 활동일 일별 정산 지점. 시작 전과 나란히 두면 이 활동이 몸에 준 변화가 보인다.
      ...(p.postFitnessStatus ? [
        [label("afterCutoff"), p.postFitnessStatus.asOf],
        [`${label("after")} CTL`, number(p.postFitnessStatus.ctl)], [`${label("after")} ATL`, number(p.postFitnessStatus.atl)], [`${label("after")} TSB`, number(p.postFitnessStatus.tsb)],
        [`${label("after")} ${label("form")}`, (p.fitnessEvidence && p.fitnessEvidence !== "sufficient" ? label("fitnessLimited") : label(`forms.${p.postFitnessStatus.formBand}`))],
      ] as [string, string][] : []),
    ])}
    {!!p.sportDetails?.length && section("sportDetails", p.sportDetails.map((row) => [row.label, row.value]))}
    {p.routeLoad && section("route", [[label("terrainLabel"), p.routeLoad.terrain ? label(`terrain.${p.routeLoad.terrain}`) : "—"], ...(!supplemental || !summaryRouteVisible ? [[label("climbs"), number(p.routeLoad.climbCount)], [label("category"), p.routeLoad.highestCategory ?? "—"], [label("avgGrade"), number(p.routeLoad.avgGradePct, "%")], [label("maxGrade"), number(p.routeLoad.maxGradePct, "%")]] as [string, string][] : []), [label("elevationQuality"), label(p.routeLoad.elevationSuspect ? "suspect" : "noWarning")]])}
    <Stack gap="var(--space-2)"><Text as="p" variant="caption" tone="tertiary"><GlossaryText>{label(p.session.discipline === "run" ? "runModelNote" : "modelNote")}</GlossaryText></Text>
    {p.qualityNote && <Text as="p" variant="caption" tone="tertiary"><GlossaryText>{label("qualityNote")}</GlossaryText></Text>}</Stack>
  </div></GlossaryProvider>;
}

export default function ActivityOverviewEvidence({ overview, preview = false, isOwner = true, supplemental = false }: { overview: ReturnType<typeof useActivityOverview>; preview?: boolean; isOwner?: boolean; supplemental?: boolean }) {
  const { t } = useTranslation("activity");
  if (!overview.enabled) return null;
  const reason = overview.response?.status === "unavailable" ? overview.response.reason : null;
  if (!isOwner && overview.response?.status !== "available") return null;
  return <div className="space-y-4 min-w-0" data-testid="activity-overview-evidence" data-supplemental={supplemental || undefined}>
    <Text as={supplemental ? "h3" : "h2"} variant={supplemental ? "bodyMedium" : "subtitle"} weight={600}><GlossaryText>{t(supplemental ? "overviewEvidence.comparisonEvidence" : "overviewEvidence.title")}</GlossaryText></Text>
    <Text as="p" variant="caption" tone="secondary"><GlossaryText>{t(supplemental ? "overviewEvidence.supplementalSource" : "overviewEvidence.source")}</GlossaryText></Text>
    {preview && <Text as="p" variant="caption"><GlossaryText>{t("overviewEvidence.preview")}</GlossaryText></Text>}
    {overview.loading ? <Text as="p" variant="body" role="status"><GlossaryText>{t("overviewEvidence.loading")}</GlossaryText></Text> : overview.response?.status === "available" ? <>
      <ActivityOverviewEvidenceContent presentation={overview.response.presentation} isOwner={isOwner} supplemental={supplemental} />
      {!!overview.response.partialReasons?.length && <Text as="p" variant="caption"><GlossaryText>{t("overviewEvidence.partial")}</GlossaryText> <GlossaryText>{overview.response.partialReasons.map((reason) => t(`overviewEvidence.partialReasons.${reason}`)).join(" · ")}</GlossaryText></Text>}
    </> : <div className="space-y-2"><Text as="p" variant="body"><GlossaryText>{t(overview.error ? "overviewEvidence.error" : reason ? `overviewEvidence.unavailable.${reason}` : "overviewEvidence.missing")}</GlossaryText></Text>{reason !== "rollout_disabled" && <Button size="sm" variant="outline" onClick={overview.retry}>{t("overviewEvidence.retry")}</Button>}</div>}
  </div>;
}
