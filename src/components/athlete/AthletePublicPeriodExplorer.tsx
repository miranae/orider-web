import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { planDayKey, planDayStartMs } from "@shared/training/planDate";
import { Button, Input, Text } from "../../theme/components";
import { useAthletePublicPeriod, publicPeriodBounds } from "../../hooks/useAthletePublicPeriod";
import AthleteActivityChart from "./AthleteActivityChart";
import AthleteRecentSummary from "./AthleteRecentSummary";
import type { AthletePeriod } from "./athleteProfilePeriods";
import { acceptedStatsActivities } from "../../utils/estimateTSS";

export default function AthletePublicPeriodExplorer({ targetUid }: { targetUid: string }) {
  const { t } = useTranslation("athlete"), [params, setParams] = useSearchParams();
  const today = planDayStartMs(Date.now()), defaultFrom = planDayKey(today - 27 * 86400000), defaultTo = planDayKey(today);
  const from = params.get("profileFrom") ?? defaultFrom, to = params.get("profileTo") ?? defaultTo;
  const [draftFrom, setFrom] = useState(from), [draftTo, setTo] = useState(to), [selected, setSelected] = useState<AthletePeriod | null>(null);
  const query = useAthletePublicPeriod(targetUid, from, to);
  const accepted = acceptedStatsActivities(query.items);
  useEffect(() => { setFrom(from); setTo(to); setSelected(null); }, [from, to, targetUid]);
  useEffect(() => { setSelected(null); }, [query.generation]);
  const choose = (start: string, end: string) => {
    setFrom(start); setTo(end); setSelected(null);
    setParams(previous => { const next = new URLSearchParams(previous); next.set("profileFrom", start); next.set("profileTo", end); return next; }, { replace: true });
    if (start === from && end === to) query.refresh();
  };
  return <section aria-label={t("publicPeriod.title")} className="athlete-profile-section">
    <h2>{t("publicPeriod.title")}</h2>
    <form className="athlete-period-form" onSubmit={event => { event.preventDefault(); if (publicPeriodBounds(draftFrom, draftTo)) choose(draftFrom, draftTo); }}>
      <label>{t("publicPeriod.from")}<Input type="date" value={draftFrom} onChange={event => setFrom(event.target.value)} /></label>
      <label>{t("publicPeriod.to")}<Input type="date" value={draftTo} onChange={event => setTo(event.target.value)} /></label>
      <Button type="submit" disabled={!publicPeriodBounds(draftFrom, draftTo)}>{t("publicPeriod.apply")}</Button>
      <Button type="button" variant="ghost" onClick={() => choose(defaultFrom, defaultTo)}>{t("profile.last28Days")}</Button>
    </form>
    <div className="athlete-query-status">{query.status !== "complete" && <Text as="p" role="status">{!query.valid ? t("publicPeriod.invalid") : t(`publicPeriod.${query.status}`, { count: query.items.length })}</Text>}
    {query.status !== "loading" && query.valid && <Button onClick={query.status === "partial" || query.status === "error" ? query.more : query.refresh}>{t(query.status === "partial" ? "publicPeriod.more" : query.status === "error" ? "monthly.retry" : "publicPeriod.refresh")}</Button>}</div>
    {query.status === "complete" && <>
      {from === defaultFrom && to === defaultTo && <AthleteRecentSummary activities={accepted} loading={false} error={false} />}
      <AthleteActivityChart key={`${from}|${to}`} rangeLimit={publicPeriodBounds(from, to)!} activities={accepted} loadActivities={[]} selected={selected} onSelect={setSelected} />
    </>}

  </section>;
}
