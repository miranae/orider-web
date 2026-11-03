import { CoachQuestionEntry } from "../../pages/coach/CoachQuestionEntry";
import { isSportUiEnabled } from "../../config/sportFeatures";
import { lazy, Suspense, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

import EmbeddedSurfaceState from "./EmbeddedSurfaceState";
import CoachConditionPage from "../../pages/coach/CoachConditionPage";
import CoachTodayPage from "../../pages/coach/CoachTodayPage";
import CoachAnalysisPage from "../../pages/coach/CoachAnalysisPage";
// 오늘 탭의 "활동 기록·수행 확인" — 코치 임베드 안에서 연다(무거운 기록 화면이라 필요할 때만 불러온다).
const TrainingLogPage = lazy(() => import("../../pages/TrainingLogPage"));
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
    || requested === "tri" && !["today", "analysis"].includes(searchParams.get("page") ?? "") ? requested : "bike";
  // 기록 화면의 종목은 활동 필터(전체·종목)라 코치 부하 종목으로 바꾸지 않는다.
  const recordsPage = searchParams.get("page") === "records";
  useEffect(() => {
    if (recordsPage || requested === null || requested === sport) return;
    setSearchParams(current => { const next = new URLSearchParams(current); next.set("sport", sport); return next; }, { replace: true });
  }, [recordsPage, requested, sport, setSearchParams]);
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
        {recordsPage ? <Suspense fallback={null}><TrainingLogPage /></Suspense>
          : searchParams.get("page") === "today" ? <CoachTodayPage startMode={startMode} />
          : searchParams.get("page") === "analysis" ? <CoachAnalysisPage />
          : <CoachConditionPage />}
        <CoachQuestionEntry model={model} page={searchParams.get("page") === "today" || recordsPage ? "today" : searchParams.get("page") === "analysis" ? "analysis" : "condition"} />
      </CoachFitnessModelContext.Provider>}
    </main>
  );
}
