import { useTranslation } from "react-i18next";
import type { ActivityOverviewPresentation } from "@shared/types/activity-overview";
import type { useActivityOverview } from "../../../hooks/useActivityOverview";
import { Button, Card, Chip, Stack, Text } from "../../../theme/components";

const number = (value: number | undefined, unit = "") => value != null && Number.isFinite(value) ? `${Math.round(value * 10) / 10}${unit}` : "—";
const delta = (value: number | undefined, unit: string) => value != null && Number.isFinite(value) ? `${value > 0 ? "+" : ""}${number(value, unit)}` : "—";
const seconds = (value: number | undefined) => number(value, " s");

export function ActivityOverviewEvidenceContent({ presentation: p, isOwner = true }: { presentation: ActivityOverviewPresentation; isOwner?: boolean }) {
  const { t } = useTranslation("activity");
  const label = (key: string) => t(`overviewEvidence.${key}`);
  // 근거 문구도 소유자 1인칭이다 — 남의 활동에서는 소유자를 가리키는 표현으로 바꾼다.
  const voice = (key: string) => label(isOwner ? key : `${key}Other`);
  const accents: Record<string, string> = { stimulus: "var(--lime)", recoveryFuel: "var(--amber)", fitness: "var(--aqua)", sportDetails: "var(--lime)", route: "var(--aqua)" };
  const heading = (key: string) => <Text as="h3" variant="bodySmall" weight={600} tone="secondary">{label(key)}</Text>;
  const section = (key: string, rows: [string, string][]) => <section className="space-y-3" aria-label={label(key)}>
    {heading(key)}
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">{rows.map(([name, value]) => <Card key={name} variant="inset" className={value.length > 24 ? "col-span-2 min-w-0" : "min-w-0"}>
      <Stack gap="var(--space-1-5)">
        <Text variant="eyebrow" tone="tertiary">{name}</Text>
        <Text variant={value.length > 12 ? "bodyMedium" : "dataSmall"} mono={/^[\d—+−-]/.test(value)} style={{ color: value === "—" ? "var(--ink-3)" : accents[key] }} className="break-words">{value}</Text>
      </Stack>
    </Card>)}</div>
  </section>;
  const powerVisible = p.availability?.power !== "private";
  const hrVisible = p.availability?.heartRate !== "private";
  const recordsVisible = p.availability?.records === "evaluated";
  const effort = powerVisible ? p.thresholdWork : undefined;
  const zones = (p.zones ?? []).filter((zone) => zone.kind === "power" ? powerVisible : hrVisible);
  const highZone = zones.find((zone) => zone.kind === "power") ?? zones.find((zone) => zone.kind === "heartRate");
  const zoneTotal = highZone?.seconds.reduce((sum, value) => sum + value, 0) ?? 0;
  const highPercent = highZone && zoneTotal > 0 ? highZone.seconds.slice(3).reduce((sum, value) => sum + value, 0) / zoneTotal * 100 : undefined;
  const metadata = p.comparisonMetadata;
  const loadIndex = (p.personal ?? []).find((row) => row.axis === "sessionLoad");
  // 역대 최고 대비 % 는 서버가 계산해 보낸다(클램프·글리치 구간은 비움). 화면은 나누지 않는다.
  const bestPct = (row: NonNullable<ActivityOverviewPresentation["powerFingerprint"]>[number]) =>
    recordsVisible ? row.allTimeBestPct : undefined;
  const record = (achievement: "first" | "new" | "tie" | undefined) => achievement ? label(`records.${achievement}`) : "—";
  const table = (headers: string[], rows: string[][]) => <Card variant="inset" padding="none" className="overflow-hidden"><div className="overflow-x-auto" role="region" aria-label={headers.join(" · ")} tabIndex={0}>
    <table className="w-full" style={{ borderCollapse: "collapse" }}>
      <thead><tr>{headers.map((header, column) => <th scope="col" key={header} className={column === 0 ? "text-left p-3 whitespace-nowrap" : "text-right p-3 whitespace-nowrap"} style={{ background: "var(--bg-3)", borderBottom: "1px solid var(--line-soft)" }}><Text variant="eyebrow" tone="tertiary">{header}</Text></th>)}</tr></thead>
      <tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column} className={column === 0 ? "p-3 whitespace-nowrap" : "p-3 text-right whitespace-nowrap"} style={{ borderBottom: index < rows.length - 1 ? "1px solid var(--line-soft)" : undefined }}>
        {headers[column] === "PR" && cell !== "—" ? <Chip variant="accent">{cell}</Chip> : <Text variant="bodySmall" mono={column > 0} tone={cell === "—" ? "tertiary" : column === 0 ? "secondary" : "primary"}>{cell}</Text>}
      </td>)}</tr>)}</tbody>
    </table>
  </div></Card>;
  return <div className="space-y-6">
    <Card variant="inset"><Stack><Text as="p" variant="bodyMedium" tone="primary">{p.coachSentence}</Text>
    {/* 하이라이트 근거 — 서버가 표시 언어로 써서 보낸 한 줄. 라벨이 왜 그렇게 불렸는지. */}
    {p.highlight && <Text as="p" variant="caption" tone="secondary">{label("highlight")} · {p.highlight.reason}</Text>}
    {p.session.classificationReason && <Text as="p" variant="caption" tone="tertiary">{p.session.classificationReason}</Text>}</Stack></Card>
    {section("stimulus", [
      [label("sport"), label(`sports.${p.session.discipline}`)],
      [label("character"), p.session.character ? label(`characters.${p.session.character}`) + (p.aboveUsualVolume ? ` · ${label("aboveUsualVolume")}` : "") : "—"],
      [`${label("load")} · ${p.session.loadKind === "tss" ? "TSS" : label("load")}`, number(p.session.load)],
      ...(powerVisible ? [["IF", p.session.intensityFactor != null ? p.session.intensityFactor.toFixed(2) : "—"], ["NP", number(p.session.normalizedPowerW, " W")]] as [string, string][] : []),
      [label("highZone"), `${number(highPercent, "%")} · ${highZone ? label(highZone.kind) : "—"}`],
      ...(powerVisible ? [
        [label("matches"), number(effort?.matchesCount)], [label("matchesTotal"), seconds(effort?.matchesTotalSec)],
        [label("longestZ4"), seconds(effort?.longestZ4PlusSec)], [label("anaerobic"), seconds(effort?.anaerobicSec)],
        [label("anaerobicWork"), number(effort?.aboveFtpKj, " kJ")],
        [label("depletion"), number(effort?.wPrimeDepletionPct, "%")], [label("remaining"), number(effort?.wPrimeRemainingPct, "%")],
      ] as [string, string][] : []),
    ])}
    <section className="space-y-3">{<Text as="h3" variant="bodySmall" weight={600} tone="secondary">{voice("personal")}</Text>}
      <Text as="p" variant="caption" tone="secondary">{voice("relative")}</Text>
      {metadata && <Text as="p" variant="caption">{t("overviewEvidence.scope", { days: metadata.windowDays, count: metadata.priorSampleCount, character: label(`characters.${metadata.character}`) })} · {label(`completeness.${metadata.historyCompleteness}`)}</Text>}
      {/* 오늘의 점수 — 정의된 값(같은 성격 90일 상대지수)만 점수라 부른다. */}
      {loadIndex && <Text as="p" variant="bodyMedium" tone="primary">{t("overviewEvidence.loadIndex", { index: Math.round(loadIndex.personalIndex), top: Math.max(1, 100 - Math.round(loadIndex.personalIndex)) })}</Text>}
      {p.personal?.length ? table([label("axis"), label("index"), label("band"), label("samples")], p.personal.map((row) => [label(`axes.${row.axis}`), number(row.personalIndex), label(`bands.${row.band}`), number(row.sampleCount)])) : <Text as="p" variant="caption">{label(`personalStates.${p.availability?.personal ?? "unavailable"}`)}</Text>}
    </section>
    <section className="space-y-3">{heading("powerComparison")}<Text as="p" variant="caption" tone="tertiary">{label("prScope")}</Text>
      {powerVisible && p.powerFingerprint?.length ? table([label("duration"), "W", label("allTimeBest"), label("bestPct"), label("median"), label("change"), label("rank"), label("samples"), "PR"], p.powerFingerprint.map((row) => [row.duration, number(row.watts),
        recordsVisible ? number(row.allTimeBestWatts, " W") : "—", number(bestPct(row), "%"),
        number(row.medianWatts, " W"), delta(row.deltaPct, "%"), number(row.competitionRank), number(row.priorSampleCount), recordsVisible ? record(row.recordAchievement) : "—"])) : <Text as="p" variant="caption">{label(powerVisible ? "missing" : "private")}</Text>}
      {powerVisible && p.powerFingerprint?.some((row) => bestPct(row) != null) && <Text as="p" variant="caption" tone="tertiary">{label("bestScope")}</Text>}
      {recordsVisible && p.runRecordAchievements?.length ? table([label("distance"), label("duration"), "PR"], p.runRecordAchievements.map((row) => [row.distance, seconds(row.valueSec), record(row.recordAchievement)])) : null}
      <Text as="p" variant="caption" tone="tertiary">{label(`recordStates.${p.availability?.records ?? "unavailable"}`)}</Text>
    </section>
    <section className="space-y-3">{heading("zones")}
      {zones.length ? zones.map((zone) => <div key={zone.kind} className="space-y-3"><Stack direction="row" align="center" wrap><Chip variant={zone.kind === "power" ? "accent" : "default"}>{label(zone.kind)}</Chip><Text variant="caption" tone="tertiary">{label("samples")} {number(zone.priorSampleCount)}</Text>
        {/* 기준이 넓어진 것은 반드시 밝힌다 — 같은 성격 표본이 부족해 종목 전체로 비교했다는 뜻이다. */}
        {zone.baselinePercentages && <Chip variant={zone.baselineScope === "discipline" ? "default" : "accent"}>{label(`baselineScope.${zone.baselineScope ?? "sameCharacter"}`)}</Chip>}</Stack>{table([label("zone"), label("duration"), "%", label("baseline"), label("change")], zone.seconds.map((value, index) => [`Z${index + 1}`, seconds(value), number(zone.currentPercentages?.[index], "%"), number(zone.baselinePercentages?.[index], "%"), delta(zone.deltaPercentagePoints?.[index], "%p")]))}</div>) : <Text as="p" variant="caption">{label("missing")}</Text>}
    </section>
    {section("recoveryFuel", [
      [label("recovery"), number(p.recovery?.hours, " h")], [label("recoveryLoad"), number(p.recovery?.load)], [label("historicalCtl"), number(p.recovery?.ctl)],
      [label("energy"), number(p.energy?.totalKcal, " kcal")], [label("fat"), `${number(p.energy?.fatPct, "%")} · ${number(p.energy?.fatKcal, " kcal")}`], [label("carb"), `${number(p.energy?.carbPct, "%")} · ${number(p.energy?.carbKcal, " kcal")}`],
      // 지방 1g ≈ 9kcal. "감량" 이 아니라 "소모" — 태운 지방이 곧 빠진 체중은 아니다.
      [label("fatGrams"), number(p.energy?.fatGrams, " g")],
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

export default function ActivityOverviewEvidence({ overview, preview = false, isOwner = true }: { overview: ReturnType<typeof useActivityOverview>; preview?: boolean; isOwner?: boolean }) {
  const { t } = useTranslation("activity");
  if (!overview.enabled) return null;
  const reason = overview.response?.status === "unavailable" ? overview.response.reason : null;
  if (!isOwner && overview.response?.status !== "available") return null;
  return <div className="space-y-4 min-w-0" data-testid="activity-overview-evidence">
    <Text as="h2" variant="subtitle">{t("overviewEvidence.title")}</Text>
    <Text as="p" variant="caption" tone="secondary">{t("overviewEvidence.source")}</Text>
    {preview && <Text as="p" variant="caption">{t("overviewEvidence.preview")}</Text>}
    {overview.loading ? <Text as="p" variant="body" role="status">{t("overviewEvidence.loading")}</Text> : overview.response?.status === "available" ? <>
      <ActivityOverviewEvidenceContent presentation={overview.response.presentation} isOwner={isOwner} />
      {!!overview.response.partialReasons?.length && <Text as="p" variant="caption">{t("overviewEvidence.partial")} {overview.response.partialReasons.map((reason) => t(`overviewEvidence.partialReasons.${reason}`)).join(" · ")}</Text>}
    </> : <div className="space-y-2"><Text as="p" variant="body">{t(overview.error ? "overviewEvidence.error" : reason ? `overviewEvidence.unavailable.${reason}` : "overviewEvidence.missing")}</Text>{reason !== "rollout_disabled" && <Button size="sm" variant="outline" onClick={overview.retry}>{t("overviewEvidence.retry")}</Button>}</div>}
  </div>;
}
