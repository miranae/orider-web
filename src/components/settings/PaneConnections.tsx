import StravaSummarySettings from "./StravaSummarySettings";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { httpsCallable } from "firebase/functions";
import { useSearchParams } from "react-router-dom";
import { stravaSignupGuidancePath, stravaSignupReturnTo } from "../../utils/stravaSignup";

import { LocalizedLink as Link } from "../LocalizedLink";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { useDialog } from "../../contexts/DialogContext";
import { useStrava } from "../../hooks/useStrava";
import { functions } from "../../services/firebase";
import { track } from "../../services/analytics";

import { SettingsCard, InlineRow, Toggle } from "./_primitives";
import { Button, Text, buttonClass } from "../../theme/components";
import { ICON_SIZE } from "../../theme/tokens/icon";

function StravaIcon({ size = ICON_SIZE.lg }: { size?: number }) {
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
    <div className="settings-service-card"
      style={{
        padding: "var(--space-3)",
        borderRadius: "var(--r-md)",
        border: "1px solid var(--line-soft)",
        background: connected
          ? "var(--bg-1)"
          : "color-mix(in oklch, var(--bg-2) 60%, var(--bg-1))",
        display: "grid",
        gridTemplateColumns: "var(--settings-service-columns, auto minmax(0, 1fr) auto)",
        gap: "var(--space-3)",
        alignItems: "center",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: "var(--r-md)",
          background: brand,
          display: "grid",
          placeItems: "center",
          color: "white",
        }}
      >
        {icon}
      </div>
      <div className="settings-service-copy">
        <div
          style={{
            fontSize: "var(--fs-sm)",
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
        <div className="settings-service-description" style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>{desc}</div>
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
  const { profile, user } = useAuth();
  const { showToast } = useToast();
  const dialog = useDialog();
  const { connectStrava, disconnectStrava, loading } = useStrava();
  const [searchParams] = useSearchParams();
  const stravaSignup = searchParams.get("stravaSignup") === "1";
  const signupReturnTo = stravaSignupReturnTo(searchParams.get("returnTo"));
  const guidancePath = stravaSignupGuidancePath(signupReturnTo);
  const [autoUploadSaving, setAutoUploadSaving] = useState(false);

  const stravaConnected = profile?.stravaConnected ?? false;
  const autoUpload = profile?.autoUpload ?? false;

  async function handleStravaDisconnect() {
    const operationId = crypto.randomUUID();
    const analyticsParams = { operationId, source: "web" };
    track("strava_disconnect_intent", analyticsParams);

    if (!(await dialog.confirm(t("strava.disconnectConfirm"), { destructive: true }))) {
      track("strava_disconnect_cancel", analyticsParams);
      return;
    }
    track("strava_disconnect_confirm", analyticsParams);

    try {
      await disconnectStrava(operationId);
      showToast(t("strava.disconnected"));
    } catch (error) {
      const reason = (error as { details?: { reason?: string } }).details?.reason;
      showToast(t(reason === "last-login-method" ? "strava.disconnectLastLogin" : "strava.disconnectFailed"), "error");
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
      icon: <StravaIcon size={ICON_SIZE.lg} />,
      connected: stravaConnected,
      onConnect: () => connectStrava(stravaSignup ? guidancePath : "/settings/connections"),
      onDisconnect: handleStravaDisconnect,
    },
    {
      id: "garmin",
      name: "Garmin Connect",
      desc: t("pane.connections.garminDesc"),
      brand: "oklch(0.45 0.05 240)",
      icon: <span style={{ fontWeight: 700, fontSize: "var(--fs-sm)", color: "white" }}>G</span>,
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
      icon: <span style={{ fontWeight: 700, fontSize: "var(--fs-sm)", color: "white" }}>W</span>,
      connected: false,
      comingSoon: true,
      onConnect: () => {},
      onDisconnect: () => {},
    },

  ];

  const connectedCount = services.filter((s) => s.connected).length;

  return (
    <>
      {stravaSignup && (
        <SettingsCard title={t("pane.connections.signupImportTitle")}>
          <p>{t(stravaConnected ? "pane.connections.signupImportReady" : "pane.connections.signupImportConsent")}</p>
          <div className="flex flex-wrap gap-2">
            {stravaConnected ? (
              <Link to="/settings/data#migrate" className={buttonClass({ variant: "primary" })}>{t("pane.connections.signupImport")}</Link>
            ) : (
              <Button disabled={loading} onClick={() => {
                try { connectStrava(guidancePath); }
                catch { showToast(t("pane.connections.signupConnectFailed"), "error"); }
              }}>{t("pane.connections.signupConnect")}</Button>
            )}
            <Link to={signupReturnTo} className={buttonClass({ variant: "secondary" })}>{t("pane.connections.signupLater")}</Link>
          </div>
        </SettingsCard>
      )}
      <SettingsCard data-testid="S2-1-1"
        title={t("pane.connections.activityApps")}
        action={
          <Text variant="eyebrow" style={{ color: "var(--ink-3)" }}>
            {t("pane.connections.connectedCount_other", { count: connectedCount })}
          </Text>
        }
        dense
      >
        <div style={{ display: "grid", gap: 'var(--space-2)' }}>
          {services.filter(s => !s.comingSoon).map((s) => (
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
        <details className="settings-future-connections">
          <summary>{t("pane.connections.futureApps")}</summary>
          <div style={{ display: "grid", gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
            {services.filter(s => s.comingSoon).map(s => <ServiceCard key={s.id} {...s} />)}
          </div>
        </details>
      </SettingsCard>

      {stravaConnected && (
        <SettingsCard data-testid="S2-1-2" title={t("pane.connections.cardStravaSync")} dense>
          <InlineRow label={t("pane.connections.autoUploadLabel")} hint={t("pane.connections.autoUploadHint")}>
            <Toggle
              on={autoUpload}
              ariaLabel={t("pane.connections.autoUploadLabel")}
              onChange={handleAutoUploadChange}
              disabled={autoUploadSaving}
            />
          </InlineRow>
          {user && <StravaSummarySettings key={user.uid} />}
          <InlineRow
            label={t("pane.connections.importPastLabel")}
            hint={t("pane.connections.importPastHint")}
          >
            <Link data-testid="S2-1-4" to="/settings/data#migrate" className={buttonClass({ variant: "secondary" })}>
                {profile?.migration?.status === "DONE"
                  ? t("pane.connections.importBtnReport")
                  : t("pane.connections.importBtnImport")}
            </Link>
          </InlineRow>
        </SettingsCard>
      )}
      <Link data-testid="S2-3-1" to="/settings/device">{t("nav.deviceLabel")} →</Link>
    </>
  );
}
