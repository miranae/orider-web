import { useEffect, useState, type ReactNode } from "react";
import { collection, doc, limit, onSnapshot, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useTranslation } from "react-i18next";
import type { Goal } from "@shared/types/goal";
import { firestore, functions, ensureAppCheckReady } from "../../services/firebase";
import { useAuth } from "../../contexts/AuthContext";
import { useTodayTrainingDecision } from "../../hooks/useTodayTrainingDecision";
import { primaryEffectiveSession } from "../../features/trainingDecision/decisionPresentation";
import { getRuntimeConfig } from "../../services/runtimeConfig";
import { LocalizedLink } from "../LocalizedLink";
import { Card, Text } from "../../theme/components";
import { logClientError } from "../../services/errorLogger";

interface RegisteredEvent { eventId: string; name: string; startTime: number }
function HomeTodaySummary({ discipline }: { discipline: "bike" | "run" | "swim" }) {
  const { user } = useAuth();
  const { t } = useTranslation("dashboard");
  const { t: tTraining } = useTranslation("training");
  const state = useTodayTrainingDecision(user?.uid, discipline);
  if (!getRuntimeConfig().trainingDecisionEnabled) return null;
  const session = state.decision && state.decision.scheduledProjectionValidUntil > Date.now() ? primaryEffectiveSession(state.decision) : null;
  return <Card data-testid="H2-2-1" data-home-slot="today" data-surface="home"><Text as="h2" variant="subtitle">{t("todayStrip.today")}</Text>
    <Text as="p" tone="secondary">{state.loading ? t("todayStrip.loading") : session ? `${tTraining(`decision.workout.${session.current.workout}`, { defaultValue: session.current.workout })} · ${tTraining("decision.duration", { value: session.current.durationMin })}` : t("todayStrip.noToday")}</Text>
    <LocalizedLink to={`/coach/today?sport=${discipline}`}>{t("todayStrip.choose")}</LocalizedLink>
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
  return state?.owner === owner ? <Text as="p">{t("todayStrip.goalCtl", { value: state.ctl.toFixed(1) })}</Text> : null;
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
  if (!current || current.loading || current.failed) return <Text tone="tertiary">{t(current?.failed ? "todayStrip.unavailable" : "todayStrip.loading")}</Text>;
  if (current.goal) {
    const goal = current.goal;
    const days = Math.ceil(((goal.targetDate ?? goal.eventDate) - Date.now()) / 86400000);
    return <LocalizedLink to={`/coach/goals?sport=${discipline}`}><Text as="p" weight={700}>{goal.title || goal.courseName || t("todayStrip.goal")}</Text>{Number.isFinite(days) && <Text>D{days >= 0 ? "−" : "+"}{Math.abs(days)}</Text>}{user && <HomeGoalForecast uid={user.uid} discipline={discipline} goalId={goal.id} />}</LocalizedLink>;
  }
  if (weeklyAverageKm <= 0) return <LocalizedLink to={`/coach/goals?sport=${discipline}`}>{t("todayStrip.createGoal")}</LocalizedLink>;
  return <LocalizedLink to={`/coach/analysis?sport=${discipline}`}><Text as="p">{t("todayStrip.monthFlow")}</Text><Text>{t("todayStrip.monthFlowValue", { distance: Math.round(monthlyKm), percent: monthlyFlowPercent ?? "—" })}</Text></LocalizedLink>;
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
  return <Card data-testid="H2-4-1" data-home-slot="events"><Text as="h2" variant="subtitle">{t("todayStrip.events")}</Text>
    {!current ? <Text>{t("todayStrip.loading")}</Text> : current.failed ? <Text>{t("todayStrip.unavailable")}</Text> : current.events.length ? current.events.map((event) => <LocalizedLink className="block" key={event.eventId} to={`/event/${event.eventId}`}><Text>{event.name} · {new Date(event.startTime).toLocaleDateString(i18n.language)}</Text></LocalizedLink>) : <Text tone="tertiary">{t("todayStrip.noEvents")}</Text>}
  </Card>;
}
export default function HomeTodayStrip({ discipline, conditionDiscipline = discipline, fitness, weeklyDetails, weeklySummary, monthlyKm, monthlyFlowPercent, runningRecap, weeklyAverageKm, mobile, guidance }: {
  discipline: "bike" | "run" | "swim"; conditionDiscipline?: "bike" | "run" | "swim" | "tri"; fitness: { ctl: number; atl: number; tsb: number } | null;
  weeklyDetails: ReactNode; weeklySummary: ReactNode; runningRecap?: ReactNode; monthlyFlowPercent?: number | null; monthlyKm: number; weeklyAverageKm: number; mobile?: boolean; guidance?: ReactNode;
}) {
  const { user } = useAuth();
  const { t } = useTranslation("dashboard");
  if (!user || user.isAnonymous) return null;
  const slots = [
    <Card key="condition" data-testid="H2-1-1" data-home-slot="condition"><Text as="h2" variant="subtitle">{t("todayStrip.condition")}</Text><Text as="p">{fitness && fitness.ctl > 0 ? `CTL ${fitness.ctl.toFixed(1)} · ATL ${fitness.atl.toFixed(1)} · TSB ${fitness.tsb.toFixed(1)}` : t("sidebar.fitness.insufficient")}</Text><LocalizedLink to={`/coach/condition?sport=${conditionDiscipline}`}>{t("todayStrip.conditionLink")}</LocalizedLink></Card>,
    <HomeTodaySummary key="today" discipline={discipline} />,
    <Card key="week" data-testid="H2-3-1" data-home-slot="week"><LocalizedLink to={`/athlete/me/activities?sport=${discipline}`}><Text as="h2" variant="subtitle">{t("todayStrip.week")}</Text>{weeklySummary}</LocalizedLink><div data-testid="H2-3-2">{weeklyDetails}</div>{discipline === "run" ? <div data-testid="H2-3-4">{runningRecap}</div> : <div data-testid="H2-3-3"><HomeGoalSummary discipline={discipline} monthlyFlowPercent={monthlyFlowPercent} monthlyKm={monthlyKm} weeklyAverageKm={weeklyAverageKm} /></div>}</Card>,
    <HomeUpcomingEvents key="events" />,
    guidance ? <Card key="guidance" data-testid="H2-5-1" data-home-slot="guidance">{guidance}</Card> : null,
  ];
  return <div className="space-y-3" data-testid="home-today-strip">{slots.slice(0, 3)}{mobile ? <details><summary>{t("todayStrip.more")}</summary><div className="space-y-3">{slots.slice(3)}</div></details> : slots.slice(3)}</div>;
}
