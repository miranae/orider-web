import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../contexts/AuthContext";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
import { createWebNotificationClient, type NotificationPreferences } from "../../services/webNotifications";
import { SettingsCard, InlineRow, Toggle } from "./_primitives";
import { Button, Text } from "../../theme/components";
export function NotificationPreferencesCard() {
  const { t } = useTranslation("settings"); const { user } = useAuth(); const services = useFirebaseServices();
  const client = useMemo(() => createWebNotificationClient(services), [services, user]);
  const active = useRef<typeof client | null>(client); active.current = client;
  const [state, setState] = useState<{ client: typeof client; value: NotificationPreferences } | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(false);
  const signedIn = !!user && !user.isAnonymous;
  const current = state?.client === client ? state.value : null;
  const load = async () => {
    setBusy(true); setError(false);
    try { const value = await client.getPreferences(); if (active.current === client) setState({ client, value }); }
    catch { if (active.current === client) { setState(null); setError(true); } }
    finally { if (active.current === client) setBusy(false); }
  };
  useEffect(() => {
    active.current = client; setState(null); setError(false);
    if (signedIn) void load();
    return () => { if (active.current === client) active.current = null; };
    // Each client captures the exact authenticated SDK object.
  }, [client, signedIn]);
  const save = async (key: keyof NotificationPreferences, value: boolean) => {
    setBusy(true); setError(false);
    try { const updated = await client.setPreferences({ [key]: value }); if (active.current === client) setState({ client, value: updated }); }
    catch (reason) {
      if (active.current !== client) return;
      const code = (reason as { code?: string })?.code;
      if (code === "functions/permission-denied" || code === "functions/unauthenticated") setState(null);
      setError(true);
    } finally { if (active.current === client) setBusy(false); }
  };
  return <SettingsCard title={t("notificationPreferences.title")}>
    <Text variant="caption">{t("notificationPreferences.inboxHint")}</Text>
    {!signedIn ? <Text>{t("loginRequired")}</Text> : <>
      {!current && !error && <Text role="status">{t("notificationPreferences.loading")}</Text>}
      {current && (["push", "kudos", "comment", "weeklyDigestEmail"] as const).map(key => <InlineRow key={key} label={t(`notificationPreferences.${key}`)} hint={key === "weeklyDigestEmail" ? t("notificationPreferences.emailHint") : key === "push" ? t("notificationPreferences.pushHint") : undefined}>
        <Toggle ariaLabel={t(`notificationPreferences.${key}`)} on={current[key]} disabled={busy || (key === "kudos" || key === "comment") && !current.push} onChange={value => { void save(key, value); }} />
      </InlineRow>)}
      {busy && current && <Text role="status">{t("notificationPreferences.saving")}</Text>}
      {error && <Text role="alert">{t("notificationPreferences.failed")}</Text>}
      {error && !current && <Button variant="secondary" disabled={busy} onClick={() => { void load(); }}>{t("notificationPreferences.retry")}</Button>}
    </>}
  </SettingsCard>;
}
