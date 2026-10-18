import GlossaryText from "../common/GlossaryText";
import { useEffect, useState, type ReactNode } from "react";
import { collection, doc, limit, onSnapshot, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useTranslation } from "react-i18next";
import type { Goal } from "@shared/types/goal";
import { firestore, functions, ensureAppCheckReady } from "../../services/firebase";
import { useAuth } from "../../contexts/AuthContext";
import { useTodayTrainingDecision } from "../../hooks/useTodayTrainingDecision";
import { useTodayWorkoutChoice } from "../../hooks/useTodayWorkoutChoice";
import { primaryEffectiveSession } from "../../features/trainingDecision/decisionPresentation";
import { getRuntimeConfig } from "../../services/runtimeConfig";
import { LocalizedLink } from "../LocalizedLink";
import { Card, Chip, Text, buttonClass } from "../../theme/components";
import { logClientError } from "../../services/errorLogger";
import InfoTip from "../InfoTip";
import { getDisciplineLabelKey } from "../../utils/disciplineFilter";

interface RegisteredEvent { eventId: string; name: string; startTime: number }
function HomeTodaySummary({ discipline }: { discipline: "bike" | "run" | "swim" }) {
  const { user } = useAuth();
  const { t } = useTranslation("dashboard");
  const { t: tTraining } = useTranslation("training");
  const { t: tFitness } = useTranslation("fitness");
  const state = useTodayTrainingDecision(user?.uid, discipline);
  const choiceState = useTodayWorkoutChoice(user?.uid, discipline === "run" ? "run" : "bike");
  // 사용자가 코치 오늘 화면에서 직접 정한 운동이 결정 엔진의 세션보다 먼저 보인다.
  const choice = discipline === "swim" ? null : choiceState.choice;
  const decisionEnabled = getRuntimeConfig().trainingDecisionEnabled;
  if (!decisionEnabled && !choice) return null;
  const session = state.decision && state.decision.scheduledProjectionValidUntil > Date.now() ? primaryEffectiveSession(state.decision) : null;
  const choiceText = choice ? `${tFitness(`coach.choice.${choice.workoutType}.${choice.discipline}`)} · ${choice.workoutType === "rest" ? tFitness("coach.choice.noLoad") : `${choice.targetTss} TSS`}` : null;
  const decisionText = state.loading ? t("todayStrip.loading") : state.unavailable ? t("todayStrip.unavailable") : session ? `${tTraining(`decision.workout.${session.current.workout}`, { defaultValue: session.current.workout })} · ${tTraining("decision.duration", { value: session.current.durationMin })}` : t("todayStrip.noToday");
  return <Card data-testid="H2-2-1" data-home-slot="today" data-surface="home" data-today-source={choice ? "user-choice" : "decision"} className="flex flex-col gap-3" header={<Text as="h2" variant="subtitle">{t("todayStrip.today")}</Text>}>
    {choice ? <div className="flex flex-col gap-1">
      <Text as="p" variant="bodyMedium" weight={700}>{choiceText}</Text>
      <div className="flex flex-wrap items-center gap-2">
        <Chip>{t("todayStrip.userChoice")}</Chip>
        {session && <Text as="span" variant="caption" tone="tertiary">{t("todayStrip.userChoiceOverPlan")}</Text>}
      </div>
    </div> : <Text as="p" variant="bodySmall" tone="secondary"><GlossaryText>{decisionText}</GlossaryText></Text>}
    <LocalizedLink className={buttonClass({ variant: "ghost", size: "sm" })} to={`/coach/today?sport=${discipline}`}>{t(choice ? "todayStrip.change" : "todayStrip.choose")}</LocalizedLink>
  </Card>;
}
/** 목표가 있을 때만 미래 예측을 읽는다. 현재 CTL 계산의 폴백으로 사용하지 않는다. */
function HomeGoalForecast({ uid, discipline, goalId }: { uid: string; discipline: "bike" | "run" | "swim"; goalId: string }) {
  const { t } = useTranslation("dashboard");
  const owner = `${uid}:${discipline}:${goalId}`;
  const [state, setState] = useState<{ owner: string; ctl: number } | null>(null);
  useEffect(() => {
    let active = true;
    const unsubscribe = onSnapshot(doc(firestore, "users", uid, "fitness", `projection_${discipline}`), snapshot => {
      if (!active) return;
      const data = snapshot.data();
      const ctl = data?.goalDay?.ctl;
      setState(data?.goalId === goalId && typeof ctl === "number" && Number.isFinite(ctl) ? { owner, ctl } : null);
    }, error => { if (active) setState(null); logClientError("HomeTodayStrip.projection", error); });
    return () => { active = false; unsubscribe(); };
  }, [uid, discipline, goalId, owner]);
  return state?.owner === owner ? <Text variant="caption"><GlossaryText>{t("todayStrip.goalCtl", { value: state.ctl.toFixed(1) })}</GlossaryText></Text> : null;
}
function HomeGoalSummary({ discipline, monthlyKm, monthlyFlowPercent, weeklyAverageKm }: { discipline: "bike" | "run" | "swim"; monthlyKm: number; monthlyFlowPercent?: number | null; weeklyAverageKm: number }) {
  const { user } = useAuth();
  const { t } = useTranslation("dashboard");
  const [state, setState] = useState<{ owner: string; goal: Goal | null; loading: boolean; failed?: boolean } | null>(null);
  const owner = `${user?.uid}:${discipline}`;
  useEffect(() => {
    if (!user) return;
    setState({ owner, goal: null, loading: true });
    return onSnapshot(query(collection(firestore, "goals"), where("userId", "==", user.uid), where("status", "==", "active"), where("discipline", "==", discipline), limit(1)), (snapshot) => {
      setState({ owner, goal: snapshot.docs.length ? { id: snapshot.docs[0]!.id, ...snapshot.docs[0]!.data() } as Goal : null, loading: false });
    }, (error) => { logClientError("HomeTodayStrip.goals", error); setState({ owner, goal: null, loading: false, failed: true }); });
  }, [user, discipline, owner]);
  const current = state?.owner === owner ? state : null;
  const goal = current?.goal;
  const days = goal ? Math.ceil(((goal.targetDate ?? goal.eventDate) - Date.now()) / 86400000) : NaN;
  return <Card padding="compact" data-home-slot="goal" header={<div className="flex items-center justify-between gap-2" style={{ width: "100%" }}>
    <Text as="h2" variant="subtitle">{current && !current.loading && !current.failed && !goal && weeklyAverageKm > 0 ? discipline === "run" ? <>{t("todayStrip.monthFlow")} · {t(getDisciplineLabelKey(discipline))}</> : t("todayStrip.monthFlowAllTitle") : <>{t("todayStrip.goal")} · {t(getDisciplineLabelKey(discipline))}</>}</Text>
    {(goal || current?.failed) && <LocalizedLink className={buttonClass({ variant: "ghost", size: "sm" })} to={`/coach/goals?sport=${discipline}`}>{t("todayStrip.goalLink")}</LocalizedLink>}
  </div>}>
    <div data-testid="H2-3-3" className="flex flex-col gap-2">
      {!current || current.loading || current.failed ? <Text as="p" variant="bodySmall" tone="tertiary">{t(current?.failed ? "todayStrip.unavailable" : "todayStrip.loading")}</Text>
        : goal ? <>
          <Text as="p" variant="bodyMedium" weight={700} style={{ overflowWrap: "anywhere" }}>{goal.title || goal.courseName || t("todayStrip.goal")}</Text>
          <div className="flex flex-wrap items-center gap-2">
            {Number.isFinite(days) && <Chip><Text variant="caption" mono><InfoTip title={t("todayStrip.goalCountdownTitle")} content={t("todayStrip.goalCountdownHelp")} label={t("todayStrip.goalCountdownLabel")} termId="countdown">{`D${days >= 0 ? "−" : "+"}${Math.abs(days)}`}</InfoTip></Text></Chip>}
            {user && <HomeGoalForecast uid={user.uid} discipline={discipline} goalId={goal.id} />}
          </div>
        </> : weeklyAverageKm <= 0 ? <LocalizedLink className={buttonClass({ variant: "ghost", size: "sm" })} to={`/coach/goals?sport=${discipline}`}>{t("todayStrip.createGoal")}</LocalizedLink>
          : <>
            <Text variant="dataSmall" mono><GlossaryText>{t(discipline === "run" ? "todayStrip.monthFlowValue" : "todayStrip.monthFlowAllValue", { distance: Math.round(monthlyKm), percent: monthlyFlowPercent ?? "—" })}</GlossaryText></Text>
            <div className="flex flex-wrap items-center gap-2">
              <LocalizedLink className={buttonClass({ variant: "ghost", size: "sm" })} to={`/coach/analysis?sport=${discipline === "run" ? "run" : "tri"}`}>{t("todayStrip.analysisLink")}</LocalizedLink>
              <LocalizedLink className={buttonClass({ variant: "ghost", size: "sm" })} to={`/coach/goals?sport=${discipline}`}>{t("todayStrip.createGoal")}</LocalizedLink>
            </div>
          </>}
    </div>
  </Card>;
}
function HomeUpcomingEvents() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation("dashboard");
  const [state, setState] = useState<{ uid: string; events: RegisteredEvent[]; failed?: boolean } | null>(null);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void ensureAppCheckReady().then(() => httpsCallable<void, { events: RegisteredEvent[] }>(functions, "listMyRegisteredEvents")()).then((result) => {
      if (!cancelled) setState({ uid: user.uid, events: result.data.events.filter((event) => event.startTime >= Date.now()).sort((a, b) => a.startTime - b.startTime).slice(0, 3) });
    }).catch((error) => { logClientError("HomeTodayStrip.events", error); if (!cancelled) setState({ uid: user.uid, events: [], failed: true }); });
    return () => { cancelled = true; };
  }, [user]);
  const current = state?.uid === user?.uid ? state : null;
  return <Card data-testid="H2-4-1" data-home-slot="events" className="flex flex-col gap-3" header={<div className="flex items-center justify-between gap-2" style={{ width: "100%" }}><Text as="h2" variant="subtitle">{t("todayStrip.events")}</Text>{current?.failed && <LocalizedLink className={buttonClass({ variant: "ghost", size: "sm" })} to="/explore/events">{t("todayStrip.findEvents")}</LocalizedLink>}</div>}>
    {!current ? <Text variant="bodySmall">{t("todayStrip.loading")}</Text> : current.failed ? <Text variant="bodySmall">{t("todayStrip.unavailable")}</Text> : current.events.length ? current.events.map((event) => <LocalizedLink className={buttonClass({ variant: "ghost", size: "sm" })} key={event.eventId} to={`/event/${event.eventId}`}><Text variant="bodySmall">{event.name} · {new Date(event.startTime).toLocaleDateString(i18n.language)}</Text></LocalizedLink>) : <Text variant="bodySmall" tone="tertiary">{t("todayStrip.noEvents")}</Text>}
  </Card>;
}
export default function HomeTodayStrip({ discipline, conditionDiscipline = discipline, weeklyDiscipline = conditionDiscipline, fitness, conditionSummary, thresholdSummary, weeklyDetails, weeklySummary, monthlyKm, monthlyFlowPercent, runningRecap, weeklyAverageKm, mobile, guidance, secondaryDetails }: {
  discipline: "bike" | "run" | "swim"; conditionDiscipline?: "bike" | "run" | "swim" | "tri"; weeklyDiscipline?: "bike" | "run" | "swim" | "tri"; fitness: { ctl: number; atl: number; tsb: number } | null;
  conditionSummary?: ReactNode; thresholdSummary?: ReactNode; weeklyDetails: ReactNode; weeklySummary: ReactNode; runningRecap?: ReactNode; monthlyFlowPercent?: number | null; monthlyKm: number; weeklyAverageKm: number; mobile?: boolean; guidance?: ReactNode; secondaryDetails?: ReactNode;
}) {
  const { user } = useAuth();
  const { t } = useTranslation("dashboard");
  if (!user || user.isAnonymous) return null;
  const conditionSlot = (
    <Card data-testid="H2-1-1" data-home-slot="condition" padding="compact" header={<div className="flex items-center justify-between gap-2" style={{ width: "100%" }}>
      <Text as="h2" variant="subtitle">{t(getDisciplineLabelKey(conditionDiscipline))} · {t("todayStrip.condition")}</Text>
      <LocalizedLink className={buttonClass({ variant: "ghost", size: "sm" })} to={`/coach/condition?sport=${conditionDiscipline}`}>{t("todayStrip.conditionLink")}</LocalizedLink>
    </div>}>
      <div className="flex flex-col gap-1">
        {conditionSummary}
        {(fitness || !conditionSummary) && <Text as="p" variant="bodySmall" mono><GlossaryText>{fitness && fitness.ctl > 0 ? `CTL ${fitness.ctl.toFixed(1)} · ATL ${fitness.atl.toFixed(1)} · TSB ${fitness.tsb.toFixed(1)}` : t("sidebar.fitness.insufficient")}</GlossaryText></Text>}
        {!mobile && thresholdSummary}
      </div>
    </Card>
  );
  const weekSlot = mobile && <Card data-testid="H2-3-1" data-home-slot="week" padding="compact" header={<div className="flex flex-wrap items-center justify-between gap-2" style={{ width: "100%" }}>
      <Text as="h2" variant="subtitle" style={{ flex: "1 0 auto", maxWidth: "100%", wordBreak: "keep-all" }}>{t("todayStrip.weekTitle", { sport: t(getDisciplineLabelKey(weeklyDiscipline)) })}</Text>
      <LocalizedLink className={buttonClass({ variant: "ghost", size: "sm" })} to={`/athlete/me/activities?sport=${weeklyDiscipline === "tri" ? "all" : weeklyDiscipline}`}>{t("todayStrip.week")}</LocalizedLink>
    </div>}><div className="flex flex-col gap-2">{weeklySummary}</div></Card>;
  const goalSlot = <HomeGoalSummary discipline={discipline} monthlyFlowPercent={monthlyFlowPercent} monthlyKm={monthlyKm} weeklyAverageKm={weeklyAverageKm} />;
  const recapSlot = runningRecap && <div data-testid="H2-3-4">{runningRecap}</div>;
  const weeklyDetailSlot = weeklyDetails && <div className="space-y-3" data-testid="H2-3-2">{weeklyDetails}</div>;
  const primarySlots = mobile ? <>{weekSlot}<HomeTodaySummary discipline={discipline} />{goalSlot}{conditionSlot}{recapSlot}</> : discipline === "run" ? <>
    {conditionSlot}<HomeTodaySummary discipline={discipline} />{goalSlot}{recapSlot}{weeklyDetailSlot}
  </> : <>
    {conditionSlot}<HomeTodaySummary discipline={discipline} />{weeklyDetailSlot}{recapSlot}{goalSlot}
  </>;
  const secondarySlots = <>
    {secondaryDetails}
    <HomeUpcomingEvents />
    {guidance && <Card data-testid="H2-5-1" data-home-slot="guidance">{guidance}</Card>}
  </>;
  return <div className={mobile ? "space-y-2" : "space-y-3"} data-testid="home-today-strip">{primarySlots}{mobile ? <details><summary>{t("todayStrip.more")}</summary><div className="space-y-3">{secondarySlots}</div></details> : secondarySlots}</div>;
}
