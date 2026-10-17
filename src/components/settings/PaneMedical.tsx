import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { doc, getDoc, setDoc } from "firebase/firestore";
import type { BloodType, EmergencyContact, MedicalProfile } from "@shared/types";
import { firestore } from "../../services/firebase";
import { logClientError } from "../../services/errorLogger";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { SettingsCard, FieldGrid, Field, fieldInputStyle } from "./_primitives";
import { Button, Text, Input, Textarea, DropdownSelect } from "../../theme/components";

const BLOOD_TYPES: BloodType[] = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-", "UNKNOWN"];

export function PaneMedical() {
  const { t } = useTranslation("settings");
  const { user } = useAuth();
  const { showToast } = useToast();
  const [bloodType, setBloodType] = useState<BloodType>("UNKNOWN");
  const [medications, setMedications] = useState("");
  const [allergies, setAllergies] = useState("");
  const [emergency, setEmergency] = useState<EmergencyContact>({ name: "", phone: "", relationship: "" });
  const [loaded, setLoaded] = useState(false);
  const [medicalSaving, setMedicalSaving] = useState(false);
  const [emergencySaving, setEmergencySaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoaded(false); setLoadFailed(false);
    void getDoc(doc(firestore, "users", user.uid, "private", "medical")).then(async snap => {
      if (cancelled) return;
      const stored = (snap.exists() ? snap.data() : null) as MedicalProfile | null;
      // Partial migration must keep legacy fields without racing Auth profile loading.
      const needsLegacy = !stored || ["bloodType", "medications", "allergies", "emergencyContact"].some(key => !(key in stored));
      const legacy = needsLegacy ? (await getDoc(doc(firestore, "users", user.uid))).data() : null;
      if (cancelled) return;
      const m = { ...legacy, ...stored } as MedicalProfile;
      setBloodType(m?.bloodType ?? "UNKNOWN");
      setMedications(m?.medications ?? ""); setAllergies(m?.allergies ?? "");
      const ec = m?.emergencyContact;
      setEmergency({ name: ec?.name ?? "", phone: ec?.phone ?? "", relationship: ec?.relationship ?? "" });
      setLoaded(true);
    }).catch(error => {
      if (cancelled) return;
      setLoadFailed(true); logClientError("PaneMedical.load", error, {});
    });
    return () => { cancelled = true; };
  }, [user?.uid, loadAttempt]);

  async function saveMedical() {
    if (!user || !loaded || medicalSaving) return;
    setMedicalSaving(true);
    try {
      await setDoc(doc(firestore, "users", user.uid, "private", "medical"), {
        bloodType: bloodType === "UNKNOWN" ? null : bloodType,
        medications: medications.trim() || null, allergies: allergies.trim() || null,
      }, { merge: true });
      showToast(t("training.saved"));
    } catch (error) { showToast(`${t("training.saveFailed")}: ${error instanceof Error ? error.message : String(error)}`); }
    finally { setMedicalSaving(false); }
  }
  async function saveEmergency() {
    if (!user || !loaded || emergencySaving) return;
    const name = emergency.name.trim(), phone = emergency.phone.trim();
    if (Boolean(name) !== Boolean(phone)) { showToast(t("personal.phoneRequired")); return; }
    const emergencyContact: EmergencyContact | null = name && phone
      ? { name, phone, ...(emergency.relationship?.trim() ? { relationship: emergency.relationship.trim() } : {}) }
      : null;
    setEmergencySaving(true);
    try {
      await setDoc(doc(firestore, "users", user.uid, "private", "medical"), { emergencyContact }, { merge: true });
      showToast(t("training.saved"));
    } catch (error) { showToast(`${t("training.saveFailed")}: ${error instanceof Error ? error.message : String(error)}`); }
    finally { setEmergencySaving(false); }
  }
  if (!user || user.isAnonymous) return null;
  return <>
    {loadFailed && <div role="alert">{t("training.loadFailed")} <Button onClick={() => setLoadAttempt(value => value + 1)}>{t("common:button.retry")}</Button></div>}
    <fieldset data-testid="S1-4-1" disabled={!loaded || medicalSaving} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <SettingsCard
        title={t("training.cardMedical")}
        action={
          <Text variant="eyebrow" style={{ color: "var(--ink-3)" }}>
            {t("training.cardMedicalAction")}
          </Text>
        }
      >
        <FieldGrid cols={2}>
          <Field label={t("training.fieldBloodType")}>
            <DropdownSelect value={bloodType} onChange={value => setBloodType(value as BloodType)}
              label={t("training.fieldBloodType")} disabled={!loaded || medicalSaving}
              options={BLOOD_TYPES.map(value => ({ value, label: value === "UNKNOWN" ? t("training.bloodTypeNone") : value }))} />
          </Field>
          <Field label={t("training.fieldMedications")} hint={t("training.fieldMedicationsHint")}>
            <Input
              value={medications}
              onChange={(e) => setMedications(e.target.value)}
              placeholder={t("training.fieldMedicationsPlaceholder")}
              style={fieldInputStyle}
            />
          </Field>
          <Field label={t("training.fieldAllergies")} full hint={t("training.fieldAllergiesHint")}>
            <Textarea
              value={allergies}
              onChange={(e) => setAllergies(e.target.value)}
              placeholder={t("training.fieldAllergiesPlaceholder")}
              style={{ ...fieldInputStyle, minHeight: 56, resize: "vertical" }}
            />
          </Field>
        </FieldGrid>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "var(--space-4)" }}>
        <Button onClick={() => void saveMedical()} disabled={!loaded || medicalSaving}>
          {medicalSaving ? t("training.btnSaving") : t("training.btnSave")}
        </Button>
      </div>
      </SettingsCard>
      </fieldset>
      <fieldset data-testid="S1-4-2" disabled={!loaded || emergencySaving} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <SettingsCard title={t("training.cardEmergency")} dense>
        <FieldGrid cols={3}>
          <Field label={t("training.fieldEmergencyName")}>
            <Input
              value={emergency.name}
              onChange={(e) => setEmergency({ ...emergency, name: e.target.value })}
              style={fieldInputStyle}
            />
          </Field>
          <Field label={t("training.fieldEmergencyPhone")}>
            <Input
              type="tel"
              value={emergency.phone}
              onChange={(e) => setEmergency({ ...emergency, phone: e.target.value })}
              style={fieldInputStyle}
            />
          </Field>
          <Field label={t("training.fieldEmergencyRelationship")}>
            <Input
              value={emergency.relationship ?? ""}
              onChange={(e) =>
                setEmergency({ ...emergency, relationship: e.target.value })
              }
              placeholder={t("training.fieldEmergencyRelationshipPlaceholder")}
              style={fieldInputStyle}
            />
          </Field>
        </FieldGrid>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "var(--space-4)" }}>
        <Button onClick={() => void saveEmergency()} disabled={!loaded || emergencySaving}>
          {emergencySaving ? t("training.btnSaving") : t("training.btnSave")}
        </Button>
      </div>
      </SettingsCard>
    </fieldset>
  </>;
}
