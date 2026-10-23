import PlanGoalLoadSummary from "../features/training/plan/PlanGoalLoadSummary";
import { goalLoadScope } from "../features/training/plan/planScope";
import { usePlanLoadComparison } from "../features/training/plan/usePlanLoadComparison";
import { useAuth } from "../contexts/AuthContext";
import { goalCountdown } from "../utils/goalCountdown";
import { formatPlanGoalTitle } from "../features/training/plan/planDisplay";
import { useMobile } from "../hooks/useMobile";
import { isSportUiEnabled } from "../config/sportFeatures";
import InfoTip from "../components/InfoTip";
import GlossaryText from "../components/common/GlossaryText";
import { GoalSourceNotice } from "../components/training/GoalInputNotice";
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
import { Button, buttonClass, Card, Text } from "../theme/components";

export default function GoalHub({ wizard }: { wizard: React.ReactNode }) {
  const { t, i18n } = useTranslation("training");
  const [params] = useSearchParams();
  const model = usePlanModel(isSportUiEnabled(params.get("sport") ?? "bike") ? params.get("sport") : "bike");
  const { user, goal, discipline } = model;
  const { profile } = useAuth();
  const goalReady = !model.loading && model.loadError == null && model.freshLoaded !== false;
  const scope = goalLoadScope(model.weeks, goal, Date.now());
  const load = usePlanLoadComparison({ uid: user?.uid, discipline, weeks: model.weeks, range: scope.range, ftp: profile?.ftp,
    enabled: goalReady && model.goalMatchesDiscipline && !!user && !user.isAnonymous && !!goal && scope.valid });
  const mobile = useMobile();
  const rawTitle = goal?.title || goal?.courseName || "";
  const title = formatPlanGoalTitle(rawTitle);
  const targetMs = goal?.targetDate ?? goal?.eventDate;
  const displayDate = targetMs != null && Number.isFinite(new Date(targetMs).getTime()) ? new Date(targetMs) : null;
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
  const choose = (kind: "event" | "climb") => { if (goalReady) setChoice({ sport: discipline, kind }); };
  const selected = choice?.sport === discipline ? choice.kind : null;
  return <div className="site-shell">
    <header className="coach-page-header" data-testid="K3-0"><Text as="h1" variant="pageTitle" data-testid="K3-0-1">{t("goalHub.title")}</Text><div data-testid="K3-0-2"><DisciplineTabs value={discipline} disabledKeys={["swim"]} /></div></header>
    {!user || user.isAnonymous ? <Card data-testid="K3-2-5"><Text>{t("goals.loginRequiredDescription")}</Text><CoachSignInButton /></Card> : <>
      {!model.loadError && !goalReady && <Text role="status">{t("climbGoal.loading")}</Text>}
      {model.loadError != null && <div role="alert"><Text as="p">{t("goalHub.readError")}</Text><Button onClick={model.retryLoad}>{t("goalHub.retry")}</Button></div>}
      {goal && <Card data-testid="K3-1">
        {model.cacheHit && model.freshLoaded === false && <Text as="p">{t("embeddedStatus.cached", { ns: "common" })}</Text>}
        <GoalSourceNotice goal={goal} discipline={discipline} />
        <div data-testid="K3-1-1"><Text as="h2" variant="title" style={{ overflowWrap: "anywhere" }}>{mobile ? title.name : rawTitle}</Text>
          {mobile && title.meta && <><Text as="p" variant="bodySmall" tone="secondary">{title.meta}</Text><InfoTip activation="click" title={t("goalHub.originalTitle")} label={t("goalHub.originalTitle")} content={rawTitle}>{t("goalHub.originalTitle")}</InfoTip></>}<Text>{t(`goalHub.goalType.${goal.runProgram ? "program" : goal.goalType === "climb" ? "climb" : goal.eventType === "completion" ? "completion" : goal.eventType === "time" ? "time" : "race"}`)} · {displayDate?.toLocaleDateString(i18n.resolvedLanguage ?? i18n.language, { timeZone: "Asia/Seoul" })} · {goalCountdown(targetMs)}{scope.expired ? ` · ${t("goalLoad.expiredBadge")}` : ""}</Text><Text>{goal.targetDurationMin ? t("goalHub.minutes", { value: goal.targetDurationMin }) : null}{goal.target?.climbDurationMin ? <GlossaryText>{`${t("goalHub.minutes", { value: goal.target.climbDurationMin })} · ${goal.target.targetWkg ?? "—"} W/kg`}</GlossaryText> : null}</Text></div>
        <div data-testid="K3-1-2" style={{ marginBlock: "var(--space-4)" }}>
          {goalReady && model.goalMatchesDiscipline ? <PlanGoalLoadSummary scope={scope} load={load} /> : <Text>—</Text>}
          {goalDay && <Text>{t("goalHub.goalDayEstimate")} · <GlossaryText>{`CTL ${goalDay.ctl.toFixed(1)} · TSB ${goalDay.tsb.toFixed(1)}`}</GlossaryText></Text>}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-3)" }}>
        <LocalizedLink data-testid="K3-1-3" className={buttonClass({ variant: "primary" })} to={`/coach/plan?sport=${discipline}`}>{t("goalHub.plan")}</LocalizedLink>
        <Button data-testid="K3-1-4" disabled={!goalReady} onClick={() => types.current?.scrollIntoView?.({ behavior: "smooth" })}>{t("goalHub.change")}</Button>
        {!goal.runProgram && <Button data-testid="K3-1-5" variant="ghost" disabled={!goalReady} onClick={() => void abandon()}>{t("buttons.abandonGoal")}</Button>}
        </div>
        {error && <Text role="alert">{t("errors.abandonError")}</Text>}
      </Card>}
      <div ref={types} data-testid="K3-2"><Text as="h2" variant="title">{t(goal ? "goalHub.other" : "goalHub.new")}</Text>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
        <Button data-testid={discipline === "bike" ? "K3-2-1" : discipline === "run" ? "K3-2-3" : "K3-2-4"} disabled={!goalReady} onClick={() => choose("event")}>{t(`goalHub.types.${discipline}`)}</Button>
        {discipline === "bike" && <Button data-testid="K3-2-2" disabled={!goalReady} onClick={() => choose("climb")}>{t("climbGoal.title")}</Button>}
        {discipline === "run" && !goal?.runProgram && <LocalizedLink data-testid="K3-2-program" to="/coach/plan?sport=run">{t("goalHub.program")}</LocalizedLink>}
        </div>
      </div>
      {selected && goal && <Text role="status">{t("goalHub.replaces", { name: goal.title || goal.courseName })}</Text>}
      {goalReady && selected === "event" && <section data-testid="K3-3">{wizard}</section>}
      {goalReady && selected === "climb" && <section data-testid="K3-4"><ClimbGoalSetupPage embedded /></section>}
    </>}
  </div>;
}
