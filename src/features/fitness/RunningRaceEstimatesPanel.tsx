import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { RunningRaceTarget } from "@shared/types/running-race-estimates";
import type { StageRaceEstimateInputs, StageRaceEstimateSnapshot } from "@shared/types/running-race-estimates-stage";
import { Button, Input, Select, Text } from "../../theme";
import { LocalizedLink } from "../../components/LocalizedLink";
import { useRunningRaceEstimates, type RaceActivityChoice } from "../../hooks/useRunningRaceEstimates";
const targets: RunningRaceTarget[] = ["5k", "10k", "half", "marathon"];
const touch = "min-h-[calc(var(--dim-button-height)+var(--space-1))]";
type ManualDraft = { id: string; target: RunningRaceTarget; date: string; time: string; attested: boolean };
const blank = (): ManualDraft => ({ id: crypto.randomUUID(), target: "5k", date: "", time: "", attested: false });
function elapsed(time: string) {
  const match = /^(\d{1,2}):(\d{2}):(\d{2}(?:\.\d+)?)$/u.exec(time);
  if (!match || Number(match[2]) >= 60 || Number(match[3]) >= 60) return NaN;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}
function raceTime(seconds: number) {
  const whole = Math.round(seconds), hours = Math.floor(whole / 3600), minutes = Math.floor(whole % 3600 / 60);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}
