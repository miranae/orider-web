import { useCoachConsentApi } from "../../hooks/useCoachApi";
import { useEffect, useRef, useState } from "react";
import { type CoachConsentPolicy } from "../../services/coachConsentClient";
import { trackCoachConsent } from "./coachAnalytics";
import { CoachConsentSheet } from "./CoachConsentSheet";

interface Props {
  open: boolean;
  policy: CoachConsentPolicy;
  onConsented: (saved: CoachConsentPolicy) => void;
  onCancel: () => void;
}

/** #550 keeps draft/requestId in its own component state and resumes only from onConsented. */
export function FirstUseCoachConsent({ open, policy, onConsented, onCancel }: Props) {
  const { acceptCoachConsent } = useCoachConsentApi();
  const [savingCycle, setSavingCycle] = useState<number | null>(null);
  const [errorState, setErrorState] = useState<{ cycle: number; value: string } | null>(null);
  const mountedRef = useRef(true);
  const visibilityRef = useRef({ open, cycle: 0 });
  const inFlightCycleRef = useRef<number | null>(null);
  if (visibilityRef.current.open !== open) visibilityRef.current = { open, cycle: visibilityRef.current.cycle + 1 };
  const cycle = visibilityRef.current.cycle;
  const saving = savingCycle === cycle;
  const error = errorState?.cycle === cycle ? errorState.value : null;
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  async function consent() {
    if (saving || inFlightCycleRef.current === cycle) return;
    inFlightCycleRef.current = cycle;
    setSavingCycle(cycle);
    setErrorState(null);
    try {
      const saved = await acceptCoachConsent(policy.policyVersion);
      if (!mountedRef.current || !visibilityRef.current.open || visibilityRef.current.cycle !== cycle) return;
      const valid = saved.consent.active && saved.consent.current && !saved.consent.revoked
        && saved.consent.currentPolicyVersion === policy.policyVersion
        && saved.consent.storedPolicyVersion === policy.policyVersion;
      if (!valid) throw new Error("CONSENT_NOT_ACTIVE");
      trackCoachConsent("accepted", saved.policyVersion, "first_use");
      onConsented(saved);
    } catch {
      if (mountedRef.current && visibilityRef.current.open && visibilityRef.current.cycle === cycle)
        setErrorState({ cycle, value: "save_failed" });
    } finally {
      if (inFlightCycleRef.current === cycle) inFlightCycleRef.current = null;
      if (mountedRef.current && visibilityRef.current.cycle === cycle) setSavingCycle(null);
    }
  }
  return <CoachConsentSheet open={open} stale={policy.consent.state === "stale"} saving={saving}
    error={error} policy={policy} onCancel={onCancel} onConsented={() => void consent()} />;
}
