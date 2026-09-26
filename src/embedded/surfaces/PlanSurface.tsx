import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import EmbeddedSurfaceState from "./EmbeddedSurfaceState";
import PlanPresentation from "../../features/training/plan/PlanPresentation";
import { usePlanModel } from "../../hooks/usePlanModel";

export interface PlanSurfaceProps {
  onReady: (status?: "cached" | "fresh" | "error") => void;
  retryKey: number;
}

export default function PlanSurface({ onReady, retryKey }: PlanSurfaceProps) {
  const [searchParams] = useSearchParams();
  const { t } = useTranslation("training");
  const model = usePlanModel(searchParams.get("sport"));
  const [mobileWeekOffset, setMobileWeekOffset] = useState(0);
  const settledKeys = useRef(new Set<string>());

  useEffect(() => {
    if (model.cacheHit) {
      const key = `${retryKey}:cached`;
      if (!settledKeys.current.has(key)) {
        settledKeys.current.add(key);
        onReady("cached");
      }
    }
    if (!model.freshLoaded || model.loading) return;
    const status = model.loadError ? "error" : "fresh";
    const key = `${retryKey}:${status}`;
    if (settledKeys.current.has(key)) return;
    settledKeys.current.add(key);
    onReady(status);
  }, [model.cacheHit, model.freshLoaded, model.loadError, model.loading, onReady, retryKey]);


  if (model.goalLoading) {
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

  return (
    <main className="orider-embedded-surface orider-embedded-surface--plan" data-testid="embedded-plan">
      <PlanPresentation
        model={model}
        embedded
        mobileWeekOffset={mobileWeekOffset}
        onMobileWeekOffsetChange={setMobileWeekOffset}
      />
    </main>
  );
}
