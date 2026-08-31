import { useEffect, useState } from "react";
import { LayoutEditorCard } from "./LayoutEditorCard";
import { useBikeProfileLayout } from "../../hooks/useBikeProfileLayout";
import { DEFAULT_DATA_PAGE_CONFIG } from "@shared/types/deviceSettings";
import { useSearchParams } from "react-router-dom";
import type { DataPageConfig } from "@shared/types/deviceSettings";
import { useTranslation } from "react-i18next";
import { Bike as BikeIcon, Check, Pencil, Trash2, X } from "lucide-react";

import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { useDialog } from "../../contexts/DialogContext";
import { useActiveBikeProfile } from "../../hooks/useActiveBikeProfile";
import type {
  BikeProfile,
  ConnectedSensor,
  VirtualPowerConfig,
} from "../../types/bikeProfile";

import {
  SettingsCard,
  Field,
  FieldGrid,
  Toggle,
  fieldInputStyle,
  monoInputStyle,
} from "./_primitives";
import { BackfillStatusCard } from "./BackfillStatusCard";
import { GearKitSection } from "./GearKitSection";
import { Button, Text } from "../../theme/components";

const CDA_PRESETS = [
  { label: "Hoods (0.32)", value: 0.32 },
  { label: "Drops (0.28)", value: 0.28 },
  { label: "Aero (0.25)", value: 0.25 },
  { label: "TT (0.22)", value: 0.22 },
];
const CRR_PRESETS = [
  { label: "Road (0.004)", value: 0.004 },
  { label: "Gravel (0.006)", value: 0.006 },
  { label: "MTB (0.012)", value: 0.012 },
];

const SENSOR_TYPE_KEY: Record<string, string> = {
  SPEED: "equipment.sensorSpeed",
  CADENCE: "equipment.sensorCadence",
  HRM: "equipment.sensorHrm",
  POWER: "equipment.sensorPower",
  DI2: "equipment.sensorDi2",
  AXS: "equipment.sensorAxs",
  RADAR: "equipment.sensorRadar",
  ACTION_CAM: "equipment.sensorActionCam",
};

function formatDate(ms: number): string {
  if (!ms) return "-";
  return new Date(ms).toLocaleDateString("ko-KR");
}

interface SensorRowProps {
  sensor: ConnectedSensor;
  onRemove: () => Promise<void>;
}

