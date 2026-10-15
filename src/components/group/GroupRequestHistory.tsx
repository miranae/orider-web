import { useEffect, useRef, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useTranslation } from "react-i18next";
import { auth, ensureAppCheckReady, firestore, functions } from "../../services/firebase";
import { useDialog } from "../../contexts/DialogContext";
import { getPublicUserProfiles } from "../../services/publicProfiles";
import { Button, Card } from "../../theme/components";
import { normalizeStartTime } from "../../utils/event-time";
import { logClientError } from "../../services/errorLogger";

interface RequestRow { id: string; userId: string; groupId: string; name: string; status: string; requestedAt: number; resolvedAt: number }
export default function GroupRequestHistory({ userId, groupId, sectionId }: { userId?: string; groupId?: string; sectionId?: string }) {
  const { t, i18n } = useTranslation("group");
  const dialog = useDialog();
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [error, setError] = useState(false);
  const [actionErrors, setActionErrors] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const intent = useRef(0);
  useEffect(() => {
    const scope = ++intent.current;
    let version = 0;
    setRows([]); setError(false); setBusy(null); setActionErrors({});
    if (!userId && !groupId) return;
    const ref = groupId ? collection(firestore, "groups", groupId, "joinRequests") : collection(firestore, "users", userId!, "group_requests");
    const unsubscribe = onSnapshot(query(ref, orderBy("requestedAt", "desc"), limit(10)), snapshot => {
      const nextVersion = ++version;
      setError(false);
      const nextRows = snapshot.docs.map(doc => {
        const data = doc.data();
        return { id: doc.id, userId: String(data.userId ?? ""), groupId: String(data.groupId ?? groupId ?? ""), name: String(data.groupName ?? data.nickname ?? data.userId ?? ""), status: String(data.status ?? "pending"), requestedAt: normalizeStartTime(data.requestedAt), resolvedAt: normalizeStartTime(data.resolvedAt) };
      });
      setRows(nextRows);
      if (groupId && nextRows.length) void getPublicUserProfiles(nextRows.map(row => row.userId)).then(profiles => {
        if (intent.current !== scope || version !== nextVersion) return;
        setRows(nextRows.map(row => ({ ...row, name: profiles.get(row.userId)?.nickname || row.name })));
      }).catch(err => { logClientError("GroupRequestHistory.profiles", err); });
    }, err => { if (intent.current === scope) { setError(true); setRows([]); } logClientError("GroupRequestHistory.read", err); });
    return () => { intent.current += 1; unsubscribe(); };
  }, [userId, groupId]);
  if (!rows.length && !error) return null;
  const history = <Card data-testid={groupId ? "C7-1-2" : "C0-1-3"} className="space-y-3"><details><summary>{t("requests.history")}</summary>{error ? <p role="alert">{t("error.loadFailed")}</p> : rows.map(row => <div key={row.id} className="space-y-2"><div className="flex items-center justify-between gap-3"><span>{row.name} · {t(`requests.${row.status}`)} · {row.requestedAt ? new Date(row.requestedAt).toLocaleString(i18n.language) : "–"}{row.resolvedAt ? ` → ${new Date(row.resolvedAt).toLocaleString(i18n.language)}` : ""}</span>{!groupId && row.status === "pending" && <Button data-testid="C0-1-3-cancel" size="sm" disabled={busy !== null} onClick={async () => {
    if (!userId || busy || auth.currentUser?.uid !== userId) return;
    const scope = intent.current;
    if (!(await dialog.confirm(t("requests.cancelConfirm"), { destructive: true }))) return;
    if (intent.current !== scope || auth.currentUser?.uid !== userId) return;
    setBusy(row.id); setActionErrors(prev => ({ ...prev, [row.id]: false }));
    try {
      await ensureAppCheckReady();
      if (intent.current !== scope || auth.currentUser?.uid !== userId) return;
      await httpsCallable(functions, "cancelGroupRequest")({ groupId: row.groupId });
    } catch (err) { if (intent.current === scope) setActionErrors(prev => ({ ...prev, [row.id]: true })); logClientError("GroupRequestHistory.cancel", err); }
    finally { if (intent.current === scope) setBusy(null); }
  }}>{t("requests.cancel")}</Button>}</div>{actionErrors[row.id] && <p role="alert">{t("requests.cancelFailed")}</p>}</div>)}</details></Card>;
  return sectionId ? <section data-testid={sectionId}>{history}</section> : history;
}
