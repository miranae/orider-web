import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../contexts/AuthContext";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
import { createPublicActivityClient } from "../../services/publicActivityDetail";
import { Button, IconButton, Stack, Text, Textarea } from "../../theme/components";
import { ICON_SIZE } from "../../theme/tokens/icon";

/**
 * Native authored memo stays separate from title and generated analysis text.
 * 제목처럼 메모 옆 연필 버튼으로 바로 고친다. 편집 초안은 화면에 보이는 메모(currentMemo)로 시작해
 * 보이는 것과 다른 메모를 고치는 일이 없게 한다. 충돌 뒤 "최신 메모로 교체"만 서버 값을 쓴다.
 */
export default function NativeActivityMemoEditor({ activityId, currentMemo, onSaved, children }: {
  activityId: string; currentMemo?: string | null; onSaved: (memo: string) => void; children?: ReactNode;
}) {
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
  async function load(fromServer = false) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    const request = generation.current;
    try {
      const detail = await client.load(activityId);
      if (request !== generation.current) return;
      if (!detail.nativeMemoRevision || detail.activity.userId !== user?.uid) throw new Error("memo_unavailable");
      const shown = currentMemo?.trim() ? currentMemo : null;
      const initial = !fromServer && shown != null ? shown : detail.content.memo ?? "";
      focusTarget.current = "editor"; setDraft(initial); setRevision(detail.nativeMemoRevision); setOpen(true);
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
    {!open ? <div className="activity-overview-memo-editable">
      <div className="activity-overview-memo-editable__view">{children}</div>
      <IconButton ref={trigger} variant="ghost" size="sm" loading={busy} aria-label={t("nativeMemo.edit")} title={t("nativeMemo.edit")}
        icon={<Pencil size={ICON_SIZE.sm} />} onClick={() => void load()} />
    </div> : <>
      <Textarea ref={textarea} aria-label={t("nativeMemo.label")} value={draft} maxLength={32768} disabled={busy} invalid={!!error} onChange={event => setDraft(event.target.value)} />
      <Stack direction="row" gap="var(--space-2)">
        <Button loading={busy} disabled={busy || error === "conflict"} onClick={() => void save()}>{t("kudosCard.save")}</Button>
        <Button variant="ghost" disabled={busy} onClick={() => { focusTarget.current = "trigger"; setOpen(false); setError(null); }}>{t("kudosCard.cancel")}</Button>
        {error === "conflict" && <Button variant="outline" disabled={busy} onClick={() => void load(true)}>{t("nativeMemo.reload")}</Button>}
      </Stack>
    </>}
    {error && <Text role="alert">{t(`nativeMemo.${error}`)}</Text>}
    {saved && <Text role="status">{t("nativeMemo.saved")}</Text>}
  </Stack>;
}