export default function RunningRaceEstimatesPanel({ ownerUid }: { ownerUid: string }) {
  const { t, i18n } = useTranslation("fitness");
  const id = useId();
  const [manual, setManual] = useState<ManualDraft[]>(() => [blank()]);
  const [activities, setActivities] = useState<RaceActivityChoice[]>([]);
  const [activityAttested, setActivityAttested] = useState(false);
  const [weeks, setWeeks] = useState<2 | 12 | 24>(2);
  const [mileage, setMileage] = useState("");
  const [mileageUnit, setMileageUnit] = useState<"km_per_week" | "miles_per_week">("km_per_week");
  const [mileageAttested, setMileageAttested] = useState(false);
  const [windowMonths, setWindowMonths] = useState<1 | 3 | 6>(1);
  const [invalid, setInvalid] = useState(false);
  const draftKey = JSON.stringify([manual, activities, activityAttested, mileage, mileageUnit, mileageAttested, weeks]);
  const tool = useRunningRaceEstimates(ownerUid, draftKey);
  if (!tool.owner || !tool.available) return null;
  const locked = !!tool.busy || tool.pendingSave;
  const date = (value: number) => new Intl.DateTimeFormat(i18n.language, { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
  const update = (index: number, patch: Partial<ManualDraft>) => { setManual(rows => rows.map((row, i) => i === index ? { ...row, ...patch } : row)); setInvalid(false); };
  const preview = () => {
    const rows = manual.filter(row => row.date || row.time || row.attested);
    const inputs: StageRaceEstimateInputs = { activities: activities.map(choice => choice.input), manualRaces: rows.map(row => ({ id: row.id, target: row.target,
      elapsedSeconds: elapsed(row.time), occurredAt: Date.parse(`${row.date}T00:00:00+09:00`), maximalEffortAttested: true })) };
    if ((!rows.length && !activities.length) || rows.some(row => !row.attested || !Number.isFinite(elapsed(row.time)) || elapsed(row.time) <= 0 || !Number.isFinite(Date.parse(`${row.date}T00:00:00+09:00`)))
      || activities.length > 0 && !activityAttested || mileage && (!mileageAttested || !Number.isFinite(Number(mileage)) || Number(mileage) <= 0)) { setInvalid(true); return; }
    if (mileage) inputs.typicalMileage = { value: Number(mileage), unit: mileageUnit, attestedTypicalTraining: true };
    setInvalid(false); void tool.preview(inputs);
  };
  const snapshot = (value: StageRaceEstimateSnapshot, historical = false) => <div className="space-y-3">
    <Text as="p" variant="bodyMedium" tone="secondary">{t(historical ? "raceEstimates.savedAt" : "raceEstimates.asOf", { date: date(value.asOf) })}</Text>
    <table className="w-full text-[length:var(--fs-md)]"><caption className="sr-only">{t("raceEstimates.table")}</caption><thead><tr><th scope="col" className="text-left">{t("raceEstimates.distance")}</th><th scope="col" className="text-left">{t("raceEstimates.time")}</th><th scope="col" className="text-left">{t("raceEstimates.kind")}</th></tr></thead><tbody>{value.estimates.map(row => <tr key={row.target}><th scope="row" className="py-3 text-left font-normal">{t(`raceEstimates.target.${row.target}`)}</th><td title={row.elapsedSeconds === null ? undefined : `${row.elapsedSeconds} s`}>{row.elapsedSeconds === null ? "—" : raceTime(row.elapsedSeconds)}</td><td>{t(`raceEstimates.status.${row.status}`)}</td></tr>)}</tbody></table>
    <Text as="p" variant="bodyMedium" tone="secondary">{t("raceEstimates.disclaimer")}</Text>
    <details><summary className={`cursor-pointer inline-flex items-center ${touch}`}>{t("raceEstimates.evidence")}</summary><div className="space-y-3">
      <Text as="p" variant="bodyMedium" tone="secondary">{t("raceEstimates.clockNote")}</Text>
      {value.estimates.map(row => <div key={row.target} className="space-y-2"><Text as="p" variant="bodyMedium">{t(`raceEstimates.target.${row.target}`)} · {row.method ? t(`raceEstimates.method.${row.method}`) : t(`raceEstimates.reason.${row.reason ?? "invalid_input"}`)}</Text>{row.source && <Text as="p" variant="bodyMedium">{t("raceEstimates.sourceInput", { date: date(row.source.occurredAt), seconds: row.source.elapsedSeconds, meters: row.source.distanceMeters })} · {t(row.source.provenance === "user_supplied_race" ? "raceEstimates.manualSource" : "raceEstimates.activitySource")}</Text>}</div>)}
      {value.inputs.activities.map(row => <LocalizedLink key={`${row.activityId}:${row.target}`} className={`inline-flex items-center underline ${touch}`} to={`/activity/${encodeURIComponent(row.activityId)}`}>{t("raceEstimates.activityLink")} · {t(`raceEstimates.target.${row.target}`)}</LocalizedLink>)}
      {value.typicalMileage && <Text as="p" variant="bodyMedium">{t("raceEstimates.mileageBasis", { value: value.typicalMileage.value, unit: t(`raceEstimates.unit.${value.typicalMileage.unit}`), date: date(value.typicalMileage.statedAt) })}</Text>}
    </div></details>
  </div>;
  return <details className="activity-growth-evidence text-[length:var(--fs-md)]">
    <summary className={`cursor-pointer inline-flex items-center font-semibold ${touch}`}>{t("raceEstimates.title")}</summary>
    <div className="space-y-4 pt-3"><Text as="p" variant="bodyMedium" tone="secondary">{t("raceEstimates.scope")}</Text>
      <fieldset disabled={locked} className="space-y-3"><legend>{t("raceEstimates.chooseSource")}</legend><div className="flex flex-wrap gap-3"><label>{t("raceEstimates.sourceWindow")}<Select className={touch} value={weeks} onChange={event => { setWeeks(Number(event.target.value) as 2 | 12 | 24); setActivities([]); }}>{[2, 12, 24].map(value => <option key={value} value={value}>{t("raceEstimates.weeks", { count: value })}</option>)}</Select></label><Button className={touch} size="sm" onClick={() => void tool.discover(weeks)}>{t("raceEstimates.loadSources")}</Button></div>
      {tool.sources && <><Text as="p" variant="bodyMedium" tone="secondary">{t("raceEstimates.sourceBounds", { from: date(tool.sources.from), through: date(tool.sources.to - 1) })}</Text>{tool.sources.partial && <Text as="p" variant="bodyMedium" tone="secondary">{t("raceEstimates.partial")}</Text>}{tool.sources.unsupported ? <Text as="p" variant="bodyMedium" tone="secondary">{t("raceEstimates.unsupported")}</Text> : <label>{t("raceEstimates.activitySource")}<Select className={touch} value="" onChange={event => { const choice = tool.sources!.choices[Number(event.target.value)]; if (choice && activities.length < 4 && !activities.some(value => value.input.activityId === choice.input.activityId && value.input.target === choice.input.target)) setActivities(values => [...values, choice]); }}><option value="">{t("raceEstimates.selectActivity")}</option>{tool.sources.choices.map((choice, index) => <option key={index} value={index}>{date(choice.startTime)} · {t(`raceEstimates.target.${choice.input.target}`)} · {raceTime(choice.elapsedSeconds)}</option>)}</Select></label>}{!tool.sources.choices.length && <Text as="p" variant="bodyMedium" tone="secondary">{t("raceEstimates.noSources")}</Text>}</>}
      {activities.map((choice, index) => <div key={`${choice.input.activityId}:${choice.input.target}`} className="flex flex-wrap items-center gap-3"><LocalizedLink className={`inline-flex items-center underline ${touch}`} to={`/activity/${encodeURIComponent(choice.input.activityId)}`}>{date(choice.startTime)} · {t(`raceEstimates.target.${choice.input.target}`)} · {raceTime(choice.elapsedSeconds)}</LocalizedLink><Button className={touch} variant="ghost" size="sm" onClick={() => setActivities(values => values.filter((_, i) => i !== index))}>{t("raceEstimates.remove")}</Button></div>)}
      {activities.length > 0 && <label className={`inline-flex items-center gap-3 ${touch}`}><input type="checkbox" checked={activityAttested} onChange={event => setActivityAttested(event.target.checked)} />{t("raceEstimates.maximal")}</label>}
      </fieldset>
      <fieldset disabled={locked} className="space-y-3"><legend>{t("raceEstimates.directInput")}</legend>{manual.map((row, index) => <div key={row.id} className="space-y-3"><div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><label htmlFor={`${id}-target-${index}`}>{t("raceEstimates.distance")}<Select id={`${id}-target-${index}`} className={touch} value={row.target} onChange={event => update(index, { target: event.target.value as RunningRaceTarget })}>{targets.map(target => <option key={target} value={target}>{t(`raceEstimates.target.${target}`)}</option>)}</Select></label><label htmlFor={`${id}-date-${index}`}>{t("raceEstimates.date")}<Input id={`${id}-date-${index}`} className={touch} type="date" value={row.date} onChange={event => update(index, { date: event.target.value })} /></label><label htmlFor={`${id}-time-${index}`}>{t("raceEstimates.rawTime")}<Input id={`${id}-time-${index}`} className={touch} placeholder="0:25:00" value={row.time} onChange={event => update(index, { time: event.target.value })} /></label></div><label className={`inline-flex items-center gap-3 ${touch}`}><input type="checkbox" checked={row.attested} onChange={event => update(index, { attested: event.target.checked })} />{t("raceEstimates.maximal")}</label><Button className={touch} variant="ghost" size="sm" onClick={() => setManual(values => values.filter((_, i) => i !== index))}>{t("raceEstimates.remove")}</Button></div>)}<Button className={touch} variant="outline" size="sm" disabled={manual.length >= 4} onClick={() => setManual(values => [...values, blank()])}>{t("raceEstimates.addRace")}</Button></fieldset>
      <fieldset disabled={locked} className="space-y-3"><legend>{t("raceEstimates.mileage")}</legend><div className="flex flex-wrap gap-3"><Input aria-label={t("raceEstimates.mileage")} className={touch} type="number" min="0" value={mileage} onChange={event => setMileage(event.target.value)} /><Select aria-label={t("raceEstimates.mileageUnit")} className={touch} value={mileageUnit} onChange={event => setMileageUnit(event.target.value as typeof mileageUnit)}>{["km_per_week", "miles_per_week"].map(unit => <option key={unit} value={unit}>{t(`raceEstimates.unit.${unit}`)}</option>)}</Select></div><label className={`inline-flex items-center gap-3 ${touch}`}><input type="checkbox" checked={mileageAttested} onChange={event => setMileageAttested(event.target.checked)} />{t("raceEstimates.typical")}</label><Text as="p" variant="bodyMedium" tone="secondary">{t("raceEstimates.mileageNote")}</Text></fieldset>
      {invalid && <Text as="p" variant="bodyMedium" role="alert">{t("raceEstimates.invalid")}</Text>}
      <Button className={touch} disabled={locked} onClick={preview}>{t("raceEstimates.preview")}</Button>
      {tool.busy && <><Text as="p" variant="bodyMedium" role="status">{t("raceEstimates.loading")}</Text><Button className={touch} variant="ghost" onClick={tool.cancel}>{t("raceEstimates.cancel")}</Button></>}
      {tool.error && <Text as="p" variant="bodyMedium" role="alert">{t(tool.storedAccountUnverified ? "raceEstimates.savedAccountUnverified" : tool.savingUnknown ? "raceEstimates.saveUnknown" : "raceEstimates.error")}</Text>}
      {tool.pendingSave && !tool.busy && <div className="flex flex-wrap gap-3"><Button className={touch} onClick={tool.retrySave}>{t("raceEstimates.retry")}</Button><Button className={touch} variant="ghost" onClick={tool.dismissSave}>{t("raceEstimates.dismiss")}</Button></div>}
      {tool.response && tool.response.mode !== "history_page" && <>{snapshot(tool.response.snapshot)}{tool.response.mode === "preview" ? <Button className={touch} disabled={locked} onClick={tool.save}>{t("raceEstimates.save")}</Button> : <Text as="p" variant="bodyMedium" role="status">{t(`raceEstimates.outcome.${tool.response.outcome}`)}</Text>}</>}
      <section className="space-y-3"><Text as="h3" variant="bodyMedium" weight={600}>{t("raceEstimates.history")}</Text><div className="flex flex-wrap gap-3"><Select aria-label={t("raceEstimates.historyWindow")} className={touch} value={windowMonths} disabled={locked} onChange={event => setWindowMonths(Number(event.target.value) as 1 | 3 | 6)}>{[1, 3, 6].map(value => <option key={value} value={value}>{t("raceEstimates.months", { count: value })}</option>)}</Select><Button className={touch} size="sm" disabled={locked} onClick={() => void tool.history(windowMonths)}>{t("raceEstimates.loadHistory")}</Button></div><Text as="p" variant="bodyMedium" tone="secondary">{t("raceEstimates.historyNote")}</Text>
      {tool.response?.mode === "history_page" && <><Text as="p" variant="bodyMedium" tone="secondary">{t("raceEstimates.actualHistoryWindow", { days: tool.response.windowDays })}</Text>{tool.response.snapshots.length === 0 && <Text as="p" variant="bodyMedium">{t("raceEstimates.emptyHistory")}</Text>}{tool.response.snapshots.length === 1 && <Text as="p" variant="bodyMedium" tone="secondary">{t("raceEstimates.onePoint")}</Text>}{tool.response.snapshots.map(item => <article key={item.snapshot.snapshotId!} className="space-y-3">{item.sourceValidity === "changed_or_unavailable" && <Text as="p" variant="bodyMedium" tone="secondary">{t("raceEstimates.sourceChanged")}</Text>}{snapshot(item.snapshot, true)}</article>)}{tool.response.capped && <Text as="p" variant="bodyMedium" tone="secondary">{t("raceEstimates.capped")}</Text>}{tool.response.nextCursor && <Button className={touch} disabled={locked} onClick={() => { if (tool.response?.mode === "history_page" && tool.response.nextCursor) void tool.history(tool.response.windowMonths, tool.response.nextCursor); }}>{t("raceEstimates.nextHistory")}</Button>}</>}
      </section>
    </div>
  </details>;
}
