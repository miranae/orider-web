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
import { notifyPlanGoalChanged } from "../embedded/planGoalChanges";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { usePlanModel } from "../hooks/usePlanModel";
import { useDialog } from "../contexts/DialogContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { logClientError } from "../services/errorLogger";
import { useLocalizedNavigate } from "../hooks/useLocalizedNavigate";
import { LocalizedLink } from "../components/LocalizedLink";
import DisciplineTabs from "../components/redesign/DisciplineTabs";
import CoachSignInButton from "./coach/CoachSignInButton";
import ClimbGoalSetupPage from "./ClimbGoalSetupPage";
import { Button, buttonClass, Card, IconButton, Text } from "../theme/components";
import { ICON_SIZE } from "../theme/tokens/icon";
import { Pencil } from "lucide-react";
import GoalActionsMenu from "./GoalActionsMenu";
import { MobileGoalActions, MobileGoalCard, MobileGoalTypeRows } from "./GoalHubMobile";

export default function GoalHub({ wizard }: { wizard: React.ReactNode }) {
  const { t, i18n } = useTranslation("training");
  const [params] = useSearchParams();
  const model = usePlanModel(isSportUiEnabled(params.get("sport") ?? "bike") ? params.get("sport") : "bike");
  const { user, discipline } = model;
  // 이 종목 목표가 없으면 다른 종목의 진행 중 목표를 호환용으로 받아 온다(readPreferredActiveGoal).
  // 사이클 탭에 수영 목표가 뜨고 "수영 목표를 대체합니다"라고 안내하던 결함 — 종목이 맞는 목표만 이 탭의 목표로 쓴다.
  const goal = model.goalMatchesDiscipline ? model.goal : null;
  const { profile } = useAuth();
  const goalReady = !model.loading && model.loadError == null && model.freshLoaded !== false;
  const scope = goalLoadScope(model.weeks, goal, Date.now());
  const mobile = useMobile();
  // 휴대폰은 목표 부하 요약·목표일 CTL/TSB 를 그리지 않으므로 조회도 하지 않는다.
  const load = usePlanLoadComparison({ uid: user?.uid, discipline, weeks: model.weeks, range: scope.range, ftp: profile?.ftp,
    enabled: !mobile && goalReady && model.goalMatchesDiscipline && !!user && !user.isAnonymous && !!goal && scope.valid });
  const rawTitle = goal?.title || goal?.courseName || "";
  const title = formatPlanGoalTitle(rawTitle);
  const targetMs = goal?.targetDate ?? goal?.eventDate;
  const displayDate = targetMs != null && Number.isFinite(new Date(targetMs).getTime()) ? new Date(targetMs) : null;
  const [choice, setChoice] = useState<{ sport: string; kind: "event" | "climb" } | null>(null);
  const [error, setError] = useState(false);
  const [changing, setChanging] = useState(false);
  const types = useRef<HTMLDivElement>(null);
  const dialog = useDialog();
  const services = useFirebaseServices();
  const { firestore } = services;
  const navigate = useLocalizedNavigate();
  const projectionOwner = `${user?.uid ?? ""}:${discipline}:${goal?.id ?? ""}`;
  const [projection, setProjection] = useState<{ owner: string; value: FitnessProjection } | null>(null);
  useEffect(() => {
    if (mobile || !user || user.isAnonymous || !goal) return;
    let cancelled = false;
    const viewer = services.auth.currentUser;
    void getDoc(doc(firestore, "users", user.uid, "fitness", `projection_${discipline}`)).then(snapshot => {
      const data = snapshot.exists() ? snapshot.data() as FitnessProjection : null;
      if (!cancelled) setProjection(data && data.goalId === goal.id && (!data.discipline || data.discipline === discipline)
        && Number.isFinite(data.goalDay?.ctl) && Number.isFinite(data.goalDay?.tsb) ? { owner: projectionOwner, value: data } : null);
    }).catch(error => {
      logClientError("GoalHub.loadProjection", error, { discipline, goalId: goal.id }, services, viewer, cancelled ? "superseded" : "");
      if (!cancelled) setProjection(null);
    });
    return () => { cancelled = true; };
  }, [mobile, user, goal, discipline, firestore, projectionOwner, services]);
  const goalDay = projection?.owner === projectionOwner ? projection.value.goalDay : null;
  useEffect(() => {
    if (params.get("new") !== "1") return;
    // 휴대폰은 유형 목록이 "목표 변경" 아래 접혀 있으므로 펼친 뒤 이동한다.
    setChanging(true);
    requestAnimationFrame(() => types.current?.scrollIntoView?.({ behavior: "smooth" }));
  }, [params]);
  const abandon = async () => {
    if (!goal || goal.runProgram || !await dialog.confirm(t("confirmations.abandonConfirm"), { destructive: true })) return;
    try {
      await updateDoc(doc(firestore, "goals", goal.id), { status: "abandoned", updatedAt: Date.now() });
      if (user) notifyPlanGoalChanged(user.uid, discipline, i18n.resolvedLanguage ?? i18n.language);
      navigate("/");
    } catch { setError(true); }
  };
  const choose = (kind: "event" | "climb") => { if (goalReady) setChoice({ sport: discipline, kind }); };
  const selected = choice?.sport === discipline ? choice.kind : null;
  return <div className="site-shell">
    <header className="coach-page-header" data-testid="K3-0"><Text as="h1" variant="pageTitle" data-testid="K3-0-1">{t("goalHub.title")}</Text><div data-testid="K3-0-2"><DisciplineTabs value={discipline} disabledKeys={["swim"]} /></div></header>
    {!user || user.isAnonymous ? <Card data-testid="K3-2-5"><Text>{t("goals.loginRequiredDescription")}</Text><CoachSignInButton /></Card> : <>
      {/* 캐시로 목표 카드를 먼저 그렸으면 위에 로딩 줄을 끼워 카드를 밀었다 당기지 않는다(진입 때 화면이 깜박였다). */}
      {!model.loadError && !goalReady && !goal && <Text role="status">{t("climbGoal.loading")}</Text>}
      {model.loadError != null && <div role="alert"><Text as="p">{t("goalHub.readError")}</Text><Button size="sm" onClick={model.retryLoad}>{t("goalHub.retry")}</Button></div>}
      {goal && mobile && <MobileGoalCard goal={goal} title={title.name} meta={title.meta ?? undefined}
        dateLabel={displayDate?.toLocaleDateString(i18n.resolvedLanguage ?? i18n.language, { timeZone: "Asia/Seoul" }) ?? null}
        countdown={goalCountdown(targetMs)} cached={!!model.cacheHit && model.freshLoaded === false}
        weeks={model.weeks} discipline={discipline} goalReady={goalReady} error={error} />}
      {goal && mobile && <MobileGoalActions goalReady={goalReady} changing={changing} onToggleChange={() => setChanging(open => !open)}
        onAbandon={() => void abandon()} canAbandon={!goal.runProgram} />}
      {mobile && (!goal || changing) && <MobileGoalTypeRows listRef={types} discipline={discipline} goalReady={goalReady}
        hasRunProgram={!!goal?.runProgram} onChoose={choose} />}
      {goal && !mobile && <Card data-testid="K3-1">
        {model.cacheHit && model.freshLoaded === false && <Text as="p">{t("embeddedStatus.cached", { ns: "common" })}</Text>}
        <GoalSourceNotice goal={goal} discipline={discipline} />
        {/* 목표 변경은 제목 옆 연필 아이콘, 드문 목표 포기는 ⋯ 메뉴(확인 대화 유지)로 둔다. */}
        <div data-testid="K3-1-1"><div className="flex items-start gap-2">
          <Text as="h2" variant="title" className="min-w-0 flex-1" style={{ overflowWrap: "anywhere" }}>{mobile ? title.name : rawTitle}</Text>
          <IconButton data-testid="K3-1-4" size="sm" variant="ghost" disabled={!goalReady} aria-label={t("goalHub.change")} title={t("goalHub.change")}
            icon={<Pencil size={ICON_SIZE.md} />} onClick={() => types.current?.scrollIntoView?.({ behavior: "smooth" })} />
          {!goal.runProgram && <GoalActionsMenu label={t("goalHub.moreActions")} disabled={!goalReady}
            items={[{ id: "K3-1-5", label: t("buttons.abandonGoal"), danger: true, onSelect: abandon }]} />}
        </div>
          {mobile && title.meta && <><Text as="p" variant="bodySmall" tone="secondary">{title.meta}</Text><InfoTip activation="click" title={t("goalHub.originalTitle")} label={t("goalHub.originalTitle")} content={rawTitle}>{t("goalHub.originalTitle")}</InfoTip></>}<Text>{t(`goalHub.goalType.${goal.runProgram ? "program" : goal.goalType === "climb" ? "climb" : goal.eventType === "completion" ? "completion" : goal.eventType === "time" ? "time" : "race"}`)} · {displayDate?.toLocaleDateString(i18n.resolvedLanguage ?? i18n.language, { timeZone: "Asia/Seoul" })} · {goalCountdown(targetMs)}</Text><Text>{goal.targetDurationMin ? t("goalHub.minutes", { value: goal.targetDurationMin }) : null}{goal.target?.climbDurationMin ? <GlossaryText>{`${t("goalHub.minutes", { value: goal.target.climbDurationMin })} · ${goal.target.targetWkg ?? "—"} W/kg`}</GlossaryText> : null}</Text></div>
        <div data-testid="K3-1-2" style={{ marginBlock: "var(--goal-load-margin, var(--space-4))" }}>
          {goalReady && model.goalMatchesDiscipline ? <PlanGoalLoadSummary scope={scope} load={load} /> : <Text>—</Text>}
          {goalDay && <Text>{t("goalHub.goalDayEstimate")} · <GlossaryText>{`CTL ${goalDay.ctl.toFixed(1)} · TSB ${goalDay.tsb.toFixed(1)}`}</GlossaryText></Text>}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-3)" }}>
        <LocalizedLink data-testid="K3-1-3" className={buttonClass({ variant: "primary" })} to={`/coach/plan?sport=${discipline}`}>{t("goalHub.plan")}</LocalizedLink>
        </div>
        {error && <Text role="alert">{t("errors.abandonError")}</Text>}
      </Card>}
      {!mobile && <div ref={types} data-testid="K3-2"><Text as="h2" variant="title">{t(goal ? "goalHub.other" : "goalHub.new")}</Text>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
        <Button data-testid={discipline === "bike" ? "K3-2-1" : discipline === "run" ? "K3-2-3" : "K3-2-4"} disabled={!goalReady} onClick={() => choose("event")}>{t(`goalHub.types.${discipline}`)}</Button>
        {discipline === "bike" && <Button data-testid="K3-2-2" disabled={!goalReady} onClick={() => choose("climb")}>{t("climbGoal.title")}</Button>}
        {discipline === "run" && !goal?.runProgram && <LocalizedLink data-testid="K3-2-program" to="/coach/plan?sport=run">{t("goalHub.program")}</LocalizedLink>}
        </div>
      </div>}
      {selected && goal && <Text role="status">{t(mobile ? "goalHub.replacesShort" : "goalHub.replaces", { name: mobile ? title.name || goal.courseName : goal.title || goal.courseName })}</Text>}
      {goalReady && selected === "event" && <section data-testid="K3-3">{wizard}</section>}
      {goalReady && selected === "climb" && <section data-testid="K3-4"><ClimbGoalSetupPage embedded /></section>}
    </>}
  </div>;
}
