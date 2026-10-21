import "./HomeTodayStrip.css";
import GlossaryText from "../common/GlossaryText";
import { useEffect, useState, type ReactNode } from "react";
import { collection, doc, limit, onSnapshot, query, where } from "firebase/firestore";
import { useTranslation } from "react-i18next";
import type { Goal } from "@shared/types/goal";
import { firestore } from "../../services/firebase";
import { useAuth } from "../../contexts/AuthContext";
import { useTodayTrainingDecision } from "../../hooks/useTodayTrainingDecision";
import { primaryEffectiveSession } from "../../features/trainingDecision/decisionPresentation";
import { getRuntimeConfig } from "../../services/runtimeConfig";
import { LocalizedLink } from "../LocalizedLink";
import { Card, Chip, Text, buttonClass } from "../../theme/components";
import { logClientError } from "../../services/errorLogger";
import InfoTip from "../InfoTip";
import HomeUpcomingEvents from "./HomeUpcomingEvents";
import { getDisciplineLabelKey } from "../../utils/disciplineFilter";

function HomeTodaySummary({ discipline }: { discipline: "bike" | "run" | "swim" }) {
  const { user } = useAuth();
  const { t } = useTranslation("dashboard");
  const { t: tTraining } = useTranslation("training");
  const state = useTodayTrainingDecision(user?.uid, discipline);
  if (!getRuntimeConfig().trainingDecisionEnabled) return null;
  const session = state.decision && state.decision.scheduledProjectionValidUntil > Date.now() ? primaryEffectiveSession(state.decision) : null;
  return <Card data-testid="H2-2-1" data-home-slot="today" data-surface="home" className="flex flex-col gap-3" header={<Text as="h2" variant="subtitle">{t("todayStrip.today")}</Text>}>
    <Text as="p" variant="bodySmall" tone="secondary"><GlossaryText>{state.loading ? t("todayStrip.loading") : state.unavailable ? t("todayStrip.unavailable") : session ? `${tTraining(`decision.workout.${session.current.workout}`, { defaultValue: session.current.workout })} · ${tTraining("decision.duration", { value: session.current.durationMin })}` : t("todayStrip.noToday")}</GlossaryText></Text>
    <LocalizedLink className={buttonClass({ variant: "ghost", size: "sm" })} to={`/coach/today?sport=${discipline}`}>{t("todayStrip.choose")}</LocalizedLink>
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
  return <Card padding="card" data-home-slot="goal" header={<div className="home-today-header">
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
export default function HomeTodayStrip({ discipline, conditionDiscipline = discipline, fitness, conditionSummary, thresholdSummary, weeklyDetails, monthlyKm, monthlyFlowPercent, runningRecap, weeklyAverageKm, mobile, guidance, secondaryDetails }: {
  discipline: "bike" | "run" | "swim"; conditionDiscipline?: "bike" | "run" | "swim" | "tri"; fitness: { ctl: number; atl: number; tsb: number } | null;
  conditionSummary?: ReactNode; thresholdSummary?: ReactNode; weeklyDetails: ReactNode; runningRecap?: ReactNode; monthlyFlowPercent?: number | null; monthlyKm: number; weeklyAverageKm: number; mobile?: boolean; guidance?: ReactNode; secondaryDetails?: ReactNode;
}) {
  const { user } = useAuth();
  const { t } = useTranslation("dashboard");
  if (!user || user.isAnonymous || mobile) return null;
  const conditionSlot = (
    <Card data-testid="H2-1-1" data-home-slot="condition" padding="card" header={<div className="home-today-header">
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
  const goalSlot = <HomeGoalSummary discipline={discipline} monthlyFlowPercent={monthlyFlowPercent} monthlyKm={monthlyKm} weeklyAverageKm={weeklyAverageKm} />;
  const recapSlot = runningRecap && <div data-testid="H2-3-4">{runningRecap}</div>;
  const weeklyDetailSlot = weeklyDetails && <div className="home-today-weekly" data-testid="H2-3-2">{weeklyDetails}</div>;
  const primarySlots = discipline === "run" ? <>
    {conditionSlot}<HomeTodaySummary discipline={discipline} />{goalSlot}{recapSlot}{weeklyDetailSlot}
  </> : <>
    {conditionSlot}<HomeTodaySummary discipline={discipline} />{weeklyDetailSlot}{recapSlot}{goalSlot}
  </>;
  const secondarySlots = <>
    {secondaryDetails}
    <HomeUpcomingEvents />
    {guidance && <Card data-testid="H2-5-1" data-home-slot="guidance">{guidance}</Card>}
  </>;
  return <div className="home-today-strip" data-testid="home-today-strip">{primarySlots}{secondarySlots}</div>;
}
