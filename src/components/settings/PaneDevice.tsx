import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Smartphone, Trash2, Users, Smartphone as PhoneIcon } from "lucide-react";

import {
  deleteDevice,
  renameDevice,
} from "../../services/deviceSettingsClient";

import {
  type AlertMetric,
  type AlertSettings,
  type AppSettings,
  type AutoLapMode,
  type GpsMode,
  type MapType,
  type NetworkMode,
  type PowerMode,
  type ScreenBrightness,
  type ScreenTimeout,
} from "@shared/types/deviceSettings";

import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { useAllDeviceSettings } from "../../hooks/useDeviceSettings";

import {
  SettingsCard,
  Field,
  FieldGrid,
  Toggle,
  fieldInputStyle,
  monoInputStyle,
} from "./_primitives";
import { LayoutEditorCard } from "./LayoutEditorCard";
import { Button, Card } from "../../theme/components";

function formatDateTime(ms: number): string {
  if (!ms) return "-";
  return new Date(ms).toLocaleString("ko-KR");
}

interface RowKV {
  k: string;
  v: string;
}

function KVList({ rows }: { rows: RowKV[] }) {
  return (
    <>
      {rows.map((r, i) => (
        <div
          key={`${r.k}-${i}`}
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "9px 0",
            borderTop: i === 0 ? "none" : "1px solid var(--line-soft)",
            fontSize: "var(--fs-sm)",
          }}
        >
          <span style={{ color: "var(--ink-2)" }}>{r.k}</span>
          <span
            style={{
              color: "var(--ink-1)",
              fontFamily: "var(--font-mono)",
              fontSize: "var(--fs-xs)",
            }}
          >
            {r.v}
          </span>
        </div>
      ))}
    </>
  );
}

type Scope = "user" | "device" | "mixed";

function ScopeBadge({ scope }: { scope: Scope }) {
  const { t } = useTranslation("settings");
  const isUser = scope === "user";
  const label = t(`device.scope${scope.charAt(0).toUpperCase() + scope.slice(1)}Badge`);
  const title = t(`device.scope${scope.charAt(0).toUpperCase() + scope.slice(1)}Title`);
  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-1)",
        fontSize: "var(--fs-xs)",
        fontWeight: 500,
        padding: "var(--space-0p5, 2px) var(--space-2)",
        borderRadius: "9999px",
        background: isUser
          ? "color-mix(in oklch, var(--lime) 18%, transparent)"
          : "color-mix(in oklch, var(--ink-3) 14%, transparent)",
        color: isUser ? "var(--ink-0)" : "var(--ink-2)",
        border: "1px solid var(--line-soft)",
      }}
    >
      {isUser ? <Users size={10} /> : <PhoneIcon size={10} />}
      {label}
    </span>
  );
}

interface EditableCardProps {
  title: string;
  scope: Scope;
  isEditing: boolean;
  saving: boolean;
  onEdit: () => void;
  onCancel: () => void;
  /** broadcast=true 면 user-scoped 필드를 모든 디바이스에도 적용. mixed/device 카드는 무시 가능. */
  onSave: (opts: { broadcast: boolean }) => Promise<void>;
  read: ReactNode;
  edit: ReactNode;
  /** broadcast 토글의 초기값. user 카드는 true, mixed 는 호출 측 결정. */
  defaultBroadcast?: boolean;
  /** broadcast 토글을 숨김 (device 전용 카드). */
  hideBroadcast?: boolean;
  /** 다중 디바이스가 있을 때만 broadcast 토글이 의미 있음. */
  showBroadcastToggle: boolean;
}

function EditableCard({
  title,
  scope,
  isEditing,
  saving,
  onEdit,
  onCancel,
  onSave,
  read,
  edit,
  defaultBroadcast = scope === "user",
  hideBroadcast = false,
  showBroadcastToggle,
}: EditableCardProps) {
  const { t } = useTranslation("settings");
  const [broadcast, setBroadcast] = useState(defaultBroadcast);
  // 편집 시작 시 default 로 리셋
  useEffect(() => {
    if (isEditing) setBroadcast(defaultBroadcast);
  }, [isEditing, defaultBroadcast]);
  const canBroadcast = !hideBroadcast && scope !== "device" && showBroadcastToggle;

  return (
    <SettingsCard
      title={
        <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}>
          {title}
          <ScopeBadge scope={scope} />
        </span>
      }
      action={
        isEditing ? (
          <div style={{ display: "flex", gap: 6 }}>
            <Button variant="secondary" size="sm"
              onClick={onCancel}
              disabled={saving}
            >
              {t("device.cancel")}
            </Button>
            <Button variant="primary" size="sm"
              onClick={() => void onSave({ broadcast: canBroadcast && broadcast })}
              disabled={saving}
            >
              {saving ? t("device.saving") : t("device.save")}
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm"
            onClick={onEdit}
            aria-label={t("device.editAriaLabel")}
          >
            <Pencil size={12} /> {t("device.edit")}
          </Button>
        )
      }
      dense
    >
      {isEditing ? (
        <>
          {edit}
          {canBroadcast && (
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
                marginTop: "var(--space-3)",
                padding: "var(--space-2) var(--space-3)",
                borderRadius: "var(--r-lg)",
                background: "color-mix(in oklch, var(--lime) 6%, transparent)",
                border: "1px solid var(--line-soft)",
                fontSize: "var(--fs-xs)",
                color: "var(--ink-1)",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={broadcast}
                onChange={(e) => setBroadcast(e.target.checked)}
              />
              <span>
                {t("device.broadcastAll")}
                {scope === "mixed" && (
                  <span style={{ color: "var(--ink-3)", marginLeft: 6 }}>
                    {t("device.broadcastMixedNote")}
                  </span>
                )}
              </span>
            </label>
          )}
        </>
      ) : (
        read
      )}
    </SettingsCard>
  );
}

