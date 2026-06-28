import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

import type { BloodType, EmergencyContact, MedicalProfile } from "@shared/types";

import { firestore } from "../../services/firebase";
import { logClientError } from "../../services/errorLogger";
import {
  syncRiderMetricsToDevices,
  syncRiderWeightToBikeProfiles,
} from "../../services/syncRiderMetrics";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { useBikeProfiles } from "../../hooks/useBikeProfiles";

import {
  SettingsCard,
  Field,
  FieldGrid,
  RD_HR_ZONES,
  StatGrid,
  ZoneBar,
  fieldInputStyle,
  monoInputStyle,
} from "./_primitives";
import { ThresholdSuggestionBanner } from "./ThresholdSuggestionBanner";
import { Button, Text } from "../../theme/components";
import { estimateFtpFromTest, isConservativeDrop, type FtpTestProtocol } from "@shared/training/ftpTest";

const BLOOD_TYPES: BloodType[] = [
  "A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-", "UNKNOWN",
];

function secsToMmss(secs: number): string {
  if (!secs || secs <= 0) return "";
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function mmssToSecs(mmss: string): number | null {
  const m = mmss.trim().match(/^(\d+):(\d{1,2})$/);
  if (!m) return null;
  const min = Number(m[1]);
  const sec = Number(m[2]);
  if (sec >= 60) return null;
  return min * 60 + sec;
}

export function PaneTraining() {
  const { t } = useTranslation("settings");
  const { user, profile } = useAuth();
  const { profiles: bikeProfiles } = useBikeProfiles(user?.uid ?? null);
  const { showToast } = useToast();

  const [ftp, setFtp] = useState("");
  // FTP 테스트 모드 — 전용 테스트 입력 → FTP 후보 산출(#307).
  const [ftpTestProtocol, setFtpTestProtocol] = useState<FtpTestProtocol>("twenty_min");
  const [ftpTestInput, setFtpTestInput] = useState("");
  const ftpTestCandidate = ftpTestInput ? estimateFtpFromTest(ftpTestProtocol, Number(ftpTestInput)) : null;
  const ftpTestDrop = ftpTestCandidate != null && isConservativeDrop(ftp ? Number(ftp) : null, ftpTestCandidate);
  const [maxHr, setMaxHr] = useState("");
  const [lthr, setLthr] = useState("");
  const [thresholdPace, setThresholdPace] = useState("");
  const [css, setCss] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [bloodType, setBloodType] = useState<BloodType>("UNKNOWN");
  const [medications, setMedications] = useState("");
  const [allergies, setAllergies] = useState("");
  const [emergency, setEmergency] = useState<EmergencyContact>({
    name: "",
    phone: "",
    relationship: "",
  });
  const [saving, setSaving] = useState(false);

  // 초기값: profile (onSnapshot)
  useEffect(() => {
    if (!user) return;
    void getDoc(doc(firestore, "users", user.uid)).then((snap) => {
      const d = snap.data() ?? {};
      if (typeof d.ftp === "number") setFtp(String(d.ftp));
      if (typeof d.maxHr === "number") setMaxHr(String(d.maxHr));
      if (typeof d.lthr === "number") setLthr(String(d.lthr));
      if (typeof d.thresholdPace === "number") setThresholdPace(secsToMmss(d.thresholdPace));
      if (typeof d.css === "number") setCss(secsToMmss(d.css));
    });
  }, [user]);

  useEffect(() => {
    setWeightKg(profile?.weightKg ? String(profile.weightKg) : "");
    setHeightCm(profile?.heightCm ? String(profile.heightCm) : "");
  }, [profile?.weightKg, profile?.heightCm]);

  // 의료/응급 PII — owner-only 서브컬렉션에서 로드(#524). 미마이그레이션 레거시는 루트 폴백.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getDoc(doc(firestore, "users", user.uid, "private", "medical"))
      .then((snap) => {
        if (cancelled) return;
        const m = (snap.exists() ? snap.data() : null) as MedicalProfile | null;
        setBloodType(m?.bloodType ?? profile?.bloodType ?? "UNKNOWN");
        setMedications(m?.medications ?? profile?.medications ?? "");
        setAllergies(m?.allergies ?? profile?.allergies ?? "");
        const ec = m?.emergencyContact ?? profile?.emergencyContact ?? null;
        setEmergency({ name: ec?.name ?? "", phone: ec?.phone ?? "", relationship: ec?.relationship ?? "" });
      })
      .catch((err) => { logClientError("PaneTraining.loadMedical", err, {}); });
    return () => { cancelled = true; };
  }, [user, profile?.bloodType, profile?.medications, profile?.allergies, profile?.emergencyContact]);

  if (!user) return null;

  const ftpN = Number(ftp) || 0;
  const wN = Number(weightKg) || 0;
  const wkg = wN > 0 && ftpN > 0 ? (ftpN / wN).toFixed(2) : "—";
  const maxHrN = Number(maxHr) || 184;

  async function handleSave() {
    if (!user) return;
    const updates: Record<string, unknown> = {};

    if (ftp.trim() === "") {
      updates.ftp = null;
    } else {
      const v = Number(ftp);
      if (!Number.isFinite(v) || v < 50 || v > 2000) {
        showToast(t("training.ftpRange"));
        return;
      }
      updates.ftp = v;
    }
    if (maxHr.trim() === "") {
      updates.maxHr = null;
    } else {
      const v = Number(maxHr);
      if (!Number.isFinite(v) || v < 50 || v > 250) {
        showToast(t("training.maxHrRange"));
        return;
      }
      updates.maxHr = v;
    }
    if (lthr.trim() === "") {
      updates.lthr = null;
    } else {
      const v = Number(lthr);
      if (!Number.isFinite(v) || v < 50 || v > 250) {
        showToast(t("training.lthrRange"));
        return;
      }
      updates.lthr = v;
    }
    if (thresholdPace.trim() === "") {
      updates.thresholdPace = null;
    } else {
      const s = mmssToSecs(thresholdPace);
      if (s === null) {
        showToast(t("training.paceFormat"));
        return;
      }
      updates.thresholdPace = s;
    }
    if (css.trim() === "") {
      updates.css = null;
    } else {
      const s = mmssToSecs(css);
      if (s === null) {
        showToast(t("training.cssFormat"));
        return;
      }
      updates.css = s;
    }

    if (weightKg.trim() === "") {
      updates.weightKg = null;
    } else {
      const v = Number(weightKg);
      if (!Number.isFinite(v) || v < 20 || v > 300) {
        showToast(t("personal.weightRange"));
        return;
      }
      updates.weightKg = v;
    }
    if (heightCm.trim() === "") {
      updates.heightCm = null;
    } else {
      const v = Number(heightCm);
      if (!Number.isFinite(v) || v < 100 || v > 250) {
        showToast(t("personal.heightRange"));
        return;
      }
      updates.heightCm = v;
    }

    // 의료/응급 PII 는 루트가 아니라 owner-only 서브컬렉션에 별도 기록(#524).
    const hasName = emergency.name.trim() !== "";
    const hasPhone = emergency.phone.trim() !== "";
    if (hasName !== hasPhone) {
      showToast(t("personal.phoneRequired"));
      return;
    }
    let emergencyContact: EmergencyContact | null = null;
    if (hasName && hasPhone) {
      const rel = emergency.relationship?.trim() ?? "";
      emergencyContact = { name: emergency.name.trim(), phone: emergency.phone.trim() };
      if (rel) emergencyContact.relationship = rel;
    }
    const medical: MedicalProfile = {
      bloodType: bloodType === "UNKNOWN" ? null : bloodType,
      medications: medications.trim() || null,
      allergies: allergies.trim() || null,
      emergencyContact,
    };

    setSaving(true);
    try {
      // 라이더 임계값(ftp/maxHr/weightKg) 은 디바이스 settings JSON 을 진실 소스로 일원화.
      // 비-null 값은 syncRiderMetricsToDevices 로 디바이스에 쓴 뒤 CF `syncDeviceSettingsToUser`
      // 가 자동으로 root 에 미러 — 같은 값으로 두 번 쓰지 않도록 root updates 에서 분리.
      // null(클리어) 은 디바이스가 "기본값 사용" 의미와 다르므로 root 에는 직접 null 로 쓴다.
      const ftpForSync = typeof updates.ftp === "number" ? updates.ftp : undefined;
      const maxHrForSync = typeof updates.maxHr === "number" ? updates.maxHr : undefined;
      const weightForSync =
        typeof updates.weightKg === "number" ? updates.weightKg : undefined;
      const needDeviceSync =
        ftpForSync !== undefined ||
        maxHrForSync !== undefined ||
        weightForSync !== undefined;

      const syncErrors: string[] = [];
      let devicesUpdated = 0;
      if (needDeviceSync) {
        try {
          const result = await syncRiderMetricsToDevices(user.uid, {
            ftp: ftpForSync,
            maxHr: maxHrForSync,
            weightKg: weightForSync,
          });
          devicesUpdated = result.updatedDevices;
          if (result.failures.length > 0) {
            const failedNames = result.failures
              .map((f) => f.deviceName || f.deviceId)
              .join(", ");
            syncErrors.push(t("training.syncDeviceFail", { count: result.failures.length, names: failedNames }));
          }
        } catch (e) {
          syncErrors.push(t("training.syncDeviceError", { message: e instanceof Error ? e.message : String(e) }));
        }
      }

      // 디바이스가 하나도 갱신되지 않았으면 (사용자가 모바일 앱을 아직 안 썼거나 디바이스
      // sync 실패) root 에 라이더 필드 fallback 쓰기 — 분석 탭 / feasibility 에 즉시 반영
      // 보장. 1개 이상 갱신되었으면 CF 미러를 신뢰하고 root 에는 쓰지 않는다.
      const rootUpdates: Record<string, unknown> = { ...updates };
      if (devicesUpdated > 0) {
        if (ftpForSync !== undefined) delete rootUpdates.ftp;
        if (maxHrForSync !== undefined) delete rootUpdates.maxHr;
        if (weightForSync !== undefined) delete rootUpdates.weightKg;
      }
      if (Object.keys(rootUpdates).length > 0) {
        await updateDoc(doc(firestore, "users", user.uid), rootUpdates);
      }
      // 의료/응급 PII → owner-only 서브컬렉션(#524). 루트엔 쓰지 않음(노출 차단).
      await setDoc(doc(firestore, "users", user.uid, "private", "medical"), medical, { merge: true });
      if (weightForSync !== undefined && bikeProfiles.length > 0) {
        // 자전거가 여러 대일 때 일괄 반영은 가족 공유나 자전거별 다른 라이더 케이스에서
        // 의도치 않은 데이터 손실이 가능하므로 명시적 confirm. 1대만 있으면 자동 동기화.
        const shouldSyncBikes =
          bikeProfiles.length === 1 ||
          window.confirm(
            t("training.syncBikeConfirm", { count: bikeProfiles.length }),
          );
        if (shouldSyncBikes) {
          try {
            await syncRiderWeightToBikeProfiles(user.uid, weightForSync);
          } catch (e) {
            syncErrors.push(t("training.syncBikeError", { message: e instanceof Error ? e.message : String(e) }));
          }
        }
      }

      if (syncErrors.length === 0) {
        showToast(t("training.saved"));
      } else {
        showToast(t("training.syncPartialFail", { errors: syncErrors.join(" / ") }));
      }
    } catch (e) {
      showToast(`${t("training.saveFailed")}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setFtp(profile?.ftp ? String(profile.ftp) : "");
    setMaxHr(profile?.maxHr ? String(profile.maxHr) : "");
    setLthr(profile?.lthr ? String(profile.lthr) : "");
    setThresholdPace(profile?.thresholdPace ? secsToMmss(profile.thresholdPace) : "");
    setCss(profile?.css ? secsToMmss(profile.css) : "");
    setWeightKg(profile?.weightKg ? String(profile.weightKg) : "");
    setHeightCm(profile?.heightCm ? String(profile.heightCm) : "");
    setBloodType(profile?.bloodType ?? "UNKNOWN");
    setMedications(profile?.medications ?? "");
    setAllergies(profile?.allergies ?? "");
    setEmergency({
      name: profile?.emergencyContact?.name ?? "",
      phone: profile?.emergencyContact?.phone ?? "",
      relationship: profile?.emergencyContact?.relationship ?? "",
    });
  }

  return (
    <>
      <StatGrid
        items={[
          { label: "FTP", value: ftp || "—", unit: "W" },
          { label: "W/kg", value: wkg, highlight: true },
          { label: t("training.statMaxHr"), value: maxHr || "—", unit: "bpm" },
          { label: t("training.statVo2max"), value: "—", unit: t("training.statUnit"), muted: true },
        ]}
      />

      <SettingsCard title={t("training.cardPhysique")} dense>
        <FieldGrid cols={2}>
          <Field label={t("training.fieldWeight")} hint={t("training.fieldWeightHint")}>
            <input
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="68"
              style={monoInputStyle}
            />
          </Field>
          <Field label={t("training.fieldHeight")} hint={t("training.fieldHeightHint")}>
            <input
              value={heightCm}
              onChange={(e) => setHeightCm(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="172"
              style={monoInputStyle}
            />
          </Field>
        </FieldGrid>
      </SettingsCard>

      <ThresholdSuggestionBanner
        onAccepted={(applied) => {
          if (applied.ftp != null) setFtp(String(applied.ftp));
          if (applied.lthr != null) setLthr(String(applied.lthr));
          if (applied.maxHr != null) setMaxHr(String(applied.maxHr));
        }}
      />

      {/* FTP 테스트 모드 — Ramp/20분/All-out 전용 테스트에서 FTP 후보 산출 → 보수적 확인 → 적용(#307).
          적용 시 아래 FTP 필드를 채우며, 저장하면 임계 우선순위(프로필 우선)에 따라 과거 분석에 즉시 재반영. */}
      <SettingsCard title={t("training.ftpTest.title")} dense>
        <Text as="div" variant="eyebrow" style={{ color: "var(--ink-3)", marginBottom: 8 }}>
          {t("training.ftpTest.desc")}
        </Text>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {(["ramp", "twenty_min", "all_out"] as FtpTestProtocol[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setFtpTestProtocol(p)}
              className="rounded-[var(--r-sm)] transition-colors"
              style={{
                padding: "5px 10px",
                fontSize: "var(--fs-xs)",
                border: `1px solid ${ftpTestProtocol === p ? "var(--lime)" : "var(--line-soft)"}`,
                background: ftpTestProtocol === p ? "color-mix(in oklch, var(--lime) 12%, transparent)" : "transparent",
                color: ftpTestProtocol === p ? "var(--lime)" : "var(--ink-2)",
                cursor: "pointer",
              }}
            >
              {t(`training.ftpTest.protocol.${p}`)}
            </button>
          ))}
        </div>
        <FieldGrid cols={2}>
          <Field label={t(`training.ftpTest.input.${ftpTestProtocol}`)} hint={t("training.ftpTest.inputHint")}>
            <input
              value={ftpTestInput}
              onChange={(e) => setFtpTestInput(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="300"
              style={monoInputStyle}
            />
          </Field>
        </FieldGrid>
        {ftpTestCandidate != null && (() => {
          const curFtp = ftp ? Number(ftp) : null;
          return (
            <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <Text as="div" variant="num" style={{ fontSize: "var(--fs-xl)", color: "var(--ink-0)", lineHeight: 1 }}>
                {ftpTestCandidate}<span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", marginLeft: 3 }}>W</span>
                <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", marginLeft: 8 }}>
                  {t("training.ftpTest.candidate")}{curFtp ? ` · ${t("training.ftpTest.current")} ${curFtp}W` : ""}
                </span>
              </Text>
              <Button
                variant={ftpTestDrop ? "secondary" : "primary"}
                onClick={() => {
                  if (ftpTestDrop && !window.confirm(t("training.ftpTest.dropConfirm", { current: curFtp, candidate: ftpTestCandidate }))) return;
                  setFtp(String(ftpTestCandidate));
                  showToast(t("training.ftpTest.applied"));
                }}
                style={{ padding: "6px 14px", fontSize: "var(--fs-sm)" }}
              >
                {t("training.ftpTest.apply")}
              </Button>
              {ftpTestDrop && (
                <Text as="div" variant="eyebrow" style={{ color: "var(--amber)", flexBasis: "100%" }}>
                  {t("training.ftpTest.dropWarn")}
                </Text>
              )}
            </div>
          );
        })()}
      </SettingsCard>

      <SettingsCard
        title={t("training.cardThresholds")}
        action={<Text variant="eyebrow">{t("training.cardThresholdsAction")}</Text>}
      >
        <FieldGrid cols={3}>
          <Field label="FTP" hint={t("training.fieldFtpHint")}>
            <input
              value={ftp}
              onChange={(e) => setFtp(e.target.value.replace(/[^0-9]/g, ""))}
              style={monoInputStyle}
            />
          </Field>
          <Field label={t("training.maxHr")} hint={t("training.fieldMaxHrHint")}>
            <input
              value={maxHr}
              onChange={(e) => setMaxHr(e.target.value.replace(/[^0-9]/g, ""))}
              style={monoInputStyle}
            />
          </Field>
          <Field label="LTHR" hint={t("training.fieldLthrHint")}>
            <input
              value={lthr}
              onChange={(e) => setLthr(e.target.value.replace(/[^0-9]/g, ""))}
              style={monoInputStyle}
            />
          </Field>
          <Field label={t("training.fieldThresholdPace")} hint={t("training.fieldThresholdPaceHint")}>
            <input
              value={thresholdPace}
              onChange={(e) => setThresholdPace(e.target.value)}
              placeholder="4:35"
              style={monoInputStyle}
            />
          </Field>
          <Field label="CSS" hint={t("training.fieldCssHint")}>
            <input
              value={css}
              onChange={(e) => setCss(e.target.value)}
              placeholder="1:45"
              style={monoInputStyle}
            />
          </Field>
        </FieldGrid>
      </SettingsCard>

      <SettingsCard
        title={t("training.cardHrZones")}
        action={<Text variant="eyebrow">{t("training.hrZonesActionBpm", { bpm: maxHrN })}</Text>}
      >
        <ZoneBar refValue={maxHrN} zones={RD_HR_ZONES} />
        <div style={{ marginTop: 'var(--space-4)', fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>
          {t("training.hrZonesNote")}
        </div>
      </SettingsCard>

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
            <select
              value={bloodType}
              onChange={(e) => setBloodType(e.target.value as BloodType)}
              style={fieldInputStyle}
            >
              {BLOOD_TYPES.map((b) => (
                <option key={b} value={b}>
                  {b === "UNKNOWN" ? t("training.bloodTypeNone") : b}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("training.fieldMedications")} hint={t("training.fieldMedicationsHint")}>
            <input
              value={medications}
              onChange={(e) => setMedications(e.target.value)}
              placeholder={t("training.fieldMedicationsPlaceholder")}
              style={fieldInputStyle}
            />
          </Field>
          <Field label={t("training.fieldAllergies")} full hint={t("training.fieldAllergiesHint")}>
            <textarea
              value={allergies}
              onChange={(e) => setAllergies(e.target.value)}
              placeholder={t("training.fieldAllergiesPlaceholder")}
              style={{ ...fieldInputStyle, minHeight: 56, resize: "vertical" }}
            />
          </Field>
        </FieldGrid>
      </SettingsCard>

      <SettingsCard title={t("training.cardEmergency")} dense>
        <FieldGrid cols={3}>
          <Field label={t("training.fieldEmergencyName")}>
            <input
              value={emergency.name}
              onChange={(e) => setEmergency({ ...emergency, name: e.target.value })}
              style={fieldInputStyle}
            />
          </Field>
          <Field label={t("training.fieldEmergencyPhone")}>
            <input
              type="tel"
              value={emergency.phone}
              onChange={(e) => setEmergency({ ...emergency, phone: e.target.value })}
              style={fieldInputStyle}
            />
          </Field>
          <Field label={t("training.fieldEmergencyRelationship")}>
            <input
              value={emergency.relationship ?? ""}
              onChange={(e) =>
                setEmergency({ ...emergency, relationship: e.target.value })
              }
              placeholder={t("training.fieldEmergencyRelationshipPlaceholder")}
              style={fieldInputStyle}
            />
          </Field>
        </FieldGrid>
      </SettingsCard>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 'var(--space-2)' }}>
        <Button variant="secondary" onClick={handleReset} disabled={saving}>
          {t("training.btnReset")}
        </Button>
        <Button variant="primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? t("training.btnSaving") : t("training.btnSave")}
        </Button>
      </div>
    </>
  );
}
