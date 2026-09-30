import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import EmbeddedSurfaceState from "./EmbeddedSurfaceState";
import PlanPresentation from "../../features/training/plan/PlanPresentation";
import Run30EnrollCard from "../../features/training/run30/Run30EnrollCard";
import Run30ProgramView from "../../features/training/run30/Run30ProgramView";
import type { Run30StartMode } from "../../features/training/run30/run30Start";
import { useRun30Program } from "../../features/training/run30/useRun30Program";
import { usePlanModel } from "../../hooks/usePlanModel";
import type { ScheduledRunStarter } from "../runStartBridge";

export interface PlanSurfaceProps {
  onReady: (status?: "cached" | "fresh" | "error") => void;
  retryKey: number;
  /** 호스트가 run-start-scheduled-v1 을 알렸을 때만 주어진다. null 이면 구버전 앱. */
  scheduledRunStarter?: ScheduledRunStarter | null;
}

export default function PlanSurface({ onReady, retryKey, scheduledRunStarter = null }: PlanSurfaceProps) {
  const [searchParams] = useSearchParams();
  const { t } = useTranslation("training");
  const model = usePlanModel(searchParams.get("sport"));
  const run30Enabled = model.discipline === "run";
  const run30 = useRun30Program(run30Enabled);
  const [mobileWeekOffset, setMobileWeekOffset] = useState(0);
  const settledKeys = useRef(new Set<string>());
  const startMode = useMemo<Run30StartMode>(() => scheduledRunStarter
    ? { kind: "host", starter: scheduledRunStarter }
    : { kind: "host-unsupported" }, [scheduledRunStarter]);
  // 러닝은 Run30 조회가 끝나야 무엇을 보여 줄지 정해진다. 그 전에는 캐시 계획도 내보이지 않는다.
  const run30Settled = !run30Enabled || run30.status === "ready" || run30.status === "error";
  const run30Program = run30Enabled && run30.status === "ready" ? run30.program : null;
  const run30Failed = run30Enabled && run30.status === "error";

  useEffect(() => {
    if (!run30Settled) return;
    if (model.cacheHit && !run30Failed) {
      const key = `${retryKey}:cached`;
      if (!settledKeys.current.has(key)) {
        settledKeys.current.add(key);
        onReady("cached");
      }
    }
    // 프로그램이 있으면 일반 계획 로딩과 무관하게 화면이 완성된다.
    const planSettled = run30Program !== null || (model.freshLoaded && !model.loading);
    if (!planSettled) return;
    const status = run30Failed || (run30Program === null && model.loadError) ? "error" : "fresh";
    const key = `${retryKey}:${status}`;
    if (settledKeys.current.has(key)) return;
    settledKeys.current.add(key);
    onReady(status);
  }, [
    model.cacheHit,
    model.freshLoaded,
    model.loadError,
    model.loading,
    onReady,
    retryKey,
    run30Failed,
    run30Program,
    run30Settled,
  ]);

  const retryAll = useCallback(() => {
    model.retryLoad();
    run30.retry();
  }, [model, run30]);

  const refreshAll = useCallback(async () => {
    await run30.refresh();
    model.retryLoad();
  }, [model, run30]);

  if (run30Program) {
    return (
      <main className="orider-embedded-surface orider-embedded-surface--plan" data-testid="embedded-plan">
        <Run30ProgramView
          api={run30.api}
          program={run30Program}
          onRefresh={run30.refresh}
          startMode={startMode}
        />
      </main>
    );
  }

  if (model.goalLoading || !run30Settled) {
    return (
      <main className="orider-embedded-surface orider-embedded-surface--plan" data-testid="embedded-plan">
        <section className="orider-embedded-plan-state" aria-label={t("goal")}>
          <EmbeddedSurfaceState title={t("goal")} loading />
        </section>
      </main>
    );
  }

  if (model.goalError || run30Failed) {
    return (
      <main className="orider-embedded-surface orider-embedded-surface--plan" data-testid="embedded-plan">
        <section className="orider-embedded-plan-state" aria-label={t("goal")}>
          <EmbeddedSurfaceState title={t("goal")} onRetry={retryAll} />
        </section>
      </main>
    );
  }

  // 활성 러닝 목표가 없으면 일반 빈 화면 대신 입문 프로그램 등록을 보여 준다.
  if (run30Enabled && (!model.goal || model.goal.discipline !== "run")) {
    return (
      <main className="orider-embedded-surface orider-embedded-surface--plan" data-testid="embedded-plan">
        <h1 className="orider-embedded-page-title">{t("page.embeddedTitle")}</h1>
        <Run30EnrollCard api={run30.api} variant="intro" onEnrolled={refreshAll} />
      </main>
    );
  }

  if (model.goal && model.planLoading) {
    return (
      <main className="orider-embedded-surface orider-embedded-surface--plan" data-testid="embedded-plan">
        <section className="orider-embedded-plan-state" aria-labelledby="embedded-plan-goal-title">
          <h2 id="embedded-plan-goal-title">{model.goal.title ?? model.goal.courseName ?? t("goal")}</h2>
        </section>
        <section className="orider-embedded-plan-state" aria-label={t("page.planTitle")}>
          <EmbeddedSurfaceState title={t("page.planTitle")} loading />
        </section>
      </main>
    );
  }

  if (model.goal && model.planError) {
    return (
      <main className="orider-embedded-surface orider-embedded-surface--plan" data-testid="embedded-plan">
        <section className="orider-embedded-plan-state" aria-labelledby="embedded-plan-goal-title">
          <h2 id="embedded-plan-goal-title">{model.goal.title ?? model.goal.courseName ?? t("goal")}</h2>
        </section>
        <section className="orider-embedded-plan-state" aria-label={t("page.planTitle")}>
          <EmbeddedSurfaceState title={t("page.planTitle")} onRetry={model.retryLoad} />
        </section>
      </main>
    );
  }

  // 다른 러닝 목표가 활성이면 기존 계획을 유지하고 입문 프로그램 전환만 제안한다.
  const run30Offer = run30Enabled && model.goal?.discipline === "run" && !model.goal.runProgram
    ? <Run30EnrollCard api={run30.api} variant="offer" onEnrolled={refreshAll} />
    : undefined;

  return (
    <main className="orider-embedded-surface orider-embedded-surface--plan" data-testid="embedded-plan">
      <PlanPresentation
        model={model}
        embedded
        decisionSlot={run30Offer}
        mobileWeekOffset={mobileWeekOffset}
        onMobileWeekOffsetChange={setMobileWeekOffset}
      />
    </main>
  );
}
