import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Watch, Activity, Heart, Smartphone, AlertCircle } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useHealthConnections } from "../../hooks/useHealthConnections";
import { useHealthPreferences } from "../../hooks/useHealthPreferences";
import { useToast } from "../../contexts/ToastContext";
import { useDialog } from "../../contexts/DialogContext";
import type {
  ConnectionDoc,
  ConnectionStatus,
  HealthPreferences,
  HealthSport,
  ProviderId,
} from "@shared/types";
import { DropdownSelect, Card, Chip } from "../../theme/components";
import { Toggle } from "./_primitives";
import { ICON_SIZE } from "../../theme/tokens/icon";

/**
 * Stage 1 PR F — 헬스 소스 연결 + 주 소스 선택 + 보존 정책 UI.
 *
 * Strava 자체 연결/해제는 PaneConnections 에서 — 본 패널은 health 도메인 (Apple Health,
 * Health Connect) 추가 + 종목별 dedup 선호 + Firestore TTL 옵트인.
 *
 * 설계 문서: docs/architecture/MULTI_SENSOR_HUB_DESIGN.md §2.10, §6-3, §6-4
 */

const PROVIDER_META: Record<
  ProviderId,
  { label: string; icon: React.ReactNode; hintKey: string; webConnectable: boolean }
> = {
  strava: {
    label: "Strava",
    icon: <Activity size={ICON_SIZE.lg} />,
    hintKey: "healthSources.stravaHint",
    webConnectable: true,
  },
  apple_health: {
    label: "Apple Health",
    icon: <Heart size={ICON_SIZE.lg} />,
    hintKey: "healthSources.appleHealthHint",
    webConnectable: false,
  },
  health_connect: {
    label: "Health Connect",
    icon: <Watch size={ICON_SIZE.lg} />,
    hintKey: "healthSources.healthConnectHint",
    webConnectable: false,
  },
};

const SPORT_LABEL_KEYS: Record<HealthSport, string> = {
  bike: "healthSources.sportBike",
  run: "healthSources.sportRun",
  swim: "healthSources.sportSwim",
  other: "healthSources.sportOther",
};

function ProviderCard({
  providerId,
  conn,
}: {
  providerId: ProviderId;
  conn: ConnectionDoc | null;
}) {
  const { t, i18n } = useTranslation("settings");
  const meta = PROVIDER_META[providerId];
  const status: ConnectionStatus | "not_connected" = conn?.status ?? "not_connected";

  function statusBadge(s: ConnectionStatus | "not_connected") {
    switch (s) {
      case "active":
        return <Chip>{t("healthSources.statusActive")}</Chip>;
      case "reauth_required":
        return <Chip>{t("healthSources.statusReauthRequired")}</Chip>;
      case "revoked":
        return <Chip>{t("healthSources.statusRevoked")}</Chip>;
      case "error":
        return <Chip>{t("healthSources.statusError")}</Chip>;
      case "not_connected":
      default:
        return <Chip>{t("healthSources.statusNotConnected")}</Chip>;
    }
  }

  return (
    <Card data-testid={`health-provider-${providerId}`} padding="none" style={{ padding: 'var(--space-4)', display: "flex", flexDirection: "column", gap: 'var(--space-2)' }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 'var(--space-3)' }}>
        <div style={{ color: "var(--ink-2)" }}>{meta.icon}</div>
        <div style={{ flex: "1 1 8rem", minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{meta.label}</div>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-2)" }}>
            {status === "active" && conn?.lastSyncAt
              ? t("healthSources.lastSync", { time: formatRelativeTime(conn.lastSyncAt, i18n.resolvedLanguage ?? i18n.language, t) })
              : t(meta.hintKey)}
          </div>
        </div>
        {statusBadge(status)}
      </div>
      {!meta.webConnectable && status === "not_connected" && (
        <div
          style={{
            fontSize: "var(--fs-xs)",
            color: "var(--ink-2)",
            display: "flex",
            alignItems: "center",
            gap: "var(--space-1-5)",
            paddingTop: 'var(--space-1)',
            borderTop: "1px solid var(--line)",
          }}
        >
          <Smartphone size={ICON_SIZE.sm} />
          {t("healthSources.appPermissionRequired")}
        </div>
      )}
      {conn?.scopes && conn.scopes.length > 0 && status === "active" && (
        <details style={{ fontSize: "var(--fs-xs)" }}>
          <summary style={{ cursor: "pointer", color: "var(--ink-2)" }}>
            {t("healthSources.scopesTitle", { count: conn.scopes.length })}
          </summary>
          <ul style={{ marginTop: 'var(--space-1)', paddingLeft: 'var(--space-4)' }}>
            {conn.scopes.map((s) => (
              <li key={s} style={{ wordBreak: "break-all" }}>{s}</li>
            ))}

          </ul>
        </details>
      )}
    </Card>
  );
}

function formatRelativeTime(ms: number, locale: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (!ms) return "—";
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return t("healthSources.justNow");
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (min < 60) return relative.format(-min, "minute");
  const hr = Math.floor(min / 60);
  if (hr < 24) return relative.format(-hr, "hour");
  const day = Math.floor(hr / 24);
  return relative.format(-day, "day");
}

