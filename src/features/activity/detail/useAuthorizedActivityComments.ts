import { useCallback, useEffect, useRef, useState } from "react";
import type { CommentItem } from "../../../components/activity/KudosCommentsCard";
import type { ActivityPublicAccessState } from "./ActivityPublicAccess";
import { isPublicActivityAccessError } from "../../../services/publicActivityDetail";

/** The shared comments card reads the same activity through its authorized API. */
export function useAuthorizedActivityComments(access?: ActivityPublicAccessState) {
  const client = access?.session.client;
  const id = access?.model.activity?.id;
  const revoke = access?.session.revokeAccess;
  const initial = access?.session.detail?.content.comments;
  const [rows, setRows] = useState<CommentItem[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const generation = useRef(0), pending = useRef(false);
  const deleted = useRef(new Set<string>());
  useEffect(() => {
    generation.current++; deleted.current.clear(); pending.current = false; setRows(null); setCursor(null); setStarted(false); setBusy(false); setFailed(false);
    return () => { generation.current++; };
  }, [client, id]);
  useEffect(() => {
    setRows(previous => previous ? Array.from(new Map([...previous, ...(initial ?? [])].filter(row => !deleted.current.has(row.id)).map(row => [row.id, row])).values()) : null);
  }, [initial]);
  const load = useCallback(async (restart = false) => {
    if (!client || !id || pending.current) return;
    const request = generation.current;
    pending.current = true; setBusy(true); setFailed(false);
    try {
      const result = await client.comments(id, restart ? null : cursor);
      if (request !== generation.current) return;
      setRows(previous => Array.from(new Map([...(restart ? [] : previous ?? []), ...result.comments].filter(row => !deleted.current.has(row.id)).map(row => [row.id, row])).values()));
      setCursor(result.nextCursor); setStarted(true);
    } catch (error) {
      if (request !== generation.current) return;
      if (isPublicActivityAccessError(error)) revoke?.();
      else setFailed(true);
    } finally { if (request === generation.current) { pending.current = false; setBusy(false); } }
  }, [client, id, cursor, revoke]);
  const mutate = useCallback(async (action: "delete" | "edit", commentId: string, text = "") => {
    if (!client || !id || pending.current) return;
    const request = generation.current;
    pending.current = true; setBusy(true); setFailed(false);
    try {
      if (action === "delete") await client.deleteComment(id, commentId);
      else await client.editComment(id, commentId, text);
      if (request !== generation.current) return;
      if (action === "delete") deleted.current.add(commentId);
      setRows(previous => action === "delete" ? (previous ?? initial ?? []).filter(row => row.id !== commentId)
        : (previous ?? initial ?? []).map(row => row.id === commentId ? { ...row, text } : row));
    } catch (error) {
      if (request !== generation.current) return;
      if (isPublicActivityAccessError(error)) revoke?.(); else setFailed(true);
    } finally { if (request === generation.current) { pending.current = false; setBusy(false); } }
  }, [client, id, initial, revoke]);
  return { rows: rows ?? initial ?? [], canLoad: !started || cursor !== null, busy, failed, load, mutate };
}
