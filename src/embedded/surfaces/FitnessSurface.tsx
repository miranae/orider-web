import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import MobileFitnessPage from "../../components/mobile/MobileFitnessPage";
import { useFitnessModel } from "../../hooks/useFitnessModel";

export interface FitnessSurfaceProps {
  onReady: (status?: "cached" | "fresh" | "error") => void;
  retryKey: number;
}

export default function FitnessSurface({ onReady, retryKey }: FitnessSurfaceProps) {
  const [searchParams] = useSearchParams();
  const { t: tCommon } = useTranslation("common");
  const model = useFitnessModel(searchParams.get("sport"), {
    // This REST client still owns the normal web Auth/App Check singleton. The embedded
    // surface uses the persisted PDC fallback until that client accepts injected services.
    enableCoachRiderInsight: false,
  });
  const settledKeys = useRef(new Set<string>());

  useEffect(() => {
    if (!model.derivedMetricsSettled) return;
    if (model.cacheHit) {
      const key = `${retryKey}:cached`;
      if (!settledKeys.current.has(key)) {
        settledKeys.current.add(key);
        onReady("cached");
      }
    }
    if (!model.freshLoaded || model.loading || !model.timeseriesLoaded) return;
    const status = model.error || model.timeseriesError ? "error" : "fresh";
    const key = `${retryKey}:${status}`;
    if (settledKeys.current.has(key)) return;
    settledKeys.current.add(key);
    onReady(status);
  }, [model.cacheHit, model.derivedMetricsSettled, model.error, model.freshLoaded, model.loading, model.timeseriesError, model.timeseriesLoaded, onReady, retryKey]);

  if (model.loading) {
    return (
      <div className="orider-embedded-status" role="status" aria-label="Loading fitness">
        <div className="orider-embedded-status__pulse" />
      </div>
    );
  }

  if (model.error) {
    return (
      <main className="orider-embedded-surface" data-testid="embedded-fitness">
        <p role="alert">{model.t("error.dataFailed")}</p>
        <button type="button" onClick={model.retryLoad}>{tCommon("button.retry")}</button>
      </main>
    );
  }

  return (
    <main className="orider-embedded-surface" data-testid="embedded-fitness">
      <MobileFitnessPage
        {...model.mobilePageProps}
        embedded
        sectionState={{
          trend: !model.timeseriesLoaded
            ? "loading"
            : model.timeseriesError ? "error" : "ready",
          derived: "ready",
          onRetryTrend: model.retryLoad,
          retryLabel: tCommon("button.retry"),
        }}
      />
    </main>
  );
}
