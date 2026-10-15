import { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { doc, getDoc, updateDoc } from "firebase/firestore";



import { firestore } from "../../services/firebase";
import { logClientError } from "../../services/errorLogger";
import {
  persistRiderMetrics,
  syncRiderWeightToBikeProfiles,
} from "../../services/syncRiderMetrics";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { useDialog } from "../../contexts/DialogContext";
import { useLocale } from "../../contexts/LocaleContext";
import { useBikeProfiles } from "../../hooks/useBikeProfiles";

import {
  SettingsCard,
  Field,
  FieldGrid,
  StatGrid,
  ZoneBar,
  monoInputStyle,
} from "./_primitives";
import { ThresholdSuggestionBanner } from "./ThresholdSuggestionBanner";
import { Button, Text } from "../../theme/components";
import { estimateFtpFromTest, isConservativeDrop, type FtpTestProtocol } from "@shared/training/ftpTest";
import {
  ftpHistorySourceForChange,
  type FtpHistorySource,
} from "@shared/training/ftpHistory";
import { deriveHrZones, isValidHrThresholdRelationship } from "../../utils/hrZones";

type BodyUnit = "metric" | "imperial";
const KG_PER_LB = 0.45359237;
const CM_PER_IN = 2.54;

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

function formatBodyValue(value: string, unit: BodyUnit, kind: "weight" | "height"): string {
  if (value.trim() === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  if (unit === "metric") return value;
  const converted = kind === "weight" ? n / KG_PER_LB : n / CM_PER_IN;
  return String(Math.round(converted * 10) / 10);
}

function parseBodyValue(value: string, unit: BodyUnit, kind: "weight" | "height"): string {
  const clean = value.replace(/[^0-9.]/g, "");
  if (clean.trim() === "") return "";
  const n = Number(clean);
  if (!Number.isFinite(n)) return "";
  const metric = unit === "metric" ? n : kind === "weight" ? n * KG_PER_LB : n * CM_PER_IN;
  return String(Math.round(metric * 10) / 10);
}

export function PaneThresholds() {
  const { t } = useTranslation("settings");
  const { user, profile } = useAuth();
  const { units } = useLocale();
  const { profiles: bikeProfiles } = useBikeProfiles(user?.uid ?? null);
  const { showToast } = useToast();
  const dialog = useDialog();

  const [ftp, setFtp] = useState("");
  const [savedFtp, setSavedFtp] = useState<number | null | undefined>(profile?.ftp);
  const [ftpChangeSource, setFtpChangeSource] = useState<FtpHistorySource>("manual");
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
  const [bodyUnit, setBodyUnit] = useState<BodyUnit>(units === "imperial" ? "imperial" : "metric");
  const [saving, setSaving] = useState(false);

  const baseline = useRef<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoaded(false);
    setLoadFailed(false);
    void getDoc(doc(firestore, "users", user.uid)).then((snap) => {
      if (cancelled) return;
      const d = snap.data() ?? {};
      const values = {
        ftp: typeof d.ftp === "number" ? String(d.ftp) : "",
        maxHr: typeof d.maxHr === "number" ? String(d.maxHr) : "",
        lthr: typeof d.lthr === "number" ? String(d.lthr) : "",
        thresholdPace: secsToMmss(d.thresholdPace), css: secsToMmss(d.css),
        weightKg: typeof d.weightKg === "number" ? String(d.weightKg) : "",
        heightCm: typeof d.heightCm === "number" ? String(d.heightCm) : "",
      };
      baseline.current = values;
      setFtp(values.ftp); setSavedFtp(d.ftp ?? null);
      setMaxHr(values.maxHr); setLthr(values.lthr);
      setThresholdPace(values.thresholdPace); setCss(values.css);
      setWeightKg(values.weightKg); setHeightCm(values.heightCm);
      setLoaded(true);
    }).catch((error) => {
      if (cancelled) return;
      setLoadFailed(true);
      logClientError("PaneThresholds.load", error, {});
    });
    return () => { cancelled = true; };
  }, [user?.uid, loadAttempt]);

  useEffect(() => {
    setBodyUnit(units === "imperial" ? "imperial" : "metric");
  }, [units]);

  if (!user) return null;

  const ftpN = Number(ftp) || 0;
  const wN = Number(weightKg) || 0;
  const wkg = wN > 0 && ftpN > 0 ? (ftpN / wN).toFixed(2) : "—";
  // 사이클링 우선 앱 — 설정 프리뷰는 Friel 사이클 %LTHR 경계를 사용 (#365).
  const hrZonePreview = deriveHrZones({ maxHr: Number(maxHr), lthr: Number(lthr), sport: "bike" });

  async function handleSave() {
    if (!user || !loaded || saving) return;
    const values = { ftp, maxHr, lthr, thresholdPace, css, weightKg, heightCm };
    const updates: Record<string, unknown> = {};

    if (ftp !== baseline.current.ftp) {
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
    }
    if (maxHr !== baseline.current.maxHr) {
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
    }
    if (lthr !== baseline.current.lthr) {
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
    }
    if (("maxHr" in updates || "lthr" in updates) && !isValidHrThresholdRelationship(Number(maxHr) || null, Number(lthr) || null)) {
      showToast(t("training.lthrBelowMaxHr"));
      return;
    }
    if (thresholdPace !== baseline.current.thresholdPace) {
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
    }
    if (css !== baseline.current.css) {
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
    }

    if (weightKg !== baseline.current.weightKg) {
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
    }
    if (heightCm !== baseline.current.heightCm) {
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
    }

    if (Object.keys(updates).length === 0) return;

    setSaving(true);
    try {
      // 라이더 임계값(ftp/maxHr/weightKg)은 프로필 root 정본과 디바이스 settings JSON을
      // 한 동작으로 갱신한다. CF 미러 지연과 무관하게 저장 직후 웹 정본도 일치해야 한다.
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
      if (needDeviceSync) {
        const ftpHistorySource = ftpHistorySourceForChange(
          savedFtp,
          ftpForSync,
          ftpChangeSource,
        );
        // persistRiderMetrics 내부의 device 실패는 result.failures 로 반환되지만,
        // 프로필+이력 batch 실패는 throw한다. 후자는 아래 저장 흐름을 중단해야 재시도 때
        // audit source가 보존되고, FTP만 별도 저장되는 부분 성공이 생기지 않는다.
        const result = await persistRiderMetrics(user.uid, {
          ftp: ftpForSync,
          maxHr: maxHrForSync,
          weightKg: weightForSync,
        }, { ftpHistorySource });
        for (const key of ["ftp", "maxHr", "weightKg"] as const) {
          if (typeof updates[key] === "number") baseline.current[key] = values[key];
        }
        if (ftpForSync !== undefined) {
          // FTP 정본+이력 커밋은 여기서 이미 완료됐다. 이후 다른 프로필 저장이
          // 실패해도 재시도가 같은 FTP 이력을 다시 append하지 않도록 기준을 즉시 확정한다.
          setSavedFtp(ftpForSync);
          setFtpChangeSource("manual");
        }
        if (result.failures.length > 0) {
          const failedNames = result.failures
            .map((f) => f.deviceName || f.deviceId)
            .join(", ");
          syncErrors.push(t("training.syncDeviceFail", { count: result.failures.length, names: failedNames }));
        }
      }

      // persistRiderMetrics가 기기 동기화와 root 정본 갱신을 함께 처리하므로,
      // 나머지 프로필 필드만 이 update에 포함한다.
      const rootUpdates: Record<string, unknown> = { ...updates };
      if (ftpForSync !== undefined) delete rootUpdates.ftp;
      if (maxHrForSync !== undefined) delete rootUpdates.maxHr;
      if (weightForSync !== undefined) delete rootUpdates.weightKg;
      if (Object.keys(rootUpdates).length > 0) {
        await updateDoc(doc(firestore, "users", user.uid), rootUpdates);
      }
      if (weightForSync !== undefined && bikeProfiles.length > 0) {
        // 자전거가 여러 대일 때 일괄 반영은 가족 공유나 자전거별 다른 라이더 케이스에서
        // 의도치 않은 데이터 손실이 가능하므로 명시적 confirm. 1대만 있으면 자동 동기화.
        const shouldSyncBikes =
          bikeProfiles.length === 1 ||
          await dialog.confirm(
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
      baseline.current = { ...baseline.current, ...values };
      if (updates.ftp === null) {
        setSavedFtp(null);
        setFtpChangeSource("manual");
      }
    } catch (e) {
      showToast(`${t("training.saveFailed")}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    const v = baseline.current;
    setFtp(v.ftp ?? ""); setSavedFtp(Number(v.ftp) || null); setFtpChangeSource("manual");
    setMaxHr(v.maxHr ?? ""); setLthr(v.lthr ?? ""); setThresholdPace(v.thresholdPace ?? "");
    setCss(v.css ?? ""); setWeightKg(v.weightKg ?? ""); setHeightCm(v.heightCm ?? "");
  }

  return (
    <>
    {loadFailed && <div role="alert">{t("training.loadFailed")} <Button onClick={() => setLoadAttempt(value => value + 1)}>{t("common:button.retry")}</Button></div>}
    <fieldset data-testid="K1-5" disabled={!loaded || saving} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>

      <div data-testid="K1-5-1"><StatGrid
        items={[
          { label: "FTP", value: ftp || "—", unit: "W" },
          { label: "W/kg", value: wkg, highlight: true },
          { label: t("training.statMaxHr"), value: maxHr || "—", unit: "bpm" },
          { label: t("training.statVo2max"), value: "—", unit: t("training.statUnit"), muted: true },
        ]}
      /></div>

      <SettingsCard
        data-testid="K1-5-6" title={t("training.cardPhysique")}
        dense
        action={
          <div style={{ display: "flex", gap: "var(--space-1)", padding: 2, background: "var(--bg-2)", borderRadius: "var(--r-md)" }}>
            {(["metric", "imperial"] as const).map((unit) => (
              <button
                key={unit}
                type="button"
                onClick={() => setBodyUnit(unit)}
                className="rounded-[var(--r-sm)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lime)]"
                style={{
                  border: "none",
                  padding: "5px 10px",
                  fontSize: "var(--fs-xs)",
                  cursor: "pointer",
                  background: bodyUnit === unit ? "var(--bg-1)" : "transparent",
                  color: bodyUnit === unit ? "var(--ink-0)" : "var(--ink-3)",
                }}
              >
                {t(`training.bodyUnit.${unit}`)}
              </button>
            ))}
          </div>
        }
      >
        <FieldGrid cols={2}>
          <Field
            label={bodyUnit === "imperial" ? t("training.fieldWeightLb") : t("training.fieldWeight")}
            hint={bodyUnit === "imperial" ? t("training.fieldWeightLbHint") : t("training.fieldWeightHint")}
          >
            <input
              value={formatBodyValue(weightKg, bodyUnit, "weight")}
              onChange={(e) => setWeightKg(parseBodyValue(e.target.value, bodyUnit, "weight"))}
              placeholder={bodyUnit === "imperial" ? "150" : "68"}
              style={monoInputStyle}
            />
          </Field>
          <Field
            label={bodyUnit === "imperial" ? t("training.fieldHeightIn") : t("training.fieldHeight")}
            hint={bodyUnit === "imperial" ? t("training.fieldHeightInHint") : t("training.fieldHeightHint")}
          >
            <input
              value={formatBodyValue(heightCm, bodyUnit, "height")}
              onChange={(e) => setHeightCm(parseBodyValue(e.target.value, bodyUnit, "height"))}
              placeholder={bodyUnit === "imperial" ? "68" : "172"}
              style={monoInputStyle}
            />
          </Field>
        </FieldGrid>
      </SettingsCard>

      <ThresholdSuggestionBanner
        onAccepted={(applied) => {
          baseline.current = { ...baseline.current, ...Object.fromEntries(Object.entries(applied).filter(([, value]) => value != null).map(([key, value]) => [key, String(value)])) };
          if (applied.ftp != null) {
            setFtp(String(applied.ftp));
            // callable이 이미 profile FTP와 detected 이력을 원자적으로 저장한다.
            // 폼의 저장 기준도 즉시 맞춰 이후 무관한 설정 저장 시 manual 이력이
            // 중복 생성되지 않도록 한다.
            setSavedFtp(applied.ftp);
            setFtpChangeSource("manual");
          }
          if (applied.lthr != null) setLthr(String(applied.lthr));
          if (applied.maxHr != null) setMaxHr(String(applied.maxHr));
        }}
      />

      {/* FTP 테스트 모드 — Ramp/20분/All-out 전용 테스트에서 FTP 후보 산출 → 보수적 확인 → 적용(#307).
          적용 시 아래 FTP 필드를 채우며, 저장하면 임계 우선순위(프로필 우선)에 따라 과거 분석에 즉시 재반영. */}
      <SettingsCard data-testid="K1-5-5" title={t("training.ftpTest.title")} dense>
        <Text as="div" variant="eyebrow" style={{ color: "var(--ink-3)", marginBottom: "var(--space-2)" }}>
          {t("training.ftpTest.desc")}
        </Text>
        <div style={{ display: "flex", gap: "var(--space-1-5)", flexWrap: "wrap", marginBottom: "var(--space-2)" }}>
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
            <div style={{ marginTop: "var(--space-2)", display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
              <Text as="div" variant="num" style={{ fontSize: "var(--fs-xl)", color: "var(--ink-0)", lineHeight: 1 }}>
                {ftpTestCandidate}<span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", marginLeft: "var(--space-1)" }}>W</span>
                <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", marginLeft: "var(--space-2)" }}>
                  {t("training.ftpTest.candidate")}{curFtp ? ` · ${t("training.ftpTest.current")} ${curFtp}W` : ""}
                </span>
              </Text>
              <Button
                variant={ftpTestDrop ? "secondary" : "primary"}
                onClick={async () => {
                  if (ftpTestDrop && !(await dialog.confirm(t("training.ftpTest.dropConfirm", { current: curFtp, candidate: ftpTestCandidate })))) return;
                  setFtp(String(ftpTestCandidate));
                  setFtpChangeSource("test");
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
        data-testid="K1-5-3" title={t("training.cardThresholds")}
        action={<Text variant="eyebrow">{t("training.cardThresholdsAction")}</Text>}
      >
        <FieldGrid cols={3}>
          <Field label="FTP" hint={t("training.fieldFtpHint")}>
            <input
              value={ftp}
              onChange={(e) => {
                setFtp(e.target.value.replace(/[^0-9]/g, ""));
                setFtpChangeSource("manual");
              }}
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
        data-testid="K1-5-4" title={t("training.cardHrZones")}
        action={<Text variant="eyebrow">{t(`training.hrZonesSource.${hrZonePreview.source}`, { bpm: hrZonePreview.referenceBpm })}</Text>}
      >
        <ZoneBar refValue={hrZonePreview.referenceBpm} zones={hrZonePreview.zones} />
        <div style={{ marginTop: 'var(--space-4)', fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>
          {t(`training.hrZonesNote.${hrZonePreview.source}`)}
        </div>
      </SettingsCard>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 'var(--space-2)' }}>
        <Button variant="secondary" onClick={handleReset} disabled={saving}>
          {t("training.btnReset")}
        </Button>
        <Button variant="primary"
          data-testid="K1-5-7"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? t("training.btnSaving") : t("training.btnSave")}
        </Button>
      </div>
    </fieldset>
    </>
  );
}
