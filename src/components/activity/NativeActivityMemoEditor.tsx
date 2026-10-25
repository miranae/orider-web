import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../contexts/AuthContext";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
import { createPublicActivityClient } from "../../services/publicActivityDetail";
import { Button, Stack, Text, Textarea } from "../../theme/components";

/** Native authored memo stays separate from title and generated analysis text. */
export default function NativeActivityMemoEditor({ activityId, onSaved }: { activityId: string; onSaved: (memo: string) => void }) {
  const services = useFirebaseServices();
  const { user } = useAuth();
  const { t } = useTranslation("activity");
  const client = useMemo(() => createPublicActivityClient(services), [services, user?.uid]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [revision, setRevision] = useState<string | null>(null);
  const [error, setError] = useState<"failed" | "conflict" | null>(null);
  const [saved, setSaved] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const focusTarget = useRef<"editor" | "trigger" | null>(null);
  useEffect(() => {
    if (busy || !focusTarget.current) return;
    const target = focusTarget.current === "editor" ? textarea.current : trigger.current;
    focusTarget.current = null;
    target?.focus();
  });
  const generation = useRef(0);
  const inFlight = useRef(false);
  useEffect(() => {
    generation.current += 1; inFlight.current = false; focusTarget.current = null; setOpen(false); setBusy(false); setDraft(""); setRevision(null); setError(null); setSaved(false);
    return () => { generation.current += 1; };
  }, [activityId, client]);
  async function load() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    const request = generation.current;
    try {
      const detail = await client.load(activityId);
      if (request !== generation.current) return;
      if (!detail.nativeMemoRevision || detail.activity.userId !== user?.uid) throw new Error("memo_unavailable");
      focusTarget.current = "editor"; setDraft(detail.content.memo ?? ""); setRevision(detail.nativeMemoRevision); setOpen(true);
    } catch { if (request === generation.current) setError("failed"); }
    finally { if (request === generation.current) { inFlight.current = false; setBusy(false); } }
  }
  async function save() {
    if (!revision || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null); setSaved(false);
    const request = generation.current;
    try {
      const result = await client.setNativeMemo(activityId, draft.trim(), revision);
      if (request !== generation.current) return;
      focusTarget.current = "trigger"; setRevision(result.memoRevision); setOpen(false); setSaved(true); onSaved(draft.trim());
    } catch (reason) {
      if (request !== generation.current) return;
      setError(typeof reason === "object" && reason !== null && "code" in reason && reason.code === "functions/aborted" ? "conflict" : "failed");
    } finally { if (request === generation.current) { inFlight.current = false; setBusy(false); } }
  }
  return <Stack gap="var(--space-3)">
    {!open ? <Button ref={trigger} variant="outline" loading={busy} onClick={() => void load()}>{t("nativeMemo.edit")}</Button> : <>
      <Textarea ref={textarea} aria-label={t("nativeMemo.label")} value={draft} maxLength={32768} disabled={busy} invalid={!!error} onChange={event => setDraft(event.target.value)} />
      <Stack direction="row" gap="var(--space-2)">
        <Button loading={busy} disabled={busy || error === "conflict"} onClick={() => void save()}>{t("kudosCard.save")}</Button>
        <Button variant="ghost" disabled={busy} onClick={() => { focusTarget.current = "trigger"; setOpen(false); setError(null); }}>{t("kudosCard.cancel")}</Button>
        {error === "conflict" && <Button variant="outline" disabled={busy} onClick={() => void load()}>{t("nativeMemo.reload")}</Button>}
      </Stack>
    </>}
    {error && <Text role="alert">{t(`nativeMemo.${error}`)}</Text>}
    {saved && <Text role="status">{t("nativeMemo.saved")}</Text>}
  </Stack>;
}
