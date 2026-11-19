import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import EmbeddedSurfaceState from "./EmbeddedSurfaceState";
import { PlanView } from "../../pages/PlanPage";
import GoalSetupPage from "../../pages/GoalSetupPage";
import { usePlanModel } from "../../hooks/usePlanModel";
import { logClientError } from "../../services/errorLogger";
import type { ScheduledRunStarter } from "../runStartBridge";

export interface PlanSurfaceProps {
  onReady: (status?: "cached" | "fresh" | "error") => void;
  retryKey: number;
  active?: boolean;
  /**
   * 호스트가 run-start-scheduled-v1 을 알렸을 때만 주어진다. 러닝 계획에서 Run30 프로그램을 빼(2026-11-19)
   * 지금은 쓰지 않지만 호스트 계약이라 받는 자리는 남긴다.
   */
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
  backgroundRefreshKey = 0,
}: PlanSurfaceProps) {
  const [searchParams] = useSearchParams();
  const { t } = useTranslation("training");
  const model = usePlanModel(searchParams.get("sport"), active);
  const settledKeys = useRef(new Set<string>());
  const canShowPlanCache = model.cacheHit && model.goal !== null;

  useEffect(() => {
    if (model.cacheHit) {
      const key = `${retryKey}:cached`;
      if (!settledKeys.current.has(key)) {
        settledKeys.current.add(key);
        onReady("cached");
      }
    }
    const planSettled = (model.freshLoaded || Boolean(model.loadError)) && !model.loading;
    if (!planSettled) return;
    const status = model.loadError ? "error" : "fresh";
    const key = `${retryKey}:${status}`;
    if (settledKeys.current.has(key)) return;
    settledKeys.current.add(key);
    onReady(status);
  }, [model.cacheHit, model.freshLoaded, model.loadError, model.loading, onReady, retryKey]);

  // 계획은 일회성 조회라 숨긴 동안의 변경(앱에서 완료 기록 등)을 받지 못한다. 다시 보일 때
  // 로딩 화면 없이 주차 계획만 다시 읽는다.
  const refreshedKey = useRef(backgroundRefreshKey);
  const { refreshPlanWeeks } = model;
  useEffect(() => {
    if (refreshedKey.current === backgroundRefreshKey) return;
    refreshedKey.current = backgroundRefreshKey;
    refreshPlanWeeks(false).catch((error: unknown) => {
      logClientError("embedded.plan.backgroundRefresh", error, { discipline: model.discipline });
    });
  }, [backgroundRefreshKey, model.discipline, refreshPlanWeeks]);


  if (searchParams.get("page") === "goals") {
    return <main className="orider-embedded-surface" data-testid="embedded-goals">{active && <GoalSetupPage />}</main>;
  }

  const sharedContent = <main className="orider-embedded-surface orider-embedded-surface--plan" data-testid="embedded-plan">
    {/* 캐시로 먼저 그린 뒤 최신 값으로 조용히 바꾼다 — "저장된 이전 정보" 안내는 앱 계획 탭에서 띄우지 않는다(2026-11-03). */}
    {active && <PlanView model={model} />}
  </main>;
  // 러닝 계획은 제목·종목 탭·날짜 이동·계획 대비 기록만 보여 준다 — 목표·주간 계획 로딩 화면을 거치지 않는다(2026-11-19).
  if (model.discipline === "run") return sharedContent;

  if (model.goalLoading && !canShowPlanCache) {
    return (
      <main className="orider-embedded-surface orider-embedded-surface--plan" data-testid="embedded-plan">
        <section className="orider-embedded-plan-state" aria-label={t("goal")}>
          <EmbeddedSurfaceState title={t("goal")} loading />
        </section>
      </main>
    );
  }

  if (model.goalError) {
    return (
      <main className="orider-embedded-surface orider-embedded-surface--plan" data-testid="embedded-plan">
        <section className="orider-embedded-plan-state" aria-label={t("goal")}>
          <EmbeddedSurfaceState title={t("goal")} onRetry={model.retryLoad} />
        </section>
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

  return sharedContent;
}
