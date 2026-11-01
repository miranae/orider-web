import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../../contexts/AuthContext";
import { LocalizedLink } from "../../../components/LocalizedLink";
import { Alert, Button, Card, Chip, Field, Input, Text, buttonClass } from "../../../theme/components";
import { logClientError } from "../../../services/errorLogger";
import { firstWorkoutLocalAvailable, firstWorkoutRequest } from "./firstWorkoutClient";
import { FIRST_WORKOUT_PREVIEWS, seoulDate, validWorkoutDate, type FirstWorkout, type StartSport } from "./firstWorkout";
import "./startJourney.css";

export default function FirstWorkoutGate({ sport, children }: { sport: StartSport; children: ReactNode }) {
  const { user } = useAuth();
  const { t } = useTranslation("training");
  const owner = `${user?.uid ?? ""}:${sport}`;
  const enabled = firstWorkoutLocalAvailable() && !!user && !user.isAnonymous;
  const [state, setState] = useState<{ owner: string; workout: FirstWorkout | null; error?: boolean }>({ owner: "", workout: null });
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(false);
  const [date, setDate] = useState(seoulDate);
  const [actionError, setActionError] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    firstWorkoutRequest(sport).then(workout => {
      if (live) { setState({ owner, workout }); if (workout) setDate(workout.date); }
    }).catch(error => {
      logClientError("FirstWorkoutGate.load", error, { sport });
      if (live) setState({ owner, workout: null, error: true });
    });
    return () => { live = false; };
  }, [enabled, owner, sport, refresh]);
  const reload = () => { setState({ owner: "", workout: null }); setRefresh(value => value + 1); };
  const workout = state.owner === owner ? state.workout : null;
  const mutate = async (action: "cancel" | "move") => {
    if (!workout || pending.current || action === "move" && !validWorkoutDate(date)) return;
    pending.current = true; setBusy(true); setActionError(false);
    try {
      const next = await firstWorkoutRequest(sport, { action, id: workout.id, revision: workout.revision, ...(action === "move" ? { date } : {}) });
      setState({ owner, workout: next }); setEdit(false);
    } catch (error) { logClientError("FirstWorkoutGate.change", error, { sport, action }); setActionError(true); }
    finally { pending.current = false; setBusy(false); }
  };
  if (!enabled) return children;
  if (state.owner !== owner) return <div className="site-shell start-session"><Text role="status">{t("start.loading")}</Text></div>;
  if (state.error) return <div className="site-shell start-session"><Alert variant="danger">{t("start.errors.request-failed")}</Alert><Button onClick={reload}>{t("start.retry")}</Button></div>;
  if (!workout) return children;
  const preview = FIRST_WORKOUT_PREVIEWS[sport];
  const past = workout.date < seoulDate();
  return <div className="site-shell start-journey">
    <header className="start-header"><Text as="p" variant="eyebrow" tone="secondary">{t(`start.sports.${sport}`)} · {t("start.yourPlan")}</Text><Text as="h1" variant="pageTitle">{t("start.firstWorkoutReady")}</Text><Text as="p" tone="secondary">{t("start.readyDescription")}</Text></header>
    <Alert variant="info">{t("start.localNotice")}</Alert>
    <Card className="start-session"><Chip variant={past ? "warning" : "accent"}>{t(past ? "start.missed" : "start.scheduled")}</Chip><Text as="h2" variant="title">{t(`start.workoutTitle.${sport}`)}</Text><div className="start-session-actions"><time dateTime={workout.date}>{workout.date}</time><Text tone="secondary">{t("start.blockMinutes", { minutes: preview.minutes })}</Text></div>
      <ol className="start-workout-blocks">{preview.blocks.map((minutes, i) => <li key={i}><span className="start-workout-number">{i + 1}</span><div><Text as="p" variant="bodyMedium">{t(`start.blocks.${sport}.${i}`)}</Text><Text as="p" variant="bodySmall" tone="secondary">{t("start.blockMinutes", { minutes })}</Text></div></li>)}</ol>
      <Text as="p" tone="secondary">{t("start.executionDescription")}</Text><Text as="p" variant="caption" tone="secondary">{t("start.noAutoCompletion")}</Text>
      {actionError && <Alert variant="danger">{t("start.changeFailed")}<Button disabled={busy} onClick={reload}>{t("start.retry")}</Button></Alert>}
      {edit && <div className="start-stack"><Field label={t("start.dateLabel")} htmlFor="move-first-workout"><Input id="move-first-workout" type="date" value={date} min={seoulDate()} max={seoulDate(Date.now() + 30 * 86400000)} onInput={event => setDate(event.currentTarget.value)} onChange={event => setDate(event.target.value)} disabled={busy} /></Field><Button variant="primary" loading={busy} disabled={!validWorkoutDate(date)} onClick={() => void mutate("move")}>{t("start.confirmDate")}</Button></div>}
      <div className="start-session-actions"><LocalizedLink className={buttonClass({ variant: "primary" })} to={`/athlete/me/activities?sport=${sport}&import=1`}>{t("start.importAfter")}</LocalizedLink><Button disabled={busy} onClick={() => setEdit(value => !value)}>{t("start.changeDate")}</Button><Button variant="ghost" disabled={busy} onClick={() => void mutate("cancel")}>{t("start.cancelWorkout")}</Button></div>
    </Card>
    <Card className="start-stack"><Text as="h2" variant="subtitle">{t("start.nextTitle")}</Text><Text as="p" tone="secondary">{t("start.nextDescription")}</Text><LocalizedLink to={`/coach/goals?sport=${sport}`}>{t("start.existingGoals")}</LocalizedLink></Card>
  </div>;
}
