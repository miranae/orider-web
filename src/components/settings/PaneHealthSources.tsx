import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Watch, Activity, Heart, Smartphone, AlertCircle } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useHealthConnections } from "../../hooks/useHealthConnections";
import { useHealthPreferences } from "../../hooks/useHealthPreferences";
import { useToast } from "../../contexts/ToastContext";
import type {
  ConnectionDoc,
  ConnectionStatus,
  HealthPreferences,
  HealthSport,
  ProviderId,
} from "@shared/types";
import { Card, Chip } from "../../theme/components";

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
    icon: <Activity size={20} />,
    hintKey: "healthSources.stravaHint",
    webConnectable: true,
  },
  apple_health: {
    label: "Apple Health",
    icon: <Heart size={20} />,
    hintKey: "healthSources.appleHealthHint",
    webConnectable: false,
  },
  health_connect: {
    label: "Health Connect",
    icon: <Watch size={20} />,
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
  const { t } = useTranslation("settings");
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
    <Card padding="none" style={{ padding: 'var(--space-4)', display: "flex", flexDirection: "column", gap: 'var(--space-2)' }}>
      <div style={{ display: "flex", alignItems: "center", gap: 'var(--space-3)' }}>
        <div style={{ color: "var(--rd-text-muted)" }}>{meta.icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600 }}>{meta.label}</div>
          <div style={{ fontSize: 12, color: "var(--rd-text-muted)" }}>
            {status === "active" && conn?.lastSyncAt
              ? t("healthSources.lastSync", { time: formatRelativeTime(conn.lastSyncAt, t) })
              : t(meta.hintKey)}
          </div>
        </div>
        {statusBadge(status)}
      </div>
      {!meta.webConnectable && status === "not_connected" && (
        <div
          style={{
            fontSize: 12,
            color: "var(--rd-text-muted)",
            display: "flex",
            alignItems: "center",
            gap: 6,
            paddingTop: 'var(--space-1)',
            borderTop: "1px solid var(--rd-border)",
          }}
        >
          <Smartphone size={14} />
          {t("healthSources.appPermissionRequired")}
        </div>
      )}
      {conn?.scopes && conn.scopes.length > 0 && status === "active" && (
        <details style={{ fontSize: 12 }}>
          <summary style={{ cursor: "pointer", color: "var(--rd-text-muted)" }}>
            {t("healthSources.scopesTitle", { count: conn.scopes.length })}
          </summary>
          <ul style={{ marginTop: 'var(--space-1)', paddingLeft: 'var(--space-4)' }}>
            {conn.scopes.slice(0, 6).map((s) => (
              <li key={s} style={{ wordBreak: "break-all" }}>{s}</li>
            ))}
            {conn.scopes.length > 6 && (
              <li>{t("healthSources.scopesMore", { count: conn.scopes.length - 6 })}</li>
            )}
          </ul>
        </details>
      )}
    </Card>
  );
}

function formatRelativeTime(ms: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (!ms) return "—";
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return t("healthSources.justNow");
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  return `${day}d`;
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
  const current = prefs?.primarySource[sport] ?? null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 'var(--space-3)' }}>
      <span style={{ minWidth: 60, fontSize: 14 }}>{t(SPORT_LABEL_KEYS[sport])}</span>
      <select
        value={current ?? ""}
        onChange={(e) => onChange(sport, e.target.value === "" ? null : (e.target.value as ProviderId))}
        style={{
          flex: 1,
          padding: "6px 8px",
          borderRadius: 6,
          border: "1px solid var(--rd-border)",
          background: "var(--rd-bg-elevated)",
          color: "var(--rd-text)",
        }}
      >
        <option value="">{t("healthSources.primarySourceAuto")}</option>
        {activeProviders.map((p) => (
          <option key={p} value={p}>{PROVIDER_META[p].label}</option>
        ))}
      </select>
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
      const confirmed = window.confirm(t("healthSources.retainForeverConfirm"));
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
    <div style={{ display: "flex", flexDirection: "column", gap: 'var(--space-4)' }}>
      <section style={{ display: "flex", flexDirection: "column", gap: 'var(--space-2)' }}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>{t("healthSources.title")}</h2>
        <p style={{ fontSize: 13, color: "var(--rd-text-muted)" }}>
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
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>{t("healthSources.primarySourceTitle")}</h3>
            <p style={{ fontSize: 12, color: "var(--rd-text-muted)", marginTop: 'var(--space-1)' }}>
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
          <h3 style={{ fontSize: 15, fontWeight: 600 }}>{t("healthSources.retentionTitle")}</h3>
          <p style={{ fontSize: 12, color: "var(--rd-text-muted)", marginTop: 'var(--space-1)' }}>
            {t("healthSources.retentionDesc")}
          </p>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 'var(--space-3)' }}>
          <input
            type="checkbox"
            checked={prefs?.retainSamplesForever ?? false}
            disabled={retainSaving}
            onChange={handleRetainToggle}
          />
          <span style={{ fontSize: 14 }}>{t("healthSources.retainForever")}</span>
        </label>
        {prefs?.retainSamplesForever && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 'var(--space-2)',
              padding: 'var(--space-2)',
              borderRadius: 6,
              background: "var(--rd-bg-muted)",
              fontSize: 12,
              color: "var(--rd-text-muted)",
            }}
          >
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              {t("healthSources.retainForeverActiveHint")}
            </span>
          </div>
        )}
      </Card>
    </div>
  );
}
