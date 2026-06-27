import { useState } from "react";
import { useTranslation } from "react-i18next";
import { httpsCallable } from "firebase/functions";

import { LocalizedLink as Link } from "../LocalizedLink";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { useStrava } from "../../hooks/useStrava";
import { functions } from "../../services/firebase";

import { SettingsCard, InlineRow, Toggle } from "./_primitives";
import { Button, Text } from "../../theme/components";

function StravaIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
    </svg>
  );
}

interface ServiceCardProps {
  name: string;
  desc: string;
  brand: string;
  icon: React.ReactNode;
  connected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  comingSoon?: boolean;
  loading?: boolean;
}

function ServiceCard({
  name,
  desc,
  brand,
  icon,
  connected,
  onConnect,
  onDisconnect,
  comingSoon,
  loading,
}: ServiceCardProps) {
  const { t } = useTranslation("settings");
  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 8,
        border: "1px solid var(--line-soft)",
        background: connected
          ? "var(--bg-1)"
          : "color-mix(in oklch, var(--bg-2) 60%, var(--bg-1))",
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        gap: 14,
        alignItems: "center",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 8,
          background: brand,
          display: "grid",
          placeItems: "center",
          color: "white",
        }}
      >
        {icon}
      </div>
      <div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--ink-0)",
            display: "flex",
            alignItems: "center",
            gap: 7,
          }}
        >
          {name}
          {connected && (
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--lime)",
              }}
            />
          )}
        </div>
        <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{desc}</div>
      </div>
      {comingSoon ? (
        <Text variant="eyebrow" style={{ color: "var(--ink-3)" }}>
          {t("pane.connections.comingSoon")}
        </Text>
      ) : connected ? (
        <Button variant="ghost" onClick={onDisconnect} disabled={loading}>
          {loading ? "..." : t("pane.connections.btnDisconnect")}
        </Button>
      ) : (
        <Button variant="secondary" onClick={onConnect}>
          {t("pane.connections.btnConnect")}
        </Button>
      )}
    </div>
  );
}

export function PaneConnections() {
  const { t } = useTranslation("settings");
  const { profile } = useAuth();
  const { showToast } = useToast();
  const { connectStrava, disconnectStrava, loading } = useStrava();
  const [autoUploadSaving, setAutoUploadSaving] = useState(false);

  const stravaConnected = profile?.stravaConnected ?? false;
  const autoUpload = profile?.autoUpload ?? false;

  async function handleStravaDisconnect() {
    if (!window.confirm(t("strava.disconnectConfirm"))) return;
    try {
      await disconnectStrava();
      showToast(t("strava.disconnected"));
    } catch {
      /* hook 내부에서 토스트 처리 */
    }
  }

  async function handleAutoUploadChange(next: boolean) {
    setAutoUploadSaving(true);
    try {
      const fn = httpsCallable(functions, "stravaSetAutoUpload");
      await fn({ enabled: next });
      showToast(next ? t("strava.autoSyncOn") : t("strava.autoSyncOff"));
    } catch {
      showToast(t("strava.settingChangeFailed"));
    } finally {
      setAutoUploadSaving(false);
    }
  }

  const services = [
    {
      id: "strava",
      name: "Strava",
      desc: t("pane.connections.stravaDesc"),
      brand: "#FC4C02",
      icon: <StravaIcon size={22} />,
      connected: stravaConnected,
      onConnect: () => connectStrava("/settings"),
      onDisconnect: handleStravaDisconnect,
    },
    {
      id: "garmin",
      name: "Garmin Connect",
      desc: t("pane.connections.garminDesc"),
      brand: "oklch(0.45 0.05 240)",
      icon: <span style={{ fontWeight: 700, fontSize: 14, color: "white" }}>G</span>,
      connected: false,
      comingSoon: true,
      onConnect: () => {},
      onDisconnect: () => {},
    },
    {
      id: "wahoo",
      name: "Wahoo SYSTM",
      desc: t("pane.connections.wahooDesc"),
      brand: "oklch(0.55 0.12 30)",
      icon: <span style={{ fontWeight: 700, fontSize: 14, color: "white" }}>W</span>,
      connected: false,
      comingSoon: true,
      onConnect: () => {},
      onDisconnect: () => {},
    },
    {
      id: "apple",
      name: "Apple Health",
      desc: t("pane.connections.appleHealthDesc"),
      brand: "oklch(0.18 0.005 240)",
      icon: <span style={{ color: "white", fontSize: 14 }}>♥</span>,
      connected: false,
      comingSoon: true,
      onConnect: () => {},
      onDisconnect: () => {},
    },
  ];

  const connectedCount = services.filter((s) => s.connected).length;

  return (
    <>
      <SettingsCard
        title={t("pane.connections.cardConnected")}
        action={
          <Text variant="eyebrow" style={{ color: "var(--ink-3)" }}>
            {t("pane.connections.connectedCount_other", { count: connectedCount })}
          </Text>
        }
        dense
      >
        <div style={{ display: "grid", gap: 'var(--space-2)' }}>
          {services.map((s) => (
            <ServiceCard
              key={s.id}
              name={s.name}
              desc={s.desc}
              brand={s.brand}
              icon={s.icon}
              connected={s.connected}
              onConnect={s.onConnect}
              onDisconnect={s.onDisconnect}
              comingSoon={s.comingSoon}
              loading={s.id === "strava" ? loading : false}
            />
          ))}
        </div>
      </SettingsCard>

      {stravaConnected && (
        <SettingsCard title={t("pane.connections.cardStravaSync")} dense>
          <InlineRow label={t("pane.connections.autoUploadLabel")} hint={t("pane.connections.autoUploadHint")}>
            <Toggle
              on={autoUpload}
              onChange={handleAutoUploadChange}
              disabled={autoUploadSaving}
            />
          </InlineRow>
          <InlineRow
            label={t("pane.connections.importPastLabel")}
            hint={t("pane.connections.importPastHint")}
          >
            <Link to="/migrate">
              <Button variant="secondary">
                {profile?.migration?.status === "DONE"
                  ? t("pane.connections.importBtnReport")
                  : t("pane.connections.importBtnImport")}
              </Button>
            </Link>
          </InlineRow>
        </SettingsCard>
      )}
    </>
  );
}
