import type { FitnessProjection } from "@shared/types/goal";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { usePlanModel } from "../hooks/usePlanModel";
import { useDialog } from "../contexts/DialogContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { useLocalizedNavigate } from "../hooks/useLocalizedNavigate";
import { LocalizedLink } from "../components/LocalizedLink";
import DisciplineTabs from "../components/redesign/DisciplineTabs";
import CoachSignInButton from "./coach/CoachSignInButton";
import ClimbGoalSetupPage from "./ClimbGoalSetupPage";
import { Button, Card, Text } from "../theme/components";

export default function GoalHub({ wizard }: { wizard: React.ReactNode }) {
  const { t } = useTranslation("training");
  const [params] = useSearchParams();
  const model = usePlanModel(params.get("sport"));
  const { user, goal, discipline } = model;
  const [choice, setChoice] = useState<{ sport: string; kind: "event" | "climb" } | null>(null);
  const [error, setError] = useState(false);
  const types = useRef<HTMLDivElement>(null);
  const dialog = useDialog();
  const { firestore } = useFirebaseServices();
  const navigate = useLocalizedNavigate();
  const projectionOwner = `${user?.uid ?? ""}:${discipline}:${goal?.id ?? ""}`;
  const [projection, setProjection] = useState<{ owner: string; value: FitnessProjection } | null>(null);
  useEffect(() => {
    if (!user || user.isAnonymous || !goal) return;
    let cancelled = false;
    void getDoc(doc(firestore, "users", user.uid, "fitness", `projection_${discipline}`)).then(snapshot => {
      const data = snapshot.exists() ? snapshot.data() as FitnessProjection : null;
      if (!cancelled) setProjection(data && data.goalId === goal.id && (!data.discipline || data.discipline === discipline)
        && Number.isFinite(data.goalDay?.ctl) && Number.isFinite(data.goalDay?.tsb) ? { owner: projectionOwner, value: data } : null);
    }).catch(() => { if (!cancelled) setProjection(null); });
    return () => { cancelled = true; };
  }, [user, goal, discipline, firestore, projectionOwner]);
  const goalDay = projection?.owner === projectionOwner ? projection.value.goalDay : null;
  useEffect(() => {
    if (params.get("new") === "1") types.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [params]);
  const abandon = async () => {
    if (!goal || goal.runProgram || !await dialog.confirm(t("confirmations.abandonConfirm"), { destructive: true })) return;
    try {
      await updateDoc(doc(firestore, "goals", goal.id), { status: "abandoned", updatedAt: Date.now() });
      navigate("/");
    } catch { setError(true); }
  };
  const choose = (kind: "event" | "climb") => setChoice({ sport: discipline, kind });
  const selected = choice?.sport === discipline ? choice.kind : null;
  return <div className="site-shell">
    <header data-testid="K3-0"><Text as="h1" variant="pageTitle" data-testid="K3-0-1">{t("goalHub.title")}</Text><div data-testid="K3-0-2"><DisciplineTabs value={discipline} /></div></header>
    {!user || user.isAnonymous ? <Card data-testid="K3-2-5"><Text>{t("goals.loginRequiredDescription")}</Text><CoachSignInButton /></Card> : <>
      {model.loading && <Text role="status">{t("climbGoal.loading")}</Text>}
      {model.loadError != null && <Button onClick={model.retryLoad}>{t("goalHub.retry")}</Button>}
      {goal && <Card data-testid="K3-1">
        <div data-testid="K3-1-1"><Text as="h2" variant="title">{goal.title || goal.courseName}</Text><Text>{t(`goalHub.goalType.${goal.runProgram ? "program" : goal.goalType === "climb" ? "climb" : goal.eventType === "completion" ? "completion" : goal.eventType === "time" ? "time" : "race"}`)} · {model.goalDate?.toLocaleDateString()} · D-{Math.max(0, model.daysLeft)}</Text><Text>{goal.targetDurationMin ? t("goalHub.minutes", { value: goal.targetDurationMin }) : null}{goal.target?.climbDurationMin ? `${t("goalHub.minutes", { value: goal.target.climbDurationMin })} · ${goal.target.targetWkg ?? "—"} W/kg` : null}</Text></div>
        <div data-testid="K3-1-2"><progress max={100} value={model.progress} aria-label={t("goalHub.progress")} />{goalDay && <Text>CTL {goalDay.ctl.toFixed(1)} · TSB {goalDay.tsb.toFixed(1)}</Text>}</div>
        <LocalizedLink data-testid="K3-1-3" to={`/coach/plan?sport=${discipline}`}>{t("goalHub.plan")}</LocalizedLink>
        <Button data-testid="K3-1-4" onClick={() => types.current?.scrollIntoView?.({ behavior: "smooth" })}>{t("goalHub.change")}</Button>
        {goal.runProgram ? <LocalizedLink data-testid="K3-1-6" to="/coach/plan?sport=run">{t("goalHub.program")}</LocalizedLink> : <Button data-testid="K3-1-5" onClick={() => void abandon()}>{t("buttons.abandonGoal")}</Button>}
        {error && <Text role="alert">{t("errors.abandonError")}</Text>}
      </Card>}
      <div ref={types} data-testid="K3-2"><Text as="h2" variant="title">{t(goal ? "goalHub.other" : "goalHub.new")}</Text>
        <Button data-testid={discipline === "bike" ? "K3-2-1" : discipline === "run" ? "K3-2-3" : "K3-2-4"} onClick={() => choose("event")}>{t(`goalHub.types.${discipline}`)}</Button>
        {discipline === "bike" && <Button data-testid="K3-2-2" onClick={() => choose("climb")}>{t("climbGoal.title")}</Button>}
        {discipline === "run" && <LocalizedLink data-testid="K3-2-3" to="/coach/plan?sport=run">{t("goalHub.program")}</LocalizedLink>}
      </div>
      {selected && goal && <Text role="status">{t("goalHub.replaces", { name: goal.title || goal.courseName })}</Text>}
      {selected === "event" && <section data-testid="K3-3">{wizard}</section>}
      {selected === "climb" && <section data-testid="K3-4"><ClimbGoalSetupPage /></section>}
    </>}
  </div>;
}