// ── Edit forms ────────────────────────────────────────────────────────

interface CardEditProps<T> {
  draft: T;
  setDraft: (next: T) => void;
}

interface AutoDraft {
  autoPauseSpeedThreshold: number;
  autoPauseDelaySeconds: number;
  mode: AutoLapMode;
  distanceKm: number;
  timeMinutes: number;
}

function AutoEdit({ draft, setDraft }: CardEditProps<AutoDraft>) {
  const { t } = useTranslation("settings");
  return (
    <FieldGrid cols={2}>
      <Field label={t("device.fieldAutoPauseSpeed")} hint={t("device.fieldAutoPauseSpeedHint")}>
        <input
          type="number"
          step="0.1"
          value={draft.autoPauseSpeedThreshold}
          onChange={(e) =>
            setDraft({ ...draft, autoPauseSpeedThreshold: Number(e.target.value) })
          }
          style={monoInputStyle}
        />
      </Field>
      <Field label={t("device.fieldAutoPauseDelay")} hint={t("device.fieldAutoPauseDelayHint")}>
        <input
          type="number"
          value={draft.autoPauseDelaySeconds}
          onChange={(e) =>
            setDraft({ ...draft, autoPauseDelaySeconds: Number(e.target.value) })
          }
          style={monoInputStyle}
        />
      </Field>
      <Field label={t("device.fieldAutoLapMode")}>
        <select
          value={draft.mode}
          onChange={(e) => setDraft({ ...draft, mode: e.target.value as AutoLapMode })}
          style={fieldInputStyle}
        >
          <option value="OFF">{t("device.autoLapOff")}</option>
          <option value="DISTANCE">{t("device.autoLapDistance")}</option>
          <option value="TIME">{t("device.autoLapTime")}</option>
        </select>
      </Field>
      {draft.mode === "DISTANCE" && (
        <Field label={t("device.fieldAutoLapDistance")} hint={t("device.fieldAutoLapDistanceHint")}>
          <input
            type="number"
            step="0.1"
            value={draft.distanceKm}
            onChange={(e) => setDraft({ ...draft, distanceKm: Number(e.target.value) })}
            style={monoInputStyle}
          />
        </Field>
      )}
      {draft.mode === "TIME" && (
        <Field label={t("device.fieldAutoLapTime")} hint={t("device.fieldAutoLapTimeHint")}>
          <input
            type="number"
            value={draft.timeMinutes}
            onChange={(e) => setDraft({ ...draft, timeMinutes: Number(e.target.value) })}
            style={monoInputStyle}
          />
        </Field>
      )}
    </FieldGrid>
  );
}

function AlertEdit({ draft, setDraft }: CardEditProps<AlertSettings>) {
  const { t } = useTranslation("settings");

  const ALERT_METRIC_KEY: Record<AlertMetric, string> = {
    HEART_RATE: "device.alertHeartRate",
    POWER: "device.alertPower",
    CADENCE: "device.alertCadence",
    SPEED: "device.alertSpeed",
  };

  function patchThreshold(
    metric: AlertMetric,
    key: "enabled" | "minValue" | "maxValue",
    value: unknown,
  ) {
    setDraft({
      thresholds: draft.thresholds.map((th) =>
        th.metric === metric ? { ...th, [key]: value } : th,
      ),
    });
  }
  return (
    <div style={{ display: "grid", gap: 'var(--space-3)' }}>
      {draft.thresholds.map((th) => (
        <div
          key={th.metric}
          style={{
            display: "grid",
            gridTemplateColumns: "100px auto 1fr 1fr",
            gap: 10,
            alignItems: "center",
            padding: "8px 0",
            borderTop: "1px solid var(--line-soft)",
          }}
        >
          <span style={{ fontSize: "var(--fs-sm)", color: "var(--ink-1)" }}>
            {t(ALERT_METRIC_KEY[th.metric])}
          </span>
          <Toggle
            on={th.enabled}
            onChange={(v) => patchThreshold(th.metric, "enabled", v)}
          />
          <input
            type="number"
            placeholder={t("device.alertMinPlaceholder")}
            value={th.minValue ?? ""}
            disabled={!th.enabled}
            onChange={(e) =>
              patchThreshold(
                th.metric,
                "minValue",
                e.target.value === "" ? null : Number(e.target.value),
              )
            }
            style={monoInputStyle}
          />
          <input
            type="number"
            placeholder={t("device.alertMaxPlaceholder")}
            value={th.maxValue ?? ""}
            disabled={!th.enabled}
            onChange={(e) =>
              patchThreshold(
                th.metric,
                "maxValue",
                e.target.value === "" ? null : Number(e.target.value),
              )
            }
            style={monoInputStyle}
          />
        </div>
      ))}
    </div>
  );
}

