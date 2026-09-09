import { useEffect, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { useTranslation } from "react-i18next";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
import type { NarrativeLang } from "../../hooks/useActivityNarrative";
import { Button, Text } from "../../theme/components";
import { InlineRow, Toggle } from "./_primitives";

interface Settings { enabled: boolean; lang: NarrativeLang }

/** 연결된 계정별 key로 마운트하여 이전 계정의 조회·저장 응답을 버린다. */
export default function StravaSummarySettings() {
  const { t } = useTranslation("activity");
  const { functions, ensureAppCheckReady } = useFirebaseServices();
  const active = useRef(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    active.current = true;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        await ensureAppCheckReady();
        if (cancelled) return;
        const response = await httpsCallable<Record<string, never>, Settings>(functions, "stravaSummarySettings")({});
        if (!cancelled) setSettings(response.data);
      } catch { if (!cancelled) setMessage("settingsError"); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; active.current = false; };
  }, [functions, ensureAppCheckReady, reloadKey]);

  const save = async (enabled: boolean) => {
    if (!settings || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      await ensureAppCheckReady();
      if (!active.current) return;
      const response = await httpsCallable<{ enabled: boolean; lang: NarrativeLang }, Settings>(functions, "stravaSummarySettings")({ enabled, lang: settings.lang });
      if (active.current) { setSettings(response.data); setMessage(enabled ? "autoEnabled" : "autoDisabled"); }
    } catch { if (active.current) setMessage("settingsError"); }
    finally { if (active.current) setSaving(false); }
  };

  return (
    <InlineRow label={t("stravaSummary.automatic")} hint={t("stravaSummary.automaticHint")}>
      <div className="space-y-2">
        <Toggle on={settings?.enabled ?? false} ariaLabel={t("stravaSummary.automatic")} disabled={loading || saving || !settings} onChange={(enabled) => { void save(enabled); }} />
        {!settings && <Button variant="secondary" size="sm" disabled={loading} onClick={() => { setMessage(null); setReloadKey((key) => key + 1); }}>{t("stravaSummary.loadSettings")}</Button>}
        {message && <Text as="p" variant="caption" tone="tertiary" role="status">{t(`stravaSummary.${message}`)}</Text>}
      </div>
    </InlineRow>
  );
}
