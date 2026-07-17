import { useState } from "react";
import { acceptCoachConsent, type CoachConsentPolicy } from "../../services/coachConsentClient";
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function consent() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await acceptCoachConsent(policy.policyVersion);
      const valid = saved.consent.active && saved.consent.current && !saved.consent.revoked
        && saved.consent.currentPolicyVersion === policy.policyVersion
        && saved.consent.storedPolicyVersion === policy.policyVersion;
      if (!valid) throw new Error("CONSENT_NOT_ACTIVE");
      trackCoachConsent("accepted", saved.policyVersion, "first_use");
      onConsented(saved);
    } catch {
      setError("save_failed");
    } finally {
      setSaving(false);
    }
  }
  return <CoachConsentSheet open={open} stale={policy.consent.state === "stale"} saving={saving}
    error={error} policy={policy} onCancel={onCancel} onConsented={() => void consent()} />;
}
