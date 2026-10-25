import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ActivityFeedComment } from "@shared/types/activity-feed-content";
import { LocalizedLink } from "../../components/LocalizedLink";
import { Button, Stack, Text, Textarea } from "../../theme/components";
import { isPublicActivityAccessError, type createPublicActivityClient } from "../../services/publicActivityDetail";

interface Props {
  activityId: string;
  userId: string | null;
  initialComments: ActivityFeedComment[];
  count: number;
  client: ReturnType<typeof createPublicActivityClient>;
  onDeleted?: () => void;
  onAccessRevoked: () => void;
}

/** Paged server-authorized comments; no unbounded Firestore subscription or author profile fetch. */
export default function PublicActivityComments({ activityId, userId, initialComments, count, client, onDeleted, onAccessRevoked }: Props) {
  const { t } = useTranslation("activity");
  const [comments, setComments] = useState(initialComments);
  const [cursor, setCursor] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [pageError, setPageError] = useState(false);
  const [reported, setReported] = useState(false);
  const [editor, setEditor] = useState<{ id: string; action: "edit" | "delete" | "report"; text: string } | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const editorInput = useRef<HTMLTextAreaElement>(null);
  const confirm = useRef<HTMLButtonElement>(null);
  const editorTrigger = useRef<HTMLButtonElement | null>(null);
  const focusTarget = useRef<"editor" | "trigger" | "list" | null>(null);
  useEffect(() => {
    if (busy || !focusTarget.current) return;
    const target = focusTarget.current === "editor" ? editorInput.current ?? confirm.current
      : focusTarget.current === "trigger" && editorTrigger.current?.isConnected ? editorTrigger.current : container.current;
    focusTarget.current = null;
    target?.focus();
  });
  // Confirmed deletions must survive a late parent aggregate read or page response.
  const deletedIds = useRef(new Set<string>());
  useEffect(() => { deletedIds.current.clear(); }, [activityId, userId, client]);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const initialCommentsRef = useRef(initialComments);
  initialCommentsRef.current = initialComments;
  useEffect(() => {
    generation.current += 1; inFlight.current = false; focusTarget.current = null;
    setComments(initialCommentsRef.current); setCursor(null); setExpanded(false); setError(false); setPageError(false); setBusy(false); setEditor(null);
    return () => { generation.current += 1; };
  }, [activityId, userId, client]);
  useEffect(() => {
    setComments(initialComments.filter(comment => !deletedIds.current.has(comment.id)));
  }, [initialComments]);
  async function loadPage(restart = false) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setPageError(false);
    const request = generation.current;
    try {
      const page = await client.comments(activityId, restart ? null : cursor);
      if (request !== generation.current) return;
      setComments(previous => {
        const existing = restart || !expanded ? [] : previous;
        return [...new Map([...existing, ...page.comments].filter(comment => !deletedIds.current.has(comment.id)).map(comment => [comment.id, comment])).values()];
      });
      if (!page.nextCursor) focusTarget.current = "list";
      setCursor(page.nextCursor); setExpanded(true);
    } catch (reason) {
      if (request !== generation.current) return;
      const invalidCursor = typeof reason === "object" && reason !== null && "code" in reason && reason.code === "functions/failed-precondition";
      if (isPublicActivityAccessError(reason) && !invalidCursor) onAccessRevoked();
      else setPageError(true);
    } finally { if (request === generation.current) { inFlight.current = false; setBusy(false); } }
  }
  async function save() {
    if (!editor || !userId || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(false); setReported(false);
    const request = generation.current;
    try {
      if (editor.action === "edit") {
        const result = await client.editComment(activityId, editor.id, editor.text.trim());
        if (request !== generation.current) return;
        setComments(rows => rows.map(comment => comment.id === editor.id ? { ...comment, text: result.text } : comment));
      } else if (editor.action === "delete") {
        await client.deleteComment(activityId, editor.id);
        if (request !== generation.current) return;
        deletedIds.current.add(editor.id);
        setComments(rows => rows.filter(comment => comment.id !== editor.id)); onDeleted?.();
      } else {
        await client.reportComment(activityId, editor.id, editor.text.trim());
        if (request !== generation.current) return;
        setReported(true);
      }
      focusTarget.current = editor.action === "delete" ? "list" : "trigger";
      setEditor(null);
    } catch (reason) {
      if (request !== generation.current) return;
      if (isPublicActivityAccessError(reason)) onAccessRevoked();
      else setError(true);
    } finally { if (request === generation.current) { inFlight.current = false; setBusy(false); } }
  }
  return <div ref={container} tabIndex={-1} role="group" aria-label={t("kudosCard.comments", { count })}><Stack gap="var(--space-3)">
    {comments.map(comment => <div key={comment.id}>
      <LocalizedLink to={`/athlete/${encodeURIComponent(comment.userId)}`}><Text weight={600}>{comment.nickname}</Text></LocalizedLink>
      <Text as="p">{comment.text}</Text>
      {userId && <Stack direction="row" gap="var(--space-2)">
        {userId === comment.userId ? <>
          <Button size="sm" variant="ghost" disabled={busy} onClick={event => { editorTrigger.current = event.currentTarget; focusTarget.current = "editor"; setEditor({ id: comment.id, action: "edit", text: comment.text }); setError(false); }}>{t("kudosCard.edit")}</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={event => { editorTrigger.current = event.currentTarget; focusTarget.current = "editor"; setEditor({ id: comment.id, action: "delete", text: "" }); setError(false); }}>{t("kudosCard.delete")}</Button>
        </> : <Button size="sm" variant="ghost" disabled={busy} onClick={event => { editorTrigger.current = event.currentTarget; focusTarget.current = "editor"; setEditor({ id: comment.id, action: "report", text: "" }); setError(false); }}>{t("kudosCard.report")}</Button>}
      </Stack>}
      {editor?.id === comment.id && <Stack gap="var(--space-2)">
        {editor.action === "delete" ? <Text>{t("kudosCard.deleteConfirm")}</Text> : <Textarea ref={editorInput} aria-label={t(editor.action === "edit" ? "kudosCard.ariaEdit" : "kudosCard.reportReason")} value={editor.text} maxLength={editor.action === "edit" ? 500 : 1000} disabled={busy} invalid={error} onChange={event => setEditor({ ...editor, text: event.target.value })} />}
        <Stack direction="row" gap="var(--space-2)">
          <Button ref={confirm} variant={editor.action === "delete" ? "danger" : "primary"} loading={busy} disabled={busy || (editor.action !== "delete" && !editor.text.trim())} onClick={() => void save()}>{t(editor.action === "delete" ? "publicDetail.confirmDelete" : "kudosCard.save")}</Button>
          <Button variant="ghost" disabled={busy} onClick={() => { focusTarget.current = "trigger"; setEditor(null); setError(false); }}>{t("kudosCard.cancel")}</Button>
        </Stack>
        {error && <Text role="alert">{t("publicDetail.mutationFailed")}</Text>}
      </Stack>}
    </div>)}
    {reported && <Text role="status">{t("kudosCard.reported")}</Text>}
    {pageError && <Text role="alert">{t("publicDetail.commentsFailed")}</Text>}
    {(cursor || (!expanded && count > initialComments.length) || pageError) && <Button variant="outline" loading={busy} disabled={busy} onClick={() => void loadPage(pageError)}>{t(pageError ? "publicDetail.commentsRestart" : "publicDetail.moreComments")}</Button>}
    {expanded && !cursor && !pageError && <Text variant="caption">{t("publicDetail.commentsComplete")}</Text>}
  </Stack></div>;
}
