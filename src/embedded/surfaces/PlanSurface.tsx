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
import { logClientError } from "../../services/errorLogger";
import type { ScheduledRunStarter } from "../runStartBridge";

export interface PlanSurfaceProps {
  onReady: (status?: "cached" | "fresh" | "error") => void;
  retryKey: number;
  active?: boolean;
  /** 호스트가 run-start-scheduled-v1 을 알렸을 때만 주어진다. null 이면 구버전 앱. */
  scheduledRunStarter?: ScheduledRunStarter | null;
  /**
   * 숨겼다가 다시 보여 준(재마운트 없이 재사용한) 표면을 조용히 갱신하라는 요청. 값이 바뀔 때만
   * 갱신하고, 마운트 시점의 값은 무시한다(마운트 자체가 새로 읽는다). 빈도 제한은 호출부가 한다.
   */
  backgroundRefreshKey?: number;
}

export default function PlanSurface({
  onReady,
  retryKey,
  active = true,
  scheduledRunStarter = null,
  backgroundRefreshKey = 0,
}: PlanSurfaceProps) {
  const [searchParams] = useSearchParams();
  const { t } = useTranslation("training");
  const { t: tCommon } = useTranslation("common");
  const model = usePlanModel(searchParams.get("sport"), active);
  const run30Enabled = model.discipline === "run";
  const run30 = useRun30Program(run30Enabled, active);
  const [mobileWeekOffset, setMobileWeekOffset] = useState(0);
  const settledKeys = useRef(new Set<string>());
  const startMode = useMemo<Run30StartMode>(() => scheduledRunStarter
    ? { kind: "host", starter: scheduledRunStarter }
    : { kind: "host-unsupported" }, [scheduledRunStarter]);
  // Run30 성공 스냅샷(프로그램 부재 포함)이 있으면 네트워크 갱신을 기다리지 않는다.
  const run30Settled = !run30Enabled || run30.status === "ready" || run30.status === "error";
  const run30Program = run30Enabled && run30.status === "ready" ? run30.program : null;
  const run30Failed = run30Enabled && run30.status === "error";
  const canShowPlanCache = model.cacheHit && model.goal !== null;

  useEffect(() => {
    if (!run30Settled && !canShowPlanCache) return;
    if ((model.cacheHit || run30.cacheHit) && !run30Failed) {
      const key = `${retryKey}:cached`;
      if (!settledKeys.current.has(key)) {
        settledKeys.current.add(key);
        onReady("cached");
      }
    }
    // 프로그램이 있으면 일반 계획 로딩과 무관하게 화면이 완성된다.
    const planSettled = run30Program !== null ? !run30.cacheHit : (model.freshLoaded && !model.loading && !run30.cacheHit);
    if (!planSettled) return;
    const status = run30Failed || (run30Program === null && model.loadError) ? "error" : "fresh";
    const key = `${retryKey}:${status}`;
    if (settledKeys.current.has(key)) return;
    settledKeys.current.add(key);
    onReady(status);
  }, [
    canShowPlanCache,
    model.cacheHit,
    model.freshLoaded,
    model.loadError,
    model.loading,
    onReady,
    retryKey,
    run30.cacheHit,
    run30Failed,
    run30Program,
    run30Settled,
  ]);

  // 계획은 일회성 조회라 숨긴 동안의 변경(앱에서 완료 기록 등)을 받지 못한다. 다시 보일 때
  // 로딩 화면 없이 주차 계획과 Run30 상태만 다시 읽는다.
  const refreshedKey = useRef(backgroundRefreshKey);
  const { refreshPlanWeeks } = model;
  const { refresh: refreshRun30 } = run30;
  useEffect(() => {
    if (refreshedKey.current === backgroundRefreshKey) return;
    refreshedKey.current = backgroundRefreshKey;
    if (run30Enabled) void refreshRun30(false);
    refreshPlanWeeks(false).catch((error: unknown) => {
      logClientError("embedded.plan.backgroundRefresh", error, { discipline: model.discipline });
    });
  }, [backgroundRefreshKey, model.discipline, refreshPlanWeeks, refreshRun30, run30Enabled]);

  const retryAll = useCallback(() => {
    model.retryLoad();
    run30.retry();
  }, [model, run30]);

  const refreshAll = useCallback(async () => {
    await run30.refresh();
    model.retryLoad();
  }, [model, run30]);

  const cachedNotice = (run30.cacheHit || (model.cacheHit && !model.freshLoaded))
    ? <p role="status" className="orider-embedded-page-title">{tCommon("embeddedStatus.cached")}</p> : null;

  if (run30Program) {
    return (
      <main className="orider-embedded-surface orider-embedded-surface--plan" data-testid="embedded-plan">
        {cachedNotice}
        <Run30ProgramView
          api={run30.api}
          program={run30Program}
          onRefresh={refreshAll}
          startMode={startMode}
        />
      </main>
    );
  }

  if ((model.goalLoading || !run30Settled) && !canShowPlanCache) {
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
        {cachedNotice}
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
  const run30Offer = run30Enabled && run30Settled && model.goal?.discipline === "run" && !model.goal.runProgram
    ? <Run30EnrollCard api={run30.api} variant="offer" onEnrolled={refreshAll} />
    : undefined;

  return (
    <main className="orider-embedded-surface orider-embedded-surface--plan" data-testid="embedded-plan">
      {cachedNotice}
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
