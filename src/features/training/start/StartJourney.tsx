import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, CalendarDays, Check, Link2, Route, Sparkles } from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";
import { LocalizedLink } from "../../../components/LocalizedLink";
import { useLocalizedNavigate } from "../../../hooks/useLocalizedNavigate";
import { track } from "../../../services/analytics";
import { logClientError } from "../../../services/errorLogger";
import { isSignInCancelled } from "../../../utils/signInCancelled";
import { Alert, Button, Card, Chip, Field, Input, Text, ToggleControls, ToggleButton, buttonClass } from "../../../theme/components";
import SportIcon from "../../../components/common/SportIcon";
import { ICON_SIZE } from "../../../theme/tokens/icon";
import { FIRST_WORKOUT_PREVIEWS, seoulDate, startSport, validWorkoutDate, type Experience, type StartSport } from "./firstWorkout";
import { firstWorkoutLocalAvailable, firstWorkoutRequest } from "./firstWorkoutClient";
import "./startJourney.css";

export function StartEntry({ sport, compact = false }: { sport: StartSport; compact?: boolean }) {
  const { t } = useTranslation("training");
  return <Card className="start-entry">
    <Text as="h2" variant={compact ? "subtitle" : "title"}>{t(`start.hero.${sport}`)}</Text>
    <Text as="p" variant="bodySmall" tone="secondary">{t("start.heroDescription")}</Text>
    <LocalizedLink className={buttonClass({ variant: "primary", size: compact ? "sm" : "md" })} to={`/coach/goals?sport=${sport}&start=choose`}>{t("start.getStarted")}<ArrowRight size={ICON_SIZE.sm} aria-hidden="true" /></LocalizedLink>
    <LocalizedLink to={`/coach/goals?sport=${sport}&start=import`} className="start-secondary-link">{t("start.importTitle")}</LocalizedLink>
  </Card>;
}

