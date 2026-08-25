import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import PlanPresentation from "../../features/training/plan/PlanPresentation";
import { usePlanModel } from "../../hooks/usePlanModel";

export interface PlanSurfaceProps {
  onError: (code: "plan_load_failed") => void;
  onReady: () => void;
  retryKey: number;
}

export default function PlanSurface({ onError, onReady, retryKey }: PlanSurfaceProps) {
  const [searchParams] = useSearchParams();
  const model = usePlanModel(searchParams.get("sport"));
  const [mobileWeekOffset, setMobileWeekOffset] = useState(0);
  const readyKey = useRef<number | null>(null);
  const errorKey = useRef<number | null>(null);

  useEffect(() => {
    if (model.loading) return;
    if (model.loadError) {
      if (errorKey.current === retryKey) return;
      errorKey.current = retryKey;
      onError("plan_load_failed");
      return;
    }
    if (readyKey.current === retryKey) return;
    readyKey.current = retryKey;
    onReady();
  }, [model.loadError, model.loading, onError, onReady, retryKey]);

  return (
    <main data-testid="embedded-plan">
      <PlanPresentation
        model={model}
        embedded
        mobileWeekOffset={mobileWeekOffset}
        onMobileWeekOffsetChange={setMobileWeekOffset}
      />
    </main>
  );
}
