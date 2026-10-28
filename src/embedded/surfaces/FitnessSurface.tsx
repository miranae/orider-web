import { CoachQuestionEntry } from "../../pages/coach/CoachQuestionEntry";
import { isSportUiEnabled } from "../../config/sportFeatures";
import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

import EmbeddedSurfaceState from "./EmbeddedSurfaceState";
import CoachConditionPage from "../../pages/coach/CoachConditionPage";
import CoachTodayPage from "../../pages/coach/CoachTodayPage";
import CoachAnalysisPage from "../../pages/coach/CoachAnalysisPage";
import { CoachFitnessModelContext } from "../../pages/coach/CoachFitnessModelContext";
import type { Run30StartMode } from "../../features/training/run30/run30Start";
import { useFitnessModel } from "../../hooks/useFitnessModel";

export interface FitnessSurfaceProps {
  onReady: (status?: "cached" | "fresh" | "error", contentComplete?: boolean) => void;
  retryKey: number;
  active?: boolean;
  startMode?: Run30StartMode;
}

export default function FitnessSurface({ onReady, retryKey, active = true, startMode }: FitnessSurfaceProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("sport");
  const sport = requested === "run" || requested === "bike" || requested === "swim" && isSportUiEnabled(requested)
    || requested === "tri" && searchParams.get("page") !== "today" ? requested : "bike";
  useEffect(() => {
    if (requested === null || requested === sport) return;
    setSearchParams(current => { const next = new URLSearchParams(current); next.set("sport", sport); return next; }, { replace: true });
  }, [requested, sport, setSearchParams]);
  const model = useFitnessModel(sport, {
    decisionId: searchParams.get("decisionId"),
    active,
  });
  const settledKeys = useRef(new Set<string>());
  const derivedContentReady = model.derivedMetricsSettled && !model.derivedMetricsError;

  useEffect(() => {
    if (model.cacheHit) {
      const key = `${retryKey}:cached:${derivedContentReady ? "complete" : "partial"}`;
      if (!settledKeys.current.has(key)) {
        settledKeys.current.add(key);
        onReady("cached", derivedContentReady);
      }
    }
    if (!model.freshLoaded || model.loading || !model.timeseriesLoaded) return;
    const status = model.error || model.timeseriesError ? "error" : "fresh";
    const key = `${retryKey}:${status}:${derivedContentReady ? "complete" : "partial"}`;
    if (settledKeys.current.has(key)) return;
    settledKeys.current.add(key);
    onReady(status, derivedContentReady);
  }, [derivedContentReady, model.cacheHit, model.error, model.freshLoaded, model.loading, model.timeseriesError, model.timeseriesLoaded, onReady, retryKey]);

  if (model.loading || model.error) {
    return (
      <main className="orider-embedded-surface" data-testid="embedded-fitness">
        <EmbeddedSurfaceState title={model.t("login.title")} loading={model.loading} onRetry={model.retryLoad} />
      </main>
    );
  }

  return (
    <main className="orider-embedded-surface" data-testid="embedded-fitness">
      {active && <CoachFitnessModelContext.Provider value={model}>
        {searchParams.get("page") === "today" ? <CoachTodayPage startMode={startMode} />
          : searchParams.get("page") === "analysis" ? <CoachAnalysisPage />
          : <CoachConditionPage />}
        <CoachQuestionEntry model={model} page={searchParams.get("page") === "today" ? "today" : searchParams.get("page") === "analysis" ? "analysis" : "condition"} />
      </CoachFitnessModelContext.Provider>}
    </main>
  );
}