interface DisplaySoundDraft {
  screenBrightness: ScreenBrightness;
  screenTimeout: ScreenTimeout;
  dynamicZoomEnabled: boolean;
  headingLockEnabled: boolean;
  mapType: MapType;
  soundEnabled: boolean;
  soundVolume: number;
}

function DisplaySoundEdit({ draft, setDraft }: CardEditProps<DisplaySoundDraft>) {
  const { t } = useTranslation("settings");
  return (
    <FieldGrid cols={2}>
      <Field label={t("device.fieldScreenBrightness")}>
        <select
          value={draft.screenBrightness}
          onChange={(e) =>
            setDraft({ ...draft, screenBrightness: e.target.value as ScreenBrightness })
          }
          style={fieldInputStyle}
        >
          <option value="SYSTEM">{t("device.brightnessSystem")}</option>
          <option value="HIGH">{t("device.brightnessHigh")}</option>
          <option value="HALF">{t("device.brightnessHalf")}</option>
        </select>
      </Field>
      <Field label={t("device.fieldScreenTimeout")}>
        <select
          value={draft.screenTimeout}
          onChange={(e) =>
            setDraft({ ...draft, screenTimeout: e.target.value as ScreenTimeout })
          }
          style={fieldInputStyle}
        >
          <option value="ALWAYS_ON">{t("device.timeoutAlwaysOn")}</option>
          <option value="SYSTEM_DEFAULT">{t("device.timeoutSystemDefault")}</option>
        </select>
      </Field>
      <Field label={t("device.fieldMapType")}>
        <select
          value={draft.mapType}
          onChange={(e) => setDraft({ ...draft, mapType: e.target.value as MapType })}
          style={fieldInputStyle}
        >
          <option value="STANDARD">{t("device.mapStandard")}</option>
          <option value="CYCLE">{t("device.mapCycle")}</option>
          <option value="TERRAIN">{t("device.mapTerrain")}</option>
          <option value="MAPBOX">{t("device.mapMapbox")}</option>
        </select>
      </Field>
      <Field label={t("device.fieldDynamicZoom")}>
        <div style={{ display: "flex", gap: 'var(--space-3)', alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--fs-xs)" }}>
            <Toggle
              on={draft.dynamicZoomEnabled}
              onChange={(v) => setDraft({ ...draft, dynamicZoomEnabled: v })}
            />
            <span style={{ color: "var(--ink-2)" }}>{t("device.fieldDynamicZoomLabel")}</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--fs-xs)" }}>
            <Toggle
              on={draft.headingLockEnabled}
              onChange={(v) => setDraft({ ...draft, headingLockEnabled: v })}
            />
            <span style={{ color: "var(--ink-2)" }}>{t("device.fieldHeadingLock")}</span>
          </label>
        </div>
      </Field>
      <Field label={t("device.fieldSound")}>
        <Toggle
          on={draft.soundEnabled}
          onChange={(v) => setDraft({ ...draft, soundEnabled: v })}
        />
      </Field>
      <Field label={t("device.fieldSoundVolume", { pct: Math.round(draft.soundVolume * 100) })}>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={draft.soundVolume}
          onChange={(e) =>
            setDraft({ ...draft, soundVolume: Number(e.target.value) })
          }
          style={{ width: "100%" }}
        />
      </Field>
    </FieldGrid>
  );
}

interface BatteryGpsDraft {
  powerMode: PowerMode;
  gpsMode: GpsMode;
}

function BatteryGpsEdit({ draft, setDraft }: CardEditProps<BatteryGpsDraft>) {
  const { t } = useTranslation("settings");
  return (
    <FieldGrid cols={2}>
      <Field label={t("device.fieldPowerMode")}>
        <select
          value={draft.powerMode}
          onChange={(e) => setDraft({ ...draft, powerMode: e.target.value as PowerMode })}
          style={fieldInputStyle}
        >
          <option value="STANDARD">{t("device.powerStandard")}</option>
          <option value="SAVER">{t("device.powerSaver")}</option>
          <option value="DASHBOARD">{t("device.powerDashboard")}</option>
          <option value="CUSTOM">{t("device.powerCustom")}</option>
        </select>
      </Field>
      <Field label={t("device.fieldGpsMode")}>
        <select
          value={draft.gpsMode}
          onChange={(e) => setDraft({ ...draft, gpsMode: e.target.value as GpsMode })}
          style={fieldInputStyle}
        >
          <option value="HIGH_ACCURACY">{t("device.gpsHigh")}</option>
          <option value="BALANCED">{t("device.gpsBalanced")}</option>
          <option value="OFF">{t("device.gpsOff")}</option>
        </select>
      </Field>
    </FieldGrid>
  );
}

interface NetworkDraft {
  mapTileNetworkMode: NetworkMode;
  weatherNetworkMode: NetworkMode;
  locationSharingNetworkMode: NetworkMode;
  stravaUploadNetworkMode: NetworkMode;
}

