import { isSportUiEnabled } from "../../config/sportFeatures";
import { useEffect, useId, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { doc, getDoc, updateDoc } from "firebase/firestore";



import { firestore, functions } from "../../services/firebase";
import { httpsCallable } from "firebase/functions";
import { logClientError } from "../../services/errorLogger";
import {
  persistRiderMetrics,
} from "../../services/syncRiderMetrics";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { useDialog } from "../../contexts/DialogContext";
import { useLocale } from "../../contexts/LocaleContext";

import {
  SettingsCard,
  Field,
  FieldGrid,
  StatGrid,
  ZoneBar,
} from "./_primitives";
import GlossaryText from "../common/GlossaryText";
import "./PaneThresholds.css";
import { LocalizedLink } from "../LocalizedLink";
import { formatBodyValue } from "./bodyMeasurements";
import { ThresholdSuggestionBanner } from "./ThresholdSuggestionBanner";
import { ToggleControls, ToggleButton, Stat, buttonClass, Button, Input, Text } from "../../theme/components";
import { estimateFtpFromTest, isConservativeDrop, type FtpTestProtocol } from "@shared/training/ftpTest";
import {
  ftpHistorySourceForChange,
  type FtpHistorySource,
} from "@shared/training/ftpHistory";
import { deriveHrZones, isValidHrThresholdRelationship } from "../../utils/hrZones";

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

export function PaneThresholds({ discipline = "bike" }: { discipline?: "bike" | "run" | "swim" | "tri" }) {
  const fieldId = useId();
  const { t } = useTranslation("settings");
  const { user, profile } = useAuth();
  const { units } = useLocale();
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
  const bodyUnit = units === "imperial" ? "imperial" : "metric";
  const [saving, setSaving] = useState(false);

  const baseline = useRef<Record<string, string>>({});
  const revisions = useRef<Record<string, string | null>>({});
  const [confirmedThresholds, setConfirmedThresholds] = useState({ ftp: false, thresholdPace: false, css: false });
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
      revisions.current = { thresholdPace: d.thresholdPaceRevision ?? null, css: d.cssRevision ?? null };
      setConfirmedThresholds({ ftp: Boolean(d.ftpRevision) || d.ftp !== 200,
        thresholdPace: Boolean(d.thresholdPaceRevision) || d.thresholdPace !== 275,
        css: Boolean(d.cssRevision) || d.css !== 108 });
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


  if (!user) return null;

  const ftpN = Number(ftp) || 0;
  const currentWeight = profile?.weightKg !== undefined ? String(profile.weightKg ?? "") : weightKg;
  const currentHeight = profile?.heightCm !== undefined ? String(profile.heightCm ?? "") : heightCm;
  const wN = Number(currentWeight) || 0;
  const wkg = wN > 0 && ftpN > 0 ? (ftpN / wN).toFixed(2) : "—";
  // 사이클링 우선 앱 — 설정 프리뷰는 Friel 사이클 %LTHR 경계를 사용 (#365).

  async function handleSave(confirmMetric?: "ftp" | "thresholdPace" | "css") {
    if (!user || !loaded || saving) return;
    const values = { ftp, maxHr, lthr, thresholdPace, css };
    const updates: Record<string, unknown> = {};

    if (ftp !== baseline.current.ftp || confirmMetric === "ftp") {
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
    if (thresholdPace !== baseline.current.thresholdPace || confirmMetric === "thresholdPace") {
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
    if (css !== baseline.current.css || confirmMetric === "css") {
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

    if (Object.keys(updates).length === 0) return;

    setSaving(true);
    try {
      // 라이더 임계값(ftp/maxHr)은 프로필 root 정본과 디바이스 settings JSON을
      // 한 동작으로 갱신한다. CF 미러 지연과 무관하게 저장 직후 웹 정본도 일치해야 한다.
      // null(클리어) 은 디바이스가 "기본값 사용" 의미와 다르므로 root 에는 직접 null 로 쓴다.
      const ftpForSync = typeof updates.ftp === "number" ? updates.ftp : undefined;
      const maxHrForSync = typeof updates.maxHr === "number" ? updates.maxHr : undefined;
      const needDeviceSync = ftpForSync !== undefined || maxHrForSync !== undefined;

      // 역치 값·출처·리비전·이력은 서버 transaction 하나에서 저장한다.
      const metricPatch = Object.fromEntries(["thresholdPace", "css"]
        .filter(field => field in updates).map(field => [field, updates[field]]));
      if (Object.keys(metricPatch).length) {
        const result = await httpsCallable<unknown, { revision: string }>(functions, "updateProfileMetrics")({
          mutationId: crypto.randomUUID(), patch: metricPatch, expectedRevisions: { ...revisions.current },
        });
        for (const field of Object.keys(metricPatch)) revisions.current[field] = result.data.revision;
        setConfirmedThresholds(previous => ({ ...previous,
          ...("thresholdPace" in metricPatch ? { thresholdPace: true } : {}), ...("css" in metricPatch ? { css: true } : {}) }));
      }
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
          weightKg: undefined,
        }, { ftpHistorySource });
        for (const key of ["ftp", "maxHr"] as const) {
          if (typeof updates[key] === "number") baseline.current[key] = values[key];
        }
        if (ftpForSync !== undefined) {
          // FTP 정본+이력 커밋은 여기서 이미 완료됐다. 이후 다른 프로필 저장이
          // 실패해도 재시도가 같은 FTP 이력을 다시 append하지 않도록 기준을 즉시 확정한다.
          setSavedFtp(ftpForSync);
          setConfirmedThresholds(previous => ({ ...previous, ftp: true }));
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
      for (const field of ["thresholdPace", "css"]) delete rootUpdates[field];
      if (Object.keys(rootUpdates).length > 0) {
        await updateDoc(doc(firestore, "users", user.uid), rootUpdates);
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
    setCss(v.css ?? "");
  }

  const ftpField = (
          <Field explain label="FTP" hint={t("training.fieldFtpHint")}>
            <Input mono id={`${fieldId}-ftp`} aria-label={"FTP"}
              value={ftp}
              onChange={(e) => {
                setFtp(e.target.value.replace(/[^0-9]/g, ""));
                setFtpChangeSource("manual");
              }}

            />
            {!confirmedThresholds.ftp && Number(ftp) === 200 && <Button size="md" variant="secondary" onClick={() => { void handleSave("ftp"); }} disabled={saving}>
              {t("training.confirmThreshold")}
            </Button>}
          </Field>
  );
  const maxHrField = (
          <Field label={t("training.maxHr")} hint={t("training.fieldMaxHrHint")}>
            <Input mono id={`${fieldId}-max-hr`} aria-label={t("training.maxHr")}
              value={maxHr}
              onChange={(e) => setMaxHr(e.target.value.replace(/[^0-9]/g, ""))}

            />
          </Field>
  );
  const lthrField = (
          <Field explain label="LTHR" hint={t("training.fieldLthrHint")}>
            <Input mono id={`${fieldId}-lthr`} aria-label={"LTHR"}
              value={lthr}
              onChange={(e) => setLthr(e.target.value.replace(/[^0-9]/g, ""))}

            />
          </Field>
  );
  const paceField = (
          <Field label={t("training.fieldThresholdPace")} hint={t("training.fieldThresholdPaceHint")}>
            <Input mono id={`${fieldId}-threshold-pace`} aria-label={t("training.fieldThresholdPace")}
              value={thresholdPace}
              onChange={(e) => setThresholdPace(e.target.value)}
              placeholder="4:35"

            />
            {!confirmedThresholds.thresholdPace && mmssToSecs(thresholdPace) === 275 && <Button size="md" variant="secondary" onClick={() => { void handleSave("thresholdPace"); }} disabled={saving}>
              {t("training.confirmThreshold")}
            </Button>}
          </Field>
  );
  const cssField = (
          <Field explain label="CSS" hint={t("training.fieldCssHint")}>
            <Input mono id={`${fieldId}-css`} aria-label={"CSS"}
              value={css}
              onChange={(e) => setCss(e.target.value)}
              placeholder="1:45"

            />
            {!confirmedThresholds.css && mmssToSecs(css) === 108 && <Button size="md" variant="secondary" onClick={() => { void handleSave("css"); }} disabled={saving}>
              {t("training.confirmThreshold")}
            </Button>}
          </Field>
  );

  const bodyReference = (
        <div className="threshold-body-reference" data-testid="K1-5-6">
            <span>{t("training.bodyReference", {
              height: formatBodyValue(currentHeight, bodyUnit, "height") || "—",
              heightUnit: bodyUnit === "imperial" ? "in" : "cm",
              weight: formatBodyValue(currentWeight, bodyUnit, "weight") || "—",
              weightUnit: bodyUnit === "imperial" ? "lb" : "kg",
            })}</span>
            <span className="threshold-body-reference__basis">{t("training.bodyWeightBasis")}</span>
            <LocalizedLink to="/settings/account#body-info" className={buttonClass({ variant: "ghost", size: "sm" })}>{t("training.editBody")}</LocalizedLink>
        </div>
  );
  const ftpGroup = <div>{ftpField}{bodyReference}</div>;
  const ftpTestCard = (
      <SettingsCard data-testid="K1-5-5" title={<GlossaryText>{t("training.ftpTest.title")}</GlossaryText>} dense>
        <Text as="div" variant="bodySmall" style={{ color: "var(--ink-3)", marginBottom: "var(--space-2)" }}>
          <GlossaryText>{t("training.ftpTest.desc")}</GlossaryText>
        </Text>
        <ToggleControls variant="axis" aria-label={t("training.ftpTest.title")}>
          {(["ramp", "twenty_min", "all_out"] as FtpTestProtocol[]).map(p => <ToggleButton key={p} selected={ftpTestProtocol === p} onClick={() => setFtpTestProtocol(p)}>{t(`training.ftpTest.protocol.${p}`)}</ToggleButton>)}
        </ToggleControls>
        <FieldGrid cols={2}>
          <Field explain label={t(`training.ftpTest.input.${ftpTestProtocol}`)} hint={t("training.ftpTest.inputHint")}>
            <Input mono id={`${fieldId}-ftp-test`} aria-label={t(`training.ftpTest.input.${ftpTestProtocol}`)}
              value={ftpTestInput}
              onChange={(e) => setFtpTestInput(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="300"

            />
          </Field>
        </FieldGrid>
        {ftpTestCandidate != null && (() => {
          const curFtp = ftp ? Number(ftp) : null;
          return (
            <div style={{ marginTop: "var(--space-2)", display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
              <Stat compact label={t("training.ftpTest.candidate")} value={ftpTestCandidate} unit="W" />
              {curFtp != null && <Text variant="bodySmall" tone="secondary">{t("training.ftpTest.current")} {curFtp} W</Text>}
              <Button
                variant={ftpTestDrop ? "secondary" : "primary"}
                onClick={async () => {
                  if (ftpTestDrop && !(await dialog.confirm(t("training.ftpTest.dropConfirm", { current: curFtp, candidate: ftpTestCandidate })))) return;
                  setFtp(String(ftpTestCandidate));
                  setFtpChangeSource("test");
                  showToast(t("training.ftpTest.applied"));
                }}
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

  );

  return (
    <>
    {loadFailed && <div role="alert">{t("training.loadFailed")} <Button onClick={() => setLoadAttempt(value => value + 1)}>{t("common:button.retry")}</Button></div>}
    <fieldset className="threshold-fields" data-testid="K1-5" disabled={!loaded || saving} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>

      <div data-testid="K1-5-1"><StatGrid
        items={discipline === "run" ? [
          { label: t("training.fieldThresholdPace"), value: thresholdPace || "—", unit: "/km" },
          { label: "LTHR", value: lthr || "—", unit: "bpm" },
          { label: t("training.statMaxHr"), value: maxHr || "—", unit: "bpm" },
          { label: "CSS", value: css || "—", unit: "/100m" },
        ].filter(item => isSportUiEnabled("swim") || item.label !== "CSS") : [
          { label: <GlossaryText>FTP</GlossaryText>, value: ftp || "—", unit: "W" },
          { label: <GlossaryText>W/kg</GlossaryText>, value: wkg, highlight: true },
          { label: t("training.statMaxHr"), value: maxHr || "—", unit: "bpm" },
          { label: t("training.statVo2max"), value: "—", unit: t("training.statUnit"), muted: true },
        ]}
      /></div>


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

      <SettingsCard
        data-testid="K1-5-3" title={t("training.cardThresholds")}
        action={<Text variant="eyebrow">{t("training.cardThresholdsAction")}</Text>}
      >

        <FieldGrid cols={3}>
          <div className="threshold-sport-group-title">{t(`training.settingsSport.${discipline}`)}</div>
          {discipline === "run" ? <>{paceField}{lthrField}{maxHrField}<div className="threshold-sport-group-title">{t("training.otherSports")}</div>{ftpGroup}{isSportUiEnabled("swim") && cssField}</> : discipline === "tri" ? <>{maxHrField}{lthrField}<div className="threshold-sport-group-title">{t("training.settingsSport.bike")}</div>{ftpGroup}<div className="threshold-sport-group-title">{t("training.settingsSport.run")}</div>{paceField}{isSportUiEnabled("swim") && <div className="threshold-sport-group-title">{t("training.settingsSport.swim")}</div>}{isSportUiEnabled("swim") && cssField}</> : <>{ftpGroup}{maxHrField}{lthrField}<div className="threshold-sport-group-title">{t("training.otherSports")}</div>{paceField}{isSportUiEnabled("swim") && cssField}</>}
        </FieldGrid>
      </SettingsCard>

      {discipline === "bike" && ftpTestCard}

      {(discipline === "tri" ? ["bike", "run"] as const : [discipline === "run" ? "run" : "bike"] as const).map(sport => {
        const preview = deriveHrZones({ maxHr: Number(maxHr), lthr: Number(lthr), sport });
        return <SettingsCard key={sport} data-testid={sport === (discipline === "run" ? "run" : "bike") ? "K1-5-4" : undefined}
          title={`${t("training.cardHrZones")} · ${t(`training.settingsSport.${sport}`)}`}
          action={<Text variant="eyebrow">{t(`training.hrZonesSource.${preview.source}`, { bpm: preview.referenceBpm })}</Text>}>
          <ZoneBar refValue={preview.referenceBpm} zones={preview.zones} compactLegend />
          <Text as="p" variant="caption" tone="tertiary">{t(`training.hrZonesNote.${preview.source}`)}</Text>
        </SettingsCard>;
      })}

      {discipline !== "bike" && ftpTestCard}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 'var(--space-2)' }}>
        <Button variant="secondary" onClick={handleReset} disabled={saving}>
          {t("training.btnReset")}
        </Button>
        <Button variant="primary"
          data-testid="K1-5-7"
          onClick={() => { void handleSave(); }}
          disabled={saving}
        >
          {saving ? t("training.btnSaving") : t("training.btnSave")}
        </Button>
      </div>
    </fieldset>
    </>
  );
}
