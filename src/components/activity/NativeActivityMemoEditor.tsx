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

export interface NativeMemoEditorOptions {
  activityId: string;
  /** 화면에 보이는 메모. */
  currentMemo?: string | null;
  /** 화면 메모가 작성 메모인지(자동 요약이면 false). 모르면 true(보수적). */
  currentMemoAuthored?: boolean;
  onSaved: (memo: string) => void;
}

/**
 * Native authored memo stays separate from title and generated analysis text.
 * 상태는 hook 에 둬서, 메모 보기를 감싼 화면이 다시 마운트돼도(활동 갱신 등) 쓰던 초안이 남는다.
 *
 * 초안 시작값 — nativeMemoRevision 은 서버 작성 메모 본문의 sha256 이다:
 * - revision == sha(화면 메모): 화면 메모 그대로(같은 스냅샷).
 * - 화면 메모가 자동 요약이고 revision == sha(""): 작성 메모가 없으니 자동 요약으로 시작.
 * - 그 외(다른 기기 수정·삭제): 서버 기준(삭제됐으면 빈 칸)으로 시작해 보지 못한 변경을 덮어쓰지 않는다.
 */
export function useNativeMemoEditor({ activityId, currentMemo, currentMemoAuthored = true, onSaved }: NativeMemoEditorOptions) {
  const services = useFirebaseServices();
  const { user } = useAuth();
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
    if (!target) return; // 보기 영역이 아직 안 붙었으면 다음 렌더에서 다시 시도
    focusTarget.current = null;
    target.focus();
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
      const serverRevision = detail.nativeMemoRevision;
      const shown = currentMemo?.trim() ? currentMemo : null;
      const emptyRevision = await sha256Hex("");
      const shownMatches = shown != null && (serverRevision === await sha256Hex(shown) || serverRevision === await sha256Hex(shown.trim()));
      if (request !== generation.current) return;
      const initial = !fromServer && shown != null && (shownMatches || (!currentMemoAuthored && serverRevision === emptyRevision)) ? shown
        : serverRevision === emptyRevision ? "" : detail.content.memo ?? "";
      focusTarget.current = "editor"; setDraft(initial); setRevision(serverRevision); setOpen(true);
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
  const cancel = () => { focusTarget.current = "trigger"; setOpen(false); setError(null); };
  return { open, busy, draft, setDraft, error, saved, trigger, textarea, load, save, cancel };
}
export type NativeMemoEditorState = ReturnType<typeof useNativeMemoEditor>;

/** 제목처럼 메모 옆 연필 버튼으로 그 자리에서 고친다. */
export function NativeActivityMemoEditorView({ editor, children }: { editor: NativeMemoEditorState; children?: ReactNode }) {
  const { t } = useTranslation("activity");
  const { open, busy, draft, setDraft, error, saved, trigger, textarea, load, save, cancel } = editor;
  return <Stack gap="var(--space-3)">
    {!open ? <div className="activity-overview-memo-editable">
      <div className="activity-overview-memo-editable__view">{children}</div>
      <IconButton ref={trigger} variant="ghost" size="sm" loading={busy} aria-label={t("nativeMemo.edit")} title={t("nativeMemo.edit")}
        icon={<Pencil size={ICON_SIZE.sm} />} onClick={() => void load()} />
    </div> : <>
      <Textarea ref={textarea} aria-label={t("nativeMemo.label")} value={draft} maxLength={32768} disabled={busy} invalid={!!error} onChange={event => setDraft(event.target.value)} />
      <Stack direction="row" gap="var(--space-2)">
        <Button loading={busy} disabled={busy || error === "conflict"} onClick={() => void save()}>{t("kudosCard.save")}</Button>
        <Button variant="ghost" disabled={busy} onClick={cancel}>{t("kudosCard.cancel")}</Button>
        {error === "conflict" && <Button variant="outline" disabled={busy} onClick={() => void load(true)}>{t("nativeMemo.reload")}</Button>}
      </Stack>
    </>}
    {error && <Text role="alert">{t(`nativeMemo.${error}`)}</Text>}
    {saved && <Text role="status">{t("nativeMemo.saved")}</Text>}
  </Stack>;
}

export default function NativeActivityMemoEditor({ children, ...options }: NativeMemoEditorOptions & { children?: ReactNode }) {
  const editor = useNativeMemoEditor(options);
  return <NativeActivityMemoEditorView editor={editor}>{children}</NativeActivityMemoEditorView>;
}