function NetworkEdit({ draft, setDraft }: CardEditProps<NetworkDraft>) {
  const { t } = useTranslation("settings");
  const fields: { labelKey: string; key: keyof NetworkDraft }[] = [
    { labelKey: "device.fieldMapTile", key: "mapTileNetworkMode" },
    { labelKey: "device.fieldWeather", key: "weatherNetworkMode" },
    { labelKey: "device.fieldLocationSharing", key: "locationSharingNetworkMode" },
    { labelKey: "device.fieldStravaUpload", key: "stravaUploadNetworkMode" },
  ];
  return (
    <FieldGrid cols={2}>
      {fields.map((f) => (
        <Field key={f.key} label={t(f.labelKey)}>
          <select
            value={draft[f.key]}
            onChange={(e) =>
              setDraft({ ...draft, [f.key]: e.target.value as NetworkMode })
            }
            style={fieldInputStyle}
          >
            <option value="OFFLINE">{t("device.networkOffline")}</option>
            <option value="ANY_NETWORK">{t("device.networkAny")}</option>
            <option value="WIFI_ONLY">{t("device.networkWifiOnly")}</option>
          </select>
        </Field>
      ))}
    </FieldGrid>
  );
}

// ── Main ──────────────────────────────────────────────────────────────

type EditingCard =
  | "rider"
  | "auto"
  | "alert"
  | "displaySound"
  | "batteryGps"
  | "network"
  | null;

interface RiderDraft {
  ftpWatts: number;
  maxHeartRate: number;
  riderWeightKg: number;
}

function RiderEdit({ draft, setDraft }: CardEditProps<RiderDraft>) {
  const { t } = useTranslation("settings");
  return (
    <FieldGrid cols={3}>
      <Field label={t("device.fieldFtp")} hint={t("device.fieldFtpHint")}>
        <input
          type="number"
          value={draft.ftpWatts}
          onChange={(e) => setDraft({ ...draft, ftpWatts: Number(e.target.value) })}
          style={monoInputStyle}
        />
      </Field>
      <Field label={t("device.fieldMaxHr")} hint={t("device.fieldMaxHrHint")}>
        <input
          type="number"
          value={draft.maxHeartRate}
          onChange={(e) => setDraft({ ...draft, maxHeartRate: Number(e.target.value) })}
          style={monoInputStyle}
        />
      </Field>
      <Field label={t("device.fieldWeight")} hint={t("device.fieldWeightHint")}>
        <input
          type="number"
          step="0.1"
          value={draft.riderWeightKg}
          onChange={(e) => setDraft({ ...draft, riderWeightKg: Number(e.target.value) })}
          style={monoInputStyle}
        />
      </Field>
    </FieldGrid>
  );
}

