import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useAuth } from "../../contexts/AuthContext";
import { useLocale } from "../../contexts/LocaleContext";
import { useToast } from "../../contexts/ToastContext";
import { useDialog } from "../../contexts/DialogContext";
import { useBikeProfiles } from "../../hooks/useBikeProfiles";
import { firestore, functions } from "../../services/firebase";
import { syncRiderMetricsToDevices, syncRiderWeightToBikeProfiles } from "../../services/syncRiderMetrics";
import { Button, Input, ToggleControls, ToggleButton } from "../../theme/components";
import { SettingsCard, Field, FieldGrid } from "./_primitives";
import { formatBodyValue, parseBodyValue, type BodyUnit } from "./bodyMeasurements";

export function ProfileBodyEditor() {
  const { t } = useTranslation("settings");
  const { user } = useAuth();
  const { units } = useLocale();
  const { showToast } = useToast();
  const dialog = useDialog();
  const { profiles } = useBikeProfiles(user?.uid ?? null);
  const fieldId = useId();
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [unit, setUnit] = useState<BodyUnit>(units === "imperial" ? "imperial" : "metric");
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const baseline = useRef({ weight: "", height: "", revision: null as string | null });
  useEffect(() => { setUnit(units === "imperial" ? "imperial" : "metric"); }, [units]);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoaded(false); setFailed(false);
    getDoc(doc(firestore, "users", user.uid)).then(snap => {
      if (cancelled) return;
      const data = snap.data() ?? {};
      const weight = typeof data.weightKg === "number" ? String(data.weightKg) : "";
      const height = typeof data.heightCm === "number" ? String(data.heightCm) : "";
      baseline.current = { weight, height, revision: data.weightRevision ?? null };
      setWeight(weight); setHeight(height);
      setConfirmed(Boolean(data.weightRevision) || Number(data.weightKg) !== 70);
      setLoaded(true);
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [user?.uid, attempt]);

  async function save(confirmWeight = false) {
    if (!user || !loaded || saving) return;
    const weightChanged = weight !== baseline.current.weight || confirmWeight;
    const heightChanged = height !== baseline.current.height;
    if (!weightChanged && !heightChanged) return;
    if (weightChanged && weight !== "" && (!Number.isFinite(Number(weight)) || Number(weight) < 25 || Number(weight) > 250)) {
      showToast(t("personal.weightRange")); return;
    }
    if (heightChanged && height !== "" && (!Number.isFinite(Number(height)) || Number(height) < 100 || Number(height) > 250)) {
      showToast(t("personal.heightRange")); return;
    }
    setSaving(true);
    const errors: string[] = [];
    try {
      if (weightChanged) {
        const result = await httpsCallable<unknown, { revision: string }>(functions, "updateProfileMetrics")({
          mutationId: crypto.randomUUID(), patch: { weightKg: weight === "" ? null : Number(weight) },
          expectedRevisions: { weightKg: baseline.current.revision },
        });
        baseline.current.weight = weight; baseline.current.revision = result.data.revision;
        setConfirmed(true);
        if (weight !== "") {
          try {
            const result = await syncRiderMetricsToDevices(user.uid, { weightKg: Number(weight) });
            if (result.failures.length) errors.push(t("training.syncDeviceFail", { count: result.failures.length, names: result.failures.map(f => f.deviceName || f.deviceId).join(", ") }));
          } catch (e) { errors.push(String(e)); }
          if (profiles.length && (profiles.length === 1 || await dialog.confirm(t("training.syncBikeConfirm", { count: profiles.length })))) {
            try { await syncRiderWeightToBikeProfiles(user.uid, Number(weight)); }
            catch (e) { errors.push(t("training.syncBikeError", { message: String(e) })); }
          }
        }
      }
      if (heightChanged) {
        await updateDoc(doc(firestore, "users", user.uid), { heightCm: height === "" ? null : Number(height) });
        baseline.current.height = height;
      }
      showToast(errors.length ? t("training.syncPartialFail", { errors: errors.join(" / ") }) : t("training.saved"));
    } catch (e) {
      showToast(`${t("training.saveFailed")}: ${String(e)}`);
    } finally { setSaving(false); }
  }

  if (!user) return null;
  return <section id="body-info" aria-label={t("profile.bodyInfo")}>
    <SettingsCard title={t("profile.bodyInfo")}>
      {failed && <div role="alert">{t("training.loadFailed")} <Button onClick={() => setAttempt(value => value + 1)}>{t("common:button.retry")}</Button></div>}
      <fieldset disabled={!loaded || saving} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <ToggleControls variant="axis" aria-label={t("training.bodyUnit.metric")} >
          {(["metric", "imperial"] as const).map(value => <ToggleButton key={value} selected={unit === value} onClick={() => setUnit(value)}>{t(`training.bodyUnit.${value}`)}</ToggleButton>)}
        </ToggleControls>
        <FieldGrid cols={2}>
          <Field label={t(unit === "metric" ? "training.fieldHeight" : "training.fieldHeightIn")} hint={unit === "metric" ? t("training.fieldHeightHint") : t("training.fieldHeightInHint")}>
            <Input id={`${fieldId}-height`} aria-label={t(unit === "metric" ? "training.fieldHeight" : "training.fieldHeightIn")} value={formatBodyValue(height, unit, "height")} onChange={e => setHeight(parseBodyValue(e.target.value, unit, "height"))} />
          </Field>
          <Field label={t(unit === "metric" ? "training.fieldWeight" : "training.fieldWeightLb")} hint={unit === "metric" ? t("training.fieldWeightHint") : t("training.fieldWeightLbHint")}>
            <Input id={`${fieldId}-weight`} aria-label={t(unit === "metric" ? "training.fieldWeight" : "training.fieldWeightLb")} value={formatBodyValue(weight, unit, "weight")} onChange={e => setWeight(parseBodyValue(e.target.value, unit, "weight"))} />
            {!confirmed && Number(weight) === 70 && <Button variant="secondary" onClick={() => void save(true)}>{t("training.confirmWeight")}</Button>}
          </Field>
        </FieldGrid>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
          <Button variant="secondary" onClick={() => { setWeight(baseline.current.weight); setHeight(baseline.current.height); }}>{t("training.btnReset")}</Button>
          <Button loading={saving} onClick={() => void save()}>{t(saving ? "training.btnSaving" : "training.btnSave")}</Button>
        </div>
      </fieldset>
    </SettingsCard>
  </section>;
}
