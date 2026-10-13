import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { StagePowerHistoryOrigin, StagePowerHistoryRange } from "@shared/types/stage-power-duration-history";
import { useStagePowerDurationHistory } from "../../../hooks/useStagePowerDurationHistory";
import { stagePowerHistoryCandidateReady } from "../../../services/stagePowerDurationHistory";
import { Button, Input, Text } from "../../../theme";
import { LocalizedLink } from "../../../components/LocalizedLink";
import { formatElapsedBoundary } from "./activityRangeSelection";
import { reducePowerHistory } from "./stagePowerHistoryReducer";
import { exactPowerEnergyDifference, exactPowerRatioDifference } from "./stagePowerHistoryExact";
export default function StagePowerDurationHistoryPanel({ ownerUid, periods }: { ownerUid: string; periods: readonly StagePowerHistoryRange[] }) {
  const { t, i18n } = useTranslation("activity"), id = useId();
  const [draft, setDraft] = useState("17"), [unit, setUnit] = useState<"W" | "W/kg">("W");
  const tool = useStagePowerDurationHistory(ownerUid, periods, draft, unit);
  if (!tool.available) return null;
  const reduced = reducePowerHistory(tool.computed);
  const day = (ms: number) => new Intl.DateTimeFormat(i18n.language, { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
  const date = (ms: number) => new Intl.DateTimeFormat(i18n.language, { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(ms);
  const boundary = (ms: number) => `${new Intl.DateTimeFormat(i18n.language, { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(ms)}${ms % 1000 ? `.${String(ms % 1000).padStart(3, "0")}` : ""}`;
  const periodLabel = (range: StagePowerHistoryRange) => day(range.fromInclusive) === day(range.toExclusive - 1) ? day(range.fromInclusive) : `${day(range.fromInclusive)}–${day(range.toExclusive - 1)}`;
  const value = (n: number) => new Intl.NumberFormat(i18n.language, n !== 0 && Math.abs(n) < 0.01 ? { notation: "scientific", maximumSignificantDigits: 3 } : { maximumFractionDigits: 2 }).format(n);
  const originLabel = (origin: StagePowerHistoryOrigin) => t(origin === "measured" ? "powerHistory.measured" : "powerHistory.stored");
  return <details className="activity-growth-evidence text-[length:var(--fs-md)]">
    <summary className="cursor-pointer py-3 font-semibold">{t("powerHistory.title")}</summary>
    <div className="space-y-3 pt-3">
      <Text as="p" variant="bodyMedium" tone="secondary">{t("powerHistory.scope")}</Text>
      <Text as="p" variant="bodyMedium" tone="secondary">{t("powerHistory.wholeBestNote")}</Text>
      <label htmlFor={id}><Text as="span" variant="bodyMedium">{t("powerHistory.duration")}</Text></label>
      <Input id={id} className="min-h-[calc(var(--dim-button-height)+var(--space-1))] text-[length:var(--fs-md)]" inputMode="text" value={draft} placeholder="137 / 2:17" onChange={event => setDraft(event.target.value)} aria-invalid={tool.durationSeconds === null} />
      <div className="flex flex-wrap gap-2">{(["W", "W/kg"] as const).map(v => <Button key={v} size="sm" variant={unit === v ? "secondary" : "ghost"} className="min-h-[calc(var(--dim-button-height)+var(--space-1))]" aria-pressed={unit === v} onClick={() => setUnit(v)}>{v}</Button>)}</div>
      {tool.busy && <Text as="p" variant="bodyMedium" role="status">{t("powerHistory.loading")}</Text>}
      {tool.failure && <Text as="p" variant="bodyMedium" role="alert">{t(tool.failure === "source_changed" ? "powerHistory.changed" : "powerHistory.error")}</Text>}
      {periods.map((range, periodIndex) => {
        const period = tool.periods[periodIndex]!, computed = new Map(tool.computed.filter(v => v.periodIndex === periodIndex).flatMap(v => v.candidates).map(v => [v.activityId, v]));
        return <section key={periodIndex} className="space-y-2" aria-label={t("powerHistory.period", { period: periodIndex + 1 })}>
          <Text as="h4" variant="bodyMedium" weight={600}>{t("powerHistory.period", { period: periodIndex + 1 })} · {periodLabel(range)}</Text>
          <Button size="sm" className="min-h-[calc(var(--dim-button-height)+var(--space-1))]" disabled={tool.busy || tool.durationSeconds === null || !tool.canStart(periodIndex)} onClick={() => void tool.start(periodIndex)}>{t(period.page ? "powerHistory.restart" : "powerHistory.start")}</Button>
          {!tool.canStart(periodIndex) && !period.page && <Text as="p" variant="bodyMedium" tone="secondary">{t("powerHistory.scopeLimit")}</Text>}
          {period.page && <>
            <Text as="p" variant="bodyMedium" tone="secondary">{t("powerHistory.coverage", { observed: period.candidates.length, checked: computed.size, waiting: period.candidates.filter(v => !computed.has(v.activityId)).length })}{period.candidates.some(v => !stagePowerHistoryCandidateReady(v)) && <> {t("powerHistory.unsupportedSubset", { unsupported: period.candidates.filter(v => !stagePowerHistoryCandidateReady(v)).length })}</>}</Text>
            {computed.size === 0 && <Text as="p" variant="bodyMedium">{t(period.candidates.some(stagePowerHistoryCandidateReady) ? "powerHistory.notCalculatedYet" : "powerHistory.noSelectable")}</Text>}
            {!period.page.page.exhausted && <Button variant="outline" size="sm" className="min-h-[calc(var(--dim-button-height)+var(--space-1))]" disabled={tool.busy || tool.failure === "source_changed" || !tool.canNext(periodIndex)} onClick={() => void tool.next(periodIndex)}>{t("powerHistory.next")}</Button>}
            <HistoryChoices key={JSON.stringify([ownerUid, periods, draft, period.page.session.requestBinding, periodIndex])} tool={tool} periodIndex={periodIndex} computedIds={[...computed.keys()]} date={date} />
          </>}
          {computed.size > 0 && reduced[periodIndex]?.origins.filter(origin => origin.inspectedActivityCount > 0).map(origin => {
            const chosen = unit === "W" ? origin.winner : origin.weightNormalized.winner;
            const watts = chosen?.result?.state === "available" ? unit === "W" ? chosen.result.maxAveragePowerW : chosen.weightNormalized?.maxAveragePowerWPerKg : null;
            return <div key={origin.sourcePowerOrigin} className="space-y-2">
              <Text as="p" variant="bodyMedium" weight={600}>{originLabel(origin.sourcePowerOrigin)}</Text>
              {watts != null && chosen ? <>
                <Text as="p" variant="dataMedium" weight={600}>{value(watts)} {unit} · {formatElapsedBoundary(tool.durationSeconds!)}</Text>
                <Text as="p" variant="bodyMedium" tone="secondary">{t("powerHistory.observedBest")}</Text>
                <LocalizedLink className="inline-flex min-h-[calc(var(--dim-button-height)+var(--space-1))] items-center underline" to={`/activity/${encodeURIComponent(chosen.activityId)}`}>{date(chosen.startTime)}</LocalizedLink>
                {unit === "W/kg" && <Text as="p" variant="bodyMedium" tone="secondary">{t("powerHistory.weight", { kg: chosen.weightNormalized!.weightKg })} · {chosen.weightNormalized!.computedAt === null ? t("powerHistory.weightTimeUnknown") : `${date(chosen.weightNormalized!.computedAt)} (${t("powerHistory.koreaTime")})`}</Text>}
              </> : <Text as="p" variant="bodyMedium" tone="secondary">{t(origin.missingSnapshotCount === origin.inspectedActivityCount ? "powerHistory.noPreparedResult" : origin.noContinuousWindowCount === origin.inspectedActivityCount ? "powerHistory.noWindowResult" : unit === "W/kg" && origin.winner ? "powerHistory.noWeightResult" : "powerHistory.noResult")}</Text>}
              <Text as="p" variant="bodyMedium" tone="secondary">{t("powerHistory.calculatedSummary", { calculated: unit === "W" ? origin.computedPhysicalCandidateCount : origin.weightNormalized.computedPhysicalCandidateCount, inspected: origin.physicalCandidateCount })}</Text>
            </div>;
          })}
        </section>;
      })}
      {(["measured", "stored_native_watts_unverified"] as const).map(origin => {
        const left = reduced[0]?.origins.find(v => v.sourcePowerOrigin === origin), right = reduced[1]?.origins.find(v => v.sourcePowerOrigin === origin);
        const a = unit === "W" ? left?.winner : left?.weightNormalized.winner, b = unit === "W" ? right?.winner : right?.weightNormalized.winner;
        if (!a || !b) return null;
        const difference = unit === "W" ? exactPowerEnergyDifference(a.comparison!.energyWattMilliseconds, a.comparison!.durationMilliseconds, b.comparison!.energyWattMilliseconds, b.comparison!.durationMilliseconds) : exactPowerRatioDifference(a.weightNormalized!.comparison!, b.weightNormalized!.comparison!);
        return <Text key={origin} as="p" variant="bodyMedium">{originLabel(origin)} · {t("powerHistory.difference", { value: `${difference > 0 ? "+" : ""}${value(difference)}`, unit })}</Text>;
      })}
      <details><summary className="cursor-pointer py-3">{t("powerHistory.basis")}</summary>
        <Text as="p" variant="bodyMedium" tone="secondary">{t("powerHistory.basisNote")}</Text>
        <Text as="p" variant="bodyMedium" tone="secondary">{t("powerHistory.weightNote")}</Text>
        <Text as="p" variant="bodyMedium" tone="secondary">{t("powerHistory.uncalculatedNote")}</Text>
        <div className="space-y-3 pt-3">{periods.map((range, periodIndex) => <section key={periodIndex} className="space-y-1">
          <Text as="p" variant="bodyMedium" tone="secondary">{t("powerHistory.fullPeriod", { period: periodIndex + 1, from: boundary(range.fromInclusive), to: boundary(range.toExclusive) })}</Text>
          {tool.periods[periodIndex]?.page && <Text as="p" variant="bodyMedium" tone="secondary">{t(tool.periods[periodIndex]!.page!.page.exhausted ? "powerHistory.exhausted" : "powerHistory.partial")}</Text>}
          {reduced[periodIndex]?.origins.filter(origin => origin.inspectedActivityCount > 0).map(origin => <div key={origin.sourcePowerOrigin}>
            <Text as="p" variant="bodyMedium" weight={600}>{originLabel(origin.sourcePowerOrigin)}</Text>
            <Text as="p" variant="bodyMedium" tone="secondary">{t("powerHistory.resultCoverage", { calculated: unit === "W" ? origin.computedPhysicalCandidateCount : origin.weightNormalized.computedPhysicalCandidateCount, inspected: origin.physicalCandidateCount, missing: origin.missingSnapshotCount, noWindow: origin.noContinuousWindowCount })}</Text>
            {unit === "W/kg" && <Text as="p" variant="bodyMedium" tone="secondary">{t("powerHistory.weightCoverage", { included: origin.weightNormalized.weightCounts.includedActivityCount, missing: origin.weightNormalized.weightCounts.missingWeightActivityCount, invalid: origin.weightNormalized.weightCounts.invalidWeightActivityCount, incompatible: origin.weightNormalized.weightCounts.incompatibleWeightActivityCount })}</Text>}
          </div>)}
        </section>)}</div>
      </details>
    </div>
  </details>;
}
function HistoryChoices({ tool, periodIndex, computedIds, date }: { tool: ReturnType<typeof useStagePowerDurationHistory>; periodIndex: number; computedIds: string[]; date: (ms: number) => string }) {
  const { t } = useTranslation("activity");
  const [selected, setSelected] = useState<string[]>([]);
  const candidates = tool.periods[periodIndex]!.candidates;
  const pending = selected.filter(id => !computedIds.includes(id));
  return <details className="text-[length:var(--fs-md)]"><summary className="cursor-pointer py-3">{t("powerHistory.choose")}</summary>
    <div className="space-y-2">{candidates.map(row => {
      const done = computedIds.includes(row.activityId), ready = stagePowerHistoryCandidateReady(row);
      return <label key={row.activityId} className="flex min-h-[calc(var(--dim-button-height)+var(--space-1))] items-center gap-2">
        <input type="checkbox" checked={pending.includes(row.activityId)} disabled={tool.busy || !ready || done || pending.length >= 2 && !pending.includes(row.activityId)} onChange={event => setSelected(event.target.checked ? [...pending, row.activityId] : pending.filter(id => id !== row.activityId))} />
        <Text variant="bodyMedium">{date(row.startTime)} · {t(done ? "powerHistory.done" : !ready ? "powerHistory.unsupported" : "powerHistory.notComputed")}</Text>
      </label>;
    })}</div>
    <Button size="sm" className="min-h-[calc(var(--dim-button-height)+var(--space-1))]" disabled={tool.busy || tool.failure === "source_changed" || pending.length === 0} onClick={() => void tool.calculate(periodIndex, pending)}>{t("powerHistory.calculate")}</Button>
  </details>;
}