export function PaneDevice() {
  const { t } = useTranslation("settings");
  const { user } = useAuth();
  const { showToast } = useToast();
  const uid = user?.uid ?? null;
  const { records, loading, error, reload, update, broadcastUserScoped } =
    useAllDeviceSettings(uid);

  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const record = useMemo(() => {
    if (!records.length) return null;
    return (
      records.find((r) => r.deviceId === selectedDeviceId) ?? records[0] ?? null
    );
  }, [records, selectedDeviceId]);

  useEffect(() => {
    const first = records[0];
    if (!first) return;
    if (!selectedDeviceId || !records.some((r) => r.deviceId === selectedDeviceId)) {
      setSelectedDeviceId(first.deviceId);
    }
  }, [records, selectedDeviceId]);

  const [editingCard, setEditingCard] = useState<EditingCard>(null);
  const [saving, setSaving] = useState(false);

  const [riderDraft, setRiderDraft] = useState<RiderDraft | null>(null);
  const [autoDraft, setAutoDraft] = useState<AutoDraft | null>(null);
  const [alertDraft, setAlertDraft] = useState<AlertSettings | null>(null);
  const [dsDraft, setDsDraft] = useState<DisplaySoundDraft | null>(null);
  const [bgDraft, setBgDraft] = useState<BatteryGpsDraft | null>(null);
  const [netDraft, setNetDraft] = useState<NetworkDraft | null>(null);

  useEffect(() => {
    if (!record) return;
    const s = record.settings;
    if (editingCard === "rider" && !riderDraft) {
      setRiderDraft({
        ftpWatts: s.ftpWatts,
        maxHeartRate: s.maxHeartRate,
        riderWeightKg: s.riderWeightKg,
      });
    }
    if (editingCard === "auto" && !autoDraft) {
      setAutoDraft({
        autoPauseSpeedThreshold: s.autoPauseSpeedThreshold,
        autoPauseDelaySeconds: s.autoPauseDelaySeconds,
        mode: s.autoLapConfig.mode,
        distanceKm: s.autoLapConfig.distanceKm,
        timeMinutes: s.autoLapConfig.timeMinutes,
      });
    }
    if (editingCard === "alert" && !alertDraft) setAlertDraft(s.alertSettings);
    if (editingCard === "displaySound" && !dsDraft) {
      setDsDraft({
        screenBrightness: s.screenBrightness,
        screenTimeout: s.screenTimeout,
        dynamicZoomEnabled: s.dynamicZoomEnabled,
        headingLockEnabled: s.headingLockEnabled,
        mapType: s.mapType,
        soundEnabled: s.soundSettings.enabled,
        soundVolume: s.soundSettings.volume,
      });
    }
    if (editingCard === "batteryGps" && !bgDraft) {
      setBgDraft({ powerMode: s.powerMode, gpsMode: s.gpsMode });
    }
    if (editingCard === "network" && !netDraft) {
      setNetDraft({
        mapTileNetworkMode: s.mapTileNetworkMode,
        weatherNetworkMode: s.weatherNetworkMode,
        locationSharingNetworkMode: s.locationSharingNetworkMode,
        stravaUploadNetworkMode: s.stravaUploadNetworkMode,
      });
    }
  }, [editingCard, record, riderDraft, autoDraft, alertDraft, dsDraft, bgDraft, netDraft]);

  // Translated label helpers (called at render, not in module scope)
  const gpsModeLabel = (m: GpsMode): string => {
    const map: Record<GpsMode, string> = {
      HIGH_ACCURACY: t("device.gpsHigh"),
      BALANCED: t("device.gpsBalanced"),
      OFF: t("device.gpsOff"),
    };
    return map[m] ?? m;
  };
  const screenBrightnessLabel = (m: ScreenBrightness): string => {
    const map: Record<ScreenBrightness, string> = {
      SYSTEM: t("device.brightnessSystem"),
      HIGH: t("device.brightnessHigh"),
      HALF: t("device.brightnessHalf"),
    };
    return map[m] ?? m;
  };
  const screenTimeoutLabel = (m: ScreenTimeout): string => {
    const map: Record<ScreenTimeout, string> = {
      ALWAYS_ON: t("device.timeoutAlwaysOn"),
      SYSTEM_DEFAULT: t("device.timeoutSystemDefault"),
    };
    return map[m] ?? m;
  };
  const powerModeLabel = (m: PowerMode): string => {
    const map: Record<PowerMode, string> = {
      STANDARD: t("device.powerStandard"),
      SAVER: t("device.powerSaver"),
      DASHBOARD: t("device.powerDashboard"),
      CUSTOM: t("device.powerCustom"),
    };
    return map[m] ?? m;
  };
  const mapTypeLabel = (m: MapType): string => {
    const map: Record<MapType, string> = {
      STANDARD: t("device.mapStandard"),
      CYCLE: t("device.mapCycle"),
      TERRAIN: t("device.mapTerrain"),
      MAPBOX: t("device.mapMapbox"),
    };
    return map[m] ?? m;
  };
  const networkModeLabel = (m: NetworkMode): string => {
    const map: Record<NetworkMode, string> = {
      OFFLINE: t("device.networkOffline"),
      ANY_NETWORK: t("device.networkAny"),
      WIFI_ONLY: t("device.networkWifiOnly"),
    };
    return map[m] ?? m;
  };
  const autoLapLabel = (m: AutoLapMode): string => {
    const map: Record<AutoLapMode, string> = {
      OFF: t("device.autoLapOff"),
      DISTANCE: t("device.autoLapDistance"),
      TIME: t("device.autoLapTime"),
    };
    return map[m] ?? m;
  };
  const alertMetricLabel = (m: AlertMetric): string => {
    const map: Record<AlertMetric, string> = {
      HEART_RATE: t("device.alertHeartRate"),
      POWER: t("device.alertPower"),
      CADENCE: t("device.alertCadence"),
      SPEED: t("device.alertSpeed"),
    };
    return map[m] ?? m;
  };

  if (!uid) {
    return (
      <SettingsCard title={t("device.mobileSync")}>
        <div style={{ fontSize: "var(--fs-sm)", color: "var(--ink-3)" }}>
          {t("device.loginRequired")}
        </div>
      </SettingsCard>
    );
  }
  if (loading) {
    return (
      <SettingsCard title={t("device.mobileSync")}>
        <div style={{ fontSize: "var(--fs-sm)", color: "var(--ink-3)" }}>
          {t("device.loading")}
        </div>
      </SettingsCard>
    );
  }
  if (error) {
    return (
      <SettingsCard title={t("device.mobileSync")} danger>
        <div style={{ fontSize: "var(--fs-sm)", color: "var(--rose)" }}>
          {t("device.loadFailed", { message: error.message })}
        </div>
      </SettingsCard>
    );
  }
  if (!record) {
    return (
      <SettingsCard title={t("device.mobileSync")}>
        <div style={{ fontSize: "var(--fs-sm)", color: "var(--ink-3)" }}>
          {t("device.noDevice")}
        </div>
      </SettingsCard>
    );
  }

  const s: AppSettings = record.settings;

  function startEdit(card: NonNullable<EditingCard>) {
    setRiderDraft(null);
    setAutoDraft(null);
    setAlertDraft(null);
    setDsDraft(null);
    setBgDraft(null);
    setNetDraft(null);
    setEditingCard(card);
  }
  function cancelEdit() {
    setEditingCard(null);
    setRiderDraft(null);
    setAutoDraft(null);
    setAlertDraft(null);
    setDsDraft(null);
    setBgDraft(null);
    setNetDraft(null);
  }

  async function commit(patch: Partial<AppSettings>, opts?: { broadcast?: boolean }) {
    if (!uid || !record) return;
    setSaving(true);
    try {
      if (opts?.broadcast && records.length > 1) {
        // broadcast 경로:
        // 1) 현재 디바이스에 patch 전체를 적용 (device-scoped 부분 — screen/gps 등 — 포함).
        // 2) 나머지 디바이스에는 user-scoped 부분만 머지. broadcastUserScoped 가 현재 디바이스를
        //    excludeDeviceId 로 받아 중복 쓰기 + stale-version 충돌 방지.
        await update(record.deviceId, patch);
        const result = await broadcastUserScoped(patch, { excludeDeviceId: record.deviceId });
        // 현재 디바이스 +1 (이미 update 로 처리됨) 을 카운트에 포함.
        const totalApplied = result.updated + 1;
        if (result.failures.length > 0) {
          const validationFailed = result.failures.filter((f) => f.kind === "validation").length;
          const networkFailed = result.failures.length - validationFailed;
          const parts: string[] = [t("device.broadcastApplied_other", { count: totalApplied })];
          if (validationFailed > 0) parts.push(t("device.broadcastValidationFailed", { count: validationFailed }));
          if (networkFailed > 0) parts.push(t("device.broadcastNetworkFailed", { count: networkFailed }));
          showToast(parts.join(" · "));
        } else if (totalApplied > 1) {
          showToast(t("device.broadcastApplied_other", { count: totalApplied }));
        } else {
          showToast(t("device.broadcastAppliedSingle"));
        }
      } else {
        // hook의 update는 putDeviceSettings 후 optimistic local merge를 수행하므로
        // cancelEdit 직후 read 모드가 즉시 새 값을 보여준다 (onSnapshot latency와 무관).
        await update(record.deviceId, patch);
        showToast(t("device.saved"));
      }
      cancelEdit();
    } catch (e) {
      showToast(t("device.saveFailed", { message: e instanceof Error ? e.message : String(e) }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Card padding="none"
        style={{
          padding: "var(--space-4) var(--space-5)",
          marginBottom: 'var(--space-4)',
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: "var(--r-xl)",
            background: "color-mix(in oklch, var(--lime) 14%, var(--bg-2))",
            display: "grid",
            placeItems: "center",
            color: "var(--ink-0)",
          }}
        >
          <Smartphone size={22} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {records.length > 1 ? (
            <select
              value={record.deviceId}
              onChange={(e) => {
                cancelEdit();
                setSelectedDeviceId(e.target.value);
              }}
              style={{
                fontSize: "var(--fs-sm)",
                fontWeight: 600,
                color: "var(--ink-0)",
                background: "transparent",
                border: "1px solid var(--line-soft)",
                borderRadius: "var(--r-md)",
                padding: "var(--space-1) var(--space-2)",
                marginBottom: 2,
                cursor: "pointer",
              }}
            >
              {records.map((r) => (
                <option key={r.deviceId} value={r.deviceId}>
                  {r.deviceName || r.deviceId}
                </option>
              ))}
            </select>
          ) : (
            <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--ink-0)" }}>
              {record.deviceName || record.deviceId}
            </div>
          )}
          <div
            style={{
              fontSize: "var(--fs-xs)",
              color: "var(--ink-3)",
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 'var(--space-1)' }}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--lime)",
                }}
              />
              {t("device.lastSync", { time: formatDateTime(record.updatedAt) })}
            </span>
            <span>·</span>
            <span>{t("device.dataPages", { count: s.dataPageConfig.pages.length })}</span>
            {records.length > 1 && (
              <>
                <span>·</span>
                <span>{t("device.totalDevices", { count: records.length })}</span>
              </>
            )}
          </div>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            if (!uid || !record) return;
            const next = window.prompt(t("device.renamePrompt"), record.deviceName || "");
            if (next == null) return;
            void (async () => {
              try {
                await renameDevice(uid, record.deviceId, next);
                showToast(t("device.renameSuccess"));
              } catch (e) {
                showToast(t("device.renameFailed", { message: e instanceof Error ? e.message : String(e) }));
              }
            })();
          }}
          aria-label={t("device.renameDeviceAriaLabel")}
        >
          {t("device.renameDevice")}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            if (!uid || !record) return;
            const ok = window.confirm(
              t("device.deleteDeviceConfirm", { name: record.deviceName || record.deviceId })
            );
            if (!ok) return;
            void (async () => {
              try {
                await deleteDevice(uid, record.deviceId);
                showToast(t("device.deleteDeviceSuccess"));
                setSelectedDeviceId(null);
              } catch (e) {
                showToast(t("device.deleteDeviceFailed", { message: e instanceof Error ? e.message : String(e) }));
              }
            })();
          }}
          aria-label={t("device.deleteDeviceAriaLabel")}
        >
          <Trash2 size={14} />
        </Button>
        <Button variant="secondary" onClick={() => void reload()}>
          {t("device.reload")}
        </Button>
      </Card>

      <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", padding: "0 4px 12px" }}>
        {t("device.deviceIntroHint")} {" "}
        <ScopeBadge scope="user" /> {t("device.broadcastAll")},{" "}
        <ScopeBadge scope="device" />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: "var(--space-3)",
          marginBottom: "var(--space-3)",
        }}
      >
        <EditableCard
          title={t("device.cardRider")}
          scope="user"
          showBroadcastToggle={records.length > 1}
          isEditing={editingCard === "rider"}
          saving={saving}
          onEdit={() => startEdit("rider")}
          onCancel={cancelEdit}
          onSave={({ broadcast }) =>
            riderDraft
              ? commit(
                  {
                    ftpWatts: riderDraft.ftpWatts,
                    maxHeartRate: riderDraft.maxHeartRate,
                    riderWeightKg: riderDraft.riderWeightKg,
                  },
                  { broadcast },
                )
              : Promise.resolve()
          }
          read={
            <KVList
              rows={[
                { k: "FTP", v: `${s.ftpWatts} W` },
                { k: t("device.fieldMaxHr"), v: `${s.maxHeartRate} bpm` },
                { k: t("device.fieldWeight"), v: `${s.riderWeightKg} kg` },
              ]}
            />
          }
          edit={riderDraft && <RiderEdit draft={riderDraft} setDraft={setRiderDraft} />}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 'var(--space-3)' }}>
        <EditableCard
          title={t("device.cardAuto")}
          scope="user"
          showBroadcastToggle={records.length > 1}
          isEditing={editingCard === "auto"}
          saving={saving}
          onEdit={() => startEdit("auto")}
          onCancel={cancelEdit}
          onSave={({ broadcast }) =>
            autoDraft
              ? commit(
                  {
                    autoPauseSpeedThreshold: autoDraft.autoPauseSpeedThreshold,
                    autoPauseDelaySeconds: autoDraft.autoPauseDelaySeconds,
                    autoLapConfig: {
                      mode: autoDraft.mode,
                      distanceKm: autoDraft.distanceKm,
                      timeMinutes: autoDraft.timeMinutes,
                    },
                  },
                  { broadcast },
                )
              : Promise.resolve()
          }
          read={
            <KVList
              rows={[
                {
                  k: t("device.readAutoPause"),
                  v: `${s.autoPauseSpeedThreshold} km/h · ${s.autoPauseDelaySeconds}s`,
                },
                { k: t("device.readAutoLapMode"), v: autoLapLabel(s.autoLapConfig.mode) },
                ...(s.autoLapConfig.mode === "DISTANCE"
                  ? [{ k: t("device.readAutoLapDistance"), v: `${s.autoLapConfig.distanceKm} km` }]
                  : []),
                ...(s.autoLapConfig.mode === "TIME"
                  ? [{ k: t("device.readAutoLapTime"), v: `${s.autoLapConfig.timeMinutes} ${t("device.readAutoLapTimeUnit")}` }]
                  : []),
              ]}
            />
          }
          edit={autoDraft && <AutoEdit draft={autoDraft} setDraft={setAutoDraft} />}
        />

        <EditableCard
          title={t("device.cardAlert")}
          scope="user"
          showBroadcastToggle={records.length > 1}
          isEditing={editingCard === "alert"}
          saving={saving}
          onEdit={() => startEdit("alert")}
          onCancel={cancelEdit}
          onSave={({ broadcast }) =>
            alertDraft
              ? commit({ alertSettings: alertDraft }, { broadcast })
              : Promise.resolve()
          }
          read={
            <KVList
              rows={s.alertSettings.thresholds.map((th) => ({
                k: alertMetricLabel(th.metric),
                v: th.enabled
                  ? `${th.minValue ?? "-"} ~ ${th.maxValue ?? "-"}`
                  : t("device.readAlertOff"),
              }))}
            />
          }
          edit={alertDraft && <AlertEdit draft={alertDraft} setDraft={setAlertDraft} />}
        />

        <EditableCard
          title={t("device.cardDisplaySound")}
          scope="mixed"
          showBroadcastToggle={records.length > 1}
          isEditing={editingCard === "displaySound"}
          saving={saving}
          onEdit={() => startEdit("displaySound")}
          onCancel={cancelEdit}
          onSave={({ broadcast }) =>
            dsDraft
              ? commit(
                  {
                    screenBrightness: dsDraft.screenBrightness,
                    screenTimeout: dsDraft.screenTimeout,
                    dynamicZoomEnabled: dsDraft.dynamicZoomEnabled,
                    headingLockEnabled: dsDraft.headingLockEnabled,
                    mapType: dsDraft.mapType,
                    soundSettings: {
                      ...s.soundSettings,
                      enabled: dsDraft.soundEnabled,
                      volume: dsDraft.soundVolume,
                    },
                  },
                  { broadcast },
                )
              : Promise.resolve()
          }
          read={
            <KVList
              rows={[
                { k: t("device.readScreenBrightness"), v: screenBrightnessLabel(s.screenBrightness) },
                { k: t("device.readScreenTimeout"), v: screenTimeoutLabel(s.screenTimeout) },
                {
                  k: t("device.readDynamicZoom"),
                  v: s.dynamicZoomEnabled ? t("device.readEnabled") : t("device.readDisabled"),
                },
                {
                  k: t("device.readHeadingLock"),
                  v: s.headingLockEnabled ? t("device.readEnabled") : t("device.readDisabled"),
                },
                { k: t("device.readMapType"), v: mapTypeLabel(s.mapType) },
                { k: t("device.readSound"), v: s.soundSettings.enabled ? t("device.readEnabled") : t("device.readDisabled") },
                {
                  k: t("device.readSoundVolume"),
                  v: `${Math.round(s.soundSettings.volume * 100)}%`,
                },
              ]}
            />
          }
          edit={dsDraft && <DisplaySoundEdit draft={dsDraft} setDraft={setDsDraft} />}
        />

        <EditableCard
          title={t("device.cardBatteryGps")}
          scope="device"
          showBroadcastToggle={records.length > 1}
          isEditing={editingCard === "batteryGps"}
          saving={saving}
          onEdit={() => startEdit("batteryGps")}
          onCancel={cancelEdit}
          onSave={() =>
            bgDraft
              ? commit({ powerMode: bgDraft.powerMode, gpsMode: bgDraft.gpsMode })
              : Promise.resolve()
          }
          read={
            <KVList
              rows={[
                { k: t("device.readPowerMode"), v: powerModeLabel(s.powerMode) },
                { k: t("device.readGpsMode"), v: gpsModeLabel(s.gpsMode) },
              ]}
            />
          }
          edit={bgDraft && <BatteryGpsEdit draft={bgDraft} setDraft={setBgDraft} />}
        />

        <EditableCard
          title={t("device.cardNetwork")}
          scope="mixed"
          showBroadcastToggle={records.length > 1}
          isEditing={editingCard === "network"}
          saving={saving}
          onEdit={() => startEdit("network")}
          onCancel={cancelEdit}
          onSave={({ broadcast }) =>
            netDraft ? commit(netDraft, { broadcast }) : Promise.resolve()
          }
          read={
            <KVList
              rows={[
                { k: t("device.readMapTile"), v: networkModeLabel(s.mapTileNetworkMode) },
                { k: t("device.readWeather"), v: networkModeLabel(s.weatherNetworkMode) },
                {
                  k: t("device.readLocationSharing"),
                  v: networkModeLabel(s.locationSharingNetworkMode),
                },
                {
                  k: t("device.readStravaUpload"),
                  v: networkModeLabel(s.stravaUploadNetworkMode),
                },
              ]}
            />
          }
          edit={netDraft && <NetworkEdit draft={netDraft} setDraft={setNetDraft} />}
        />
      </div>

      <div style={{ marginTop: 'var(--space-3)' }}>
        <LayoutEditorCard
          config={s.dataPageConfig}
          onSave={(next) => commit({ dataPageConfig: next })}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "var(--space-3)",
          marginTop: "var(--space-3)",
        }}
      >
        <SensorPairingCard settings={s} />
        <SoundPathsCard settings={s} />
      </div>
    </>
  );
}