function PrimarySourceSelector({
  sport,
  activeProviders,
  prefs,
  onChange,
}: {
  sport: HealthSport;
  activeProviders: ProviderId[];
  prefs: HealthPreferences | null;
  onChange: (sport: HealthSport, provider: ProviderId | null) => void;
}) {
  const { t } = useTranslation("settings");
  const current = prefs?.primarySource?.[sport] ?? null;
  const inactiveCurrent = current && !activeProviders.includes(current) ? current : null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 'var(--space-3)' }}>
      <span style={{ minWidth: 60, fontSize: "var(--fs-sm)" }}>{t(SPORT_LABEL_KEYS[sport])}</span>
      <DropdownSelect value={current ?? ""} label={t(SPORT_LABEL_KEYS[sport])}
        onChange={value => onChange(sport, value === "" ? null : value as ProviderId)}
        options={[{ value: "", label: t("healthSources.primarySourceAuto") }, ...activeProviders.map(value => ({ value, label: PROVIDER_META[value].label })), ...(inactiveCurrent ? [{ value: inactiveCurrent, label: `${PROVIDER_META[inactiveCurrent].label} (${t("healthSources.statusNotConnected")})`, disabled: true }] : [])]} />
    </div>
  );
}

export function PaneHealthSources() {
  const { t } = useTranslation("settings");
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { connections, loading: connLoading } = useHealthConnections(uid);
  const { prefs, loading: prefsLoading, setPrimarySource, setRetainForever } = useHealthPreferences(uid);
  const { showToast } = useToast();
  const dialog = useDialog();
  const [retainSaving, setRetainSaving] = useState(false);

  const activeProviders = useMemo<ProviderId[]>(() => {
    return (Object.keys(connections) as ProviderId[]).filter(
      (p) => connections[p]?.status === "active",
    );
  }, [connections]);

  const showPrimarySelector = activeProviders.length >= 2;

  async function handlePrimaryChange(sport: HealthSport, provider: ProviderId | null) {
    try {
      await setPrimarySource(sport, provider);
      if (provider) {
        showToast(t("healthSources.primarySourceChanged", {
          sport: t(SPORT_LABEL_KEYS[sport]),
          provider: PROVIDER_META[provider].label,
        }));
      } else {
        showToast(t("healthSources.primarySourceAutoChanged", {
          sport: t(SPORT_LABEL_KEYS[sport]),
        }));
      }
    } catch {
      showToast(t("healthSources.primarySourceSaveFailed"));
    }
  }

  async function handleRetainToggle() {
    const next = !(prefs?.retainSamplesForever ?? false);
    if (next) {
      const confirmed = await dialog.confirm(t("healthSources.retainForeverConfirm"));
      if (!confirmed) return;
    }
    setRetainSaving(true);
    try {
      await setRetainForever(next);
      showToast(next ? t("healthSources.retainForeverOn") : t("healthSources.retainForeverOff"));
    } catch {
      showToast(t("healthSources.retainForeverSaveFailed"));
    } finally {
      setRetainSaving(false);
    }
  }

  if (connLoading || prefsLoading) {
    return (
      <Card padding="none" style={{ padding: 'var(--space-4)' }}>{t("healthSources.loading")}</Card>
    );
  }

  return (
    <div data-testid="S2-2-1" style={{ display: "flex", flexDirection: "column", gap: 'var(--space-4)' }}>
      <section style={{ display: "flex", flexDirection: "column", gap: 'var(--space-2)' }}>
        <h2 style={{ fontSize: "var(--fs-lg)", fontWeight: 600 }}>{t("healthSources.title")}</h2>
        <p style={{ fontSize: "var(--fs-sm)", color: "var(--ink-2)" }}>
          {t("healthSources.desc")}
        </p>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 'var(--space-2)' }}>
        {(Object.keys(PROVIDER_META) as ProviderId[]).map((p) => (
          <ProviderCard key={p} providerId={p} conn={connections[p]} />
        ))}
      </section>

      {showPrimarySelector && (
        <Card padding="none"
          style={{ padding: 'var(--space-4)', display: "flex", flexDirection: "column", gap: 'var(--space-3)' }}
        >
          <div>
            <h3 style={{ fontSize: "var(--fs-sm)", fontWeight: 600 }}>{t("healthSources.primarySourceTitle")}</h3>
            <p style={{ fontSize: "var(--fs-xs)", color: "var(--ink-2)", marginTop: 'var(--space-1)' }}>
              {t("healthSources.primarySourceDesc")}
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 'var(--space-2)' }}>
            {(Object.keys(SPORT_LABEL_KEYS) as HealthSport[]).map((sport) => (
              <PrimarySourceSelector
                key={sport}
                sport={sport}
                activeProviders={activeProviders}
                prefs={prefs}
                onChange={handlePrimaryChange}
              />
            ))}
          </div>
        </Card>
      )}

      <Card padding="none"
        style={{ padding: 'var(--space-4)', display: "flex", flexDirection: "column", gap: 'var(--space-3)' }}
      >
        <div>
          <h3 style={{ fontSize: "var(--fs-sm)", fontWeight: 600 }}>{t("healthSources.retentionTitle")}</h3>
          <p style={{ fontSize: "var(--fs-xs)", color: "var(--ink-2)", marginTop: 'var(--space-1)' }}>
            {t("healthSources.retentionDesc")}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 'var(--space-3)' }}>
          <Toggle
            on={prefs?.retainSamplesForever ?? false}
            disabled={retainSaving}
            ariaLabel={t("healthSources.retainForever")}
            onChange={() => void handleRetainToggle()}
          />
          <span style={{ fontSize: "var(--fs-sm)" }}>{t("healthSources.retainForever")}</span>
        </div>
        {prefs?.retainSamplesForever && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 'var(--space-2)',
              padding: 'var(--space-2)',
              borderRadius: "var(--r-md)",
              background: "var(--bg-2)",
              fontSize: "var(--fs-xs)",
              color: "var(--ink-2)",
            }}
          >
            <AlertCircle size={ICON_SIZE.sm} style={{ flexShrink: 0, marginTop: "var(--space-0-5)" }} />
            <span>
              {t("healthSources.retainForeverActiveHint")}
            </span>
          </div>
        )}
      </Card>
    </div>
  );
}