function SensorRow({ sensor, onRemove }: SensorRowProps) {
  const { t } = useTranslation("settings");
  const { showToast } = useToast();
  const dialog = useDialog();
  const [busy, setBusy] = useState(false);
  const typeKey = SENSOR_TYPE_KEY[sensor.type];
  const typeLabel = typeKey ? t(typeKey) : sensor.type;
  const label = sensor.cameraType
    ? `${typeLabel} (${sensor.cameraType})`
    : typeLabel;

  async function handleRemove() {
    const sensorName = sensor.deviceName ?? sensor.deviceAddress;
    if (!(await dialog.confirm(t("equipment.sensorRemoveConfirm", { name: sensorName }), { destructive: true }))) return;
    setBusy(true);
    try {
      await onRemove();
    } catch (e) {
      showToast(t("equipment.sensorRemoveFailed", { message: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "90px 1fr auto auto",
        gap: "var(--space-2)",
        alignItems: "center",
        padding: "8px 0",
        borderTop: "1px solid var(--line-soft)",
      }}
    >
      <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-2)" }}>{label}</span>
      <span
        style={{
          fontSize: "var(--fs-sm)",
          color: "var(--ink-1)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {sensor.deviceName || t("equipment.sensorNoName")}
      </span>
      <span
        style={{
          fontSize: "var(--fs-xs)",
          color: "var(--ink-3)",
          fontFamily: "var(--font-mono)",
        }}
      >
        {sensor.deviceAddress}
      </span>
      <Button variant="ghost" size="sm"
        onClick={handleRemove}
        disabled={busy}
        aria-label={t("equipment.sensorAriaRemove")}
        style={{ color: "var(--rose)" }}
      >
        <Trash2 size={12} />
      </Button>
    </div>
  );
}

interface ProfileCardProps {
  profile: BikeProfile;
  isActive: boolean;
  canDelete: boolean;
  /** 웹에서 보고 있는 자전거를 바꾼다 — 이 브라우저에만 남는다(#1950). */
  onSetActive: () => void;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onUpdateWheel: (mm: number) => Promise<void>;
  onRemoveSensor: (deviceAddress: string) => Promise<void>;
  /** 이 자전거의 데이터 페이지 편집기를 연다 (#1950). */
  onOpenDataPages: () => void;
}

function ProfileCard({
  profile,
  isActive,
  canDelete,
  onSetActive,
  onRename,
  onDelete,
  onUpdateWheel,
  onRemoveSensor,
  onOpenDataPages,
}: ProfileCardProps) {
  const { t } = useTranslation("settings");
  const { showToast } = useToast();
  const dialog = useDialog();
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(profile.name);
  const [wheelInput, setWheelInput] = useState(String(profile.wheelCircumferenceMm));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setNameInput(profile.name);
    setWheelInput(String(profile.wheelCircumferenceMm));
  }, [profile.name, profile.wheelCircumferenceMm]);

  async function handleSaveName() {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === profile.name) {
      setEditing(false);
      setNameInput(profile.name);
      return;
    }
    setBusy(true);
    try {
      await onRename(trimmed);
      setEditing(false);
    } catch (e) {
      showToast(t("equipment.bikeRenameFailed", { message: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveWheel() {
    const mm = Number(wheelInput);
    if (!Number.isFinite(mm) || mm < 1000 || mm > 3000) {
      showToast(t("equipment.bikeWheelRange"));
      setWheelInput(String(profile.wheelCircumferenceMm));
      return;
    }
    if (mm === profile.wheelCircumferenceMm) return;
    setBusy(true);
    try {
      await onUpdateWheel(mm);
    } catch (e) {
      showToast(t("equipment.bikeWheelSaveFailed", { message: e instanceof Error ? e.message : String(e) }));
      setWheelInput(String(profile.wheelCircumferenceMm));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!(await dialog.confirm(t("equipment.bikeDeleteConfirm", { name: profile.name }), { destructive: true }))) return;
    setBusy(true);
    try {
      await onDelete();
    } catch (e) {
      showToast(t("equipment.bikeDeleteFailed", { message: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  }

  async function handleSetActive() {
    setBusy(true);
    try {
      onSetActive();
      showToast(t("equipment.bikeActivateSucceeded", { name: profile.name }));
    } catch (e) {
      showToast(t("equipment.bikeActivateFailed", { message: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: "var(--r-lg)",
        border: `1px solid ${isActive ? "var(--lime)" : "var(--line-soft)"}`,
        background: isActive
          ? "color-mix(in oklch, var(--lime) 6%, var(--bg-1))"
          : "var(--bg-1)",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          gap: "var(--space-3)",
          alignItems: "center",
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: "var(--r-lg)",
            background: "var(--bg-2)",
            display: "grid",
            placeItems: "center",
            color: "var(--ink-1)",
          }}
        >
          <BikeIcon size={20} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 'var(--space-2)', marginBottom: "var(--space-0-5)" }}>
            {editing ? (
              <>
                <input
                  autoFocus
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleSaveName();
                    if (e.key === "Escape") {
                      setEditing(false);
                      setNameInput(profile.name);
                    }
                  }}
                  disabled={busy}
                  style={{ ...fieldInputStyle, width: 180, padding: "var(--space-1) var(--space-2)" }}
                />
                <Button variant="ghost"
                  onClick={handleSaveName}
                  disabled={busy}
                  aria-label={t("equipment.bikeSave")}
                >
                  <Check size={14} />
                </Button>
                <Button variant="ghost"
                  onClick={() => {
                    setEditing(false);
                    setNameInput(profile.name);
                  }}
                  disabled={busy}
                  aria-label={t("equipment.bikeCancel")}
                >
                  <X size={14} />
                </Button>
              </>
            ) : (
              <>
                <span style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--ink-0)" }}>
                  {profile.name}
                </span>
                {isActive && (
                  <span
                    style={{
                      fontSize: "var(--fs-xs)",
                      padding: "1px 6px",
                      borderRadius: "9999px",
                      background: "var(--lime)",
                      color: "var(--primary-fg)",
                      fontWeight: 600,
                    }}
                  >
                    {t("equipment.bikeActive")}
                  </span>
                )}
              </>
            )}
          </div>
          <div
            style={{
              fontSize: "var(--fs-xs)",
              color: "var(--ink-3)",
              display: "flex",
              gap: "var(--space-2)",
              fontFamily: "var(--font-mono)",
              flexWrap: "wrap",
            }}
          >
            <span>{t("equipment.bikeWheelCircumference")} {profile.wheelCircumferenceMm}mm</span>
            <span>·</span>
            <span>{t("equipment.bikeSensors")} {profile.sensors.length}</span>
            <span>·</span>
            <span>VP {profile.virtualPower.enabled ? "ON" : "OFF"}</span>
            <span>·</span>
            <span>{formatDate(profile.createdAt)}</span>
          </div>
        </div>
        {!editing && (
          <div style={{ display: "flex", gap: 'var(--space-1)' }}>
            {!isActive && (
              <Button variant="secondary" size="sm" onClick={handleSetActive} disabled={busy}>
                {t("equipment.bikeSetActive")}
              </Button>
            )}
            {/* 데이터 페이지는 **자전거의 속성**이다 — 기기 화면이 아니라 이 행에서 연다(§5.1). */}
            <Button
              variant="secondary"
              size="sm"
              onClick={onOpenDataPages}
              disabled={busy}
              data-testid={`bike-data-pages-${profile.id}`}
            >
              {t("equipment.bikeDataPages")}
            </Button>
            <Button variant="ghost"
              onClick={() => {
                setEditing(true);
                setNameInput(profile.name);
              }}
              disabled={busy}
              aria-label={t("equipment.bikeRename")}
            >
              <Pencil size={12} />
            </Button>
            {canDelete && (
              <Button variant="ghost"
                onClick={handleDelete}
                disabled={busy}
                aria-label={t("equipment.bikeDelete")}
                style={{ color: "var(--rose)" }}
              >
                <Trash2 size={12} />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* 펼침 영역 — 휠 둘레 + 센서 목록 */}
      <div
        style={{
          marginTop: 'var(--space-3)',
          paddingTop: 'var(--space-2)',
          borderTop: "1px solid var(--line-soft)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "120px 1fr",
            gap: "var(--space-2)",
            alignItems: "center",
            padding: "6px 0",
          }}
        >
          <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-2)" }}>{t("equipment.bikeWheelCircumference")}</span>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1-5)" }}>
            <input
              type="number"
              value={wheelInput}
              min={1000}
              max={3000}
              onChange={(e) => setWheelInput(e.target.value)}
              onBlur={handleSaveWheel}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              disabled={busy}
              style={{ ...monoInputStyle, width: 100 }}
            />
            <Text variant="unit">mm</Text>
            <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>
              700×23c=2096 · 25c=2105 · 28c=2136 · 32c=2155
            </span>
          </div>
        </div>

        <div style={{ marginTop: 'var(--space-1)' }}>
          <div
            style={{
              fontSize: "var(--fs-xs)",
              color: "var(--ink-3)",
              padding: "6px 0",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              fontFamily: "var(--font-mono)",
            }}
          >
            {t("equipment.bikeSensors")} {profile.sensors.length > 0 ? `(${profile.sensors.length})` : ""}
          </div>
          {profile.sensors.length === 0 ? (
            <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", padding: "6px 0" }}>
              {t("equipment.bikeSensorsEmpty")}
            </div>
          ) : (
            profile.sensors.map((sensor) => (
              <SensorRow
                key={sensor.deviceAddress}
                sensor={sensor}
                onRemove={() => onRemoveSensor(sensor.deviceAddress)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function PaneEquipment() {
  const { t } = useTranslation("settings");
  const { user, profile } = useAuth();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const uid = user?.uid ?? null;
  const {
    active,
    profiles,
    loading,
    setActive,
    updateVirtualPower,
    renameProfile,
    deleteProfile,
    updateWheelCircumference,
    removeSensor,
  } = useActiveBikeProfile(uid);

  const [vpDraft, setVpDraft] = useState<VirtualPowerConfig | null>(null);

  useEffect(() => {
    setVpDraft(active?.virtualPower ?? null);
  }, [active?.id, active?.virtualPower]);

  /**
   * 데이터 페이지 편집 대상 (#1943 §5.1, #1950).
   *
   * URL 에 담는다 — `?profileId={id}&panel=data-pages`. 링크를 공유하거나 새로고침해도 같은
   * 자전거의 편집기가 열려야 하고, 화면 상태에만 두면 뒤로가기가 편집기를 닫지 못한다.
   */
  const panel = searchParams.get("panel");
  const urlProfileId = searchParams.get("profileId");
  const editingProfileId = panel === "data-pages" ? (urlProfileId ?? active?.id ?? null) : null;
  const editingProfile = profiles.find((p) => p.id === editingProfileId) ?? null;

  function openDataPages(profileId: string) {
    const next = new URLSearchParams(searchParams);
    next.set("profileId", profileId);
    next.set("panel", "data-pages");
    setSearchParams(next);
  }

  function closeDataPages() {
    const next = new URLSearchParams(searchParams);
    next.delete("panel");
    next.delete("profileId");
    setSearchParams(next);
  }

  if (!uid) return null;
  if (loading) {
    return (
      <SettingsCard title={t("equipment.bikeProfile")}>
        <div style={{ padding: 'var(--space-3)', color: "var(--ink-3)" }}>{t("equipment.bikeLoading")}</div>
      </SettingsCard>
    );
  }
  if (!active) {
    return (
      <SettingsCard title={t("equipment.bikeProfile")}>
        <div style={{ padding: 'var(--space-3)', color: "var(--ink-3)" }}>
          {t("equipment.bikeNoProfile")}
        </div>
      </SettingsCard>
    );
  }

  const sortedProfiles = [...profiles].sort((a, b) => {
    if (a.id === active.id) return -1;
    if (b.id === active.id) return 1;
    return b.updatedAt - a.updatedAt;
  });
  const canDelete = profiles.length > 1;

  const userWeightKg = profile?.weightKg;

  async function patchVp(p: Partial<VirtualPowerConfig>) {
    if (!active || !vpDraft) return;
    for (const v of Object.values(p)) {
      if (typeof v === "number" && !Number.isFinite(v)) return;
    }
    const next: Partial<VirtualPowerConfig> =
      userWeightKg && userWeightKg > 0 ? { ...p, riderWeightKg: userWeightKg } : p;
    setVpDraft({ ...vpDraft, ...p });
    try {
      await updateVirtualPower(active.id, next);
    } catch (e) {
      showToast(t("equipment.vpSaveFailed", { message: e instanceof Error ? e.message : String(e) }));
    }
  }

  const weightDisplay = userWeightKg && userWeightKg > 0
    ? t("equipment.virtualPowerWeightKg", { weight: userWeightKg })
    : t("equipment.virtualPowerWeightNotSet");

  // 편집기는 **자전거 하나**에 대한 화면이다. 목록 위에 겹쳐 띄우지 않고 자리를 바꾼다 —
  // 어느 자전거를 고치는 중인지가 화면의 유일한 주제여야 잘못된 자전거에 저장하지 않는다.
  if (editingProfile) {
    return (
      <BikeDataPagesPanel
        uid={uid}
        profile={editingProfile}
        onBack={closeDataPages}
      />
    );
  }

  return (
    <>
      <SettingsCard
        title={t("equipment.bikeProfile")}
        action={
          <Text variant="eyebrow" style={{ color: "var(--ink-3)" }}>
            {t("equipment.bikeProfileCount", { count: profiles.length })}
          </Text>
        }
        dense
      >
        {profiles.length > 1 && (
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", marginBottom: 'var(--space-2)' }}>
            {t("equipment.bikeProfileDuplicateHint")}
          </div>
        )}
        <div style={{ display: "grid", gap: "var(--space-2)" }}>
          {sortedProfiles.map((p) => (
            <ProfileCard
              key={p.id}
              profile={p}
              isActive={p.id === active.id}
              canDelete={canDelete}
              onSetActive={() => setActive(p.id)}
              onRename={(name) => renameProfile(p.id, name)}
              onDelete={() => deleteProfile(p.id)}
              onUpdateWheel={(mm) => updateWheelCircumference(p.id, mm)}
              onRemoveSensor={(addr) => removeSensor(p.id, addr)}
              onOpenDataPages={() => openDataPages(p.id)}
            />
          ))}
        </div>
      </SettingsCard>

      <SettingsCard
        title={t("equipment.virtualPower")}
        action={
          <Toggle
            on={vpDraft?.enabled ?? true}
            ariaLabel={t("equipment.virtualPower")}
            onChange={(v) => patchVp({ enabled: v, userDisabled: !v })}
          />
        }
      >
        <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", marginBottom: "var(--space-3)", lineHeight: 1.5 }}>
          {t("equipment.virtualPowerDesc", { name: active.name, weight: weightDisplay })}
        </div>
        <FieldGrid cols={2}>
          <Field label={t("equipment.vpBikeWeight")} hint="kg">
            <input
              type="number"
              step="0.1"
              min={1}
              max={50}
              value={vpDraft?.bikeWeightKg ?? 9}
              disabled={!(vpDraft?.enabled ?? false)}
              onChange={(e) => patchVp({ bikeWeightKg: Number(e.target.value) })}
              style={monoInputStyle}
            />
          </Field>
          <Field label={t("equipment.vpRollingResistance")} hint={t("equipment.vpRollingHint")}>
            <input
              type="number"
              step="0.0001"
              min={0.001}
              max={0.05}
              value={vpDraft?.rollingResistance ?? 0.005}
              disabled={!(vpDraft?.enabled ?? false)}
              onChange={(e) => patchVp({ rollingResistance: Number(e.target.value) })}
              style={monoInputStyle}
            />
          </Field>
          <Field label={t("equipment.vpCdaPreset")}>
            <select
              value={
                CDA_PRESETS.find((c) => c.value === vpDraft?.cdA)?.value ?? ""
              }
              disabled={!(vpDraft?.enabled ?? false)}
              onChange={(e) => e.target.value && patchVp({ cdA: Number(e.target.value) })}
              style={fieldInputStyle}
            >
              <option value="">{t("equipment.vpCdaManual")}</option>
              {CDA_PRESETS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("equipment.vpCrrPreset")}>
            <select
              value={
                CRR_PRESETS.find((c) => c.value === vpDraft?.rollingResistance)?.value ??
                ""
              }
              disabled={!(vpDraft?.enabled ?? false)}
              onChange={(e) =>
                e.target.value && patchVp({ rollingResistance: Number(e.target.value) })
              }
              style={fieldInputStyle}
            >
              <option value="">{t("equipment.vpCdaManual")}</option>
              {CRR_PRESETS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("equipment.vpCda")} full hint={t("equipment.vpCdaHint")}>
            <input
              type="number"
              step="0.01"
              min={0.15}
              max={0.5}
              value={vpDraft?.cdA ?? 0.32}
              disabled={!(vpDraft?.enabled ?? false)}
              onChange={(e) => patchVp({ cdA: Number(e.target.value) })}
              style={monoInputStyle}
            />
          </Field>
        </FieldGrid>
      </SettingsCard>

      <BackfillStatusCard uid={uid} />

      <GearKitSection uid={uid} />
    </>
  );
}

/**
 * 한 자전거의 데이터 페이지 편집 (#1943 §5.1, #1950).
 *
 * 저장은 canonical callable 경로로 간다 — 기기 설정 문서(`settings/{deviceId}`)를 읽고 쓰던
 * 예전 경로는 **기기의 구성**이라, 자전거를 바꿔도 같은 배치가 따라다녔다.
 */
function BikeDataPagesPanel({
  uid,
  profile,
  onBack,
}: {
  uid: string | null;
  profile: BikeProfile;
  onBack: () => void;
}) {
  const { t } = useTranslation("settings");
  const { showToast } = useToast();
  const { config, source, loading, canSave, save } = useBikeProfileLayout(
    uid,
    profile.id,
    DEFAULT_DATA_PAGE_CONFIG.pages,
  );

  async function handleSave(next: DataPageConfig) {
    const result = await save(next.pages);
    // 결과마다 사용자가 할 일이 다르다 — "저장 실패" 하나로 뭉치면 다시 눌러야 하는지,
    // 다른 기기 편집을 받아야 하는지, 대상이 사라졌는지 구분할 수 없다(§6.1).
    switch (result.status) {
      case "synced":
        showToast(t("equipment.dataPagesSaved"));
        break;
      case "savedPendingSync":
        showToast(t("equipment.dataPagesSyncing"));
        break;
      case "conflict":
        showToast(t("equipment.dataPagesConflict"));
        break;
      case "targetDeleted":
        showToast(t("equipment.dataPagesTargetDeleted"));
        break;
      default:
        showToast(t("equipment.dataPagesFailed"));
    }
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
        <Button variant="ghost" size="sm" onClick={onBack} data-testid="bike-data-pages-back">
          {t("equipment.dataPagesBack")}
        </Button>
        <Text variant="subtitle" weight={700}>
          {t("equipment.dataPagesTitle", { name: profile.name })}
        </Text>
      </div>
      {/* 상태를 먼저 말한다 — 저장 버튼이 왜 잠겼는지 모르면 사용자는 고장으로 읽는다. */}
      {!loading && source !== "canonical" && (
        <div
          role="status"
          style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", marginBottom: "var(--space-2)" }}
          data-testid="bike-data-pages-status"
        >
          {source === "quarantined"
            ? t("equipment.dataPagesQuarantined")
            : t("equipment.dataPagesUnsaved")}
        </div>
      )}
      {config && (
        <LayoutEditorCard config={config} onSave={handleSave} readOnly={!canSave} />
      )}
    </>
  );
}