// ── Read-only cards (device-scoped 표시 전용) ───────────────────────────

/** BLE MAC 주소를 마지막 5자만 노출 (식별용, 전체 노출 회피). */
function maskAddress(addr: string | null): string {
  if (!addr) return "";
  const tail = addr.slice(-5);
  return `…${tail}`;
}

function SensorPairingCard({ settings }: { settings: AppSettings }) {
  const { t } = useTranslation("settings");
  const unpaired = t("device.sensorUnpaired");
  function addr(a: string | null) {
    if (!a) return unpaired;
    return maskAddress(a);
  }
  const rows: RowKV[] = [
    { k: t("device.sensorSpeedLabel"), v: addr(settings.savedSpeedSensorAddress) },
    { k: t("device.sensorCadenceLabel"), v: addr(settings.savedCadenceSensorAddress) },
    { k: t("device.sensorHrmLabel"), v: addr(settings.savedHrmSensorAddress) },
    { k: t("device.sensorPowerLabel"), v: addr(settings.savedPowerSensorAddress) },
    { k: t("device.sensorRadarLabel"), v: addr(settings.savedRadarSensorAddress) },
    { k: t("device.sensorDi2Label"), v: addr(settings.savedDi2SensorAddress) },
    { k: t("device.sensorAxsLabel"), v: addr(settings.savedAxsSensorAddress) },
    {
      k: t("device.sensorActionCamLabel"),
      v: settings.savedActionCamAddress
        ? `${settings.savedActionCamType ?? "?"} ${maskAddress(settings.savedActionCamAddress)}`
        : unpaired,
    },
  ];
  return (
    <SettingsCard
      title={
        <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}>
          {t("device.sensorPairing")}
          <ScopeBadge scope="device" />
        </span>
      }
      dense
    >
      <KVList rows={rows} />
      <div style={{ marginTop: "var(--space-2)", fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>
        {t("device.sensorPairingHint")}
      </div>
    </SettingsCard>
  );
}

/** 디바이스 로컬 파일 URI 의 basename 만 노출. */
function soundLabel(path: string | null, defaultLabel: string): string {
  if (!path) return defaultLabel;
  const lastSlash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
}

function SoundPathsCard({ settings }: { settings: AppSettings }) {
  const { t } = useTranslation("settings");
  const defaultSound = t("device.soundDefault");
  const ss = settings.soundSettings;
  const rows: RowKV[] = [
    { k: t("device.soundStart"), v: soundLabel(ss.startSoundPath, defaultSound) },
    { k: t("device.soundStop"), v: soundLabel(ss.stopSoundPath, defaultSound) },
    { k: t("device.soundLap"), v: soundLabel(ss.lapSoundPath, defaultSound) },
    { k: t("device.soundClimbStart"), v: soundLabel(ss.climbStartSoundPath, defaultSound) },
    { k: t("device.soundClimbEnd"), v: soundLabel(ss.climbEndSoundPath, defaultSound) },
    { k: t("device.soundRadar"), v: soundLabel(ss.radarSoundPath, defaultSound) },
  ];
  return (
    <SettingsCard
      title={
        <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}>
          {t("device.soundFiles")}
          <ScopeBadge scope="device" />
        </span>
      }
      dense
    >
      <KVList rows={rows} />
      <div style={{ marginTop: "var(--space-2)", fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>
        {t("device.soundFilesHint")}
      </div>
    </SettingsCard>
  );
}
