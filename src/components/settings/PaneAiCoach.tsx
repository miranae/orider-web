import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingsCard, InlineRow } from "./_primitives";
import { Button } from "../../theme/components";
import { useDialog } from "../../contexts/DialogContext";
import { useToast } from "../../contexts/ToastContext";
import {
  acceptCoachConsent,
  getCoachConsentPolicy,
  revokeCoachConsent,
  type CoachConsentPolicy,
} from "../../services/coachConsentClient";
import { CoachConsentSheet } from "../../features/coach/CoachConsentSheet";
import { notifyCoachConsentSessionReset } from "../../features/coach/consentSessionBoundary";
import { trackCoachConsent } from "../../features/coach/coachAnalytics";

export function PaneAiCoach() {
  const { t } = useTranslation("settings");
  const dialog = useDialog();
  const { showToast } = useToast();
  const [policy, setPolicy] = useState<CoachConsentPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setPolicy(await getCoachConsentPolicy()); }
    catch { setError("load_failed"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function accept() {
    if (!policy || saving) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await acceptCoachConsent(policy.policyVersion);
      if (!saved.consent.active || !saved.consent.current || saved.consent.revoked) {
        throw new Error("CONSENT_NOT_ACTIVE");
      }
      setPolicy(saved);
      setSheetOpen(false);
      trackCoachConsent("accepted", saved.policyVersion, "settings");
      showToast(t("coach.accepted"));
    } catch {
      setError("save_failed");
    } finally {
      setSaving(false);
    }
  }

  async function revoke() {
    if (saving || !await dialog.confirm(t("coach.revokeImpact"), {
      title: t("coach.revokeTitle"), confirmLabel: t("coach.revoke"), destructive: true,
    })) return;
    setSaving(true);
    try {
      const saved = await revokeCoachConsent();
      if (saved.consent.active || !saved.consent.revoked) throw new Error("CONSENT_STILL_ACTIVE");
      setPolicy(saved);
      notifyCoachConsentSessionReset();
      trackCoachConsent("revoked", saved.policyVersion, "settings");
      showToast(t("coach.revoked"));
    } catch {
      showToast(t("coach.revokeFailed"));
    } finally {
      setSaving(false);
    }
  }

  const state = policy?.consent.state ?? "missing";
  const valid = policy?.consent.active === true && policy.consent.current && !policy.consent.revoked;
  return (
    <>
      <SettingsCard title={t("coach.cardTitle")}>
        <p>{t("coach.cardDescription")}</p>
        <InlineRow label={t("coach.processingLabel")} hint={t("coach.noHistory") }>
          <strong>{loading ? t("coach.checking") : t(valid ? "coach.statusAccepted" : `coach.status.${state}`)}</strong>
        </InlineRow>
        {policy && <InlineRow label={t("coach.policyVersion")}><code>{policy.policyVersion}</code></InlineRow>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)", marginTop: "var(--space-4)" }}>
          {!valid && <Button disabled={loading || saving} onClick={() => setSheetOpen(true)}>{t("coach.reviewConsent")}</Button>}
          {valid && <Button variant="danger" disabled={saving} onClick={() => void revoke()}>{t("coach.revoke")}</Button>}
        </div>
        {error === "load_failed" && <p role="alert">{t("coach.loadFailed")}</p>}
      </SettingsCard>
      {policy && <CoachConsentSheet
        open={sheetOpen}
        stale={policy?.consent.state === "stale"}
        saving={saving}
        error={error === "save_failed" ? error : null}
        policy={policy}
        onCancel={() => setSheetOpen(false)}
        onConsented={() => void accept()}
      />}
    </>
  );
}
