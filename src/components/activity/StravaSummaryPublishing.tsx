import { useEffect, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { useTranslation } from "react-i18next";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
import { useStrava } from "../../hooks/useStrava";
import { Button, Text } from "../../theme/components";
import type { NarrativeLang } from "../../hooks/useActivityNarrative";

interface Settings { enabled: boolean; lang: NarrativeLang }
interface PublishResult {
  status: "published" | "unchanged" | "queued" | "reauthorization-required" | "unavailable";
  reason?: string;
  stravaActivityId?: string | number;
}

export function parseStravaSummaryTarget(input: string): string | null {
  const value = input.trim();
  let id = value;
  if (!/^\d+$/.test(value)) {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || !["www.strava.com", "strava.com"].includes(url.hostname)) return null;
      id = /^\/activities\/(\d+)\/?$/.exec(url.pathname)?.[1] ?? "";
    } catch { return null; }
  }
  return /^\d+$/.test(id) && Number.isSafeInteger(Number(id)) && Number(id) > 0 ? String(Number(id)) : null;
}

/** 부모가 계정·활동·언어별 key를 부여해 이전 요청의 결과가 다음 화면에 남지 않게 한다. */
export default function StravaSummaryPublishing({ activityId, lang }: { activityId: string; lang: NarrativeLang }) {
  const { t } = useTranslation("activity");
  const { functions, ensureAppCheckReady } = useFirebaseServices();
  const { connectStrava } = useStrava();
  const active = useRef(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<PublishResult | null>(null);
  const [target, setTarget] = useState("");
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    active.current = true;
    setSettingsLoading(true);
    let cancelled = false;
    void (async () => {
      try {
        await ensureAppCheckReady();
        const response = await httpsCallable<Record<string, never>, Settings>(functions, "stravaSummarySettings")({});
        if (!cancelled) setSettings(response.data);
      } catch { if (!cancelled) setMessage("settingsError"); }
      finally { if (!cancelled) setSettingsLoading(false); }
    })();
    return () => { cancelled = true; active.current = false; };
  }, [functions, ensureAppCheckReady, reloadKey]);

  useEffect(() => {
    const remoteId = result?.stravaActivityId == null ? null : parseStravaSummaryTarget(String(result.stravaActivityId));
    if (result?.status !== "queued" || !remoteId) return;
    let cancelled = false;
    let checks = 0;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      checks += 1;
      try {
        await ensureAppCheckReady();
        if (cancelled) return;
        const response = await httpsCallable<{ activityId: string; stravaActivityId: string }, PublishResult>(functions, "stravaSummaryPublishStatus")({ activityId, stravaActivityId: remoteId });
        if (cancelled) return;
        setResult(response.data);
        setMessage(response.data.status);
        if (response.data.status !== "queued") return;
      } catch { if (cancelled) return; }
      // 큐 재시도 상태만 조회한다. 새 게시 요청은 만들지 않는다.
      if (checks < 120) timer = setTimeout(() => { void poll(); }, 15_000);
    };
    timer = setTimeout(() => { void poll(); }, 15_000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [activityId, result?.status, result?.stravaActivityId, functions, ensureAppCheckReady]);

  const saveAutomatic = async (enabled: boolean) => {
    setBusy(true);
    setMessage(null);
    try {
      await ensureAppCheckReady();
      if (!active.current) return;
      const response = await httpsCallable<{ enabled: boolean; lang: NarrativeLang }, Settings>(functions, "stravaSummarySettings")({ enabled, lang });
      if (active.current) { setSettings(response.data); setMessage(enabled ? "autoEnabled" : "autoDisabled"); }
    } catch { if (active.current) setMessage("settingsError"); }
    finally { if (active.current) setBusy(false); }
  };

  const publish = async () => {
    const stravaActivityId = target.trim() ? parseStravaSummaryTarget(target) : null;
    if (target.trim() && !stravaActivityId) { setMessage("invalidTarget"); return; }
    setBusy(true);
    setMessage(null);
    try {
      await ensureAppCheckReady();
      if (!active.current) return;
      const response = await httpsCallable<{ activityId: string; lang: NarrativeLang; stravaActivityId?: string }, PublishResult>(functions, "stravaPublishActivitySummary")({
        activityId, lang, ...(stravaActivityId ? { stravaActivityId } : {}),
      });
      if (active.current) { setResult(response.data); setMessage(response.data.status); }
    } catch { if (active.current) setMessage("publishError"); }
    finally { if (active.current) setBusy(false); }
  };
  const publishedId = result?.stravaActivityId == null ? null : parseStravaSummaryTarget(String(result.stravaActivityId));
  return (
    <section className="space-y-3" aria-label={t("stravaSummary.title")}>
      <Text as="h4" variant="body" tone="primary">{t("stravaSummary.title")}</Text>
      <Text as="p" variant="caption" tone="tertiary">{t("stravaSummary.disclosure")}</Text>
      <Button variant="secondary" size="sm" disabled={busy} onClick={() => { void publish(); }}>{t(busy ? "stravaSummary.working" : "stravaSummary.publish")}</Button>
      {result?.status !== "published" && result?.status !== "unchanged" && (
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => connectStrava(window.location.pathname, { writeActivities: true })}>{t("stravaSummary.reconnect")}</Button>
      )}
      <details>
        <summary>{t("stravaSummary.targetHelp")}</summary>
        <label className="block space-y-2">
          <span>{t("stravaSummary.targetLabel")}</span>
          <input className="w-full" type="url" value={target} onChange={(event) => setTarget(event.target.value)} disabled={busy} placeholder="https://www.strava.com/activities/…" />
        </label>
      </details>
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={settings?.enabled ?? false} disabled={busy || !settings} onChange={(event) => { void saveAutomatic(event.target.checked); }} />
        <span>{t("stravaSummary.automatic")}</span>
      </label>
      {!settings && <Button variant="secondary" size="sm" disabled={busy || settingsLoading} onClick={() => { setMessage(null); setReloadKey((key) => key + 1); }}>{t("stravaSummary.loadSettings")}</Button>}
      <p role="status">{message ? t(`stravaSummary.${message}`) : ""}</p>
      {publishedId && (result?.status === "published" || result?.status === "unchanged") && <a href={`https://www.strava.com/activities/${publishedId}`} target="_blank" rel="noreferrer">{t("stravaSummary.view")}</a>}
    </section>
  );
}
