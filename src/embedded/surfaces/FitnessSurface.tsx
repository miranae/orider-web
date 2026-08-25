import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

import MobileFitnessPage from "../../components/mobile/MobileFitnessPage";
import { useFitnessModel } from "../../hooks/useFitnessModel";

export interface FitnessSurfaceProps {
  onError: (code: "fitness_load_failed") => void;
  onReady: () => void;
  retryKey: number;
}

export default function FitnessSurface({ onError, onReady, retryKey }: FitnessSurfaceProps) {
  const [searchParams] = useSearchParams();
  const model = useFitnessModel(searchParams.get("sport"), {
    // This REST client still owns the normal web Auth/App Check singleton. The embedded
    // surface uses the persisted PDC fallback until that client accepts injected services.
    enableCoachRiderInsight: false,
  });
  const readyKey = useRef<number | null>(null);
  const errorKey = useRef<string | null>(null);

  useEffect(() => {
    if (model.loading || !model.timeseriesLoaded) return;
    if (model.error) {
      const key = `${retryKey}:${model.error}`;
      if (errorKey.current === key) return;
      errorKey.current = key;
      onError("fitness_load_failed");
      return;
    }
    if (readyKey.current === retryKey) return;
    readyKey.current = retryKey;
    onReady();
  }, [model.error, model.loading, model.timeseriesLoaded, onError, onReady, retryKey]);

  if (model.loading || !model.timeseriesLoaded) {
    return (
      <div className="orider-embedded-status" role="status" aria-label="Loading fitness">
        <div className="orider-embedded-status__pulse" />
      </div>
    );
  }

  if (model.error) {
    return (
      <div className="orider-embedded-status" role="alert">
        Fitness is unavailable.
      </div>
    );
  }

  return (
    <main className="orider-embedded-surface" data-testid="embedded-fitness">
      <MobileFitnessPage {...model.mobilePageProps} embedded />
    </main>
  );
}