export default function StartJourney({ sport: initialSport, activeGoal, checking = false, loadError = false, activeGoalSport }: {
  sport: StartSport; activeGoal: boolean; checking?: boolean; loadError?: boolean; activeGoalSport?: StartSport;
}) {
  const { t } = useTranslation("training");
  const { user, signIn, loading } = useAuth();
  const navigate = useLocalizedNavigate();
  const [params, setParams] = useSearchParams();
  const sport = startSport(params.get("sport")) ?? initialSport;
  const rawStep = params.get("start");
  const step = ["choose", "workout", "preview", "import"].includes(rawStep ?? "") ? rawStep! : "choose";
  const experience = ["new", "sometimes", "regular"].includes(params.get("experience") ?? "") ? params.get("experience") as Experience : "skip";
  const [date, setDate] = useState(seoulDate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<{ owner: string; date: string; key: string } | null>(null);
  const pending = useRef(false);
  const header = useRef<HTMLElement>(null);
  const local = firstWorkoutLocalAvailable();
  const preview = FIRST_WORKOUT_PREVIEWS[sport];
  const change = (patch: Record<string, string>) => {
    setError(null);
    setParams(previous => { const next = new URLSearchParams(previous); Object.entries(patch).forEach(([key, value]) => next.set(key, value)); return next; });
  };
  useEffect(() => { track("or_start_step_view", { sport, step, experience }); }, [sport, step, experience]);
  useEffect(() => {
    header.current?.scrollIntoView?.({ block: "start" });
    header.current?.querySelector("h1")?.focus({ preventScroll: true });
  }, [sport, step]);
  useEffect(() => { attempt.current = null; setError(null); }, [user?.uid, sport]);

  const reserve = async () => {
    if (pending.current || busy || loading || !local || activeGoal || checking || loadError || !validWorkoutDate(date)) return;
    if (!user || user.isAnonymous) {
      setBusy(true);
      try { await signIn(); } catch (cause) { if (!isSignInCancelled(cause)) setError("request-failed"); } finally { setBusy(false); }
      return;
    }
    pending.current = true; setBusy(true); setError(null);
    const owner = `${user.uid}:${sport}`;
    if (attempt.current?.owner !== owner || attempt.current.date !== date) attempt.current = { owner, date, key: crypto.randomUUID() };
    try {
      const workout = await firstWorkoutRequest(sport, { action: "reserve", date, key: attempt.current.key });
      if (!workout) throw new Error("invalid-response");
      track("or_first_workout_reserved", { sport, workoutId: workout.id });
      navigate(`/coach/plan?sport=${sport}`);
    } catch (cause) {
      logClientError("StartJourney.reserve", cause, { sport });
      setError(cause instanceof Error ? cause.message : "request-failed");
    } finally { pending.current = false; setBusy(false); }
  };
  const goalPath = `/coach/goals?sport=${sport}`;
  const choosePlan = async (program: boolean) => {
    if (busy || loading) return;
    const target = program ? `/coach/plan?sport=${sport}` : `${goalPath}&new=1`;
    if (!user || user.isAnonymous) {
      // URL is the durable return state; no goal is created by signing in.
      setBusy(true); setError(null);
      try { await signIn(); navigate(target); } catch (cause) { if (!isSignInCancelled(cause)) setError("request-failed"); } finally { setBusy(false); }
    } else navigate(target);
  };
  const index = step === "choose" || step === "import" ? 0 : step === "workout" ? 1 : 2;

  return <div className="site-shell start-journey">
    <header className="start-header" ref={header}>
      <Text as="p" variant="eyebrow" tone="secondary">{t("start.eyebrow")}</Text>
      <Text as="h1" variant="pageTitle" tabIndex={-1}>{t(step === "preview" ? "start.previewTitle" : "start.title")}</Text>
      <Text as="p" variant="body" tone="secondary">{t("start.description")}</Text>
      <ToggleControls variant="axis" aria-label={t("start.sportLabel")}><ToggleButton selected={sport === "bike"} disabled={busy} onClick={() => change({ sport: "bike", start: "choose" })}><SportIcon sport="bike" size={ICON_SIZE.md} />{t("start.sports.bike")}</ToggleButton><ToggleButton selected={sport === "run"} disabled={busy} onClick={() => change({ sport: "run", start: "choose" })}><SportIcon sport="run" size={ICON_SIZE.md} />{t("start.sports.run")}</ToggleButton></ToggleControls>
    </header>
    <ol className="start-progress" aria-label={t("start.progressLabel")}>{["choose", "workout", "preview"].map((value, i) => <li key={value} aria-current={i === index ? "step" : undefined}><span aria-hidden="true">{i < index ? <Check size={ICON_SIZE.sm} /> : i + 1}</span><Text variant="caption" tone={i === index ? "primary" : "secondary"}>{t(`start.steps.${value}`)}</Text></li>)}</ol>
    {local && <Alert variant="info">{t("start.localNotice")}</Alert>}
    {error && <Alert variant="danger">{t(`start.errors.${error}`, { defaultValue: t("start.errors.request-failed") })}{error === "other-workout" && <LocalizedLink to={`/coach/plan?sport=${sport === "run" ? "bike" : "run"}`}>{t("start.openPlan")}</LocalizedLink>}{(error === "active-workout" || error === "active-goal") && <LocalizedLink to={`/coach/plan?sport=${sport}`}>{t("start.openPlan")}</LocalizedLink>}</Alert>}
    {activeGoal ? <Card className="start-stack"><Text as="h2" variant="title">{t("start.activeGoal")}</Text><Text as="p" tone="secondary">{t("start.activeGoalDescription")}</Text><LocalizedLink className={buttonClass({ variant: "primary" })} to={`/coach/plan?sport=${activeGoalSport ?? sport}`}>{t("start.openPlan")}</LocalizedLink></Card> : <>
      {step === "choose" && <div className="start-choice-grid">
        <Card className="start-stack"><Sparkles size={ICON_SIZE.xl} aria-hidden="true" /><Text as="h2" variant="title">{t("start.beginTitle")}</Text><Text as="p" tone="secondary">{t("start.beginDescription")}</Text><Button variant="primary" onClick={() => change({ start: "workout" })} trailingIcon={<ArrowRight size={ICON_SIZE.md} />}>{t("start.beginAction")}</Button></Card>
        <Card className="start-stack"><Link2 size={ICON_SIZE.xl} aria-hidden="true" /><Text as="h2" variant="title">{t("start.importTitle")}</Text><Text as="p" tone="secondary">{t("start.importDescription")}</Text><Button variant="secondary" onClick={() => change({ start: "import" })}>{t("start.importAction")}</Button></Card>
        <Card className="start-stack"><Route size={ICON_SIZE.xl} aria-hidden="true" /><Text as="h2" variant="title">{t("start.browseTitle")}</Text><Text as="p" tone="secondary">{t("start.browseDescription")}</Text><LocalizedLink className={buttonClass({ variant: "secondary" })} to={`/?sport=${sport}`}>{t("start.browseAction")}</LocalizedLink></Card>
      </div>}
      {step === "workout" && <>
        <section className="start-experience"><Text as="h2" variant="subtitle">{t("start.experienceTitle", { sport: t(`start.sports.${sport}`) })}</Text><Text as="p" variant="bodySmall" tone="secondary">{t("start.experienceDescription")}</Text><ToggleControls variant="axis" aria-label={t("start.experienceLabel")}>{(["new", "sometimes", "regular", "skip"] as const).map(value => <ToggleButton key={value} selected={experience === value} onClick={() => change({ experience: value })}>{t(`start.experience.${value}`)}</ToggleButton>)}</ToggleControls></section>
        <div className="start-choice-grid start-choice-grid--two">
          {local && <Card className="start-stack"><Chip variant="accent">{t("start.oneTimeBadge")}</Chip><Text as="h2" variant="title">{t("start.oneTimeTitle")}</Text><Text as="p" tone="secondary">{t("start.oneTimeDescription")}</Text><Text as="p" variant="caption" tone="secondary">{t(`start.requirements.${sport}`)}</Text><Button variant="primary" onClick={() => change({ start: "preview" })}>{t("start.previewAction")}</Button></Card>}
          <Card className="start-stack"><CalendarDays size={ICON_SIZE.xl} aria-hidden="true" /><Text as="h2" variant="title">{t("start.planTitle")}</Text><Text as="p" tone="secondary">{t(`start.planDescription.${sport}`)}</Text>{sport === "run" && <Button variant={local ? "secondary" : "primary"} loading={busy} onClick={() => void choosePlan(true)}>{t("start.runProgram")}</Button>}<Button variant={sport === "run" || local ? "secondary" : "primary"} loading={busy} onClick={() => void choosePlan(false)}>{t(`start.goalAction.${sport}`)}</Button></Card>
        </div>
      </>}
      {step === "preview" && (local ? <div className="start-preview-grid"><Card className="start-stack"><Chip>{t("start.previewBadge")}</Chip><Text as="h2" variant="title">{t(`start.workoutTitle.${sport}`)}</Text><Text as="p" tone="secondary">{t("start.workoutDescription")}</Text><div className="start-duration"><Text variant="dataLarge">{preview.minutes}</Text><Text tone="secondary">{t("start.minutes")}</Text></div><ol className="start-workout-blocks">{preview.blocks.map((minutes, i) => <li key={i}><span className="start-workout-number">{i + 1}</span><div><Text as="p" variant="bodyMedium">{t(`start.blocks.${sport}.${i}`)}</Text><Text as="p" variant="bodySmall" tone="secondary">{t("start.blockMinutes", { minutes })}</Text></div></li>)}</ol><Text as="p" variant="caption" tone="secondary">{t("start.contentNotice")}</Text></Card><Card className="start-stack"><Text as="h2" variant="title">{t("start.prepareTitle")}</Text><Text as="p" tone="secondary">{t(`start.requirements.${sport}`)}</Text><Field label={t("start.dateLabel")} htmlFor="first-workout-date"><Input id="first-workout-date" type="date" value={date} min={seoulDate()} max={seoulDate(Date.now() + 30 * 86400000)} onInput={event => setDate(event.currentTarget.value)} onChange={event => setDate(event.target.value)} disabled={busy} /></Field><Text as="p" variant="bodySmall" tone="secondary">{t("start.executionDescription")}</Text><Text as="p" variant="bodySmall" tone="secondary">{t("start.saveDescription")}</Text>{loadError && <Alert variant="warning">{t("start.goalLoadError")}</Alert>}<Button variant="primary" block loading={busy} disabled={loading || checking || loadError || !validWorkoutDate(date)} onClick={() => void reserve()}>{t(!user || user.isAnonymous ? "start.signInSave" : "start.saveAction")}</Button></Card></div> : <Alert variant="info">{t("start.unavailable")}</Alert>)}
      {step === "import" && <Card className="start-stack"><Text as="h2" variant="title">{t("start.importTitle")}</Text><Text as="p" tone="secondary">{t("start.importExplanation")}</Text><LocalizedLink className={buttonClass({ variant: "primary" })} to={`/athlete/me/activities?sport=${sport}&import=1`}>{t("start.importAction")}</LocalizedLink><LocalizedLink to={`/settings/connections?sport=${sport}`}>{t("start.stravaSettings")}</LocalizedLink><Text as="p" variant="caption" tone="secondary">{t("start.importOptional")}</Text></Card>}
    </>}
    <footer className="start-footer">{step !== "choose" && <Button variant="ghost" disabled={busy} onClick={() => change({ start: step === "preview" ? "workout" : "choose" })}>{t("start.back")}</Button>}<LocalizedLink to={`/?sport=${sport}`}>{t("start.backHome")}</LocalizedLink><Text variant="caption" tone="secondary">{t("start.footer")}</Text></footer>
  </div>;
}
