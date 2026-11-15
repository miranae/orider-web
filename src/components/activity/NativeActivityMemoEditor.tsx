import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../contexts/AuthContext";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
import { createPublicActivityClient } from "../../services/publicActivityDetail";
import { Button, IconButton, Stack, Text, Textarea } from "../../theme/components";
import { ICON_SIZE } from "../../theme/tokens/icon";

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Native authored memo stays separate from title and generated analysis text.
 * 제목처럼 메모 옆 연필 버튼으로 바로 고친다.
 * nativeMemoRevision 은 서버 작성 메모 본문의 sha256 이다. 그 revision 이 빈 메모(작성 메모 없음 —
 * 화면엔 자동 요약이 보임) 또는 화면 메모와 같을 때만 화면 메모로 초안을 시작한다. 그 외(다른 기기에서
 * 바뀐 경우 등)는 서버 메모로 시작해 보지 못한 수정을 덮어쓰지 않는다.
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
      const revision = detail.nativeMemoRevision;
      const shownIsSafe = !fromServer && shown != null
        && (revision === await sha256Hex("") || revision === await sha256Hex(shown.trim()) || revision === await sha256Hex(shown));
      if (request !== generation.current) return;
      const initial = shownIsSafe ? shown : detail.content.memo ?? "";
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
